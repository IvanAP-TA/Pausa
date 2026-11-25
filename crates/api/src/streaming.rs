//! "Where to watch": the services a person has, the services that carry a title (TMDB watch providers, data by JustWatch).
//! A title's availability is read from TMDB once a week per country and kept in D1; the Cache API absorbs repeats within a day.

use crate::catalog::{self, Caller};
use crate::diary::{locale_of, num, query_param};
use crate::http::{body, finish, json, no_content, now_ms, Fail, R};
use crate::{limit, session};
use pausa_core::limits;
use pausa_core::streaming::{
    clean_providers, default_country, is_country, on_my_services, parse_region_providers,
    parse_watch_providers, Availability, MyProviders, Provider, ProviderCatalogue, ProvidersIn,
    AVAILABILITY_TTL_MS,
};
use serde::Deserialize;
use worker::wasm_bindgen::JsValue;
use worker::*;

#[derive(Deserialize)]
struct ProviderRow {
    provider_id: i64,
    name: String,
    logo_path: Option<String>,
}

fn to_provider(r: ProviderRow) -> Provider {
    Provider {
        id: r.provider_id,
        name: r.name,
        logo_path: r.logo_path,
    }
}

async fn my_providers(db: &D1Database, user_id: &str) -> R<(Option<String>, Vec<Provider>)> {
    #[derive(Deserialize)]
    struct Country {
        country: Option<String>,
    }
    let res = db
        .batch(vec![
            db.prepare("SELECT country FROM user WHERE id = ?1")
                .bind(&[user_id.into()])?,
            db.prepare("SELECT provider_id, name, logo_path FROM user_provider WHERE user_id = ?1 ORDER BY name")
                .bind(&[user_id.into()])?,
        ])
        .await?;
    let country = res[0]
        .results::<Country>()?
        .into_iter()
        .next()
        .and_then(|c| c.country);
    let list = res[1]
        .results::<ProviderRow>()?
        .into_iter()
        .map(to_provider)
        .collect();
    Ok((country, list))
}

/// `GET /api/me/providers`: the country and the services you said you have.
pub async fn mine(req: Request, env: Env) -> Result<Response> {
    finish(mine_inner(&req, &env).await)
}

async fn mine_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let (country, providers) = my_providers(&db, &s.user_id).await?;
    json(&MyProviders { country, providers }, 200)
}

/// `PUT /api/me/providers {country, providers}`: replaces both. A `null` country clears the services too.
pub async fn save(mut req: Request, env: Env) -> Result<Response> {
    finish(save_inner(&mut req, &env).await)
}

async fn save_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let input: ProvidersIn = body(req).await?;
    let country = match input.country.as_deref() {
        Some(c) if is_country(c) => Some(c.to_string()),
        Some(_) => return Err(Fail::invalid()),
        None => None,
    };
    let providers = if country.is_some() {
        clean_providers(input.providers)
    } else {
        Vec::new()
    };
    let mut stmts = vec![
        db.prepare("UPDATE user SET country = ?2, updated_at = ?3 WHERE id = ?1")
            .bind(&[
                s.user_id.as_str().into(),
                country.as_deref().map_or(JsValue::NULL, JsValue::from),
                num(now_ms()),
            ])?,
        db.prepare("DELETE FROM user_provider WHERE user_id = ?1")
            .bind(&[s.user_id.as_str().into()])?,
    ];
    for p in &providers {
        stmts.push(
            db.prepare("INSERT INTO user_provider(user_id, provider_id, name, logo_path) VALUES (?1, ?2, ?3, ?4)")
                .bind(&[
                    s.user_id.as_str().into(),
                    num(p.id),
                    p.name.as_str().into(),
                    p.logo_path.as_deref().map_or(JsValue::NULL, JsValue::from),
                ])?,
        );
    }
    db.batch(stmts).await?;
    no_content()
}

/// `GET /api/providers?country=IT`: the services a person can pick from in that country (24, most prominent first).
pub async fn catalogue(req: Request, env: Env) -> Result<Response> {
    finish(catalogue_inner(&req, &env).await)
}

async fn catalogue_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let country = query_param(req, "country").ok_or_else(Fail::invalid)?;
    if !is_country(&country) {
        return Err(Fail::invalid());
    }
    limit::check(
        &db,
        &format!("act:providers:{}", s.user_id),
        limits::CATALOG,
    )
    .await?;
    let caller = Caller {
        db: &db,
        user_id: &s.user_id,
        counted: false,
    };
    let v = catalog::tmdb_get(
        env,
        &caller,
        &format!(
            "/watch/providers/movie?watch_region={country}&language={}",
            catalog::tmdb_lang(locale_of(req))
        ),
    )
    .await?;
    json(
        &ProviderCatalogue {
            providers: parse_region_providers(&v, &country, 24),
            country,
        },
        200,
    )
}

#[derive(Deserialize)]
struct EntityRow {
    kind: String,
    tmdb_id: Option<i64>,
}

/// `GET /api/media/:id/availability?country=`: where the title streams (subscription services) in that country, and which of
/// them you have. Without `country`, yours; without one, the default for your language.
pub async fn availability(req: Request, env: Env, media_id: &str) -> Result<Response> {
    finish(availability_inner(&req, &env, media_id).await)
}

async fn availability_inner(req: &Request, env: &Env, media_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let (my_country, mine) = my_providers(&db, &s.user_id).await?;
    let locale = locale_of(req);
    let country = query_param(req, "country")
        .or(my_country)
        .unwrap_or_else(|| default_country(catalog::locale_code(locale)).to_string());
    if !is_country(&country) {
        return Err(Fail::invalid());
    }
    let entity = db
        .prepare("SELECT kind, tmdb_id FROM media_entity WHERE id = ?1")
        .bind(&[media_id.into()])?
        .first::<EntityRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    let now = now_ms();
    #[derive(Deserialize)]
    struct Checked {
        fetched_at: i64,
    }
    let checked = db
        .prepare(
            "SELECT fetched_at FROM media_availability_check WHERE media_id = ?1 AND country = ?2",
        )
        .bind(&[media_id.into(), country.as_str().into()])?
        .first::<Checked>(None)
        .await?;
    let fresh = checked
        .as_ref()
        .is_some_and(|c| now - c.fetched_at < AVAILABILITY_TTL_MS);
    let read_stored = || async {
        let rows = db
            .prepare("SELECT provider_id, name, logo_path FROM media_provider WHERE media_id = ?1 AND country = ?2 ORDER BY name")
            .bind(&[media_id.into(), country.as_str().into()])?
            .all()
            .await?
            .results::<ProviderRow>()?;
        Ok::<Vec<Provider>, Fail>(rows.into_iter().map(to_provider).collect())
    };

    let (providers, known) = if fresh {
        (read_stored().await?, true)
    } else if let (Some(tmdb_id), true) = (entity.tmdb_id, catalog::tmdb_enabled(env)) {
        let caller = Caller {
            db: &db,
            user_id: &s.user_id,
            counted: true,
        };
        let kind = if entity.kind == "movie" {
            "movie"
        } else {
            "tv"
        };
        match catalog::tmdb_get(env, &caller, &format!("/{kind}/{tmdb_id}/watch/providers")).await {
            Ok(v) => {
                let list = parse_watch_providers(&v, &country);
                let mut stmts = vec![db
                    .prepare("DELETE FROM media_provider WHERE media_id = ?1 AND country = ?2")
                    .bind(&[media_id.into(), country.as_str().into()])?];
                for p in &list {
                    stmts.push(
                        db.prepare("INSERT INTO media_provider(media_id, country, provider_id, name, logo_path) VALUES (?1, ?2, ?3, ?4, ?5)")
                            .bind(&[
                                media_id.into(),
                                country.as_str().into(),
                                num(p.id),
                                p.name.as_str().into(),
                                p.logo_path.as_deref().map_or(JsValue::NULL, JsValue::from),
                            ])?,
                    );
                }
                stmts.push(
                    db.prepare("INSERT INTO media_availability_check(media_id, country, fetched_at) VALUES (?1, ?2, ?3) ON CONFLICT(media_id, country) DO UPDATE SET fetched_at = excluded.fetched_at")
                        .bind(&[media_id.into(), country.as_str().into(), num(now)])?,
                );
                db.batch(stmts).await?;
                (list, true)
            }
            // Rate limited: say so. Any other failure: an old answer is better than none, and "unknown" is better than "nowhere".
            Err(f) if f.status == 429 => return Err(f),
            Err(_) => (read_stored().await?, checked.is_some()),
        }
    } else {
        (read_stored().await?, checked.is_some())
    };
    let mine_here = on_my_services(&providers, &mine);
    json(
        &Availability {
            country,
            providers,
            mine: mine_here,
            known,
        },
        200,
    )
}
