//! Sign-in for app-store reviewers, who cannot receive an email link.
//!
//! Off unless BOTH `REVIEW_EMAIL` (a variable) and `REVIEW_PASSWORD` (set it as a secret: `wrangler secret put REVIEW_PASSWORD`)
//! are set: without them every route here answers 404, as if it did not exist, before reading the body or touching the
//! database. The password is only ever compared (hashed, in constant time), never stored, echoed or logged. The session is opened
//! on the fixed demo account `u-review`, never on an existing real account, and the address must not be an operator's.

use crate::admin::in_operator_list;
use crate::http::{body, client_ip, finish, json, now_ms, Fail, R};
use crate::{limit, session};
use pausa_core::limits;
use pausa_core::review::{
    password_matches, DEMO_FILMS, DEMO_LOGS, DEMO_PEOPLE, REVIEW_CIRCLE_ID, REVIEW_USER_ID,
};
use serde::Deserialize;
use worker::wasm_bindgen::JsValue;
use worker::*;

const DAY_S: i64 = 86_400;

/// A secret or a variable by name (a secret wins), `None` when it is not there.
fn read(env: &Env, name: &str) -> Option<String> {
    env.secret(name)
        .map(|v| v.to_string())
        .or_else(|_| env.var(name).map(|v| v.to_string()))
        .ok()
}

/// `(address, password)` when the review sign-in is configured. A blank value counts as missing.
fn config(env: &Env) -> Option<(String, String)> {
    let email = read(env, "REVIEW_EMAIL")?.trim().to_lowercase();
    // The password is compared as typed, not trimmed: only an empty one counts as missing.
    let password = read(env, "REVIEW_PASSWORD").filter(|v| !v.is_empty())?;
    if email.is_empty() {
        return None;
    }
    // The review account must never be an operator, or the shared password would open the admin area.
    let operators = read(env, "OPERATOR_EMAILS").unwrap_or_default();
    if in_operator_list(&operators, &email) {
        return None;
    }
    Some((email, password))
}

/// `GET /api/review`: 200 `{enabled: true}` when the review sign-in exists, 404 otherwise (the page then shows nothing).
pub async fn status(env: Env) -> Result<Response> {
    finish(match config(&env) {
        Some(_) => json(&serde_json::json!({ "enabled": true }), 200),
        None => Err(Fail::not_found()),
    })
}

#[derive(Deserialize)]
struct SignInIn {
    password: String,
    /// The native app wants the token in the body, not a cookie.
    native: Option<bool>,
}

/// `POST /api/review/sign-in {password, native?}`: right password, a session on the demo account (cookie, or a token for the
/// app) and the id of its demo Cerchia. Wrong: 401. Too many attempts from one address: 429. Not configured: 404.
pub async fn sign_in(mut req: Request, env: Env) -> Result<Response> {
    finish(sign_in_inner(&mut req, &env).await)
}

async fn sign_in_inner(req: &mut Request, env: &Env) -> R<Response> {
    let Some((email, expected)) = config(env) else {
        return Err(Fail::not_found());
    };
    let db = env.d1("DB")?;
    limit::check(
        &db,
        &format!("review:ip:{}", client_ip(req)),
        limits::REVIEW_LOGIN,
    )
    .await?;
    let input: SignInIn = body(req).await?;
    if !password_matches(&input.password, &expected) {
        return Err(Fail::unauthorized());
    }

    // The demo account, its Cerchia and its films: fixed ids and `INSERT OR IGNORE`, so every sign-in can repeat this.
    let now = now_ms();
    let n = |v: i64| JsValue::from_f64(v as f64);
    let mut stmts: Vec<D1PreparedStatement> = Vec::new();
    stmts.push(
        db.prepare("INSERT OR IGNORE INTO user(id, name, email, email_verified, locale, created_at, updated_at) VALUES (?1, 'Reviewer', ?2, 1, 'en', ?3, ?3)")
            .bind(&[REVIEW_USER_ID.into(), email.clone().into(), n(now)])?,
    );
    // The address may have changed since the account was made; keep it only if nobody else has it.
    stmts.push(
        db.prepare("UPDATE user SET email = ?2 WHERE id = ?1 AND email <> ?2 AND NOT EXISTS (SELECT 1 FROM user WHERE email = ?2)")
            .bind(&[REVIEW_USER_ID.into(), email.clone().into()])?,
    );
    for (id, name, mail, _) in DEMO_PEOPLE {
        stmts.push(
            db.prepare("INSERT OR IGNORE INTO user(id, name, email, email_verified, locale, created_at, updated_at) VALUES (?1, ?2, ?3, 1, 'en', ?4, ?4)")
                .bind(&[id.into(), name.into(), mail.into(), n(now)])?,
        );
    }
    stmts.push(
        db.prepare("INSERT OR IGNORE INTO circle(id, name, description, created_by, created_at) VALUES (?1, 'Demo circle', 'A small demo group for app review.', ?2, ?3)")
            .bind(&[REVIEW_CIRCLE_ID.into(), REVIEW_USER_ID.into(), n(now)])?,
    );
    stmts.push(
        db.prepare("INSERT OR IGNORE INTO circle_member(circle_id, user_id, role, joined_at) VALUES (?1, ?2, 'owner', ?3)")
            .bind(&[REVIEW_CIRCLE_ID.into(), REVIEW_USER_ID.into(), n(now)])?,
    );
    for (id, _, _, role) in DEMO_PEOPLE {
        stmts.push(
            db.prepare("INSERT OR IGNORE INTO circle_member(circle_id, user_id, role, joined_at) VALUES (?1, ?2, ?3, ?4)")
                .bind(&[REVIEW_CIRCLE_ID.into(), id.into(), role.into(), n(now)])?,
        );
    }
    for (id, title, year, runtime) in DEMO_FILMS {
        stmts.push(
            db.prepare("INSERT OR IGNORE INTO media_entity(id, kind, original_title, year, runtime_min, created_at) VALUES (?1, 'movie', ?2, ?3, ?4, ?5)")
                .bind(&[id.into(), title.into(), n(year), n(runtime), n(now)])?,
        );
    }
    for (i, (who, film, rating, days, review)) in DEMO_LOGS.iter().enumerate() {
        let log_id = format!("l-review-{who}-{i}");
        let media_id = DEMO_FILMS[*film].0;
        let at = n((now / 1000 - days * DAY_S) * 1000);
        let rating_arg = rating.map_or(JsValue::NULL, n);
        let review_arg = review.map_or(JsValue::NULL, JsValue::from_str);
        stmts.push(
            db.prepare("INSERT OR IGNORE INTO log(id, user_id, media_id, watched_on, rating, review, created_at, updated_at) VALUES (?1, ?2, ?3, date(?4 / 1000, 'unixepoch'), ?5, ?6, ?4, ?4)")
                .bind(&[log_id.clone().into(), (*who).into(), media_id.into(), at.clone(), rating_arg.clone(), review_arg])?,
        );
        stmts.push(
            db.prepare("INSERT OR IGNORE INTO log_share(log_id, circle_id, created_at) VALUES (?1, ?2, ?3)")
                .bind(&[log_id.into(), REVIEW_CIRCLE_ID.into(), at.clone()])?,
        );
        if !rating_arg.is_null() {
            stmts.push(
                db.prepare("INSERT OR IGNORE INTO rating_current(circle_id, user_id, media_id, rating, rated_at) VALUES (?1, ?2, ?3, ?4, ?5)")
                    .bind(&[REVIEW_CIRCLE_ID.into(), (*who).into(), media_id.into(), rating_arg, at])?,
            );
        }
    }
    let (token, session_stmt) = session::new_session(
        &db,
        "SELECT id FROM user WHERE id = ?1 AND disabled_at IS NULL",
        REVIEW_USER_ID,
        "review",
        req.headers().get("user-agent")?,
    )?;
    stmts.push(session_stmt);
    let results = db.batch(stmts).await?;
    let made = results
        .last()
        .and_then(|r| r.meta().ok().flatten())
        .and_then(|m| m.changes)
        .unwrap_or(0);
    if made != 1 {
        // The demo account is disabled, or its address is taken by someone else: nothing to open.
        return Err(Fail::not_found());
    }

    let mut res = if input.native == Some(true) {
        json(&serde_json::json!({ "token": token, "circleId": REVIEW_CIRCLE_ID }), 200)?
    } else {
        let mut r = json(&serde_json::json!({ "circleId": REVIEW_CIRCLE_ID }), 200)?;
        r.headers_mut()
            .append("Set-Cookie", &session::cookie_for(req, &token))?;
        r
    };
    res.headers_mut().set("Cache-Control", "no-store")?;
    Ok(res)
}
