//! People search and the person page: bio and filmography from the catalogue, joined to the titles Pausa holds and, inside a
//! Cerchia, to its votes.

use crate::catalog;
use crate::diary::{locale_of, num, query_param};
use crate::http::{finish, json, Fail, R};
use crate::manage;
use crate::session;
use pausa_core::catalog::Key;
use pausa_core::dto::{PersonHitDto, PersonPageDto, PersonRating, PersonWorkDto};
use pausa_core::people::PersonKey;
use serde::Deserialize;
use std::collections::HashMap;
use worker::wasm_bindgen::JsValue;
use worker::*;

/// Most works of one person shown (and the most bound parameters the lookups below ever need).
const MAX_WORKS: usize = 50;

/// `GET /api/people/search?q=&locale=`: directors, creators and authors from TMDB and AniList. Nothing is stored.
pub async fn search(req: Request, env: Env) -> Result<Response> {
    finish(search_inner(&req, &env).await)
}

async fn search_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let q = query_param(req, "q").ok_or_else(Fail::invalid)?;
    if q.trim().chars().count() < 2 {
        return json(&Vec::<PersonHitDto>::new(), 200);
    }
    let hits = catalog::person_search(env, &db, &s.user_id, &q, locale_of(req)).await?;
    let out: Vec<PersonHitDto> = hits
        .into_iter()
        .map(|h| PersonHitDto {
            key: h.key.to_string(),
            name: h.name,
            profile_path: h.profile,
            known_for: h.known_for,
        })
        .collect();
    json(&out, 200)
}

#[derive(Deserialize)]
struct HeldRow {
    id: String,
    kind: String,
    tmdb_id: Option<i64>,
    anilist_id: Option<i64>,
    loc_title: Option<String>,
}

#[derive(Deserialize)]
struct VoteRow {
    media_id: String,
    user_id: String,
    rating: u8,
}

/// `?{offset+1}, ?{offset+2}, …` for `n` bound parameters.
fn placeholders(offset: usize, n: usize) -> String {
    (0..n)
        .map(|i| format!("?{}", offset + i + 1))
        .collect::<Vec<_>>()
        .join(", ")
}

/// `GET /api/people/:key?locale=&circle=`: the person's card with the works Pausa already holds linked and, with `circle`, that
/// Cerchia's votes on them. A `circle` the caller is not in answers 404.
pub async fn page(req: Request, env: Env, key: &str) -> Result<Response> {
    finish(page_inner(&req, &env, key).await)
}

async fn page_inner(req: &Request, env: &Env, key: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let key = PersonKey::from_path(key).ok_or_else(Fail::not_found)?;
    let locale = locale_of(req);
    let circle = query_param(req, "circle");
    if let Some(c) = &circle {
        manage::my_role(&db, c, &s.user_id).await?;
    }
    let mut card = catalog::person_card(env, &db, &s.user_id, &key, locale)
        .await?
        .ok_or_else(Fail::not_found)?;
    card.works.truncate(MAX_WORKS);

    let parsed: Vec<Option<Key>> = card.works.iter().map(|w| Key::parse(&w.work_key)).collect();
    let mut tmdb_ids: Vec<i64> = Vec::new();
    let mut anilist_ids: Vec<i64> = Vec::new();
    for k in parsed.iter().flatten() {
        match k {
            Key::Tmdb { id, .. } => tmdb_ids.push(*id),
            Key::Anilist { id } => anilist_ids.push(*id),
            Key::Local(_) => {}
        }
    }

    // Titles Pausa already holds, by catalogue id (one query, bound parameters only).
    let mut held: Vec<HeldRow> = Vec::new();
    if !tmdb_ids.is_empty() || !anilist_ids.is_empty() {
        let mut clauses = Vec::new();
        let mut args: Vec<JsValue> = vec![catalog::locale_code(locale).into()];
        if !tmdb_ids.is_empty() {
            clauses.push(format!(
                "(e.tmdb_id IN ({}) AND e.kind IN ('movie','tv','anime'))",
                placeholders(args.len(), tmdb_ids.len())
            ));
            args.extend(tmdb_ids.iter().map(|i| num(*i)));
        }
        if !anilist_ids.is_empty() {
            clauses.push(format!(
                "e.anilist_id IN ({})",
                placeholders(args.len(), anilist_ids.len())
            ));
            args.extend(anilist_ids.iter().map(|i| num(*i)));
        }
        held = db
            .prepare(format!(
                "SELECT e.id, e.kind, e.tmdb_id, e.anilist_id, mt.title AS loc_title FROM media_entity e \
                 LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?1 WHERE {}",
                clauses.join(" OR ")
            ))
            .bind(&args)?
            .all()
            .await?
            .results::<HeldRow>()?;
    }
    let held_for = |k: &Option<Key>| -> Option<&HeldRow> {
        match k.as_ref()? {
            Key::Tmdb { tv, id } => held
                .iter()
                .find(|h| h.tmdb_id == Some(*id) && (h.kind == "movie") != *tv),
            Key::Anilist { id } => held.iter().find(|h| h.anilist_id == Some(*id)),
            Key::Local(_) => None,
        }
    };

    // The Cerchia's votes on those titles.
    let mut votes: HashMap<String, Vec<PersonRating>> = HashMap::new();
    if let Some(c) = &circle {
        let ids: Vec<&str> = parsed
            .iter()
            .filter_map(|k| held_for(k).map(|h| h.id.as_str()))
            .collect();
        if !ids.is_empty() {
            let mut args: Vec<JsValue> = vec![c.as_str().into()];
            args.extend(ids.iter().map(|i| JsValue::from(*i)));
            let rows = db
                .prepare(format!(
                    "SELECT r.media_id, r.user_id, r.rating FROM rating_current r \
                     JOIN circle_member m ON m.circle_id = r.circle_id AND m.user_id = r.user_id \
                     WHERE r.circle_id = ?1 AND r.media_id IN ({})",
                    placeholders(1, ids.len())
                ))
                .bind(&args)?
                .all()
                .await?
                .results::<VoteRow>()?;
            for r in rows {
                votes.entry(r.media_id).or_default().push(PersonRating {
                    user_id: r.user_id,
                    rating: r.rating,
                });
            }
        }
    }

    let works: Vec<PersonWorkDto> = card
        .works
        .iter()
        .zip(&parsed)
        .map(|(w, k)| {
            let h = held_for(k);
            let ratings = h
                .and_then(|h| votes.get(&h.id))
                .cloned()
                .unwrap_or_default();
            let avg = (!ratings.is_empty()).then(|| {
                ratings.iter().map(|r| f64::from(r.rating)).sum::<f64>() / ratings.len() as f64
            });
            PersonWorkDto {
                work_key: w.work_key.clone(),
                media_id: h.map(|h| h.id.clone()),
                kind: w.kind.as_str().into(),
                title: h
                    .and_then(|h| h.loc_title.clone())
                    .unwrap_or_else(|| w.title.clone()),
                year: w.year,
                poster_path: w.poster_path.clone(),
                role: w.role.as_str().into(),
                avg,
                ratings,
            }
        })
        .collect();
    json(
        &PersonPageDto {
            key: card.key.to_string(),
            name: card.name,
            profile_path: card.profile,
            born: card.born,
            died: card.died,
            place: card.place,
            bio: card.bio,
            works,
        },
        200,
    )
}
