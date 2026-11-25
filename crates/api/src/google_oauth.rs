//! Google authorization-code sign-in. The browser proves it started the flow; native also proves possession of its app verifier.

use crate::auth::{encode, locale_code, native_page};
use crate::http::{client_ip, finish, json, new_id, now_ms, origin, random, Fail, R};
use crate::{limit, session};
use pausa_core::auth::{
    hash_token, name_from_email, normalize_email, pkce_s256, safe_next, token_from_bytes,
    NATIVE_CODE_TTL_MS,
};
use pausa_core::{dto::Locale, limits};
use serde::Deserialize;
use worker::*;

const CALLBACK: &str = "/api/auth/callback/google";
const STATE_COOKIE: &str = "__Host-pausa_google";
const STATE_TTL_SECONDS: i64 = 600;
const GOOGLE_AUTH: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO: &str = "https://openidconnect.googleapis.com/v1/userinfo";

struct Config {
    id: String,
    secret: String,
}

impl Config {
    fn get(req: &Request, env: &Env) -> Option<Self> {
        let app = env.var("APP_URL").ok()?.to_string();
        if !app.starts_with("https://") || origin(req) != app {
            return None;
        }
        let id = env.secret("GOOGLE_CLIENT_ID").ok()?.to_string();
        let secret = env.secret("GOOGLE_CLIENT_SECRET").ok()?.to_string();
        (!id.is_empty() && !secret.is_empty()).then_some(Self { id, secret })
    }
}

pub fn status(req: Request, env: Env) -> Result<Response> {
    finish(json(
        &serde_json::json!({ "enabled": Config::get(&req, &env).is_some() }),
        200,
    ))
}

pub async fn start(req: Request, env: Env) -> Result<Response> {
    finish(start_inner(&req, &env).await)
}

async fn start_inner(req: &Request, env: &Env) -> R<Response> {
    let cfg = Config::get(req, env).ok_or_else(Fail::not_found)?;
    let url = req.url()?;
    let q = |key: &str| query(&url, key);
    let locale = q("locale")
        .as_deref()
        .and_then(Locale::from_code)
        .unwrap_or(Locale::It);
    let fallback = format!("/{}/home", locale_code(locale));
    let next = safe_next(q("next").as_deref(), &fallback);
    let native = match q("native").as_deref() {
        Some("1") => Some(
            q("challenge")
                .filter(|v| valid_native_challenge(v))
                .ok_or_else(Fail::invalid)?,
        ),
        _ => None,
    };
    let db = env.d1("DB")?;
    limit::check(
        &db,
        &format!("google:ip:{}", client_ip(req)),
        limits::MAGIC_LINK_IP,
    )
    .await?;
    let state = token_from_bytes(&random::<32>());
    let browser = token_from_bytes(&random::<32>());
    db.prepare("INSERT INTO google_oauth_state (state_hash, browser_hash, next_path, locale, native_challenge, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(&[
            hash_token(&state).into(), hash_token(&browser).into(), next.into(), locale_code(locale).into(),
            native.map_or(wasm_bindgen::JsValue::NULL, Into::into), ((now_ms() + STATE_TTL_SECONDS * 1000) as f64).into(),
        ])?
        .run().await?;
    let callback = format!("{}{CALLBACK}", origin(req));
    let dest = format!(
        "{GOOGLE_AUTH}?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email&state={state}&code_challenge={}&code_challenge_method=S256",
        encode(&cfg.id), encode(&callback), pkce_s256(&browser)
    );
    let mut res = redirect(&dest)?;
    res.headers_mut()
        .append("Set-Cookie", &state_cookie(&browser, STATE_TTL_SECONDS))?;
    Ok(res)
}

#[derive(Deserialize)]
struct State {
    next_path: String,
    locale: String,
    native_challenge: Option<String>,
}

pub async fn callback(req: Request, env: Env) -> Result<Response> {
    finish(callback_inner(&req, &env).await)
}

async fn callback_inner(req: &Request, env: &Env) -> R<Response> {
    let cfg = Config::get(req, env).ok_or_else(Fail::not_found)?;
    let url = req.url()?;
    let browser = req.headers().get("cookie")?.and_then(|h| {
        h.split(';')
            .filter_map(|kv| kv.trim().split_once('='))
            .find(|(key, value)| *key == STATE_COOKIE && !value.is_empty())
            .map(|(_, value)| value.to_string())
    });
    let (Some(state), Some(browser)) = (query(&url, "state"), browser) else {
        return failed(&url, Locale::It, false);
    };
    let db = env.d1("DB")?;
    let state = db.prepare("DELETE FROM google_oauth_state WHERE state_hash = ?1 AND browser_hash = ?2 AND expires_at > ?3 RETURNING next_path, locale, native_challenge")
        .bind(&[hash_token(&state).into(), hash_token(&browser).into(), (now_ms() as f64).into()])?
        .first::<State>(None).await?;
    let Some(state) = state else {
        return failed(&url, Locale::It, false);
    };
    let locale = Locale::from_code(&state.locale).unwrap_or(Locale::It);
    let native = state.native_challenge.is_some();
    let Some(code) = query(&url, "code").filter(|_| query(&url, "error").is_none()) else {
        return failed(&url, locale, native);
    };
    let callback = format!("{}{CALLBACK}", origin(req));
    let Some(identity) = identity(&cfg, &code, &browser, &callback).await else {
        return failed(&url, locale, native);
    };
    let Some(user_id) = user_for(&db, &identity).await? else {
        return failed(&url, locale, native);
    };
    let mut res = if let Some(challenge) = state.native_challenge {
        let code = token_from_bytes(&random::<32>());
        let now = now_ms();
        let made = db.prepare("INSERT INTO login_token (token_hash, kind, user_id, native_challenge, expires_at, created_at) SELECT ?1, 'native_code', id, ?3, ?4, ?5 FROM user WHERE id = ?2 AND disabled_at IS NULL")
            .bind(&[hash_token(&code).into(), user_id.into(), challenge.into(), ((now + NATIVE_CODE_TTL_MS) as f64).into(), (now as f64).into()])?
            .run().await?.meta()?.and_then(|m| m.changes).unwrap_or(0);
        if made != 1 {
            return failed(&url, locale, true);
        }
        let deep = format!(
            "pausa://auth?google=1&code={code}&locale={}&next={}",
            locale_code(locale),
            encode(&state.next_path)
        );
        native_page(&deep, locale, true)?
    } else {
        let (token, stmt) = session::new_session(
            &db,
            "SELECT id FROM user WHERE id = ?1 AND disabled_at IS NULL",
            &user_id,
            "web",
            req.headers().get("user-agent")?,
        )?;
        if stmt.run().await?.meta()?.and_then(|m| m.changes) != Some(1) {
            return failed(&url, locale, false);
        }
        let target = url
            .join(&state.next_path)
            .ok()
            .filter(|u| u.origin() == url.origin());
        let fallback = format!("/{}/home", locale_code(locale));
        let mut res = redirect(target.as_ref().map_or(fallback.as_str(), |u| u.as_str()))?;
        res.headers_mut()
            .append("Set-Cookie", &session::cookie_for(req, &token))?;
        res
    };
    res.headers_mut()
        .append("Set-Cookie", &state_cookie("", 0))?;
    Ok(res)
}

#[derive(Deserialize)]
struct GoogleToken {
    access_token: String,
}

#[derive(Deserialize)]
struct Identity {
    sub: String,
    email: Option<String>,
    email_verified: Option<bool>,
    hd: Option<String>,
}

async fn identity(cfg: &Config, code: &str, browser: &str, callback: &str) -> Option<Identity> {
    let result = fetch_identity(cfg, code, browser, callback).await;
    match result {
        Ok(identity) => identity,
        Err(_) => {
            // Fetch/JSON errors may contain request data; never include provider credentials in logs.
            console_error!("Google OAuth token exchange or userinfo failed");
            None
        }
    }
}

async fn fetch_identity(
    cfg: &Config,
    code: &str,
    browser: &str,
    callback: &str,
) -> Result<Option<Identity>> {
    let form = format!(
        "grant_type=authorization_code&code={}&client_id={}&client_secret={}&redirect_uri={}&code_verifier={}",
        encode(code), encode(&cfg.id), encode(&cfg.secret), encode(callback), encode(browser)
    );
    let headers = Headers::new();
    headers.set("Content-Type", "application/x-www-form-urlencoded")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(form.into()))
        .with_redirect(RequestRedirect::Manual);
    let mut response = Fetch::Request(Request::new_with_init(GOOGLE_TOKEN, &init)?)
        .send()
        .await?;
    if response.status_code() != 200 {
        console_error!(
            "Google OAuth token endpoint answered {}",
            response.status_code()
        );
        return Ok(None);
    }
    let token: GoogleToken = response.json().await?;
    let headers = Headers::new();
    headers.set("Authorization", &format!("Bearer {}", token.access_token))?;
    let mut init = RequestInit::new();
    init.with_headers(headers)
        .with_redirect(RequestRedirect::Manual);
    let mut response = Fetch::Request(Request::new_with_init(GOOGLE_USERINFO, &init)?)
        .send()
        .await?;
    if response.status_code() != 200 {
        console_error!(
            "Google OAuth userinfo endpoint answered {}",
            response.status_code()
        );
        return Ok(None);
    }
    Ok(Some(response.json().await?))
}

impl Identity {
    fn linkable_email(&self) -> Option<String> {
        let email = self.email.as_deref().and_then(normalize_email)?;
        let (_, domain) = email.split_once('@')?;
        // Outside Gmail/Workspace a verified Google address may have changed owners since verification.
        (self.email_verified == Some(true)
            && (domain == "gmail.com"
                || self
                    .hd
                    .as_deref()
                    .is_some_and(|hd| hd.eq_ignore_ascii_case(domain))))
        .then_some(email)
    }
}

#[derive(Deserialize)]
struct GoogleUser {
    id: String,
    disabled_at: Option<i64>,
}

async fn user_for(db: &D1Database, identity: &Identity) -> R<Option<String>> {
    if identity.sub.is_empty() || identity.sub.len() > 255 {
        return Ok(None);
    }
    let linked = || {
        db.prepare(
        "SELECT u.id, u.disabled_at FROM account a JOIN user u ON u.id = a.user_id WHERE a.provider = 'google' AND a.provider_account_id = ?1"
    ).bind(&[identity.sub.clone().into()])
    };
    if let Some(user) = linked()?.first::<GoogleUser>(None).await? {
        return Ok(user.disabled_at.is_none().then_some(user.id));
    }
    let Some(email) = identity.linkable_email() else {
        return Ok(None);
    };
    let now = now_ms() as f64;
    let rows = db.batch(vec![
        db.prepare("INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at)
            SELECT ?1, ?2, ?3, 1, ?4, ?4 WHERE NOT EXISTS (SELECT 1 FROM account WHERE provider = 'google' AND provider_account_id = ?5)")
            .bind(&[new_id().into(), name_from_email(&email).into(), email.clone().into(), now.into(), identity.sub.clone().into()])?,
        db.prepare("INSERT OR IGNORE INTO account (id, user_id, provider, provider_account_id, created_at)
            SELECT ?1, u.id, 'google', ?2, ?3 FROM user u WHERE u.email = ?4 AND u.disabled_at IS NULL AND u.is_anonymous = 0
            AND NOT EXISTS (SELECT 1 FROM account a WHERE a.provider = 'google' AND a.user_id = u.id)")
            .bind(&[new_id().into(), identity.sub.clone().into(), now.into(), email.into()])?,
        linked()?,
    ]).await?;
    let user = rows[2].results::<GoogleUser>()?.pop();
    Ok(user.filter(|u| u.disabled_at.is_none()).map(|u| u.id))
}

fn valid_native_challenge(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn query(url: &Url, key: &str) -> Option<String> {
    url.query_pairs()
        .find(|(n, _)| n == key)
        .map(|(_, v)| v.into_owned())
}

fn state_cookie(value: &str, max_age: i64) -> String {
    format!("{STATE_COOKIE}={value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age={max_age}")
}

fn redirect(dest: &str) -> R<Response> {
    let mut res = Response::empty()?.with_status(303);
    res.headers_mut().set("Location", dest)?;
    res.headers_mut().set("Cache-Control", "no-store")?;
    res.headers_mut().set("Referrer-Policy", "no-referrer")?;
    Ok(res)
}

fn failed(url: &Url, locale: Locale, native: bool) -> R<Response> {
    let mut res = if native {
        native_page(
            &format!("pausa://auth?google_error=1&locale={}", locale_code(locale)),
            locale,
            false,
        )?
    } else {
        let path = format!("/{}/sign-in?google_error=1", locale_code(locale));
        redirect(url.join(&path).map_err(|_| Fail::internal())?.as_str())?
    };
    res.headers_mut()
        .append("Set-Cookie", &state_cookie("", 0))?;
    Ok(res)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_links_require_a_google_authoritative_verified_address() {
        let mut identity = Identity {
            sub: "123".into(),
            email: Some("A@Gmail.com".into()),
            email_verified: Some(true),
            hd: None,
        };
        assert_eq!(identity.linkable_email().as_deref(), Some("a@gmail.com"));
        identity.email = Some("a@example.org".into());
        assert!(identity.linkable_email().is_none());
        identity.hd = Some("example.org".into());
        assert_eq!(identity.linkable_email().as_deref(), Some("a@example.org"));
        identity.email_verified = Some(false);
        assert!(identity.linkable_email().is_none());
    }
}
