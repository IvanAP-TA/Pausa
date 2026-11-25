//! Changing the sign-in email. Two steps, both needed: you ask while signed in, the new address gets a single-use link (15 minutes),
//! and the link only works for the person who asked (their session must be the one the token was made for). Nothing about the new
//! address leaks: asking for an address somebody else uses looks the same as asking for a free one.

use crate::catalog::locale_code;
use crate::http::{body, finish, is_loopback, json, now_ms, origin, random, Fail, R};
use crate::{limit, mail, session};
use pausa_core::auth::{hash_token, normalize_email, token_from_bytes, MAGIC_LINK_TTL_MS};
use pausa_core::dto::{Locale, MagicLinkSent};
use pausa_core::limits;
use serde::Deserialize;
use worker::*;

#[derive(Deserialize)]
struct ChangeIn {
    email: String,
    locale: Option<String>,
}

/// `POST /api/account/email {email, locale?}`: sends the confirmation link to the NEW address. Guests have no email to change.
pub async fn request(mut req: Request, env: Env) -> Result<Response> {
    finish(request_inner(&mut req, &env).await)
}

async fn request_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::invalid());
    }
    let input: ChangeIn = body(req).await?;
    let email = normalize_email(&input.email).ok_or_else(Fail::invalid)?;
    limit::check(
        &db,
        &format!("emailchange:user:{}", s.user_id),
        limits::MAGIC_LINK_EMAIL,
    )
    .await?;
    let locale = input
        .locale
        .as_deref()
        .and_then(Locale::from_code)
        .unwrap_or(Locale::It);
    let ok = |dev_link: Option<String>| json(&MagicLinkSent { ok: true, dev_link }, 200);

    let taken = db
        .prepare("SELECT 1 AS n FROM user WHERE email = ?1")
        .bind(&[email.as_str().into()])?
        .first::<serde_json::Value>(None)
        .await?;
    if taken.is_some() {
        // Same answer as for a free address; the owner of that address is not told anything either.
        return ok(None);
    }
    let token = token_from_bytes(&random::<32>());
    let now = now_ms();
    db.prepare("INSERT INTO login_token(token_hash, kind, email, user_id, expires_at, created_at) VALUES (?1, 'email_change', ?2, ?3, ?4, ?5)")
        .bind(&[
            hash_token(&token).into(),
            email.as_str().into(),
            s.user_id.as_str().into(),
            ((now + MAGIC_LINK_TTL_MS) as f64).into(),
            (now as f64).into(),
        ])?
        .run()
        .await?;
    let link = format!(
        "{}/api/account/email/confirm?token={token}&l={}",
        origin(req),
        locale_code(locale)
    );
    if env.secret("RESEND_API_KEY").is_err() {
        if is_loopback(req) {
            return ok(Some(link));
        }
        console_error!("RESEND_API_KEY is not set: the email change link cannot be sent");
        return Err(Fail::internal());
    }
    let (subject, text) = mail::email_change_text(locale, &link);
    if let Err(e) = mail::send(env, &email, &subject, &text).await {
        console_error!("email change mail failed: {e}");
    }
    ok(None)
}

#[derive(Deserialize)]
struct Pending {
    email: String,
    user_id: String,
}

/// `GET /api/account/email/confirm?token=&l=`: the link in the email. Needs the session of the person who asked. On success the
/// email changes, is marked verified, the email sign-in method follows it and every OTHER session is signed out.
pub async fn confirm(req: Request, env: Env) -> Result<Response> {
    let url = req.url()?;
    let locale = url
        .query_pairs()
        .find(|(k, _)| k == "l")
        .and_then(|(_, v)| Locale::from_code(&v))
        .unwrap_or(Locale::It);
    let back = |ok: bool| -> Result<Response> {
        let mut u = url.clone();
        u.set_path(&format!("/{}/me/account", locale_code(locale)));
        u.set_query(Some(if ok { "email=changed" } else { "email=failed" }));
        Response::redirect_with_status(u, 303)
    };
    match confirm_inner(&req, &env, &url).await {
        Ok(()) => back(true),
        Err(f) if f.status == 401 || f.status == 404 => back(false),
        Err(f) => finish(Err(f)),
    }
}

async fn confirm_inner(req: &Request, env: &Env, url: &Url) -> R<()> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let token = url
        .query_pairs()
        .find(|(k, _)| k == "token")
        .map(|(_, v)| v.to_string())
        .ok_or_else(Fail::not_found)?;
    let now = now_ms();
    // Atomic and tied to this person: only the first use, before expiry, by the person it was made for.
    let pending = db
        .prepare(
            "UPDATE login_token SET used_at = ?2 WHERE token_hash = ?1 AND kind = 'email_change' AND used_at IS NULL \
             AND expires_at > ?2 AND user_id = ?3 RETURNING email, user_id",
        )
        .bind(&[
            hash_token(&token).into(),
            (now as f64).into(),
            s.user_id.as_str().into(),
        ])?
        .first::<Pending>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    // The address may have been taken since the link was made: the unique index refuses and nothing changes.
    let changed = db
        .batch(vec![
            db.prepare("UPDATE user SET email = ?2, email_verified = 1, updated_at = ?3 WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM user WHERE email = ?2)")
                .bind(&[pending.user_id.as_str().into(), pending.email.as_str().into(), (now as f64).into()])?,
            db.prepare("UPDATE account SET provider_account_id = ?2 WHERE user_id = ?1 AND provider = 'email' AND EXISTS (SELECT 1 FROM user WHERE id = ?1 AND email = ?2)")
                .bind(&[pending.user_id.as_str().into(), pending.email.as_str().into()])?,
            db.prepare("DELETE FROM session WHERE user_id = ?1 AND id <> ?2 AND EXISTS (SELECT 1 FROM user WHERE id = ?1 AND email = ?3)")
                .bind(&[pending.user_id.as_str().into(), s.id.as_str().into(), pending.email.as_str().into()])?,
        ])
        .await?;
    let rows = changed[0].meta()?.and_then(|m| m.changes).unwrap_or(0);
    if rows == 0 {
        return Err(Fail::not_found());
    }
    Ok(())
}
