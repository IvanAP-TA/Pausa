//! Importing a history: the client parses the file and sends normalised rows in chunks. Per chunk the Worker validates each row on
//! its own, matches it to a stored title (ids first, then title and year), asks TMDB/AniList for the ones Pausa does not know,
//! and writes the viewings. Everything is idempotent (sending a chunk twice adds nothing), so an import can stop anywhere and
//! resume from `cursor`.
//!
//! Cloudflare limits shape the chunk: 50 outgoing requests and 50 D1 queries per invocation. A new title costs up to three
//! requests and three queries, so at most `NEW_TITLE_CAP` new titles are made per chunk; the response says how many rows from the
//! start were handled (`processed`) and the client sends the rest again. Titles Pausa already has cost almost nothing.

use crate::catalog::{self, Caller};
use crate::diary::{locale_of, num, placeholders};
use crate::http::{body, finish, json, new_id, now_ms, Fail, R};
use crate::{limit, manage, session};
use pausa_core::catalog::{Key, Kind};
use pausa_core::dto::{
    BulkDayDto, BulkDayUndone, ChunkResult, ErrorCode, IdOnly, ImportBatchDto, ImportConfig,
    ImportUndone, ListChunkResult, Locale, RejectedRow,
};
use pausa_core::import::{
    clean_row, created_at_for, today_of, Clean, ImportRow, CHUNK_LIMIT, SOURCES,
};
use pausa_core::limits;
use pausa_core::lists::{clean_description, clean_name, MAX_ITEMS};
use serde::Deserialize;
use std::collections::HashSet;
use worker::wasm_bindgen::JsValue;
use worker::*;

/// New titles created per request. Each costs up to 3 outgoing requests and 3 D1 queries; the Worker allows 50 of each.
const NEW_TITLE_CAP: usize = 12;

fn opt_str(v: &Option<String>) -> JsValue {
    v.as_deref().map_or(JsValue::NULL, JsValue::from)
}

fn opt_num(v: Option<i64>) -> JsValue {
    v.map_or(JsValue::NULL, num)
}

#[derive(Deserialize)]
struct BatchRow {
    circle_id: Option<String>,
    status: String,
    cursor: i64,
}

async fn batch_of(db: &D1Database, id: &str, user_id: &str) -> R<BatchRow> {
    db.prepare("SELECT circle_id, status, cursor FROM import_batch WHERE id = ?1 AND user_id = ?2")
        .bind(&[id.into(), user_id.into()])?
        .first::<BatchRow>(None)
        .await?
        .ok_or_else(Fail::not_found)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartIn {
    source: String,
    circle_id: Option<String>,
    total: Option<i64>,
}

/// `POST /api/imports {source, circleId?, total?}`: opens an import. With `circleId` the viewings are also shown in that Cerchia
/// (I must be in it); without, they stay in my own diary.
pub async fn start(mut req: Request, env: Env) -> Result<Response> {
    finish(start_inner(&mut req, &env).await)
}

async fn start_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    limit::check(
        &db,
        &format!("act:importStart:{}", s.user_id),
        limits::IMPORT_START,
    )
    .await?;
    let input: StartIn = body(req).await?;
    if !SOURCES.contains(&input.source.as_str()) {
        return Err(Fail::invalid());
    }
    if let Some(c) = &input.circle_id {
        manage::my_role(&db, c, &s.user_id).await?;
    }
    let id = new_id();
    db.prepare("INSERT INTO import_batch(id, user_id, source, circle_id, total, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(&[id.as_str().into(), s.user_id.as_str().into(), input.source.into(), opt_str(&input.circle_id), opt_num(input.total.filter(|t| *t >= 0)), num(now_ms())])?
        .run()
        .await?;
    json(&IdOnly { id }, 201)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChunkIn {
    rows: Vec<ImportRow>,
    /// Index of the first row of this chunk in the whole file (for the cursor).
    #[serde(default)]
    offset: i64,
    #[serde(default = "yes")]
    include_reviews: bool,
    /// Rows without a date: left out by default, or counted as seen today.
    #[serde(default)]
    include_undated: bool,
    locale: Option<String>,
}

fn yes() -> bool {
    true
}

#[derive(Deserialize)]
struct IdRow {
    id: String,
}

/// Looks every row up against the stored titles in one batch: two statements per row (identity ids, then title and year).
async fn find_existing(db: &D1Database, rows: &[Clean]) -> R<Vec<Option<String>>> {
    let mut stmts = Vec::with_capacity(rows.len() * 2);
    for r in rows {
        stmts.push(
            db.prepare(
                "SELECT id FROM media_entity WHERE (letterboxd_uri = ?1) OR (anilist_id = ?2) OR (mal_id = ?3) OR (tmdb_id = ?4 AND kind = ?5) OR (imdb_id = ?6) LIMIT 1",
            )
            .bind(&[opt_str(&r.letterboxd_uri), opt_num(r.anilist_id), opt_num(r.mal_id), opt_num(r.tmdb_id), r.kind.as_str().into(), opt_str(&r.imdb_id)])?,
        );
        // Same title (any language we hold, case-insensitive) and kind, release year within one or unknown on either side.
        stmts.push(
            db.prepare(
                "SELECT e.id FROM media_entity e WHERE e.kind = ?1 AND (e.original_title = ?2 COLLATE NOCASE OR e.id IN (SELECT media_id FROM media_title WHERE title = ?2 COLLATE NOCASE)) \
                 AND (?3 IS NULL OR e.year IS NULL OR ABS(e.year - ?3) <= 1) LIMIT 1",
            )
            .bind(&[r.kind.as_str().into(), r.title.as_str().into(), opt_num(r.year)])?,
        );
    }
    let res = db.batch(stmts).await?;
    let mut out = Vec::with_capacity(rows.len());
    for i in 0..rows.len() {
        let by_id = res[2 * i]
            .results::<IdRow>()?
            .into_iter()
            .next()
            .map(|r| r.id);
        let by_title = || {
            res[2 * i + 1]
                .results::<IdRow>()
                .ok()
                .and_then(|v| v.into_iter().next())
                .map(|r| r.id)
        };
        out.push(by_id.or_else(by_title));
    }
    Ok(out)
}

/// A title the catalogues could not give us: keep what the file says, so the viewing is not lost (v1: "passes without a cover").
async fn create_minimal(db: &D1Database, r: &Clean, locale: Locale) -> R<String> {
    let id = new_id();
    let now = now_ms() as f64;
    let res = db
        .batch(vec![
            db.prepare(
                "INSERT OR IGNORE INTO media_entity(id, kind, tmdb_id, anilist_id, mal_id, letterboxd_uri, imdb_id, original_title, year, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )
            .bind(&[id.as_str().into(), r.kind.as_str().into(), opt_num(r.tmdb_id), opt_num(r.anilist_id), opt_num(r.mal_id), opt_str(&r.letterboxd_uri), opt_str(&r.imdb_id), r.title.as_str().into(), opt_num(r.year), now.into()])?,
            db.prepare("INSERT OR IGNORE INTO media_title(media_id, locale, title) VALUES (?1, ?2, ?3)").bind(&[id.as_str().into(), catalog::locale_code(locale).into(), r.title.as_str().into()])?,
        ])
        .await?;
    let inserted = res[0].meta()?.and_then(|m| m.changes).unwrap_or(0) == 1;
    if inserted {
        return Ok(id);
    }
    // A unique id collided with a title stored meanwhile: use that one.
    let found = find_existing(db, std::slice::from_ref(r)).await?;
    found
        .into_iter()
        .next()
        .flatten()
        .ok_or_else(Fail::internal)
}

/// Gets a stored title for a row that is not stored yet: from the catalogue by the best id the row carries, else by IMDb id or
/// title; with no catalogue answer, a minimal title from the file. `calls` counts outgoing requests left.
async fn enrich(
    env: &Env,
    caller: &Caller<'_>,
    r: &Clean,
    locale: Locale,
    calls: &mut i32,
) -> R<String> {
    let tmdb_on = catalog::tmdb_enabled(env);
    let attempt: R<Option<String>> = async {
        match r.kind {
            Kind::Anime => {
                if let Some(a) = r.anilist_id {
                    *calls -= 1;
                    return Ok(Some(
                        catalog::resolve_as(env, caller, &Key::Anilist { id: a }, locale).await?,
                    ));
                }
                if let Some(m) = r.mal_id {
                    *calls -= 1;
                    return catalog::resolve_mal(env, caller, m, locale).await;
                }
                Ok(None)
            }
            Kind::Movie | Kind::Tv => {
                if !tmdb_on {
                    return Ok(None);
                }
                let tv = r.kind == Kind::Tv;
                let id = match r.tmdb_id {
                    Some(id) => Some(id),
                    None => {
                        *calls -= if r.imdb_id.is_some() { 2 } else { 1 };
                        catalog::tmdb_lookup(
                            env,
                            caller,
                            tv,
                            r.imdb_id.as_deref(),
                            &r.title,
                            r.year,
                            locale,
                        )
                        .await?
                    }
                };
                match id {
                    Some(id) => {
                        *calls -= 1;
                        Ok(Some(
                            catalog::resolve_as(env, caller, &Key::Tmdb { tv, id }, locale).await?,
                        ))
                    }
                    None => Ok(None),
                }
            }
        }
    }
    .await;
    match attempt {
        Ok(Some(id)) => Ok(id),
        // Catalogue off, down, or no match: keep the viewing with what the file says. Only a rate limit stops the import.
        Ok(None) => create_minimal(caller.db, r, locale).await,
        Err(f) if f.status == 429 => Err(f),
        Err(_) => create_minimal(caller.db, r, locale).await,
    }
}

/// Worst case of outgoing requests for one new title: IMDb lookup + search + detail.
const CALLS_PER_NEW_TITLE: i32 = 3;
const CALL_BUDGET: i32 = 40;

struct Resolved {
    /// One entry per row handled, in order: the stored title id.
    ids: Vec<String>,
    processed: usize,
}

/// Turns the first rows of a chunk into stored title ids, stopping before a new title that would exceed the request budget.
async fn resolve_rows(
    env: &Env,
    caller: &Caller<'_>,
    rows: &[Clean],
    locale: Locale,
) -> R<Resolved> {
    let existing = find_existing(caller.db, rows).await?;
    let mut ids = Vec::with_capacity(rows.len());
    let (mut calls, mut created) = (CALL_BUDGET, 0usize);
    for (r, found) in rows.iter().zip(existing) {
        if let Some(id) = found {
            ids.push(id);
            continue;
        }
        if created >= NEW_TITLE_CAP || calls < CALLS_PER_NEW_TITLE {
            break;
        }
        ids.push(enrich(env, caller, r, locale, &mut calls).await?);
        created += 1;
    }
    Ok(Resolved {
        processed: ids.len(),
        ids,
    })
}

#[derive(Deserialize)]
struct SeenRow {
    media_id: String,
    watched_on: String,
}

#[derive(Deserialize)]
struct NewCount {
    n: i64,
}

/// `POST /api/imports/:id/rows {rows, offset?, includeReviews?, includeUndated?, locale?}`: up to 30 rows. Answers how many were
/// handled from the start (`processed`), what was added, what was already there, and which rows were rejected and why.
pub async fn rows(mut req: Request, env: Env, batch_id: &str) -> Result<Response> {
    finish(rows_inner(&mut req, &env, batch_id).await)
}

async fn rows_inner(req: &mut Request, env: &Env, batch_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let batch = batch_of(&db, batch_id, &s.user_id).await?;
    if batch.status != "running" {
        return Err(Fail::new(ErrorCode::Conflict, 409));
    }
    // Still in the destination Cerchia? (v1: a person who left mid-import got an error on the next chunk.)
    if let Some(c) = &batch.circle_id {
        manage::my_role(&db, c, &s.user_id)
            .await
            .map_err(|_| Fail::new(ErrorCode::Conflict, 409))?;
    }
    limit::check(
        &db,
        &format!("act:importRows:{}", s.user_id),
        limits::IMPORT_ROWS,
    )
    .await?;
    let input: ChunkIn = body(req).await?;
    if input.rows.is_empty() || input.rows.len() > CHUNK_LIMIT {
        return Err(Fail::invalid());
    }
    let locale = input
        .locale
        .as_deref()
        .and_then(Locale::from_code)
        .unwrap_or_else(|| locale_of(req));
    let started = now_ms();
    let today = today_of(started);

    // Validate row by row; a bad row is reported and the others go on.
    let mut rejected = Vec::new();
    let mut skipped_undated = 0u32;
    let mut clean: Vec<(usize, Clean)> = Vec::new();
    for (i, r) in input.rows.iter().enumerate() {
        match clean_row(r, &today) {
            Err(why) => rejected.push(RejectedRow {
                index: i as u32,
                reason: why.code().into(),
            }),
            Ok(mut c) => {
                if !input.include_reviews {
                    c.review = None;
                }
                if c.watched_on.is_none() {
                    if input.include_undated {
                        c.watched_on = Some(today.clone());
                    } else {
                        skipped_undated += 1;
                        continue;
                    }
                }
                clean.push((i, c));
            }
        }
    }

    let caller = Caller {
        db: &db,
        user_id: &s.user_id,
        counted: false,
    };
    let cleaned: Vec<Clean> = clean.iter().map(|(_, c)| c.clone()).collect();
    let resolved = if cleaned.is_empty() {
        Resolved {
            ids: Vec::new(),
            processed: 0,
        }
    } else {
        resolve_rows(env, &caller, &cleaned, locale).await?
    };
    // Rows handled from the START of the chunk: when not all clean rows were handled, rows before the first unhandled one count.
    let handled_clean = resolved.processed;
    let consumed_until = if handled_clean < clean.len() {
        clean[handled_clean].0
    } else {
        input.rows.len()
    };
    let processed = consumed_until;
    // Rejections after the cut will be reported again when the client sends those rows; keep only the ones inside what we handled.
    rejected.retain(|r| (r.index as usize) < processed);
    if handled_clean < clean.len() {
        skipped_undated = input
            .rows
            .iter()
            .take(processed)
            .enumerate()
            .filter(|(i, _)| {
                !clean.iter().any(|(j, _)| j == i)
                    && !rejected.iter().any(|r| r.index as usize == *i)
            })
            .count() as u32;
    }

    // New titles are those created since this request started.
    let mut counts = pausa_core::import::Counts {
        skipped_undated,
        ..Default::default()
    };
    if !resolved.ids.is_empty() {
        let uniq: Vec<&String> = {
            let mut seen = HashSet::new();
            resolved
                .ids
                .iter()
                .filter(|i| seen.insert((*i).clone()))
                .collect()
        };
        let mut args: Vec<JsValue> = vec![num(started)];
        args.extend(uniq.iter().map(|i| JsValue::from(i.as_str())));
        counts.new_titles = db
            .prepare(format!(
                "SELECT COUNT(*) AS n FROM media_entity WHERE created_at >= ?1 AND id IN ({})",
                placeholders(2, uniq.len())
            ))
            .bind(&args)?
            .first::<NewCount>(None)
            .await?
            .map_or(0, |c| c.n as u32);
    }

    // Viewings already in the diary for the same title and day are not added again (any log counts, written by hand or imported).
    let mut have: HashSet<(String, String)> = HashSet::new();
    if !resolved.ids.is_empty() {
        let mut args: Vec<JsValue> = vec![s.user_id.as_str().into()];
        let uniq: Vec<&String> = {
            let mut seen = HashSet::new();
            resolved
                .ids
                .iter()
                .filter(|i| seen.insert((*i).clone()))
                .collect()
        };
        args.extend(uniq.iter().map(|i| JsValue::from(i.as_str())));
        for r in db
            .prepare(format!(
                "SELECT media_id, watched_on FROM log WHERE user_id = ?1 AND media_id IN ({})",
                placeholders(2, uniq.len())
            ))
            .bind(&args)?
            .all()
            .await?
            .results::<SeenRow>()?
        {
            have.insert((r.media_id, r.watched_on));
        }
    }

    let mut stmts = Vec::new();
    let mut rated_titles: Vec<String> = Vec::new();
    for (media_id, (_, c)) in resolved.ids.iter().zip(clean.iter()) {
        let day = c.watched_on.clone().unwrap_or_else(|| today.clone());
        if !have.insert((media_id.clone(), day.clone())) {
            counts.already += 1;
            continue;
        }
        let log_id = new_id();
        let at = created_at_for(&day);
        stmts.push(
            db.prepare(
                "INSERT INTO log(id, user_id, media_id, watched_on, rating, review, is_rewatch, import_batch_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            )
            .bind(&[
                log_id.as_str().into(),
                s.user_id.as_str().into(),
                media_id.as_str().into(),
                day.as_str().into(),
                opt_num(c.rating.map(i64::from)),
                opt_str(&c.review),
                num(i64::from(c.rewatch)),
                batch_id.into(),
                num(at),
            ])?,
        );
        if let Some(circle) = &batch.circle_id {
            stmts.push(
                db.prepare("INSERT INTO log_share(log_id, circle_id, import_batch_id, created_at) VALUES (?1, ?2, ?3, ?4)")
                    .bind(&[log_id.as_str().into(), circle.as_str().into(), batch_id.into(), num(at)])?,
            );
            if c.rating.is_some() && !rated_titles.contains(media_id) {
                rated_titles.push(media_id.clone());
            }
        }
        counts.imported += 1;
    }
    if !rated_titles.is_empty() {
        stmts.extend(crate::diary::rating_refresh_many(
            &db,
            &s.user_id,
            &rated_titles,
        )?);
    }
    let cursor = batch.cursor.max(input.offset.max(0) + processed as i64);
    stmts.push(
        db.prepare("UPDATE import_batch SET cursor = ?2, imported = imported + ?3, skipped = skipped + ?4, new_titles = new_titles + ?5, failed_rows = failed_rows + ?6 WHERE id = ?1")
            .bind(&[batch_id.into(), num(cursor), num(i64::from(counts.imported)), num(i64::from(counts.already + counts.skipped_undated)), num(i64::from(counts.new_titles)), num(rejected.len() as i64)])?,
    );
    db.batch(stmts).await?;
    json(
        &ChunkResult {
            processed: processed as u32,
            imported: counts.imported,
            already: counts.already,
            new_titles: counts.new_titles,
            skipped_undated: counts.skipped_undated,
            rejected,
            cursor: cursor as u32,
        },
        200,
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListIn {
    name: String,
    description: Option<String>,
    /// "watchlist" or "list"
    kind: Option<String>,
    #[serde(default)]
    offset: i64,
    rows: Vec<ImportRow>,
    locale: Option<String>,
}

#[derive(Deserialize)]
struct ListRow {
    id: String,
}

/// `POST /api/imports/:id/lists {name, description?, kind?, offset, rows}`: a Letterboxd list or watchlist, in chunks. The list is
/// found by owner, name and kind (so later chunks continue it), or made. A group list when the import goes to a Cerchia.
pub async fn lists(mut req: Request, env: Env, batch_id: &str) -> Result<Response> {
    finish(lists_inner(&mut req, &env, batch_id).await)
}

async fn lists_inner(req: &mut Request, env: &Env, batch_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let batch = batch_of(&db, batch_id, &s.user_id).await?;
    if batch.status != "running" {
        return Err(Fail::new(ErrorCode::Conflict, 409));
    }
    if let Some(c) = &batch.circle_id {
        manage::my_role(&db, c, &s.user_id)
            .await
            .map_err(|_| Fail::new(ErrorCode::Conflict, 409))?;
    }
    limit::check(
        &db,
        &format!("act:importRows:{}", s.user_id),
        limits::IMPORT_ROWS,
    )
    .await?;
    let input: ListIn = body(req).await?;
    if input.rows.is_empty()
        || input.rows.len() > CHUNK_LIMIT
        || !(0..=5000).contains(&input.offset)
    {
        return Err(Fail::invalid());
    }
    let name = clean_name(&input.name).ok_or_else(Fail::invalid)?;
    let description = match input.description.as_deref() {
        Some(d) => clean_description(d).ok_or_else(Fail::invalid)?,
        None => None,
    };
    let kind = if input.kind.as_deref() == Some("watchlist") {
        "watchlist"
    } else {
        "list"
    };
    let locale = input
        .locale
        .as_deref()
        .and_then(Locale::from_code)
        .unwrap_or_else(|| locale_of(req));
    let today = today_of(now_ms());

    let circle: JsValue = opt_str(&batch.circle_id);
    let found = db
        .prepare("SELECT id FROM list WHERE owner_id = ?1 AND name = ?2 AND kind = ?3 AND circle_id IS ?4")
        .bind(&[s.user_id.as_str().into(), name.as_str().into(), kind.into(), circle.clone()])?
        .first::<ListRow>(None)
        .await?;
    let (list_id, created) = match found {
        Some(l) => (l.id, false),
        None => {
            let id = new_id();
            db.prepare("INSERT INTO list(id, circle_id, owner_id, kind, name, description, import_batch_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
                .bind(&[id.as_str().into(), circle, s.user_id.as_str().into(), kind.into(), name.into(), description.map_or(JsValue::NULL, JsValue::from), batch_id.into(), num(now_ms())])?
                .run()
                .await?;
            (id, true)
        }
    };

    // Lists hold films and series only (anime ids are dropped, like v1).
    let mut rejected = Vec::new();
    let mut clean: Vec<(usize, Clean)> = Vec::new();
    for (i, r) in input.rows.iter().enumerate() {
        match clean_row(r, &today) {
            Err(why) => rejected.push(RejectedRow {
                index: i as u32,
                reason: why.code().into(),
            }),
            Ok(mut c) => {
                if c.kind == Kind::Anime {
                    c.kind = Kind::Tv;
                }
                c.anilist_id = None;
                c.mal_id = None;
                clean.push((i, c));
            }
        }
    }
    let caller = Caller {
        db: &db,
        user_id: &s.user_id,
        counted: false,
    };
    let cleaned: Vec<Clean> = clean.iter().map(|(_, c)| c.clone()).collect();
    let started = now_ms();
    let resolved = if cleaned.is_empty() {
        Resolved {
            ids: Vec::new(),
            processed: 0,
        }
    } else {
        resolve_rows(env, &caller, &cleaned, locale).await?
    };
    let processed = if resolved.processed < clean.len() {
        clean[resolved.processed].0
    } else {
        input.rows.len()
    };
    rejected.retain(|r| (r.index as usize) < processed);

    let mut stmts = Vec::new();
    for (k, media_id) in resolved.ids.iter().enumerate() {
        let position = input.offset + clean[k].0 as i64;
        stmts.push(
            db.prepare("INSERT OR IGNORE INTO list_item(list_id, media_id, position, added_by, added_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE (SELECT COUNT(*) FROM list_item WHERE list_id = ?1) < ?6")
                .bind(&[list_id.as_str().into(), media_id.as_str().into(), num(position), s.user_id.as_str().into(), num(now_ms()), num(MAX_ITEMS as i64)])?,
        );
    }
    let mut added = 0u32;
    if !stmts.is_empty() {
        for r in db.batch(stmts).await? {
            added += r.meta().ok().flatten().and_then(|m| m.changes).unwrap_or(0) as u32;
        }
    }
    let uniq: Vec<&String> = {
        let mut seen = HashSet::new();
        resolved
            .ids
            .iter()
            .filter(|i| seen.insert((*i).clone()))
            .collect()
    };
    let new_titles = if uniq.is_empty() {
        0
    } else {
        let mut args: Vec<JsValue> = vec![num(started)];
        args.extend(uniq.iter().map(|i| JsValue::from(i.as_str())));
        db.prepare(format!(
            "SELECT COUNT(*) AS n FROM media_entity WHERE created_at >= ?1 AND id IN ({})",
            placeholders(2, uniq.len())
        ))
        .bind(&args)?
        .first::<NewCount>(None)
        .await?
        .map_or(0, |c| c.n as u32)
    };
    if created {
        db.prepare("UPDATE import_batch SET lists = lists + 1 WHERE id = ?1")
            .bind(&[batch_id.into()])?
            .run()
            .await?;
    }
    json(
        &ListChunkResult {
            list_id,
            processed: processed as u32,
            added,
            new_titles,
            rejected,
        },
        200,
    )
}

#[derive(Deserialize)]
struct BatchFullRow {
    id: String,
    source: String,
    circle_id: Option<String>,
    circle_name: Option<String>,
    status: String,
    cursor: i64,
    total: Option<i64>,
    imported: i64,
    skipped: i64,
    new_titles: i64,
    lists: i64,
    failed_rows: i64,
    in_circle: i64,
    lists_in_circle: i64,
    created_at: i64,
    finished_at: Option<i64>,
}

const BATCH_COLS: &str = "b.id, b.source, b.circle_id, c.name AS circle_name, b.status, b.cursor, b.total, b.imported, b.skipped, b.new_titles, b.lists, b.failed_rows, b.created_at, b.finished_at, \n    (SELECT COUNT(*) FROM log_share bs WHERE bs.import_batch_id = b.id) AS in_circle, \n    (SELECT COUNT(*) FROM list bl WHERE bl.import_batch_id = b.id AND bl.circle_id IS NOT NULL) AS lists_in_circle";

fn batch_dto(r: BatchFullRow) -> ImportBatchDto {
    ImportBatchDto {
        id: r.id,
        source: r.source,
        circle_id: r.circle_id,
        circle_name: r.circle_name,
        status: r.status,
        cursor: r.cursor as u32,
        total: r.total.map(|t| t as u32),
        imported: r.imported as u32,
        skipped: r.skipped as u32,
        new_titles: r.new_titles as u32,
        lists: r.lists as u32,
        failed_rows: r.failed_rows as u32,
        in_circle: r.in_circle as u32,
        lists_in_circle: r.lists_in_circle as u32,
        created_at: r.created_at,
        finished_at: r.finished_at,
    }
}

/// `GET /api/imports`: my imports, newest first (50), with their counts. Imports that added nothing are left out.
pub async fn list(req: Request, env: Env) -> Result<Response> {
    finish(list_inner(&req, &env).await)
}

async fn list_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let rows = db
        .prepare(format!(
            "SELECT {BATCH_COLS} FROM import_batch b LEFT JOIN circle c ON c.id = b.circle_id WHERE b.user_id = ?1 AND (b.imported > 0 OR b.lists > 0 OR b.status = 'running') \
             ORDER BY b.created_at DESC LIMIT 50"
        ))
        .bind(&[s.user_id.as_str().into()])?
        .all()
        .await?
        .results::<BatchFullRow>()?;
    json(&rows.into_iter().map(batch_dto).collect::<Vec<_>>(), 200)
}

/// `GET /api/imports/:id`: where an import stands, so an interrupted one can resume at `cursor`.
pub async fn status(req: Request, env: Env, batch_id: &str) -> Result<Response> {
    finish(status_inner(&req, &env, batch_id).await)
}

async fn status_inner(req: &Request, env: &Env, batch_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let row = db
        .prepare(format!("SELECT {BATCH_COLS} FROM import_batch b LEFT JOIN circle c ON c.id = b.circle_id WHERE b.id = ?1 AND b.user_id = ?2"))
        .bind(&[batch_id.into(), s.user_id.as_str().into()])?
        .first::<BatchFullRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    json(&batch_dto(row), 200)
}

#[derive(Deserialize, Default)]
struct FinishIn {
    #[serde(default)]
    cancel: bool,
    #[serde(default)]
    failed: bool,
}

/// `POST /api/imports/:id/finish {cancel?, failed?}`: closes an import (done by default, or cancelled by the person, or failed).
pub async fn finish_batch(mut req: Request, env: Env, batch_id: &str) -> Result<Response> {
    finish(finish_inner(&mut req, &env, batch_id).await)
}

async fn finish_inner(req: &mut Request, env: &Env, batch_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    batch_of(&db, batch_id, &s.user_id).await?;
    let input: FinishIn = body(req).await.unwrap_or_default();
    let status = if input.cancel {
        "cancelled"
    } else if input.failed {
        "failed"
    } else {
        "done"
    };
    db.prepare("UPDATE import_batch SET status = ?2, finished_at = ?3 WHERE id = ?1 AND status = 'running'").bind(&[batch_id.into(), status.into(), num(now_ms())])?.run().await?;
    status_inner(req, env, batch_id).await
}

#[derive(Deserialize)]
struct CountRow {
    n: i64,
}

/// `POST /api/imports/:id/remove-from-circle`: takes the whole import out of the Cerchia it was sent to. The viewings stay in my
/// diary; group lists it made become personal. Idempotent.
pub async fn remove_from_circle(req: Request, env: Env, batch_id: &str) -> Result<Response> {
    finish(remove_inner(&req, &env, batch_id).await)
}

#[derive(Deserialize)]
struct CircleRow {
    circle_id: String,
}

async fn remove_inner(req: &Request, env: &Env, batch_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    batch_of(&db, batch_id, &s.user_id).await?;
    let circles: Vec<String> = db
        .prepare("SELECT DISTINCT circle_id FROM log_share WHERE import_batch_id = ?1")
        .bind(&[batch_id.into()])?
        .all()
        .await?
        .results::<CircleRow>()?
        .into_iter()
        .map(|c| c.circle_id)
        .collect();
    let counted = db
        .batch(vec![
            db.prepare("SELECT COUNT(*) AS n FROM log_share WHERE import_batch_id = ?1").bind(&[batch_id.into()])?,
            db.prepare("SELECT COUNT(*) AS n FROM list WHERE import_batch_id = ?1 AND circle_id IS NOT NULL").bind(&[batch_id.into()])?,
        ])
        .await?;
    let viewings = counted[0]
        .results::<CountRow>()?
        .first()
        .map_or(0, |c| c.n as u32);
    let lists = counted[1]
        .results::<CountRow>()?
        .first()
        .map_or(0, |c| c.n as u32);
    // What the Cerchia wrote under these viewings lives per Cerchia, so it goes with the share; then the ratings that counted there
    // are rebuilt from what is still shared.
    let mut stmts = vec![
        db.prepare("DELETE FROM comment WHERE (log_id, circle_id) IN (SELECT log_id, circle_id FROM log_share WHERE import_batch_id = ?1)").bind(&[batch_id.into()])?,
        db.prepare("DELETE FROM reaction WHERE (log_id, circle_id) IN (SELECT log_id, circle_id FROM log_share WHERE import_batch_id = ?1)").bind(&[batch_id.into()])?,
        db.prepare("DELETE FROM log_share WHERE import_batch_id = ?1").bind(&[batch_id.into()])?,
        db.prepare("UPDATE list SET circle_id = NULL WHERE import_batch_id = ?1").bind(&[batch_id.into()])?,
    ];
    for c in &circles {
        stmts.extend(crate::diary::rebuild_ratings(&db, &s.user_id, c)?);
    }
    db.batch(stmts).await?;
    json(&ImportUndone { viewings, lists }, 200)
}
/// `DELETE /api/imports/:id`: deletes for good the viewings this import made (their threads go with them). Viewings that were
/// already there, lists and the titles it created stay. Add `?lists=1` to delete the lists it made too.
pub async fn delete(req: Request, env: Env, batch_id: &str) -> Result<Response> {
    finish(delete_inner(&req, &env, batch_id).await)
}

async fn delete_inner(req: &Request, env: &Env, batch_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    batch_of(&db, batch_id, &s.user_id).await?;
    let with_lists = crate::diary::query_param(req, "lists").as_deref() == Some("1");
    let counted = db
        .batch(vec![
            db.prepare("SELECT COUNT(*) AS n FROM log WHERE import_batch_id = ?1 AND user_id = ?2")
                .bind(&[batch_id.into(), s.user_id.as_str().into()])?,
            db.prepare(
                "SELECT COUNT(*) AS n FROM list WHERE import_batch_id = ?1 AND owner_id = ?2",
            )
            .bind(&[batch_id.into(), s.user_id.as_str().into()])?,
        ])
        .await?;
    let viewings = counted[0]
        .results::<CountRow>()?
        .first()
        .map_or(0, |c| c.n as u32);
    let lists = counted[1]
        .results::<CountRow>()?
        .first()
        .map_or(0, |c| c.n as u32);
    let circles: Vec<String> = db
        .prepare("SELECT DISTINCT s.circle_id FROM log_share s JOIN log l ON l.id = s.log_id WHERE l.import_batch_id = ?1 AND l.user_id = ?2")
        .bind(&[batch_id.into(), s.user_id.as_str().into()])?
        .all()
        .await?
        .results::<CircleRow>()?
        .into_iter()
        .map(|c| c.circle_id)
        .collect();
    let mut stmts = vec![db
        .prepare("DELETE FROM log WHERE import_batch_id = ?1 AND user_id = ?2")
        .bind(&[batch_id.into(), s.user_id.as_str().into()])?];
    for c in &circles {
        stmts.extend(crate::diary::rebuild_ratings(&db, &s.user_id, c)?);
    }
    if with_lists {
        stmts.push(
            db.prepare("DELETE FROM list WHERE import_batch_id = ?1 AND owner_id = ?2")
                .bind(&[batch_id.into(), s.user_id.as_str().into()])?,
        );
    }
    db.batch(stmts).await?;
    json(
        &ImportUndone {
            viewings,
            lists: if with_lists { lists } else { 0 },
        },
        200,
    )
}

// ───────────── Imports from before runs were tracked ─────────────
// Older imports left no mark on their viewings. What still gives them away is that they were all written on the same day (UTC):
// a day with BULK_MIN or more viewings and no run is offered as one block, to take out of the Cerchie or to delete.

/// A day with fewer viewings than this is hand-written, not a block: the single buttons are for those.
const BULK_MIN: i64 = 10;
const DAY_OF: &str = "date(l.created_at / 1000, 'unixepoch')";

#[derive(Deserialize)]
struct BulkRow {
    day: String,
    logs: i64,
    in_circles: i64,
}

/// `GET /api/imports/bulk-days`: my days with at least ten viewings added and no import run, newest first.
pub async fn bulk_days(req: Request, env: Env) -> Result<Response> {
    finish(bulk_days_inner(&req, &env).await)
}

async fn bulk_days_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let rows = db
        .prepare(format!(
            "SELECT {DAY_OF} AS day, COUNT(*) AS logs, \
               COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM log_share ps WHERE ps.log_id = l.id) THEN 1 ELSE 0 END), 0) AS in_circles \
             FROM log l WHERE l.user_id = ?1 AND l.import_batch_id IS NULL \
             GROUP BY day HAVING COUNT(*) >= {BULK_MIN} ORDER BY day DESC"
        ))
        .bind(&[s.user_id.as_str().into()])?
        .all()
        .await?
        .results::<BulkRow>()?;
    let days: Vec<BulkDayDto> = rows
        .into_iter()
        .map(|r| BulkDayDto {
            day: r.day,
            logs: r.logs as u32,
            in_circles: r.in_circles as u32,
        })
        .collect();
    json(&days, 200)
}

fn valid_day(day: &str) -> bool {
    let b = day.as_bytes();
    b.len() == 10
        && b.iter().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                *c == b'-'
            } else {
                c.is_ascii_digit()
            }
        })
}

/// The viewings of a bulk day, or `not_found` when the day is not a block (or does not exist).
async fn bulk_day_count(db: &D1Database, user_id: &str, day: &str) -> R<i64> {
    if !valid_day(day) {
        return Err(Fail::new(ErrorCode::NotFound, 404));
    }
    let n = db
        .prepare(format!(
            "SELECT COUNT(*) AS n FROM log l WHERE l.user_id = ?1 AND l.import_batch_id IS NULL AND {DAY_OF} = ?2"
        ))
        .bind(&[user_id.into(), day.into()])?
        .first::<CountRow>(None)
        .await?
        .map_or(0, |c| c.n);
    if n < BULK_MIN {
        return Err(Fail::new(ErrorCode::NotFound, 404));
    }
    Ok(n)
}

async fn bulk_day_circles(db: &D1Database, user_id: &str, day: &str) -> R<Vec<String>> {
    Ok(db
        .prepare(format!(
            "SELECT DISTINCT s.circle_id FROM log_share s JOIN log l ON l.id = s.log_id \
             WHERE l.user_id = ?1 AND l.import_batch_id IS NULL AND {DAY_OF} = ?2"
        ))
        .bind(&[user_id.into(), day.into()])?
        .all()
        .await?
        .results::<CircleRow>()?
        .into_iter()
        .map(|c| c.circle_id)
        .collect())
}

const BULK_LOGS: &str =
    "SELECT l.id FROM log l WHERE l.user_id = ?1 AND l.import_batch_id IS NULL AND date(l.created_at / 1000, 'unixepoch') = ?2";

/// `POST /api/imports/bulk-days/:day/hide`: takes a bulk day out of every Cerchia (the viewings stay in my diary, private).
pub async fn hide_bulk_day(req: Request, env: Env, day: &str) -> Result<Response> {
    finish(hide_bulk_inner(&req, &env, day).await)
}

async fn hide_bulk_inner(req: &Request, env: &Env, day: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    bulk_day_count(&db, &s.user_id, day).await?;
    let circles = bulk_day_circles(&db, &s.user_id, day).await?;
    let viewings = db
        .prepare(format!(
            "SELECT COUNT(*) AS n FROM log l WHERE l.user_id = ?1 AND l.import_batch_id IS NULL AND {DAY_OF} = ?2 \
               AND EXISTS (SELECT 1 FROM log_share ps WHERE ps.log_id = l.id)"
        ))
        .bind(&[s.user_id.as_str().into(), day.into()])?
        .first::<CountRow>(None)
        .await?
        .map_or(0, |c| c.n as u32);
    let args = [s.user_id.as_str().into(), day.into()];
    let mut stmts = vec![
        db.prepare(format!("DELETE FROM comment WHERE (log_id, circle_id) IN (SELECT log_id, circle_id FROM log_share WHERE log_id IN ({BULK_LOGS}))")).bind(&args)?,
        db.prepare(format!("DELETE FROM reaction WHERE (log_id, circle_id) IN (SELECT log_id, circle_id FROM log_share WHERE log_id IN ({BULK_LOGS}))")).bind(&args)?,
        db.prepare(format!("DELETE FROM log_share WHERE log_id IN ({BULK_LOGS})")).bind(&args)?,
    ];
    for c in &circles {
        stmts.extend(crate::diary::rebuild_ratings(&db, &s.user_id, c)?);
    }
    db.batch(stmts).await?;
    json(&BulkDayUndone { viewings }, 200)
}

/// `DELETE /api/imports/bulk-days/:day`: deletes for good every viewing of a bulk day.
pub async fn delete_bulk_day(req: Request, env: Env, day: &str) -> Result<Response> {
    finish(delete_bulk_inner(&req, &env, day).await)
}

async fn delete_bulk_inner(req: &Request, env: &Env, day: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let n = bulk_day_count(&db, &s.user_id, day).await?;
    let circles = bulk_day_circles(&db, &s.user_id, day).await?;
    let mut stmts = vec![db
        .prepare(format!("DELETE FROM log WHERE id IN ({BULK_LOGS})"))
        .bind(&[s.user_id.as_str().into(), day.into()])?];
    for c in &circles {
        stmts.extend(crate::diary::rebuild_ratings(&db, &s.user_id, c)?);
    }
    db.batch(stmts).await?;
    json(&BulkDayUndone { viewings: n as u32 }, 200)
}

/// `GET /api/imports/config`: what the server can do for an import (today: whether TMDB is on, so films come with their posters).
pub async fn config(req: Request, env: Env) -> Result<Response> {
    finish(config_inner(&req, &env).await)
}

async fn config_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    session::require(req, &db).await?;
    json(
        &ImportConfig {
            tmdb: catalog::tmdb_enabled(env),
        },
        200,
    )
}
