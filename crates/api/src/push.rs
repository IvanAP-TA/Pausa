//! Push notifications (Expo) and the daily email digest.
//!
//! Notifications are written where things happen (and already respect "muted" and the per-type switches). Delivery is a
//! separate job: the one-minute cron picks the notifications nobody has pushed yet (`pushed_at IS NULL`, last hour), says them in
//! words and sends them to the person's Expo devices in one request. A device Expo reports as gone is forgotten. Web Push
//! devices get a VAPID-signed push with no payload (`webpush.rs`).

use crate::diary::num;
use crate::http::{body, finish, new_id, no_content, now_ms, Fail, R};
use crate::{limit, mail, session};
use pausa_core::dto::Locale;
use pausa_core::limits;
use pausa_core::push::{dead_devices, digest, message, valid_endpoint, Note};
use serde::Deserialize;
use serde_json::json;
use worker::*;

const HOUR_MS: i64 = 3_600_000;
const EXPO_URL: &str = "https://exp.host/--/api/v2/push/send";
const MAX_DEVICES: i64 = 10;
/// Resend's free plan allows 100 emails a day and sign-in links come first: the digest never uses more than this per run.
const DIGEST_PER_RUN: i64 = 40;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterIn {
    kind: String,
    endpoint: String,
    p256dh: Option<String>,
    auth: Option<String>,
    locale: Option<String>,
}

/// `POST /api/me/push {kind: "expo"|"webpush", endpoint, p256dh?, auth?, locale?}`: this device wants push. Registering the same
/// endpoint again moves it to the current person (a shared phone) and refreshes its language.
pub async fn register(mut req: Request, env: Env) -> Result<Response> {
    finish(register_inner(&mut req, &env).await)
}

async fn register_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::invalid());
    }
    limit::check(&db, &format!("act:push:{}", s.user_id), limits::REPORT).await?;
    let input: RegisterIn = body(req).await?;
    if !valid_endpoint(&input.kind, &input.endpoint) {
        return Err(Fail::invalid());
    }
    if input.kind == "webpush"
        && (input.p256dh.as_deref().unwrap_or("").is_empty()
            || input.auth.as_deref().unwrap_or("").is_empty())
    {
        return Err(Fail::invalid());
    }
    let locale = input
        .locale
        .as_deref()
        .filter(|l| matches!(*l, "it" | "en" | "es"))
        .unwrap_or("it");
    #[derive(Deserialize)]
    struct Count {
        n: i64,
    }
    let have = db
        .prepare(
            "SELECT COUNT(*) AS n FROM push_subscription WHERE user_id = ?1 AND endpoint <> ?2",
        )
        .bind(&[s.user_id.as_str().into(), input.endpoint.as_str().into()])?
        .first::<Count>(None)
        .await?
        .map_or(0, |c| c.n);
    if have >= MAX_DEVICES {
        return Err(Fail::invalid());
    }
    let opt = |v: &Option<String>| {
        v.as_deref()
            .map_or(wasm_null(), worker::wasm_bindgen::JsValue::from)
    };
    db.prepare(
        "INSERT INTO push_subscription(id, user_id, kind, endpoint, p256dh, auth, locale, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, kind = excluded.kind, p256dh = excluded.p256dh, auth = excluded.auth, locale = excluded.locale",
    )
    .bind(&[
        new_id().into(),
        s.user_id.as_str().into(),
        input.kind.as_str().into(),
        input.endpoint.as_str().into(),
        opt(&input.p256dh),
        opt(&input.auth),
        locale.into(),
        num(now_ms()),
    ])?
    .run()
    .await?;
    no_content()
}

fn wasm_null() -> worker::wasm_bindgen::JsValue {
    worker::wasm_bindgen::JsValue::NULL
}

#[derive(Deserialize)]
struct UnregisterIn {
    endpoint: String,
}

/// `DELETE /api/me/push {endpoint}`: this device stops receiving push. Only your own devices can be removed.
pub async fn unregister(mut req: Request, env: Env) -> Result<Response> {
    finish(unregister_inner(&mut req, &env).await)
}

async fn unregister_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let input: UnregisterIn = body(req).await?;
    db.prepare("DELETE FROM push_subscription WHERE user_id = ?1 AND endpoint = ?2")
        .bind(&[s.user_id.as_str().into(), input.endpoint.as_str().into()])?
        .run()
        .await?;
    no_content()
}

#[derive(Deserialize)]
struct Pending {
    id: String,
    kind: String,
    circle_id: Option<String>,
    log_id: Option<String>,
    serata_code: Option<String>,
    actor: Option<String>,
    circle: Option<String>,
    title: Option<String>,
    endpoint: Option<String>,
    locale: Option<String>,
    sub_kind: Option<String>,
}

fn locale_of(code: Option<&str>) -> Locale {
    match code {
        Some("en") => Locale::En,
        Some("es") => Locale::Es,
        _ => Locale::It,
    }
}

/// Where tapping the push opens inside the app.
fn target(p: &Pending) -> String {
    match (&p.serata_code, &p.circle_id, &p.log_id) {
        (Some(code), _, _) => format!("/s/{code}"),
        (_, Some(c), Some(l)) => format!("/c/{c}/log/{l}"),
        (_, Some(c), None) => format!("/c/{c}"),
        _ => "/notifications".to_string(),
    }
}

/// Every minute. One read when there is nothing to do (partial index on `pushed_at IS NULL`).
pub async fn run_push(env: &Env) -> Result<()> {
    let db = env.d1("DB")?;
    let now = now_ms();
    let rows = db
        .prepare(
            "SELECT n.id, n.type AS kind, n.circle_id, n.log_id, n.serata_code, a.name AS actor, c.name AS circle, \
                    COALESCE(mt.title, e.original_title) AS title, p.endpoint, p.locale, p.kind AS sub_kind \
             FROM notification n LEFT JOIN push_subscription p ON p.user_id = n.user_id \
               LEFT JOIN user a ON a.id = n.actor_id LEFT JOIN circle c ON c.id = n.circle_id \
               LEFT JOIN media_entity e ON e.id = n.media_id LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = COALESCE(p.locale, 'it') \
             WHERE n.pushed_at IS NULL AND n.created_at > ?1 ORDER BY n.created_at LIMIT 100",
        )
        .bind(&[num(now - HOUR_MS)])?
        .all()
        .await?
        .results::<Pending>()?;
    if rows.is_empty() {
        return Ok(());
    }
    let mut ids: Vec<&str> = rows.iter().map(|r| r.id.as_str()).collect();
    ids.dedup();
    let mut seen = std::collections::HashSet::new();
    ids.retain(|i| seen.insert(*i));

    let sendable: Vec<&Pending> = rows
        .iter()
        .filter(|r| r.endpoint.is_some() && r.sub_kind.as_deref() == Some("expo"))
        .collect();
    // Web Push: no payload (see `webpush.rs`), one request per device; the service worker fetches what to show.
    for r in rows
        .iter()
        .filter(|r| r.sub_kind.as_deref() == Some("webpush"))
    {
        if let Some(endpoint) = r.endpoint.as_deref() {
            if crate::webpush::send(env, endpoint).await == crate::webpush::Outcome::Gone {
                db.prepare("DELETE FROM push_subscription WHERE endpoint = ?1")
                    .bind(&[endpoint.into()])?
                    .run()
                    .await?;
            }
        }
    }
    if !sendable.is_empty() {
        let messages: Vec<serde_json::Value> = sendable
            .iter()
            .map(|r| {
                let (title, text) = message(
                    locale_of(r.locale.as_deref()),
                    &Note {
                        kind: &r.kind,
                        actor: r.actor.as_deref().unwrap_or(""),
                        title: r.title.as_deref(),
                        circle: r.circle.as_deref(),
                    },
                );
                json!({ "to": r.endpoint, "title": title, "body": text, "sound": "default", "data": { "url": target(r) } })
            })
            .collect();
        match send_expo(env, &messages).await {
            Ok(tickets) => {
                let dead: Vec<&str> = dead_devices(&tickets)
                    .into_iter()
                    .filter_map(|i| sendable.get(i).and_then(|r| r.endpoint.as_deref()))
                    .collect();
                for endpoint in dead {
                    db.prepare("DELETE FROM push_subscription WHERE endpoint = ?1")
                        .bind(&[endpoint.into()])?
                        .run()
                        .await?;
                }
            }
            // Expo unreachable: leave the rows unpushed, the next minute tries again (they expire after an hour).
            Err(e) => {
                console_error!("expo push failed: {e}");
                return Ok(());
            }
        }
    }
    let list = crate::diary::placeholders(2, ids.len());
    let mut args: Vec<worker::wasm_bindgen::JsValue> = vec![num(now)];
    args.extend(ids.iter().map(|i| worker::wasm_bindgen::JsValue::from(*i)));
    db.prepare(format!(
        "UPDATE notification SET pushed_at = ?1 WHERE id IN ({list})"
    ))
    .bind(&args)?
    .run()
    .await?;
    Ok(())
}

async fn send_expo(env: &Env, messages: &[serde_json::Value]) -> Result<serde_json::Value> {
    let url = env
        .var("EXPO_PUSH_URL")
        .map_or_else(|_| EXPO_URL.to_string(), |v| v.to_string());
    let headers = Headers::new();
    headers.set("Content-Type", "application/json")?;
    headers.set("Accept", "application/json")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(serde_json::to_string(messages)?.into()));
    let mut res = Fetch::Request(Request::new_with_init(&url, &init)?)
        .send()
        .await?;
    if res.status_code() >= 300 {
        return Err(Error::RustError(format!(
            "expo answered {}",
            res.status_code()
        )));
    }
    let v: serde_json::Value = res.json().await?;
    Ok(v.get("data").cloned().unwrap_or(serde_json::Value::Null))
}

#[derive(Deserialize)]
struct Person {
    id: String,
    email: String,
    locale: Option<String>,
}

#[derive(Deserialize)]
struct Unread {
    kind: String,
    actor: Option<String>,
    circle: Option<String>,
    title: Option<String>,
}

/// Daily (17:00 UTC, like v1). People who asked for it and have unread notifications get one email; `digest_sent_at` is set before
/// sending so a failure cannot turn into a second email the same day. Needs `APP_URL` and the email key; otherwise it does nothing.
pub async fn run_digest(env: &Env) -> Result<()> {
    let Ok(app_url) = env.var("APP_URL").map(|v| v.to_string()) else {
        return Ok(());
    };
    if env.secret("RESEND_API_KEY").is_err() {
        return Ok(());
    }
    let db = env.d1("DB")?;
    let now = now_ms();
    let people = db
        .prepare(
            "SELECT u.id, u.email, u.locale FROM user u WHERE u.email_digest = 1 AND u.is_anonymous = 0 AND u.email_verified = 1 AND u.disabled_at IS NULL \
               AND (u.digest_sent_at IS NULL OR u.digest_sent_at < ?1) \
               AND EXISTS (SELECT 1 FROM notification n WHERE n.user_id = u.id AND n.read_at IS NULL AND n.created_at > COALESCE(u.digest_sent_at, 0)) \
             LIMIT ?2",
        )
        .bind(&[num(now - 20 * HOUR_MS), num(DIGEST_PER_RUN)])?
        .all()
        .await?
        .results::<Person>()?;
    for p in people {
        db.prepare("UPDATE user SET digest_sent_at = ?2 WHERE id = ?1")
            .bind(&[p.id.as_str().into(), num(now)])?
            .run()
            .await?;
        let loc = locale_of(p.locale.as_deref());
        let rows = db
            .prepare(
                "SELECT n.type AS kind, a.name AS actor, c.name AS circle, COALESCE(mt.title, e.original_title) AS title \
                 FROM notification n LEFT JOIN user a ON a.id = n.actor_id LEFT JOIN circle c ON c.id = n.circle_id \
                   LEFT JOIN media_entity e ON e.id = n.media_id LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 \
                 WHERE n.user_id = ?1 AND n.read_at IS NULL ORDER BY n.created_at DESC LIMIT 200",
            )
            .bind(&[p.id.as_str().into(), p.locale.as_deref().unwrap_or("it").into()])?
            .all()
            .await?
            .results::<Unread>()?;
        let lines: Vec<String> = rows
            .iter()
            .map(|r| {
                let (circle, body) = message(
                    loc,
                    &Note {
                        kind: &r.kind,
                        actor: r.actor.as_deref().unwrap_or(""),
                        title: r.title.as_deref(),
                        circle: r.circle.as_deref(),
                    },
                );
                format!("{circle}: {body}")
            })
            .collect();
        let code = p.locale.as_deref().unwrap_or("it");
        let (subject, text) = digest(
            loc,
            rows.len(),
            &lines,
            &format!("{}/{code}/home", app_url.trim_end_matches('/')),
        );
        if let Err(e) = mail::send(env, &p.email, &subject, &text).await {
            console_error!("digest to {} failed: {e}", p.id);
        }
    }
    Ok(())
}
