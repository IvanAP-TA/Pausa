//! Reading the current session from a request, and creating one.

use crate::http::{is_https, new_id, now_ms, random, Fail, R};
use pausa_core::auth::{
    hash_token, session_cookie, token_from_bearer, token_from_bytes, token_from_cookie_header,
    SESSION_TOUCH_MS, SESSION_TTL_MS,
};
use serde::Deserialize;
use worker::*;

pub struct Session {
    pub id: String,
    pub user_id: String,
    pub is_anonymous: bool,
}

#[derive(Deserialize)]
struct Row {
    id: String,
    user_id: String,
    is_anonymous: i64,
    expires_at: i64,
    last_seen_at: i64,
    disabled_at: Option<i64>,
}

/// The raw session token: `Authorization: Bearer` (native app) first, then the cookie (web).
pub fn token_of(req: &Request) -> Option<String> {
    if let Some(t) = req
        .headers()
        .get("authorization")
        .ok()
        .flatten()
        .as_deref()
        .and_then(token_from_bearer)
    {
        return Some(t.to_string());
    }
    let cookie = req.headers().get("cookie").ok().flatten()?;
    token_from_cookie_header(&cookie, is_https(req)).map(str::to_string)
}

/// One query. Renews the session (at most once a day, one written row) when it has been idle for a day.
pub async fn current(req: &Request, db: &D1Database) -> R<Option<Session>> {
    let Some(token) = token_of(req) else {
        return Ok(None);
    };
    let token_hash = hash_token(&token);
    let row = db
        .prepare(
            "SELECT s.id, s.user_id, u.is_anonymous, s.expires_at, s.last_seen_at, u.disabled_at \
             FROM session s JOIN user u ON u.id = s.user_id WHERE s.token_hash = ?1",
        )
        .bind(&[token_hash.into()])?
        .first::<Row>(None)
        .await?;
    let now = now_ms();
    let Some(r) = row else { return Ok(None) };
    if r.expires_at <= now || r.disabled_at.is_some() {
        return Ok(None);
    }
    if now - r.last_seen_at >= SESSION_TOUCH_MS {
        db.prepare("UPDATE session SET last_seen_at = ?1, expires_at = ?2 WHERE id = ?3")
            .bind(&[
                (now as f64).into(),
                ((now + SESSION_TTL_MS) as f64).into(),
                r.id.clone().into(),
            ])?
            .run()
            .await?;
    }
    Ok(Some(Session {
        id: r.id,
        user_id: r.user_id,
        is_anonymous: r.is_anonymous != 0,
    }))
}

pub async fn require(req: &Request, db: &D1Database) -> R<Session> {
    current(req, db).await?.ok_or_else(Fail::unauthorized)
}

/// A fresh token and the statement that stores its session for the user selected by `user_sql` (a scalar subquery taking
/// `?1` as its only parameter, which is bound to `user_arg`). Returns `(token, statement)`.
pub fn new_session(
    db: &D1Database,
    user_sql: &str,
    user_arg: &str,
    kind: &str,
    user_agent: Option<String>,
) -> R<(String, D1PreparedStatement)> {
    let token = token_from_bytes(&random::<32>());
    let now = now_ms();
    let sql = format!(
        "INSERT INTO session(id, token_hash, user_id, kind, user_agent, expires_at, last_seen_at, created_at) \
         SELECT ?2, ?3, ({user_sql}), ?4, ?5, ?6, ?7, ?7 WHERE ({user_sql}) IS NOT NULL"
    );
    let ua: worker::wasm_bindgen::JsValue = match user_agent {
        Some(s) => s.chars().take(200).collect::<String>().into(),
        None => worker::wasm_bindgen::JsValue::NULL,
    };
    let stmt = db.prepare(sql).bind(&[
        user_arg.into(),
        new_id().into(),
        hash_token(&token).into(),
        kind.into(),
        ua,
        ((now + SESSION_TTL_MS) as f64).into(),
        (now as f64).into(),
    ])?;
    Ok((token, stmt))
}

/// `Set-Cookie` header for a new web session.
pub fn cookie_for(req: &Request, token: &str) -> String {
    session_cookie(token, is_https(req), SESSION_TTL_MS / 1000)
}
