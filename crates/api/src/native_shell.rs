//! Sign-in for the old native shell (v1's Tauri app: a WebView that loads the site). Google refuses OAuth inside a WebView, so
//! the shell hands sign-in to the system browser and takes the result back, exactly as v1 did (src-tauri/src/lib.rs):
//!   1. the page sends the WebView to `/api/native/start`: the shell catches that address and opens it in the system browser;
//!   2. the browser signs in (Google, or the email link) and ends on `/api/native/done`, which opens `pausa://auth?token=&next=`;
//!   3. the shell loads `/api/native/exchange?token=&next=` in its WebView, which swaps the single-use code for a web session.
//!
//! The code is the same `native_code` login token the Expo app uses: single use, 3 minutes.

use crate::auth::{encode, locale_code, native_page};
use crate::http::{client_ip, finish, now_ms, random, Fail, R};
use crate::{limit, session};
use pausa_core::auth::{hash_token, safe_next, token_from_bytes, NATIVE_CODE_TTL_MS};
use pausa_core::dto::Locale;
use pausa_core::limits;
use serde::Deserialize;
use worker::*;

fn query(url: &Url, key: &str) -> Option<String> {
    url.query_pairs()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.to_string())
}

/// The app path to land on, and its language (the first path segment, as v1).
fn next_of(url: &Url) -> (String, Locale) {
    let next = safe_next(query(url, "next").as_deref(), "/it/home");
    // Never bounce back into these endpoints.
    let next = if next.starts_with("/api/") {
        "/it/home".to_string()
    } else {
        next
    };
    let locale = next
        .split('/')
        .nth(1)
        .and_then(Locale::from_code)
        .unwrap_or(Locale::It);
    (next, locale)
}

fn redirect(url: &Url, to: &str, status: u16) -> R<Response> {
    let target = url
        .join(to)
        .ok()
        .filter(|u| u.origin() == url.origin())
        .ok_or_else(Fail::not_found)?;
    let mut res = Response::empty()?.with_status(status);
    res.headers_mut().set("Location", target.as_str())?;
    res.headers_mut().set("Cache-Control", "no-store")?;
    Ok(res)
}

/// `GET /api/native/start?next=` (in the system browser): Google sign-in that ends on `/api/native/done`.
/// Already signed in here (not as a guest): straight to done.
pub async fn start(req: Request, env: Env) -> Result<Response> {
    finish(start_inner(&req, &env).await)
}

async fn start_inner(req: &Request, env: &Env) -> R<Response> {
    let url = req.url()?;
    let (next, locale) = next_of(&url);
    let done = format!("/api/native/done?next={}", encode(&next));
    let db = env.d1("DB")?;
    if matches!(session::current(req, &db).await?, Some(s) if !s.is_anonymous) {
        return redirect(&url, &done, 302);
    }
    let google = format!(
        "/api/auth/google/start?locale={}&next={}",
        locale_code(locale),
        encode(&done)
    );
    redirect(&url, &google, 302)
}

/// `GET /api/native/done?next=` (in the system browser, signed in): a single-use code handed to the shell via `pausa://auth`.
pub async fn done(req: Request, env: Env) -> Result<Response> {
    finish(done_inner(&req, &env).await)
}

async fn done_inner(req: &Request, env: &Env) -> R<Response> {
    let url = req.url()?;
    let (next, locale) = next_of(&url);
    let db = env.d1("DB")?;
    let Some(s) = session::current(req, &db).await? else {
        return redirect(
            &url,
            &format!("/{}/sign-in?next={}", locale_code(locale), encode(&next)),
            302,
        );
    };
    let code = token_from_bytes(&random::<32>());
    let now = now_ms();
    db.prepare("INSERT INTO login_token(token_hash, kind, user_id, expires_at, created_at) VALUES (?1, 'native_code', ?2, ?3, ?4)")
        .bind(&[hash_token(&code).into(), s.user_id.into(), ((now + NATIVE_CODE_TTL_MS) as f64).into(), (now as f64).into()])?
        .run()
        .await?;
    // v1's shell forwards only `token` and `next` from the link.
    let deep = format!("pausa://auth?token={code}&next={}", encode(&next));
    native_page(&deep, locale, true)
}

#[derive(Deserialize)]
struct UserIdRow {
    user_id: String,
}

/// `GET /api/native/exchange?token=&next=` (in the shell's WebView): swaps the code for a web session cookie, then goes to `next`.
pub async fn exchange(req: Request, env: Env) -> Result<Response> {
    finish(exchange_inner(&req, &env).await)
}

async fn exchange_inner(req: &Request, env: &Env) -> R<Response> {
    let url = req.url()?;
    let (next, locale) = next_of(&url);
    let back = format!("/{}/sign-in", locale_code(locale));
    let Some(code) = query(&url, "token").filter(|t| !t.is_empty()) else {
        return redirect(&url, &back, 302);
    };
    let db = env.d1("DB")?;
    limit::check(
        &db,
        &format!("native:ip:{}", client_ip(req)),
        limits::NATIVE_EXCHANGE,
    )
    .await?;
    let now = now_ms();
    // Only codes made without an app verifier: the Expo app's PKCE-bound codes cannot be spent here.
    let used = db
        .prepare(
            "UPDATE login_token SET used_at = ?2 WHERE token_hash = ?1 AND kind = 'native_code' AND used_at IS NULL \
             AND expires_at > ?2 AND native_challenge IS NULL RETURNING user_id",
        )
        .bind(&[hash_token(&code).into(), (now as f64).into()])?
        .first::<UserIdRow>(None)
        .await?;
    let Some(used) = used else {
        return redirect(&url, &back, 302);
    };
    let (token, stmt) = session::new_session(
        &db,
        "SELECT id FROM user WHERE id = ?1 AND disabled_at IS NULL",
        &used.user_id,
        "web",
        req.headers().get("user-agent")?,
    )?;
    if stmt.run().await?.meta()?.and_then(|m| m.changes) != Some(1) {
        return redirect(&url, &back, 302);
    }
    let mut res = redirect(&url, &next, 303)?;
    res.headers_mut()
        .append("Set-Cookie", &session::cookie_for(req, &token))?;
    Ok(res)
}
