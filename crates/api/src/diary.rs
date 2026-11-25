//! The diary: writing, editing and deleting a viewing, choosing which Cerchie see it, and reading it back (own diary, a
//! Cerchia's feed, one viewing with its thread). A viewing is visible only where it was shared (`log_share`).

use crate::catalog;
use crate::http::{body, finish, json, new_id, no_content, now_ms, Fail, R};
use crate::{limit, session};
use pausa_core::catalog::Key;
use pausa_core::diary::{
    clamp_position, clean_log, date_of_ms, sets_title_rating, LogError, LogInput, MAX_WATCHED_WITH,
};
use pausa_core::dto::{
    CommentDto, ErrorCode, Locale, LogCreated, LogDto, LogPage, LogThread, MediaDto, PersonDto,
    ReactionCount, Removed,
};
use pausa_core::limits;
use serde::Deserialize;
use worker::wasm_bindgen::JsValue;
use worker::*;

/// A viewing can be shared with at most this many Cerchie at once.
const MAX_SHARES: usize = 20;
const PAGE: usize = 20;

pub fn num(v: i64) -> JsValue {
    (v as f64).into()
}

fn opt_num(v: Option<i64>) -> JsValue {
    v.map_or(JsValue::NULL, num)
}

fn opt_str(v: &Option<String>) -> JsValue {
    v.as_deref().map_or(JsValue::NULL, JsValue::from)
}

fn log_error(e: LogError) -> Fail {
    let _ = e;
    Fail::invalid()
}

/// `?1, ?2` style placeholders for an IN list starting at parameter `start`.
pub fn placeholders(start: usize, n: usize) -> String {
    (start..start + n)
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn query_param(req: &Request, name: &str) -> Option<String> {
    req.url()
        .ok()?
        .query_pairs()
        .find(|(k, _)| k == name)
        .map(|(_, v)| v.to_string())
        .filter(|v| !v.is_empty())
}

pub fn locale_of(req: &Request) -> Locale {
    query_param(req, "locale")
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
        })
}

/// Recomputes, for one person and one title, the rating that counts in every Cerchia the title is shared with: the latest rated
/// whole-title viewing shared there. Two statements, run after any write that can change it.
pub fn rating_refresh(
    db: &D1Database,
    user_id: &str,
    media_id: &str,
) -> Result<Vec<D1PreparedStatement>> {
    Ok(vec![
        db.prepare("DELETE FROM rating_current WHERE user_id = ?1 AND media_id = ?2").bind(&[user_id.into(), media_id.into()])?,
        db.prepare(
            "INSERT INTO rating_current(circle_id, user_id, media_id, rating, rated_at) \
             SELECT s.circle_id, l.user_id, l.media_id, l.rating, l.created_at FROM log l JOIN log_share s ON s.log_id = l.id \
             WHERE l.user_id = ?1 AND l.media_id = ?2 AND l.season IS NULL AND l.episode IS NULL AND l.rating IS NOT NULL \
               AND l.id = (SELECT l2.id FROM log l2 JOIN log_share s2 ON s2.log_id = l2.id AND s2.circle_id = s.circle_id \
                           WHERE l2.user_id = l.user_id AND l2.media_id = l.media_id AND l2.season IS NULL AND l2.episode IS NULL \
                             AND l2.rating IS NOT NULL ORDER BY l2.watched_on DESC, l2.created_at DESC, l2.id DESC LIMIT 1)",
        )
        .bind(&[user_id.into(), media_id.into()])?,
    ])
}

#[derive(Deserialize)]
struct CircleIdRow {
    circle_id: String,
}

#[derive(Deserialize)]
struct UserIdRow {
    user_id: String,
}

#[derive(Deserialize)]
struct SeasonRow {
    season: i64,
    episodes: i64,
}

#[derive(Deserialize)]
struct KindRow {
    kind: String,
}

fn dedupe(mut v: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    v.retain(|x| seen.insert(x.clone()));
    v
}

/// Which of `circles` the person belongs to, as a statement for a batch. All must match or the request is refused.
fn membership_stmt(
    db: &D1Database,
    user_id: &str,
    circles: &[String],
) -> Result<D1PreparedStatement> {
    let mut args: Vec<JsValue> = vec![user_id.into()];
    args.extend(circles.iter().map(|c| JsValue::from(c.as_str())));
    db.prepare(format!(
        "SELECT circle_id FROM circle_member WHERE user_id = ?1 AND circle_id IN ({})",
        placeholders(2, circles.len())
    ))
    .bind(&args)
}

/// People who may be tagged "watched with": members (not me) of any of the Cerchie the viewing is shared with.
fn people_stmt(
    db: &D1Database,
    user_id: &str,
    circles: &[String],
    wanted: &[String],
) -> Result<D1PreparedStatement> {
    let mut args: Vec<JsValue> = vec![user_id.into()];
    args.extend(circles.iter().map(|c| JsValue::from(c.as_str())));
    args.extend(wanted.iter().map(|c| JsValue::from(c.as_str())));
    let c = circles.len();
    db.prepare(format!(
        "SELECT DISTINCT user_id FROM circle_member WHERE user_id <> ?1 AND circle_id IN ({}) AND user_id IN ({})",
        placeholders(2, c),
        placeholders(2 + c, wanted.len())
    ))
    .bind(&args)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogIn {
    watched_on: String,
    rating: Option<i64>,
    review: Option<String>,
    platform: Option<String>,
    season: Option<i64>,
    episode: Option<i64>,
    #[serde(default)]
    contains_spoilers: bool,
    #[serde(default)]
    is_rewatch: bool,
    #[serde(default)]
    watched_with: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateIn {
    media_key: String,
    #[serde(flatten)]
    log: LogIn,
    /// The Cerchie that see it. Empty = private (only in my own diary).
    #[serde(default)]
    circles: Vec<String>,
    locale: Option<String>,
}

impl LogIn {
    fn input(&self) -> LogInput {
        LogInput {
            watched_on: self.watched_on.clone(),
            rating: self.rating,
            review: self.review.clone(),
            platform: self.platform.clone(),
            season: self.season,
            episode: self.episode,
        }
    }
}

/// `POST /api/logs`: write a viewing. `mediaKey` is a search result's key; the title is created from the catalogue on first use.
pub async fn create(mut req: Request, env: Env) -> Result<Response> {
    finish(create_inner(&mut req, &env).await)
}

async fn create_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    // A retried request (offline queue, an answer that got lost) carries the same `Idempotency-Key`: the first one wins and the
    // retry gets that log back, without costing a rate-limit slot or a catalogue call.
    let idem = idempotency_key(req)?;
    if let Some(k) = &idem {
        if let Some(done) = logged_with_key(&db, &s.user_id, k).await? {
            return json(&done, 200);
        }
    }
    limit::check(
        &db,
        &format!("act:createLog:{}", s.user_id),
        limits::CREATE_LOG,
    )
    .await?;
    let input: CreateIn = body(req).await?;
    let now = now_ms();
    let clean = clean_log(&input.log.input(), &date_of_ms(now)).map_err(log_error)?;
    let circles = dedupe(input.circles);
    if circles.len() > MAX_SHARES || input.log.watched_with.len() > MAX_WATCHED_WITH {
        return Err(Fail::invalid());
    }
    let key = Key::parse(&input.media_key).ok_or_else(Fail::invalid)?;
    let locale = input
        .locale
        .as_deref()
        .and_then(Locale::from_code)
        .unwrap_or_else(|| locale_of(req));
    // Membership and taggable people first: a refused request must not cost a catalogue call or leave a title behind.
    let wanted = dedupe(input.log.watched_with);
    let mut people: Vec<String> = Vec::new();
    if !circles.is_empty() {
        let mut pre = vec![membership_stmt(&db, &s.user_id, &circles)?];
        if !wanted.is_empty() {
            pre.push(people_stmt(&db, &s.user_id, &circles, &wanted)?);
        }
        let res = db.batch(pre).await?;
        if res[0].results::<CircleIdRow>()?.len() != circles.len() {
            return Err(Fail::new(ErrorCode::Forbidden, 403));
        }
        if !wanted.is_empty() {
            people = res[1]
                .results::<UserIdRow>()?
                .into_iter()
                .map(|r| r.user_id)
                .collect();
        }
    }

    let media_id = catalog::resolve(env, &db, &s.user_id, &key, locale).await?;
    let res = db
        .batch(vec![
            db.prepare(
                "SELECT season, episodes FROM media_season WHERE media_id = ?1 ORDER BY season",
            )
            .bind(&[media_id.as_str().into()])?,
            db.prepare("SELECT kind FROM media_entity WHERE id = ?1")
                .bind(&[media_id.as_str().into()])?,
        ])
        .await?;
    let seasons: Vec<(i64, i64)> = res[0]
        .results::<SeasonRow>()?
        .into_iter()
        .map(|r| (r.season, r.episodes))
        .collect();
    let kind = res[1]
        .results::<KindRow>()?
        .into_iter()
        .next()
        .map(|k| k.kind)
        .unwrap_or_default();
    let (season, episode) = clamp_position(clean.season, clean.episode, &seasons);
    let log_id = new_id();
    let mut stmts = vec![db
        .prepare(
            "INSERT INTO log(id, user_id, media_id, watched_on, rating, review, contains_spoilers, platform, season, episode, is_rewatch, created_at, updated_at, idempotency_key) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?13)",
        )
        .bind(&[
            log_id.as_str().into(),
            s.user_id.as_str().into(),
            media_id.as_str().into(),
            clean.watched_on.as_str().into(),
            opt_num(clean.rating.map(i64::from)),
            opt_str(&clean.review),
            num(i64::from(input.log.contains_spoilers)),
            opt_str(&clean.platform),
            opt_num(season),
            opt_num(episode),
            num(i64::from(input.log.is_rewatch)),
            num(now),
            idem.as_deref().map_or(JsValue::NULL, JsValue::from),
        ])?];
    for p in &people {
        stmts.push(
            db.prepare("INSERT INTO log_watched_with(log_id, user_id) VALUES (?1, ?2)")
                .bind(&[log_id.as_str().into(), p.as_str().into()])?,
        );
    }
    for c in &circles {
        stmts.push(
            db.prepare("INSERT INTO log_share(log_id, circle_id, created_at) VALUES (?1, ?2, ?3)")
                .bind(&[log_id.as_str().into(), c.as_str().into(), num(now)])?,
        );
        stmts.push(
            db.prepare(
                "INSERT INTO notification(id, user_id, type, actor_id, circle_id, log_id, media_id, created_at) \
                 SELECT lower(hex(randomblob(16))), m.user_id, 'log', ?1, ?2, ?3, ?4, ?5 FROM circle_member m \
                 WHERE m.circle_id = ?2 AND m.user_id <> ?1 AND m.muted = 0 \
                   AND NOT EXISTS (SELECT 1 FROM notification_off o WHERE o.user_id = m.user_id AND o.type = 'log')",
            )
            .bind(&[s.user_id.as_str().into(), c.as_str().into(), log_id.as_str().into(), media_id.as_str().into(), num(now)])?,
        );
    }
    if sets_title_rating(season, episode) && clean.rating.is_some() {
        stmts.extend(rating_refresh(&db, &s.user_id, &media_id)?);
    }
    // Series and anime: where I am. A whole-title log finishes it; an episode or season log moves the bookmark.
    if kind != "movie" {
        let status = if sets_title_rating(season, episode) {
            "done"
        } else {
            "watching"
        };
        stmts.push(
            db.prepare(
                "INSERT INTO watch_progress(user_id, media_id, season, episode, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
                 ON CONFLICT(user_id, media_id) DO UPDATE SET season = excluded.season, episode = excluded.episode, \
                 status = excluded.status, updated_at = excluded.updated_at",
            )
            .bind(&[s.user_id.as_str().into(), media_id.as_str().into(), opt_num(season), opt_num(episode), status.into(), num(now)])?,
        );
    }
    if let Err(e) = db.batch(stmts).await {
        // Two copies of the same request at once: the unique index let one through; the other gets that log back.
        if let Some(k) = &idem {
            if let Some(done) = logged_with_key(&db, &s.user_id, k).await? {
                return json(&done, 200);
            }
        }
        return Err(e.into());
    }
    json(
        &LogCreated {
            id: log_id,
            media_id,
        },
        201,
    )
}

/// The `Idempotency-Key` header: 1 to 64 characters of letters, digits, `-`, `_` or `:`; anything else is refused.
fn idempotency_key(req: &Request) -> R<Option<String>> {
    let Some(v) = req.headers().get("idempotency-key").ok().flatten() else {
        return Ok(None);
    };
    let v = v.trim();
    if v.is_empty()
        || v.len() > 64
        || !v
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b':'))
    {
        return Err(Fail::invalid());
    }
    Ok(Some(v.to_string()))
}

async fn logged_with_key(db: &D1Database, user_id: &str, key: &str) -> R<Option<LogCreated>> {
    #[derive(Deserialize)]
    struct Row {
        id: String,
        media_id: String,
    }
    Ok(db
        .prepare("SELECT id, media_id FROM log WHERE user_id = ?1 AND idempotency_key = ?2")
        .bind(&[user_id.into(), key.into()])?
        .first::<Row>(None)
        .await?
        .map(|r| LogCreated {
            id: r.id,
            media_id: r.media_id,
        }))
}

#[derive(Deserialize)]
struct OwnerRow {
    user_id: String,
    media_id: String,
}

async fn own_log(db: &D1Database, log_id: &str, user_id: &str) -> R<OwnerRow> {
    let row = db
        .prepare("SELECT user_id, media_id FROM log WHERE id = ?1")
        .bind(&[log_id.into()])?
        .first::<OwnerRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    // Someone else's viewing is not found, not forbidden: whether it exists is theirs to share.
    if row.user_id != user_id {
        return Err(Fail::not_found());
    }
    Ok(row)
}

/// `PUT /api/logs/:id`: replaces the editable fields (date, rating, review, platform, season, episode, spoilers, rewatch, who
/// watched with). Not the title and not the sharing (see `PUT /api/logs/:id/shares`).
pub async fn update(mut req: Request, env: Env, log_id: &str) -> Result<Response> {
    finish(update_inner(&mut req, &env, log_id).await)
}

async fn update_inner(req: &mut Request, env: &Env, log_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let owned = own_log(&db, log_id, &s.user_id).await?;
    let input: LogIn = body(req).await?;
    let now = now_ms();
    let clean = clean_log(&input.input(), &date_of_ms(now)).map_err(log_error)?;
    let wanted = dedupe(input.watched_with);
    if wanted.len() > MAX_WATCHED_WITH {
        return Err(Fail::invalid());
    }

    let shared = db
        .prepare("SELECT circle_id FROM log_share WHERE log_id = ?1")
        .bind(&[log_id.into()])?;
    let seasons = db
        .prepare("SELECT season, episodes FROM media_season WHERE media_id = ?1 ORDER BY season")
        .bind(&[owned.media_id.as_str().into()])?;
    let res = db.batch(vec![shared, seasons]).await?;
    let circles: Vec<String> = res[0]
        .results::<CircleIdRow>()?
        .into_iter()
        .map(|r| r.circle_id)
        .collect();
    let seasons: Vec<(i64, i64)> = res[1]
        .results::<SeasonRow>()?
        .into_iter()
        .map(|r| (r.season, r.episodes))
        .collect();
    let (season, episode) = clamp_position(clean.season, clean.episode, &seasons);
    let people: Vec<String> = if circles.is_empty() || wanted.is_empty() {
        Vec::new()
    } else {
        people_stmt(&db, &s.user_id, &circles, &wanted)?
            .all()
            .await?
            .results::<UserIdRow>()?
            .into_iter()
            .map(|r| r.user_id)
            .collect()
    };

    let mut stmts = vec![
        db.prepare(
            "UPDATE log SET watched_on = ?2, rating = ?3, review = ?4, platform = ?5, season = ?6, episode = ?7, contains_spoilers = ?8, \
             is_rewatch = ?9, updated_at = ?10 WHERE id = ?1",
        )
        .bind(&[
            log_id.into(),
            clean.watched_on.as_str().into(),
            opt_num(clean.rating.map(i64::from)),
            opt_str(&clean.review),
            opt_str(&clean.platform),
            opt_num(season),
            opt_num(episode),
            num(i64::from(input.contains_spoilers)),
            num(i64::from(input.is_rewatch)),
            num(now),
        ])?,
        db.prepare("DELETE FROM log_watched_with WHERE log_id = ?1").bind(&[log_id.into()])?,
    ];
    for p in &people {
        stmts.push(
            db.prepare("INSERT INTO log_watched_with(log_id, user_id) VALUES (?1, ?2)")
                .bind(&[log_id.into(), p.as_str().into()])?,
        );
    }
    stmts.extend(rating_refresh(&db, &s.user_id, &owned.media_id)?);
    db.batch(stmts).await?;
    no_content()
}

/// `DELETE /api/logs/:id`: only the author. Shares, thread, reactions and notices go with it (cascade).
pub async fn delete(req: Request, env: Env, log_id: &str) -> Result<Response> {
    finish(delete_inner(&req, &env, log_id).await)
}

async fn delete_inner(req: &Request, env: &Env, log_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let owned = own_log(&db, log_id, &s.user_id).await?;
    let mut stmts = vec![db
        .prepare("DELETE FROM log WHERE id = ?1")
        .bind(&[log_id.into()])?];
    stmts.extend(rating_refresh(&db, &s.user_id, &owned.media_id)?);
    db.batch(stmts).await?;
    no_content()
}

#[derive(Deserialize)]
struct SharesIn {
    circles: Vec<String>,
}

/// `PUT /api/logs/:id/shares {circles}`: the exact set of Cerchie that see this viewing. Empty = private. Taking a Cerchia out
/// also removes what that Cerchia wrote under it (its thread and reactions); adding one makes it arrive there now.
pub async fn set_shares(mut req: Request, env: Env, log_id: &str) -> Result<Response> {
    finish(shares_inner(&mut req, &env, log_id).await)
}

async fn shares_inner(req: &mut Request, env: &Env, log_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let owned = own_log(&db, log_id, &s.user_id).await?;
    let input: SharesIn = body(req).await?;
    let circles = dedupe(input.circles);
    if circles.len() > MAX_SHARES {
        return Err(Fail::invalid());
    }
    if !circles.is_empty()
        && membership_stmt(&db, &s.user_id, &circles)?
            .all()
            .await?
            .results::<CircleIdRow>()?
            .len()
            != circles.len()
    {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    let now = now_ms();
    let mut keep_args: Vec<JsValue> = vec![log_id.into()];
    keep_args.extend(circles.iter().map(|c| JsValue::from(c.as_str())));
    let not_in = if circles.is_empty() {
        "1 = 1".to_string()
    } else {
        format!("circle_id NOT IN ({})", placeholders(2, circles.len()))
    };
    let mut stmts = vec![
        db.prepare(format!(
            "DELETE FROM comment WHERE log_id = ?1 AND {not_in}"
        ))
        .bind(&keep_args)?,
        db.prepare(format!(
            "DELETE FROM reaction WHERE log_id = ?1 AND {not_in}"
        ))
        .bind(&keep_args)?,
        db.prepare(format!(
            "DELETE FROM log_share WHERE log_id = ?1 AND {not_in}"
        ))
        .bind(&keep_args)?,
    ];
    for c in &circles {
        stmts.push(db.prepare("INSERT OR IGNORE INTO log_share(log_id, circle_id, created_at) VALUES (?1, ?2, ?3)").bind(&[log_id.into(), c.as_str().into(), num(now)])?);
    }
    stmts.extend(rating_refresh(&db, &s.user_id, &owned.media_id)?);
    db.batch(stmts).await?;
    no_content()
}

#[derive(Deserialize)]
struct WithdrawIn {
    confirm: String,
}

/// `POST /api/circles/:id/withdraw {confirm: "PAUSA"}`: takes every one of my viewings out of this Cerchia without deleting
/// them. One statement, not the share-by-share dance v1 needed.
pub async fn withdraw(mut req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(withdraw_inner(&mut req, &env, circle_id).await)
}

#[derive(Deserialize)]
struct CountRow {
    n: i64,
}

async fn withdraw_inner(req: &mut Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    crate::manage::my_role(&db, circle_id, &s.user_id).await?;
    let input: WithdrawIn = body(req).await?;
    if input.confirm.trim().to_uppercase() != "PAUSA" {
        return Err(Fail::invalid());
    }
    let res = db
        .batch(vec![
            db.prepare("SELECT COUNT(*) AS n FROM log_share WHERE circle_id = ?1 AND log_id IN (SELECT id FROM log WHERE user_id = ?2)")
                .bind(&[circle_id.into(), s.user_id.as_str().into()])?,
            db.prepare("DELETE FROM log_share WHERE circle_id = ?1 AND log_id IN (SELECT id FROM log WHERE user_id = ?2)")
                .bind(&[circle_id.into(), s.user_id.as_str().into()])?,
            db.prepare("DELETE FROM rating_current WHERE circle_id = ?1 AND user_id = ?2").bind(&[circle_id.into(), s.user_id.as_str().into()])?,
            db.prepare("DELETE FROM comment WHERE circle_id = ?1 AND log_id IN (SELECT id FROM log WHERE user_id = ?2)")
                .bind(&[circle_id.into(), s.user_id.as_str().into()])?,
            db.prepare("DELETE FROM reaction WHERE circle_id = ?1 AND log_id IN (SELECT id FROM log WHERE user_id = ?2)")
                .bind(&[circle_id.into(), s.user_id.as_str().into()])?,
        ])
        .await?;
    let n = res[0].results::<CountRow>()?.first().map_or(0, |r| r.n);
    json(&Removed { removed: n as u32 }, 200)
}

/* ───────────── reading ───────────── */

#[derive(Deserialize)]
struct LogRow {
    id: String,
    user_id: String,
    user_name: String,
    user_image: Option<String>,
    media_id: String,
    kind: String,
    original_title: String,
    loc_title: Option<String>,
    year: Option<i64>,
    poster_path: Option<String>,
    watched_on: String,
    rating: Option<i64>,
    review: Option<String>,
    contains_spoilers: i64,
    platform: Option<String>,
    season: Option<i64>,
    episode: Option<i64>,
    is_rewatch: i64,
    arrived_at: i64,
    comments: i64,
    reactions: String,
    shared_in: String,
}

#[derive(Deserialize)]
struct ReactionJson {
    e: String,
    c: i64,
    m: i64,
}

const LOG_COLS: &str = "l.id, l.user_id, u.name AS user_name, u.image AS user_image, l.media_id, e.kind, e.original_title, mt.title AS loc_title, \
    e.year, e.poster_path, l.watched_on, l.rating, l.review, l.contains_spoilers, l.platform, l.season, l.episode, l.is_rewatch";

fn to_dto(r: LogRow, viewer: &str, reveal: bool) -> LogDto {
    let hidden = r.contains_spoilers != 0 && r.user_id != viewer && !reveal && r.review.is_some();
    LogDto {
        id: r.id,
        author: PersonDto {
            id: r.user_id.clone(),
            name: r.user_name,
            image: r.user_image,
        },
        media: MediaDto {
            id: r.media_id,
            kind: r.kind,
            title: r.loc_title.unwrap_or(r.original_title),
            year: r.year,
            poster_path: r.poster_path,
        },
        watched_on: r.watched_on,
        rating: r.rating.map(|x| x as u8),
        review: if hidden { None } else { r.review },
        review_hidden: hidden,
        contains_spoilers: r.contains_spoilers != 0,
        platform: r.platform,
        season: r.season,
        episode: r.episode,
        is_rewatch: r.is_rewatch != 0,
        arrived_at: r.arrived_at,
        comment_count: r.comments as u32,
        reactions: serde_json::from_str::<Vec<ReactionJson>>(&r.reactions)
            .unwrap_or_default()
            .into_iter()
            .map(|x| ReactionCount {
                emoji: x.e,
                count: x.c as u32,
                mine: x.m != 0,
            })
            .collect(),
        shared_in: serde_json::from_str(&r.shared_in).unwrap_or_default(),
    }
}

/// `GET /api/me/diary?before=&locale=`: my own viewings, newest first, shared or not.
pub async fn my_diary(req: Request, env: Env) -> Result<Response> {
    finish(my_diary_inner(&req, &env).await)
}

async fn my_diary_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let locale = locale_of(req);
    // Cursor: "<watched_on>|<created_at>|<id>" of the last item of the previous page (keyset, so nothing is skipped or repeated).
    let cursor = query_param(req, "before")
        .map(|c| c.splitn(3, '|').map(str::to_string).collect::<Vec<_>>())
        .filter(|p| p.len() == 3);
    let (c_date, c_at, c_id): (JsValue, JsValue, JsValue) = match &cursor {
        Some(p) => (
            p[0].as_str().into(),
            p[1].parse::<i64>().map_err(|_| Fail::invalid()).map(num)?,
            p[2].as_str().into(),
        ),
        None => (JsValue::NULL, JsValue::NULL, JsValue::NULL),
    };
    let sql = format!(
        "SELECT {LOG_COLS}, l.created_at AS arrived_at, 0 AS comments, '[]' AS reactions, \
           (SELECT json_group_array(circle_id) FROM log_share WHERE log_id = l.id) AS shared_in \
         FROM log l JOIN user u ON u.id = l.user_id JOIN media_entity e ON e.id = l.media_id \
         LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 \
         WHERE l.user_id = ?1 AND (?3 IS NULL OR l.watched_on < ?3 OR (l.watched_on = ?3 AND (l.created_at < ?4 OR (l.created_at = ?4 AND l.id < ?5)))) AND (?6 IS NULL OR l.media_id = ?6) \
         ORDER BY l.watched_on DESC, l.created_at DESC, l.id DESC LIMIT {}",
        PAGE + 1
    );
    let media = query_param(req, "mediaId");
    let rows = db
        .prepare(sql)
        .bind(&[
            s.user_id.as_str().into(),
            catalog::locale_code(locale).into(),
            c_date,
            c_at,
            c_id,
            media.as_deref().map_or(JsValue::NULL, JsValue::from),
        ])?
        .all()
        .await?
        .results::<LogRow>()?;
    let more = rows.len() > PAGE;
    let next = more
        .then(|| {
            rows.get(PAGE - 1)
                .map(|r| format!("{}|{}|{}", r.watched_on, r.arrived_at, r.id))
        })
        .flatten();
    let items = rows
        .into_iter()
        .take(PAGE)
        .map(|r| to_dto(r, &s.user_id, true))
        .collect();
    json(&LogPage { items, next }, 200)
}

/// `GET /api/circles/:id/feed?before=&person=&kind=&year=&platform=&minRating=&locale=`: what this Cerchia was shown, newest
/// share first. Keyset pagination on (arrival, id), so logs that arrive in the same millisecond are never skipped.
pub async fn feed(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(feed_inner(&req, &env, circle_id).await)
}

async fn feed_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    crate::manage::my_role(&db, circle_id, &s.user_id).await?;
    let locale = locale_of(req);
    let cursor = query_param(req, "before").and_then(|c| {
        c.split_once('.')
            .map(|(a, b)| (a.to_string(), b.to_string()))
    });
    let mut args: Vec<JsValue> = vec![
        circle_id.into(),
        s.user_id.as_str().into(),
        catalog::locale_code(locale).into(),
    ];
    let mut filters = String::new();
    // Adds `sql` (its single `?` becomes the next numbered parameter) and binds `v`.
    fn add(filters: &mut String, args: &mut Vec<JsValue>, sql: &str, v: JsValue) {
        args.push(v);
        filters.push_str(&sql.replace('?', &format!("?{}", args.len())));
    }
    if let Some((at, id)) = &cursor {
        let at: i64 = at.parse().map_err(|_| Fail::invalid())?;
        args.push(num(at));
        let at_n = args.len();
        args.push(id.as_str().into());
        filters.push_str(&format!(
            " AND (s.created_at < ?{at_n} OR (s.created_at = ?{at_n} AND l.id < ?{}))",
            at_n + 1
        ));
    }
    if let Some(p) = query_param(req, "person") {
        add(
            &mut filters,
            &mut args,
            " AND l.user_id = ?",
            p.as_str().into(),
        );
    }
    if let Some(k) =
        query_param(req, "kind").filter(|k| matches!(k.as_str(), "movie" | "tv" | "anime"))
    {
        add(
            &mut filters,
            &mut args,
            " AND e.kind = ?",
            k.as_str().into(),
        );
    }
    if let Some(y) = query_param(req, "year").and_then(|y| y.parse::<i64>().ok()) {
        add(&mut filters, &mut args, " AND e.year = ?", num(y));
    }
    if let Some(p) = query_param(req, "platform") {
        add(
            &mut filters,
            &mut args,
            " AND l.platform = ?",
            p.as_str().into(),
        );
    }
    if let Some(r) = query_param(req, "minRating")
        .and_then(|r| r.parse::<i64>().ok())
        .filter(|r| (1..=10).contains(r))
    {
        add(&mut filters, &mut args, " AND l.rating >= ?", num(r));
    }
    let sql = format!(
        "SELECT {LOG_COLS}, s.created_at AS arrived_at, \
           (SELECT COUNT(*) FROM comment WHERE log_id = l.id AND circle_id = ?1) AS comments, \
           (SELECT json_group_array(json_object('e', emoji, 'c', cnt, 'm', mine)) FROM \
              (SELECT emoji, COUNT(*) AS cnt, MAX(user_id = ?2) AS mine FROM reaction WHERE log_id = l.id AND circle_id = ?1 GROUP BY emoji)) AS reactions, \
           '[]' AS shared_in \
         FROM log_share s JOIN log l ON l.id = s.log_id \
           JOIN circle_member m ON m.circle_id = s.circle_id AND m.user_id = l.user_id \
           JOIN user u ON u.id = l.user_id JOIN media_entity e ON e.id = l.media_id \
           LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?3 \
         WHERE s.circle_id = ?1 AND l.user_id NOT IN (SELECT blocked_id FROM user_block WHERE blocker_id = ?2){filters} ORDER BY s.created_at DESC, l.id DESC LIMIT {}",
        PAGE + 1
    );
    let rows = db
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<LogRow>()?;
    let more = rows.len() > PAGE;
    let next = more
        .then(|| {
            rows.get(PAGE - 1)
                .map(|r| format!("{}.{}", r.arrived_at, r.id))
        })
        .flatten();
    let items = rows
        .into_iter()
        .take(PAGE)
        .map(|r| to_dto(r, &s.user_id, false))
        .collect();
    json(&LogPage { items, next }, 200)
}

#[derive(Deserialize)]
struct CommentRow {
    id: String,
    user_id: String,
    user_name: String,
    user_image: Option<String>,
    body: String,
    is_spoiler: i64,
    parent_id: Option<String>,
    created_at: i64,
}

#[derive(Deserialize)]
struct PersonRow {
    id: String,
    name: String,
    image: Option<String>,
}

/// `GET /api/circles/:id/logs/:logId?reveal=1`: one viewing with this Cerchia's thread. Spoiler text (the review and spoiler
/// comments) is left out unless `reveal=1`. "Watched with" lists only people who are in this Cerchia.
pub async fn thread(req: Request, env: Env, circle_id: &str, log_id: &str) -> Result<Response> {
    finish(thread_inner(&req, &env, circle_id, log_id).await)
}

async fn thread_inner(req: &Request, env: &Env, circle_id: &str, log_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    crate::manage::my_role(&db, circle_id, &s.user_id).await?;
    let locale = locale_of(req);
    let reveal = query_param(req, "reveal").as_deref() == Some("1");
    let res = db
        .batch(vec![
            db.prepare(format!(
                "SELECT {LOG_COLS}, s.created_at AS arrived_at, \
                   (SELECT COUNT(*) FROM comment WHERE log_id = l.id AND circle_id = ?1) AS comments, \
                   (SELECT json_group_array(json_object('e', emoji, 'c', cnt, 'm', mine)) FROM \
                      (SELECT emoji, COUNT(*) AS cnt, MAX(user_id = ?2) AS mine FROM reaction WHERE log_id = l.id AND circle_id = ?1 GROUP BY emoji)) AS reactions, \
                   '[]' AS shared_in \
                 FROM log_share s JOIN log l ON l.id = s.log_id JOIN circle_member m ON m.circle_id = s.circle_id AND m.user_id = l.user_id \
                   JOIN user u ON u.id = l.user_id JOIN media_entity e ON e.id = l.media_id \
                   LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?4 WHERE s.circle_id = ?1 AND l.id = ?3 AND l.user_id NOT IN (SELECT blocked_id FROM user_block WHERE blocker_id = ?2)"
            ))
            .bind(&[circle_id.into(), s.user_id.as_str().into(), log_id.into(), catalog::locale_code(locale).into()])?,
            db.prepare(
                "SELECT c.id, c.user_id, u.name AS user_name, u.image AS user_image, c.body, c.is_spoiler, c.parent_id, c.created_at \
                 FROM comment c JOIN user u ON u.id = c.user_id WHERE c.log_id = ?1 AND c.circle_id = ?2 AND c.user_id NOT IN (SELECT blocked_id FROM user_block WHERE blocker_id = ?3) ORDER BY c.created_at, c.id",
            )
            .bind(&[log_id.into(), circle_id.into(), s.user_id.as_str().into()])?,
            db.prepare(
                "SELECT u.id, u.name, u.image FROM log_watched_with w JOIN user u ON u.id = w.user_id \
                 JOIN circle_member m ON m.user_id = w.user_id AND m.circle_id = ?2 WHERE w.log_id = ?1 ORDER BY u.name",
            )
            .bind(&[log_id.into(), circle_id.into()])?,
        ])
        .await?;
    let row = res[0]
        .results::<LogRow>()?
        .into_iter()
        .next()
        .ok_or_else(Fail::not_found)?;
    let comments = res[1]
        .results::<CommentRow>()?
        .into_iter()
        .map(|c| {
            let hidden = c.is_spoiler != 0 && c.user_id != s.user_id && !reveal;
            CommentDto {
                id: c.id,
                mine: c.user_id == s.user_id,
                author: PersonDto {
                    id: c.user_id,
                    name: c.user_name,
                    image: c.user_image,
                },
                body: if hidden { None } else { Some(c.body) },
                body_hidden: hidden,
                is_spoiler: c.is_spoiler != 0,
                parent_id: c.parent_id,
                created_at: c.created_at,
            }
        })
        .collect();
    let watched_with = res[2]
        .results::<PersonRow>()?
        .into_iter()
        .map(|p| PersonDto {
            id: p.id,
            name: p.name,
            image: p.image,
        })
        .collect();
    json(
        &LogThread {
            log: to_dto(row, &s.user_id, reveal),
            comments,
            watched_with,
        },
        200,
    )
}

/// `rating_refresh` for several titles of one person at once (an import chunk): same rule, `media_id IN (...)`.
pub fn rating_refresh_many(
    db: &D1Database,
    user_id: &str,
    media_ids: &[String],
) -> Result<Vec<D1PreparedStatement>> {
    let mut args: Vec<JsValue> = vec![user_id.into()];
    args.extend(media_ids.iter().map(|m| JsValue::from(m.as_str())));
    let list = placeholders(2, media_ids.len());
    Ok(vec![
        db.prepare(format!("DELETE FROM rating_current WHERE user_id = ?1 AND media_id IN ({list})")).bind(&args)?,
        db.prepare(format!(
            "INSERT INTO rating_current(circle_id, user_id, media_id, rating, rated_at) \
             SELECT s.circle_id, l.user_id, l.media_id, l.rating, l.created_at FROM log l JOIN log_share s ON s.log_id = l.id \
             WHERE l.user_id = ?1 AND l.media_id IN ({list}) AND l.season IS NULL AND l.episode IS NULL AND l.rating IS NOT NULL \
               AND l.id = (SELECT l2.id FROM log l2 JOIN log_share s2 ON s2.log_id = l2.id AND s2.circle_id = s.circle_id \
                           WHERE l2.user_id = l.user_id AND l2.media_id = l.media_id AND l2.season IS NULL AND l2.episode IS NULL \
                             AND l2.rating IS NOT NULL ORDER BY l2.watched_on DESC, l2.created_at DESC, l2.id DESC LIMIT 1)"
        ))
        .bind(&args)?,
    ])
}

/// Rebuilds everything one person has in one Cerchia's `rating_current` (after a whole import was taken out or deleted).
pub fn rebuild_ratings(
    db: &D1Database,
    user_id: &str,
    circle_id: &str,
) -> Result<Vec<D1PreparedStatement>> {
    Ok(vec![
        db.prepare("DELETE FROM rating_current WHERE user_id = ?1 AND circle_id = ?2").bind(&[user_id.into(), circle_id.into()])?,
        db.prepare(
            "INSERT INTO rating_current(circle_id, user_id, media_id, rating, rated_at) \
             SELECT s.circle_id, l.user_id, l.media_id, l.rating, l.created_at FROM log l JOIN log_share s ON s.log_id = l.id AND s.circle_id = ?2 \
             WHERE l.user_id = ?1 AND l.season IS NULL AND l.episode IS NULL AND l.rating IS NOT NULL \
               AND l.id = (SELECT l2.id FROM log l2 JOIN log_share s2 ON s2.log_id = l2.id AND s2.circle_id = ?2 \
                           WHERE l2.user_id = l.user_id AND l2.media_id = l.media_id AND l2.season IS NULL AND l2.episode IS NULL \
                             AND l2.rating IS NOT NULL ORDER BY l2.watched_on DESC, l2.created_at DESC, l2.id DESC LIMIT 1)",
        )
        .bind(&[user_id.into(), circle_id.into()])?,
    ])
}
