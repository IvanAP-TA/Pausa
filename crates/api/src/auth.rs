//! Sign-in: magic link, guest, logout.

use crate::http::{
    body, client_ip, finish, is_loopback, json, new_id, no_content, now_ms, origin, random, Fail, R,
};
use crate::{limit, mail, session};
use pausa_core::auth::{
    clear_cookie, hash_token, name_from_email, normalize_email, safe_next, token_from_bytes,
    MAGIC_LINK_TTL_MS, NATIVE_CODE_TTL_MS,
};
use pausa_core::dto::{Locale, MagicLinkSent, NativeCode, NativeToken};
use pausa_core::limits;
use serde::Deserialize;
use worker::*;

#[derive(Deserialize)]
struct MagicLinkIn {
    email: String,
    next: Option<String>,
    locale: Option<String>,
    /// The native app asked: after the link, hand a one-time code to the app (pausa://auth) instead of a web session.
    native: Option<bool>,
}

/// `POST /api/auth/magic-link`. Always answers `{ok:true}` for a well-formed address, so it never says whether it exists.
pub async fn request_link(mut req: Request, env: Env) -> Result<Response> {
    finish(request_link_inner(&mut req, &env).await)
}

async fn request_link_inner(req: &mut Request, env: &Env) -> R<Response> {
    let input: MagicLinkIn = body(req).await?;
    let email = normalize_email(&input.email).ok_or_else(Fail::invalid)?;
    let db = env.d1("DB")?;
    limit::check(
        &db,
        &format!("link:ip:{}", client_ip(req)),
        limits::MAGIC_LINK_IP,
    )
    .await?;
    limit::check(
        &db,
        &format!("link:email:{email}"),
        limits::MAGIC_LINK_EMAIL,
    )
    .await?;

    let token = token_from_bytes(&random::<32>());
    let now = now_ms();
    db.prepare("INSERT INTO login_token(token_hash, kind, email, expires_at, created_at) VALUES (?1, 'magic_link', ?2, ?3, ?4)")
        .bind(&[hash_token(&token).into(), email.clone().into(), ((now + MAGIC_LINK_TTL_MS) as f64).into(), (now as f64).into()])?
        .run()
        .await?;

    let next = safe_next(input.next.as_deref(), "/");
    let locale = input
        .locale
        .as_deref()
        .and_then(Locale::from_code)
        .unwrap_or_else(|| {
            Locale::negotiate(
                req.headers()
                    .get("accept-language")
                    .ok()
                    .flatten()
                    .as_deref(),
            )
        });
    let native = if input.native == Some(true) {
        "&native=1"
    } else {
        ""
    };
    let link = format!(
        "{}/api/auth/magic-link/verify?token={token}&next={}&l={}{native}",
        origin(req),
        encode(&next),
        locale_code(locale)
    );
    // Local development without a mail key: hand the link back instead of sending it. Never on a real host.
    let has_key = env.secret("RESEND_API_KEY").is_ok();
    if !has_key {
        if is_loopback(req) {
            return json(
                &MagicLinkSent {
                    ok: true,
                    dev_link: Some(link),
                },
                200,
            );
        }
        console_error!("RESEND_API_KEY is not set: sign-in links cannot be sent");
        return Err(Fail::internal());
    }
    let (subject, text) = mail::magic_link_text(locale, &link);
    if let Err(e) = mail::send(env, &email, &subject, &text).await {
        console_error!("magic link email failed: {e}");
    }
    json(
        &MagicLinkSent {
            ok: true,
            dev_link: None,
        },
        200,
    )
}

pub(crate) fn locale_code(l: Locale) -> &'static str {
    match l {
        Locale::It => "it",
        Locale::En => "en",
        Locale::Es => "es",
    }
}

/// Percent-encodes everything outside the unreserved set (enough for a path in a query value).
pub(crate) fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~' | b'/') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

#[derive(Deserialize)]
struct EmailRow {
    email: String,
}

/// `GET /api/auth/magic-link/verify?token=&next=`: consumes the link, signs in, redirects. Two D1 calls.
pub async fn verify_link(req: Request, env: Env) -> Result<Response> {
    finish(verify_inner(&req, &env).await)
}

async fn verify_inner(req: &Request, env: &Env) -> R<Response> {
    let url = req.url()?;
    let q = |k: &str| {
        url.query_pairs()
            .find(|(n, _)| n == k)
            .map(|(_, v)| v.to_string())
    };
    let next = safe_next(q("next").as_deref(), "/");
    let fail_to = |reason: &str| -> R<Response> {
        let mut u = url.clone();
        u.set_path("/");
        u.set_query(Some(&format!("signin_error={reason}")));
        Ok(Response::redirect_with_status(u, 303)?)
    };
    let Some(token) = q("token") else {
        return fail_to("link");
    };
    let db = env.d1("DB")?;
    let now = now_ms();

    // Atomic: only the first use of an unexpired link returns a row.
    let used = db
        .prepare(
            "UPDATE login_token SET used_at = ?2 WHERE token_hash = ?1 AND kind = 'magic_link' AND used_at IS NULL \
             AND expires_at > ?2 RETURNING email",
        )
        .bind(&[hash_token(&token).into(), (now as f64).into()])?
        .first::<EmailRow>(None)
        .await?;
    let Some(EmailRow { email }) = used else {
        return fail_to("link");
    };

    let native = q("native").as_deref() == Some("1");
    let user_sql = "SELECT id FROM user WHERE email = ?1 AND disabled_at IS NULL";
    // Web: a session for this browser. Native: a one-time code the app swaps for its own session (the browser is not the app).
    let (session_token, session_stmt) = if native {
        let code = token_from_bytes(&random::<32>());
        let stmt = db
            .prepare("INSERT INTO login_token(token_hash, kind, user_id, expires_at, created_at) SELECT ?1, 'native_code', id, ?2, ?3 FROM user WHERE email = ?4 AND disabled_at IS NULL")
            .bind(&[hash_token(&code).into(), ((now + NATIVE_CODE_TTL_MS) as f64).into(), (now as f64).into(), email.clone().into()])?;
        (code, stmt)
    } else {
        session::new_session(
            &db,
            user_sql,
            &email,
            "web",
            req.headers().get("user-agent")?,
        )?
    };
    let name = name_from_email(&email);
    let stmts = vec![
        db.prepare("INSERT OR IGNORE INTO user(id, name, email, email_verified, created_at, updated_at) VALUES (?1, ?2, ?3, 1, ?4, ?4)")
            .bind(&[new_id().into(), name.into(), email.clone().into(), (now as f64).into()])?,
        db.prepare("UPDATE user SET email_verified = 1 WHERE email = ?1 AND email_verified = 0").bind(&[email.clone().into()])?,
        db.prepare(
            "INSERT OR IGNORE INTO account(id, user_id, provider, provider_account_id, created_at) \
             SELECT ?1, id, 'email', ?2, ?3 FROM user WHERE email = ?2",
        )
        .bind(&[new_id().into(), email.clone().into(), (now as f64).into()])?,
        session_stmt,
    ];
    let results = db.batch(stmts).await?;
    let created = results
        .last()
        .and_then(|r| r.meta().ok().flatten())
        .and_then(|m| m.changes)
        .unwrap_or(0);
    if created != 1 {
        return fail_to("disabled"); // the account exists but an operator disabled it
    }

    if native {
        let deep = format!("pausa://auth?code={session_token}&next={}", encode(&next));
        return native_page(
            &deep,
            q("l")
                .as_deref()
                .and_then(Locale::from_code)
                .unwrap_or(Locale::It),
            true,
        );
    }

    // `next` may carry a query (the old shell's /api/native/done?next=...): resolve it, same origin only.
    let target = url
        .join(&next)
        .ok()
        .filter(|u| u.origin() == url.origin())
        .unwrap_or_else(|| {
            let mut u = url.clone();
            u.set_path("/");
            u.set_query(None);
            u
        });
    let mut res = Response::empty()?.with_status(303);
    res.headers_mut().set("Location", target.as_str())?;
    res.headers_mut()
        .append("Set-Cookie", &session::cookie_for(req, &session_token))?;
    res.headers_mut().set("Cache-Control", "no-store")?;
    Ok(res)
}

#[derive(Deserialize, Default)]
struct GuestIn {
    name: Option<String>,
    /// The native app wants the token in the body, not a cookie.
    native: Option<bool>,
}

/// `POST /api/auth/guest`: an anonymous account for joining a Serata without signing up.
pub async fn guest(mut req: Request, env: Env) -> Result<Response> {
    finish(guest_inner(&mut req, &env).await)
}

async fn guest_inner(req: &mut Request, env: &Env) -> R<Response> {
    let input: GuestIn = body(req).await.unwrap_or_default();
    let name: String = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .unwrap_or("Ospite")
        .chars()
        .take(30)
        .collect();
    let db = env.d1("DB")?;
    limit::check(
        &db,
        &format!("guest:ip:{}", client_ip(req)),
        limits::GUEST_SIGN_IN,
    )
    .await?;

    let id = new_id();
    let email = format!("guest-{id}@guest.invalid");
    let (token, session_stmt) = session::new_session(
        &db,
        "SELECT id FROM user WHERE id = ?1",
        &id,
        "web",
        req.headers().get("user-agent")?,
    )?;
    let now = now_ms();
    db.batch(vec![
        db.prepare("INSERT INTO user(id, name, email, is_anonymous, created_at, updated_at) VALUES (?1, ?2, ?3, 1, ?4, ?4)")
            .bind(&[id.clone().into(), name.into(), email.into(), (now as f64).into()])?,
        session_stmt,
    ])
    .await?;
    if input.native == Some(true) {
        return json(&NativeToken { token }, 200);
    }
    let mut res = json(&serde_json::json!({ "ok": true }), 200)?;
    res.headers_mut()
        .append("Set-Cookie", &session::cookie_for(req, &token))?;
    Ok(res)
}

/// `POST /api/auth/logout`: ends this session only.
pub async fn logout(req: Request, env: Env) -> Result<Response> {
    finish(logout_inner(&req, &env).await)
}

async fn logout_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    if let Some(token) = session::token_of(req) {
        db.prepare("DELETE FROM session WHERE token_hash = ?1")
            .bind(&[hash_token(&token).into()])?
            .run()
            .await?;
    }
    let mut res = no_content()?;
    res.headers_mut()
        .append("Set-Cookie", &clear_cookie(crate::http::is_https(req)))?;
    Ok(res)
}

/// The page the system browser shows after a native sign-in: a button (and an automatic jump) into the app. No script, so
/// it works under any content policy; the code in the link is single-use and lives 3 minutes.
pub(crate) fn native_page(deep_link: &str, locale: Locale, success: bool) -> R<Response> {
    let (title, button, hint) = match (locale, success) {
        (Locale::It, true) => (
            "Accesso riuscito",
            "Torna a Pausa",
            "Se l'app non si apre da sola, tocca il pulsante.",
        ),
        (Locale::En, true) => (
            "Signed in",
            "Back to Pausa",
            "If the app does not open by itself, tap the button.",
        ),
        (Locale::Es, true) => (
            "Sesión iniciada",
            "Volver a Pausa",
            "Si la app no se abre sola, toca el botón.",
        ),
        (Locale::It, false) => (
            "Accesso Google non riuscito",
            "Torna a Pausa",
            "Riprova o accedi via email.",
        ),
        (Locale::En, false) => (
            "Google sign-in failed",
            "Back to Pausa",
            "Try again or sign in by email.",
        ),
        (Locale::Es, false) => (
            "No se pudo acceder con Google",
            "Volver a Pausa",
            "Inténtalo de nuevo o accede por email.",
        ),
    };
    let href = deep_link.replace('&', "&amp;");
    let html = format!(
        "<!doctype html><html lang=\"{}\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
         <meta name=\"robots\" content=\"noindex\"><meta http-equiv=\"refresh\" content=\"0;url={href}\"><title>{title}</title>\
         <style>body{{font:18px system-ui,sans-serif;background:#0b1114;color:#f4efe6;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}}\
         a{{display:inline-block;margin-top:1rem;padding:.9rem 1.4rem;background:#ff7a59;color:#0b1114;text-decoration:none;font-weight:700}}</style></head>\
         <body><main><h1>{title}</h1><p>{hint}</p><a href=\"{href}\">{button}</a></main></body></html>",
        locale_code(locale)
    );
    let mut res = Response::from_html(html)?;
    let h = res.headers_mut();
    h.set("Cache-Control", "no-store")?;
    h.set("Referrer-Policy", "no-referrer")?;
    h.set("X-Content-Type-Options", "nosniff")?;
    Ok(res)
}

/// `POST /api/auth/native/code` (with a web session): a one-time code for the native app, e.g. after Google sign-in in the
/// system browser. The app opens `pausa://auth?code=...` and exchanges it.
pub async fn native_code(req: Request, env: Env) -> Result<Response> {
    finish(native_code_inner(&req, &env).await)
}

async fn native_code_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let code = token_from_bytes(&random::<32>());
    let now = now_ms();
    db.prepare("INSERT INTO login_token(token_hash, kind, user_id, expires_at, created_at) VALUES (?1, 'native_code', ?2, ?3, ?4)")
        .bind(&[hash_token(&code).into(), s.user_id.into(), ((now + NATIVE_CODE_TTL_MS) as f64).into(), (now as f64).into()])?
        .run()
        .await?;
    json(&NativeCode { code }, 200)
}

#[derive(Deserialize)]
struct ExchangeIn {
    code: String,
    verifier: Option<String>,
}

#[derive(Deserialize)]
struct UserIdRow {
    user_id: String,
}

/// `POST /api/auth/native/exchange {code}`: swaps a one-time code for the app's own session token (Bearer). Single use.
pub async fn native_exchange(mut req: Request, env: Env) -> Result<Response> {
    finish(native_exchange_inner(&mut req, &env).await)
}

async fn native_exchange_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    limit::check(
        &db,
        &format!("native:ip:{}", client_ip(req)),
        limits::NATIVE_EXCHANGE,
    )
    .await?;
    let input: ExchangeIn = body(req).await?;
    let challenge = input.verifier.as_deref().map(hash_token);
    let now = now_ms();
    let used = db
        .prepare(
            "UPDATE login_token SET used_at = ?2 WHERE token_hash = ?1 AND kind = 'native_code' AND used_at IS NULL \
             AND expires_at > ?2 AND (native_challenge IS NULL OR native_challenge = ?3) RETURNING user_id",
        )
        .bind(&[
            hash_token(&input.code).into(),
            (now as f64).into(),
            challenge.map_or(worker::wasm_bindgen::JsValue::NULL, Into::into),
        ])?
        .first::<UserIdRow>(None)
        .await?
        .ok_or_else(Fail::unauthorized)?;
    let (token, stmt) = session::new_session(
        &db,
        "SELECT id FROM user WHERE id = ?1 AND disabled_at IS NULL",
        &used.user_id,
        "native",
        req.headers().get("user-agent")?,
    )?;
    let made = stmt
        .run()
        .await?
        .meta()?
        .and_then(|m| m.changes)
        .unwrap_or(0);
    if made != 1 {
        return Err(Fail::unauthorized()); // account disabled in the meantime
    }
    json(&NativeToken { token }, 200)
}
