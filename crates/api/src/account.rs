//! The person's own account: data export, deletion, signed-in devices.

use crate::http::{body, finish, is_https, json, no_content, now_ms, Fail, R};
use crate::session;
use pausa_core::auth::clear_cookie;
use pausa_core::dto::SessionInfo;
use serde::Deserialize;
use serde_json::{json as obj, Value};
use worker::*;

/// `GET /api/account/export`: everything we hold about the person, as one downloadable JSON file. Tables that have no API yet
/// (logs, lists, ...) are included already, so the export is complete the day their screens arrive.
pub async fn export(req: Request, env: Env) -> Result<Response> {
    finish(export_inner(&req, &env).await)
}

async fn export_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if req
        .url()?
        .query_pairs()
        .any(|(k, v)| k == "format" && v == "csv")
    {
        return diary_csv(&db, &s.user_id).await;
    }
    let me = [s.user_id.as_str().into()];
    let q = |sql: &str| -> R<D1PreparedStatement> { Ok(db.prepare(sql).bind(&me)?) };
    let results = db
        .batch(vec![
            q("SELECT id, name, email, locale, country, bio, favorite_genres, email_digest, created_at FROM user WHERE id = ?1")?,
            q("SELECT c.id, c.name, m.role, m.joined_at FROM circle_member m JOIN circle c ON c.id = m.circle_id WHERE m.user_id = ?1")?,
            q("SELECT l.id, e.original_title AS title, e.kind, e.year, l.watched_on, l.rating, l.review, l.platform, l.season, l.episode, \
               l.is_rewatch, l.created_at FROM log l JOIN media_entity e ON e.id = l.media_id WHERE l.user_id = ?1 ORDER BY l.watched_on")?,
            q("SELECT id, log_id, circle_id, body, created_at FROM comment WHERE user_id = ?1")?,
            q("SELECT l.id, l.name, l.kind, l.circle_id, e.original_title AS title, i.note, i.position FROM list l \
               LEFT JOIN list_item i ON i.list_id = l.id LEFT JOIN media_entity e ON e.id = i.media_id WHERE l.owner_id = ?1 ORDER BY l.id, i.position")?,
            q("SELECT e.original_title AS title, f.position FROM favorite f JOIN media_entity e ON e.id = f.media_id WHERE f.user_id = ?1 ORDER BY f.position")?,
            q("SELECT e.original_title AS title, w.season, w.episode, w.status, w.updated_at FROM watch_progress w JOIN media_entity e ON e.id = w.media_id WHERE w.user_id = ?1")?,
        ])
        .await?;
    let rows = |i: usize| -> R<Vec<Value>> { Ok(results[i].results::<Value>()?) };
    let body = obj!({
        "exportedAt": now_ms(),
        "profile": rows(0)?.into_iter().next(),
        "circles": rows(1)?,
        "logs": rows(2)?,
        "comments": rows(3)?,
        "lists": rows(4)?,
        "favorites": rows(5)?,
        "watchProgress": rows(6)?,
    });
    let mut res = json(&body, 200)?;
    res.headers_mut().set(
        "Content-Disposition",
        "attachment; filename=\"pausa-data.json\"",
    )?;
    Ok(res)
}

#[derive(Deserialize)]
struct CsvRow {
    watched_on: String,
    title: String,
    year: Option<i64>,
    rating: Option<i64>,
    is_rewatch: i64,
    review: Option<String>,
    kind: String,
    season: Option<i64>,
    episode: Option<i64>,
    platform: Option<String>,
}

/// `GET /api/account/export?format=csv`: the whole diary, one row per viewing (a Letterboxd-style file). Up to 20 000 rows.
async fn diary_csv(db: &D1Database, user_id: &str) -> R<Response> {
    let rows = db
        .prepare(
            "SELECT l.watched_on, e.original_title AS title, e.year, l.rating, l.is_rewatch, l.review, e.kind, l.season, l.episode, l.platform              FROM log l JOIN media_entity e ON e.id = l.media_id WHERE l.user_id = ?1 ORDER BY l.watched_on, l.created_at LIMIT 20000",
        )
        .bind(&[user_id.into()])?
        .all()
        .await?
        .results::<CsvRow>()?;
    let entries: Vec<pausa_core::export::Entry> = rows
        .iter()
        .map(|r| pausa_core::export::Entry {
            watched_on: &r.watched_on,
            title: &r.title,
            year: r.year,
            rating: r.rating,
            rewatch: r.is_rewatch != 0,
            review: r.review.as_deref(),
            kind: &r.kind,
            season: r.season,
            episode: r.episode,
            platform: r.platform.as_deref(),
        })
        .collect();
    let mut res = Response::ok(pausa_core::export::diary_csv(&entries))?;
    let h = res.headers_mut();
    h.set("Content-Type", "text/csv; charset=utf-8")?;
    h.set(
        "Content-Disposition",
        "attachment; filename=\"pausa-diario.csv\"",
    )?;
    h.set("Cache-Control", "no-store")?;
    Ok(res)
}

#[derive(Deserialize)]
struct DeleteIn {
    confirm: bool,
}

#[derive(Deserialize)]
struct Successor {
    circle_id: String,
    successor: Option<String>,
}

/// `DELETE /api/account {confirm: true}`. One atomic batch: every Cerchia they own goes to the longest-standing admin, else the
/// longest-standing member, else it is deleted with them; then the account and everything that cascades from it.
pub async fn delete(mut req: Request, env: Env) -> Result<Response> {
    finish(delete_inner(&mut req, &env).await)
}

async fn delete_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let input: DeleteIn = body(req).await?;
    if !input.confirm {
        return Err(Fail::invalid());
    }
    // Same order as `pausa_core::circles::next_owner`: admins first, then members, oldest first.
    let owned = db
        .prepare(
            "SELECT m.circle_id, (SELECT m2.user_id FROM circle_member m2 WHERE m2.circle_id = m.circle_id AND m2.user_id <> ?1 \
               ORDER BY CASE m2.role WHEN 'admin' THEN 0 ELSE 1 END, m2.joined_at, m2.user_id LIMIT 1) AS successor \
             FROM circle_member m WHERE m.user_id = ?1 AND m.role = 'owner'",
        )
        .bind(&[s.user_id.as_str().into()])?
        .all()
        .await?
        .results::<Successor>()?;
    let mut stmts = Vec::with_capacity(owned.len() * 2 + 1);
    for o in &owned {
        match &o.successor {
            Some(next) => {
                // The old owner steps down first so the one-owner index holds at every step.
                stmts.push(
                    db.prepare("UPDATE circle_member SET role = 'admin' WHERE circle_id = ?1 AND user_id = ?2")
                        .bind(&[o.circle_id.as_str().into(), s.user_id.as_str().into()])?,
                );
                stmts.push(
                    db.prepare("UPDATE circle_member SET role = 'owner' WHERE circle_id = ?1 AND user_id = ?2")
                        .bind(&[o.circle_id.as_str().into(), next.as_str().into()])?,
                );
            }
            None => stmts.push(
                db.prepare("DELETE FROM circle WHERE id = ?1")
                    .bind(&[o.circle_id.as_str().into()])?,
            ),
        }
    }
    stmts.push(
        db.prepare("DELETE FROM user WHERE id = ?1")
            .bind(&[s.user_id.as_str().into()])?,
    );
    db.batch(stmts).await?;
    let mut res = no_content()?;
    res.headers_mut()
        .append("Set-Cookie", &clear_cookie(is_https(req)))?;
    Ok(res)
}

#[derive(Deserialize)]
struct SessionRow {
    id: String,
    kind: String,
    user_agent: Option<String>,
    created_at: i64,
    last_seen_at: i64,
}

/// `GET /api/account/sessions`: the devices signed in, this one marked.
pub async fn sessions(req: Request, env: Env) -> Result<Response> {
    finish(sessions_inner(&req, &env).await)
}

async fn sessions_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let rows = db
        .prepare("SELECT id, kind, user_agent, created_at, last_seen_at FROM session WHERE user_id = ?1 AND expires_at > ?2 ORDER BY last_seen_at DESC")
        .bind(&[s.user_id.as_str().into(), (now_ms() as f64).into()])?
        .all()
        .await?
        .results::<SessionRow>()?;
    let list: Vec<SessionInfo> = rows
        .into_iter()
        .map(|r| SessionInfo {
            current: r.id == s.id,
            id: r.id,
            kind: r.kind,
            user_agent: r.user_agent,
            created_at: r.created_at,
            last_seen_at: r.last_seen_at,
        })
        .collect();
    json(&list, 200)
}

/// `DELETE /api/account/sessions/:id`: signs one of the person's devices out (their own sessions only).
pub async fn revoke_session(req: Request, env: Env, id: &str) -> Result<Response> {
    finish(revoke_inner(&req, &env, id).await)
}

async fn revoke_inner(req: &Request, env: &Env, id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    db.prepare("DELETE FROM session WHERE id = ?1 AND user_id = ?2")
        .bind(&[id.into(), s.user_id.as_str().into()])?
        .run()
        .await?;
    no_content()
}
