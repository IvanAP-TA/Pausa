//! `GET /api/me/for-you`: titles to watch next, from what this person rated highest (TMDB recommendations, ranked in
//! `pausa_core::discovery`). Nothing is stored; the client logs a pick with its `key`.

use crate::catalog::{self, Caller};
use crate::diary::locale_of;
use crate::http::{finish, json, R};
use crate::session;
use pausa_core::discovery::{
    candidates_from_recommendations, rank_discovery, ForYou, Seed, MAX_SEEDS, SEED_MIN_RATING,
};
use pausa_core::streaming::{default_country, on_my_services, parse_watch_providers, Provider};
use serde::Deserialize;
use std::collections::HashSet;
use worker::*;

#[derive(Deserialize)]
struct SeedRow {
    media_id: String,
    title: String,
    rating: i64,
    tmdb_id: i64,
    kind: String,
}

#[derive(Deserialize)]
struct MineRow {
    provider_id: i64,
    name: String,
    logo_path: Option<String>,
}

#[derive(Deserialize)]
struct CountryRow {
    country: Option<String>,
}

/// An anime only AniList knows, rated high: its seed is AniList's own recommendations.
#[derive(Deserialize)]
struct AnilistSeedRow {
    media_id: String,
    title: String,
    rating: i64,
    anilist_id: i64,
}

#[derive(Deserialize)]
struct AnilistLogged {
    anilist_id: i64,
}

#[derive(Deserialize)]
struct LoggedRow {
    tmdb_id: i64,
    kind: String,
}

pub async fn for_you(req: Request, env: Env) -> Result<Response> {
    finish(for_you_inner(&req, &env).await)
}

fn key(kind: &str, id: i64) -> String {
    format!("tmdb:{}:{id}", if kind == "movie" { "movie" } else { "tv" })
}

async fn for_you_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let locale = locale_of(req);
    let tmdb_on = catalog::tmdb_enabled(env);
    // AniList-only anime seed "Per te" too (AniList needs no key, so this works with TMDB off as well).
    let anilist = db
        .batch(vec![
            db.prepare(
                "SELECT l.media_id, COALESCE(mt.title, e.original_title) AS title, l.rating, e.anilist_id                  FROM log l JOIN media_entity e ON e.id = l.media_id LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2                  WHERE l.user_id = ?1 AND e.tmdb_id IS NULL AND e.anilist_id IS NOT NULL AND l.rating IS NOT NULL                    AND l.id = (SELECT l2.id FROM log l2 WHERE l2.user_id = l.user_id AND l2.media_id = l.media_id                                ORDER BY l2.watched_on DESC, l2.created_at DESC, l2.id DESC LIMIT 1)                    AND l.rating >= ?3 ORDER BY l.rating DESC, l.watched_on DESC LIMIT ?4",
            )
            .bind(&[
                s.user_id.as_str().into(),
                catalog::locale_code(locale).into(),
                (SEED_MIN_RATING as f64).into(),
                (MAX_SEEDS as f64).into(),
            ])?,
            db.prepare("SELECT DISTINCT e.anilist_id FROM log l JOIN media_entity e ON e.id = l.media_id WHERE l.user_id = ?1 AND e.anilist_id IS NOT NULL")
                .bind(&[s.user_id.as_str().into()])?,
        ])
        .await?;
    let anilist_seeds = anilist[0].results::<AnilistSeedRow>()?;
    let anilist_logged = anilist[1].results::<AnilistLogged>()?;
    if !tmdb_on && anilist_seeds.is_empty() {
        return json(
            &ForYou {
                enabled: false,
                seeded: 0,
                picks: Vec::new(),
            },
            200,
        );
    }
    let res = db
        .batch(vec![
            // The latest rating of each title (a rewatch can change your mind), best first, newest first among ties.
            db.prepare(
                "SELECT l.media_id, COALESCE(mt.title, e.original_title) AS title, l.rating, e.tmdb_id, e.kind \
                 FROM log l JOIN media_entity e ON e.id = l.media_id LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 \
                 WHERE l.user_id = ?1 AND e.tmdb_id IS NOT NULL AND l.rating IS NOT NULL \
                   AND l.id = (SELECT l2.id FROM log l2 WHERE l2.user_id = l.user_id AND l2.media_id = l.media_id \
                               ORDER BY l2.watched_on DESC, l2.created_at DESC, l2.id DESC LIMIT 1) \
                   AND l.rating >= ?3 ORDER BY l.rating DESC, l.watched_on DESC LIMIT ?4",
            )
            .bind(&[
                s.user_id.as_str().into(),
                catalog::locale_code(locale).into(),
                (SEED_MIN_RATING as f64).into(),
                (MAX_SEEDS as f64).into(),
            ])?,
            db.prepare(
                "SELECT DISTINCT e.tmdb_id, e.kind FROM log l JOIN media_entity e ON e.id = l.media_id WHERE l.user_id = ?1 AND e.tmdb_id IS NOT NULL",
            )
            .bind(&[s.user_id.as_str().into()])?,
        ])
        .await?;
    let seeds = if tmdb_on {
        res[0].results::<SeedRow>()?
    } else {
        Vec::new()
    };
    let mut exclude: HashSet<String> = res[1]
        .results::<LoggedRow>()?
        .into_iter()
        .map(|r| key(&r.kind, r.tmdb_id))
        .collect();
    exclude.extend(
        anilist_logged
            .iter()
            .map(|r| format!("anilist:{}", r.anilist_id)),
    );
    let caller = Caller {
        db: &db,
        user_id: &s.user_id,
        counted: true,
    };
    let mut input = Vec::new();
    for r in &seeds {
        let tv = r.kind != "movie";
        let path = format!(
            "/{}/{}/recommendations?language={}",
            if tv { "tv" } else { "movie" },
            r.tmdb_id,
            catalog::tmdb_lang(locale)
        );
        match catalog::tmdb_get(env, &caller, &path).await {
            Ok(v) => input.push((
                Seed {
                    media_id: r.media_id.clone(),
                    title: r.title.clone(),
                    rating: r.rating,
                },
                candidates_from_recommendations(&v, tv),
            )),
            Err(f) if f.status == 429 => return Err(f),
            Err(_) => {}
        }
    }
    for r in &anilist_seeds {
        match catalog::anilist_post(
            env,
            &caller,
            pausa_core::catalog::ANILIST_RECOMMENDATIONS,
            serde_json::json!({ "id": r.anilist_id }),
        )
        .await
        {
            Ok(v) => input.push((
                Seed {
                    media_id: r.media_id.clone(),
                    title: r.title.clone(),
                    rating: r.rating,
                },
                pausa_core::catalog::candidates_from_anilist_recommendations(&v, 12),
            )),
            Err(f) if f.status == 429 => return Err(f),
            Err(_) => {}
        }
    }
    let mut picks = rank_discovery(&input, &exclude, 8);
    // "On your services": only when they set some. One TMDB lookup per pick; a failure just leaves the pick without services.
    let mine: Vec<Provider> = db
        .prepare("SELECT provider_id, name, logo_path FROM user_provider WHERE user_id = ?1 ORDER BY name")
        .bind(&[s.user_id.as_str().into()])?
        .all()
        .await?
        .results::<MineRow>()?
        .into_iter()
        .map(|r| Provider { id: r.provider_id, name: r.name, logo_path: r.logo_path })
        .collect();
    if tmdb_on && !mine.is_empty() {
        let country = db
            .prepare("SELECT country FROM user WHERE id = ?1")
            .bind(&[s.user_id.as_str().into()])?
            .first::<CountryRow>(None)
            .await?
            .and_then(|c| c.country)
            .unwrap_or_else(|| default_country(catalog::locale_code(locale)).to_string());
        for p in &mut picks {
            let mut parts = p.key.split(':').skip(1);
            let (Some(kind), Some(id)) = (parts.next(), parts.next()) else {
                continue;
            };
            match catalog::tmdb_get(env, &caller, &format!("/{kind}/{id}/watch/providers")).await {
                Ok(v) => p.on = on_my_services(&parse_watch_providers(&v, &country), &mine),
                Err(f) if f.status == 429 => break,
                Err(_) => {}
            }
        }
    }
    json(
        &ForYou {
            enabled: true,
            seeded: input.len() as u32,
            picks,
        },
        200,
    )
}
