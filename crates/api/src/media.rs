//! Title search and detail, and where I am in a series.

use crate::catalog;
use crate::diary::{locale_of, num, query_param};
use crate::http::{body, finish, json, no_content, now_ms, Fail, R};
use crate::session;
use pausa_core::catalog::Key;
use pausa_core::diary::{advance, clamp_position};
use pausa_core::dto::{
    AuthorDto, CastDto, ErrorCode, IdOnly, Locale, MediaDetailDto, MediaDto, Position, ProgressDto,
    ProgressNext, SeasonDto,
};
use serde::Deserialize;
use worker::wasm_bindgen::JsValue;
use worker::*;

/// `GET /api/media/search?q=&locale=`: candidates from Pausa's own titles, TMDB and AniList. Nothing is stored.
pub async fn search(req: Request, env: Env) -> Result<Response> {
    finish(search_inner(&req, &env).await)
}

async fn search_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let q = query_param(req, "q").ok_or_else(Fail::invalid)?;
    json(
        &catalog::search(env, &db, &s.user_id, &q, locale_of(req)).await?,
        200,
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveIn {
    media_key: String,
    locale: Option<String>,
}

/// `POST /api/media/resolve {mediaKey, locale?}`: the stored id of a chosen search result, creating the title from the
/// catalogue the first time (what "now watching" needs before it can write a position).
pub async fn resolve(mut req: Request, env: Env) -> Result<Response> {
    finish(resolve_inner(&mut req, &env).await)
}

async fn resolve_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    let input: ResolveIn = body(req).await?;
    let key = Key::parse(&input.media_key).ok_or_else(Fail::invalid)?;
    let locale = input
        .locale
        .as_deref()
        .and_then(Locale::from_code)
        .unwrap_or_else(|| locale_of(req));
    let id = catalog::resolve(env, &db, &s.user_id, &key, locale).await?;
    json(&IdOnly { id }, 200)
}

#[derive(Deserialize)]
struct EntityRow {
    id: String,
    kind: String,
    original_title: String,
    loc_title: Option<String>,
    year: Option<i64>,
    poster_path: Option<String>,
    runtime_min: Option<i64>,
    episodes_total: Option<i64>,
}

#[derive(Deserialize)]
struct DetailRow {
    overview: Option<String>,
    genres: String,
    cast: String,
}

#[derive(Deserialize)]
struct AuthorRow {
    tmdb_id: Option<i64>,
    anilist_id: Option<i64>,
    name: String,
    role: String,
}

#[derive(Deserialize)]
struct SeasonRow {
    season: i64,
    episodes: i64,
}

/// `GET /api/media/:id?locale=`: a title with synopsis, genres, cast and season counts in the viewer's language. The first
/// request in a language that has none yet asks the catalogue once and keeps the answer.
pub async fn detail(req: Request, env: Env, media_id: &str) -> Result<Response> {
    finish(detail_inner(&req, &env, media_id).await)
}

async fn read_detail(db: &D1Database, media_id: &str, loc: &str) -> R<Option<MediaDetailDto>> {
    let res = db
        .batch(vec![
            db.prepare(
                "SELECT e.id, e.kind, e.original_title, mt.title AS loc_title, e.year, e.poster_path, e.runtime_min, e.episodes_total FROM media_entity e \
                 LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 WHERE e.id = ?1",
            )
            .bind(&[media_id.into(), loc.into()])?,
            db.prepare("SELECT overview, genres, \"cast\" FROM media_detail WHERE media_id = ?1 AND locale = ?2").bind(&[media_id.into(), loc.into()])?,
            db.prepare("SELECT season, episodes FROM media_season WHERE media_id = ?1 ORDER BY season").bind(&[media_id.into()])?,
            db.prepare("SELECT p.tmdb_id, p.anilist_id, p.name, mp.role FROM media_person mp JOIN person p ON p.id = mp.person_id WHERE mp.media_id = ?1 ORDER BY mp.position")
                .bind(&[media_id.into()])?,
        ])
        .await?;
    let Some(e) = res[0].results::<EntityRow>()?.into_iter().next() else {
        return Ok(None);
    };
    let d = res[1].results::<DetailRow>()?.into_iter().next();
    let cast: Vec<serde_json::Value> = d
        .as_ref()
        .and_then(|d| serde_json::from_str(&d.cast).ok())
        .unwrap_or_default();
    Ok(Some(MediaDetailDto {
        media: MediaDto {
            id: e.id,
            kind: e.kind,
            title: e.loc_title.unwrap_or(e.original_title),
            year: e.year,
            poster_path: e.poster_path,
        },
        runtime_min: e.runtime_min,
        episodes_total: e.episodes_total,
        overview: d.as_ref().and_then(|d| d.overview.clone()),
        genres: d
            .as_ref()
            .and_then(|d| serde_json::from_str(&d.genres).ok())
            .unwrap_or_default(),
        cast: cast
            .iter()
            .filter_map(|c| {
                Some(CastDto {
                    name: c.get("name")?.as_str()?.to_string(),
                    role: c.get("role").and_then(|r| r.as_str()).map(str::to_string),
                })
            })
            .collect(),
        seasons: res[2]
            .results::<SeasonRow>()?
            .into_iter()
            .map(|r| SeasonDto {
                season: r.season,
                episodes: r.episodes,
            })
            .collect(),
        authors: res[3]
            .results::<AuthorRow>()?
            .into_iter()
            .filter_map(|r| {
                Some(AuthorDto {
                    key: r
                        .tmdb_id
                        .map(|i| format!("tmdb:{i}"))
                        .or(r.anilist_id.map(|i| format!("anilist:{i}")))?,
                    name: r.name,
                    role: r.role,
                })
            })
            .collect(),
    }))
}

async fn detail_inner(req: &Request, env: &Env, media_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let locale = locale_of(req);
    let loc = catalog::locale_code(locale);
    let has = db
        .prepare("SELECT 1 AS n FROM media_detail WHERE media_id = ?1 AND locale = ?2")
        .bind(&[media_id.into(), loc.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .is_some();
    if !has {
        // Best effort: a catalogue that is down or not configured just means no synopsis for now.
        let _ = catalog::fill_locale(env, &db, &s.user_id, media_id, locale).await;
    }
    // Titles stored before genres and authors existed get them on first view (best effort, counted).
    let needs_v2 = db
        .prepare("SELECT catalog_v2_at FROM media_entity WHERE id = ?1")
        .bind(&[media_id.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .is_some_and(|r| {
            r.get("catalog_v2_at")
                .is_none_or(serde_json::Value::is_null)
        });
    if needs_v2 {
        let _ = catalog::fill_v2(env, &db, &s.user_id, media_id, true).await;
    }
    json(
        &read_detail(&db, media_id, loc)
            .await?
            .ok_or_else(Fail::not_found)?,
        200,
    )
}

/* ───────────── where I am in a series ───────────── */

#[derive(Deserialize)]
struct ProgressRow {
    media_id: String,
    season: Option<i64>,
    episode: Option<i64>,
    status: String,
    updated_at: i64,
    kind: String,
    original_title: String,
    loc_title: Option<String>,
    year: Option<i64>,
    poster_path: Option<String>,
}

#[derive(Deserialize)]
struct SeasonOfRow {
    media_id: String,
    season: i64,
    episodes: i64,
}

/// `GET /api/me/progress`: everything I am in the middle of ("continue watching"), most recent first, with the next episode.
pub async fn list(req: Request, env: Env) -> Result<Response> {
    finish(list_inner(&req, &env).await)
}

async fn list_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let loc = catalog::locale_code(locale_of(req));
    let res = db
        .batch(vec![
            db.prepare(
                "SELECT w.media_id, w.season, w.episode, w.status, w.updated_at, e.kind, e.original_title, mt.title AS loc_title, e.year, e.poster_path \
                 FROM watch_progress w JOIN media_entity e ON e.id = w.media_id LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 \
                 WHERE w.user_id = ?1 AND w.status <> 'done' ORDER BY w.updated_at DESC LIMIT 50",
            )
            .bind(&[s.user_id.as_str().into(), loc.into()])?,
            db.prepare(
                "SELECT media_id, season, episodes FROM media_season WHERE media_id IN \
                 (SELECT media_id FROM watch_progress WHERE user_id = ?1 AND status <> 'done') ORDER BY media_id, season",
            )
            .bind(&[s.user_id.as_str().into()])?,
        ])
        .await?;
    let seasons = res[1].results::<SeasonOfRow>()?;
    let out: Vec<ProgressDto> = res[0]
        .results::<ProgressRow>()?
        .into_iter()
        .map(|r| {
            let counts: Vec<(i64, i64)> = seasons
                .iter()
                .filter(|x| x.media_id == r.media_id)
                .map(|x| (x.season, x.episodes))
                .collect();
            let next = match (r.season, r.episode) {
                (Some(sn), Some(ep)) => {
                    let (ns, ne) = advance(sn, ep, &counts);
                    ((ns, ne) != (sn, ep)).then_some(ProgressNext {
                        season: ns,
                        episode: ne,
                    })
                }
                _ => None,
            };
            ProgressDto {
                media: MediaDto {
                    id: r.media_id,
                    kind: r.kind,
                    title: r.loc_title.unwrap_or(r.original_title),
                    year: r.year,
                    poster_path: r.poster_path,
                },
                season: r.season,
                episode: r.episode,
                status: r.status,
                updated_at: r.updated_at,
                next,
            }
        })
        .collect();
    json(&out, 200)
}

#[derive(Deserialize)]
struct ProgressIn {
    season: Option<i64>,
    episode: Option<i64>,
    status: Option<String>,
}

#[derive(Deserialize)]
struct CurrentRow {
    season: Option<i64>,
    episode: Option<i64>,
}

async fn seasons_of(db: &D1Database, media_id: &str) -> R<Vec<(i64, i64)>> {
    Ok(db
        .prepare("SELECT season, episodes FROM media_season WHERE media_id = ?1 ORDER BY season")
        .bind(&[media_id.into()])?
        .all()
        .await?
        .results::<SeasonRow>()?
        .into_iter()
        .map(|r| (r.season, r.episodes))
        .collect())
}

/// Writes my position. A title I was not yet following tells the Cerchie that have "sta guardando" switched on (once, when it
/// starts, not on every episode); a Cerchia can switch that off and a person can hide it.
async fn write_progress(
    db: &D1Database,
    user_id: &str,
    media_id: &str,
    season: Option<i64>,
    episode: Option<i64>,
    status: &str,
    is_new: bool,
) -> R<()> {
    let now = now_ms();
    let opt = |v: Option<i64>| -> JsValue { v.map_or(JsValue::NULL, num) };
    let mut stmts = vec![db
        .prepare(
            "INSERT INTO watch_progress(user_id, media_id, season, episode, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT(user_id, media_id) DO UPDATE SET season = excluded.season, episode = excluded.episode, status = excluded.status, updated_at = excluded.updated_at",
        )
        .bind(&[user_id.into(), media_id.into(), opt(season), opt(episode), status.into(), num(now)])?];
    if is_new && status == "watching" {
        stmts.push(
            db.prepare(
                "INSERT INTO notification(id, user_id, type, actor_id, circle_id, media_id, created_at) \
                 SELECT lower(hex(randomblob(16))), m2.user_id, 'now_watching', ?1, m.circle_id, ?2, ?3 \
                 FROM circle_member m JOIN circle c ON c.id = m.circle_id AND c.live_watching = 1 \
                 JOIN circle_member m2 ON m2.circle_id = m.circle_id AND m2.user_id <> ?1 AND m2.muted = 0 AND m2.hide_watching = 0 \
                 WHERE m.user_id = ?1 AND NOT EXISTS (SELECT 1 FROM notification_off o WHERE o.user_id = m2.user_id AND o.type = 'now_watching')",
            )
            .bind(&[user_id.into(), media_id.into(), num(now)])?,
        );
    }
    db.batch(stmts).await?;
    Ok(())
}

async fn current(db: &D1Database, user_id: &str, media_id: &str) -> R<Option<CurrentRow>> {
    Ok(db
        .prepare("SELECT season, episode FROM watch_progress WHERE user_id = ?1 AND media_id = ?2")
        .bind(&[user_id.into(), media_id.into()])?
        .first::<CurrentRow>(None)
        .await?)
}

async fn require_media(db: &D1Database, media_id: &str) -> R<()> {
    db.prepare("SELECT 1 AS n FROM media_entity WHERE id = ?1")
        .bind(&[media_id.into()])?
        .first::<serde_json::Value>(None)
        .await?
        .map(|_| ())
        .ok_or_else(Fail::not_found)
}

/// `PUT /api/media/:id/progress {season, episode, status?}`: "I'm watching S3·E4". Cut to what exists when the counts are known.
pub async fn set(mut req: Request, env: Env, media_id: &str) -> Result<Response> {
    finish(set_inner(&mut req, &env, media_id).await)
}

async fn set_inner(req: &mut Request, env: &Env, media_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    let input: ProgressIn = body(req).await?;
    require_media(&db, media_id).await?;
    if input.season.is_some_and(|x| !(1..=99).contains(&x))
        || input.episode.is_some_and(|x| !(1..=9999).contains(&x))
        || (input.episode.is_some() && input.season.is_none())
    {
        return Err(Fail::invalid());
    }
    let status = input.status.as_deref().unwrap_or("watching");
    if !matches!(status, "watching" | "paused" | "done") {
        return Err(Fail::invalid());
    }
    let seasons = seasons_of(&db, media_id).await?;
    let (season, episode) = clamp_position(input.season, input.episode, &seasons);
    let existed = current(&db, &s.user_id, media_id).await?.is_some();
    write_progress(&db, &s.user_id, media_id, season, episode, status, !existed).await?;
    no_content()
}

/// `POST /api/media/:id/progress/advance {season?: true}`: "+1 episode" (rolls into the next season at the end) or, with
/// `season: true`, the next season's first episode. Writes no log: the diary only changes when I choose to log.
pub async fn advance_one(mut req: Request, env: Env, media_id: &str) -> Result<Response> {
    finish(advance_inner(&mut req, &env, media_id).await)
}

#[derive(Deserialize, Default)]
struct AdvanceIn {
    #[serde(default)]
    season: bool,
}

async fn advance_inner(req: &mut Request, env: &Env, media_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let input: AdvanceIn = body(req).await.unwrap_or_default();
    let cur = current(&db, &s.user_id, media_id)
        .await?
        .ok_or_else(Fail::not_found)?;
    let (sn, ep) = (cur.season.unwrap_or(1), cur.episode.unwrap_or(0));
    let seasons = seasons_of(&db, media_id).await?;
    let (ns, ne) = if input.season {
        ((sn + 1).min(99), 1)
    } else {
        advance(sn, ep.max(1), &seasons)
    };
    write_progress(
        &db,
        &s.user_id,
        media_id,
        Some(ns),
        Some(ne),
        "watching",
        false,
    )
    .await?;
    json(
        &Position {
            season: ns,
            episode: ne,
        },
        200,
    )
}

/// `DELETE /api/media/:id/progress`: stop following it.
pub async fn clear(req: Request, env: Env, media_id: &str) -> Result<Response> {
    finish(clear_inner(&req, &env, media_id).await)
}

async fn clear_inner(req: &Request, env: &Env, media_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    db.prepare("DELETE FROM watch_progress WHERE user_id = ?1 AND media_id = ?2")
        .bind(&[s.user_id.as_str().into(), media_id.into()])?
        .run()
        .await?;
    no_content()
}
