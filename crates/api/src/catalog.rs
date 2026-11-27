//! TMDB and AniList access: search, and turning a chosen result into a stored title. Responses go through the Cache API
//! (TMDB 1 day, AniList 1 hour, like v1) and only real network calls count against the catalogue rate limit.
//!
//! Configuration: `TMDB_API_TOKEN` (secret) switches TMDB on; `TMDB_BASE_URL` / `ANILIST_URL` default to the real services and are
//! overridden in tests (a local mock). With no token the app still works for titles already stored and for AniList anime.

use crate::http::{new_id, now_ms, Fail, R};
use crate::limit;
use pausa_core::catalog::{
    candidates_from_anilist, candidates_from_tmdb, draft_from_anilist, draft_from_tmdb,
    merge_candidates, prefix_bounds, Candidate, Draft, Key, Kind,
};
use pausa_core::dto::{CandidateDto, ErrorCode, Locale};
use pausa_core::limits;
use pausa_core::people::{
    card_from_anilist, card_from_tmdb, hits_from_anilist, hits_from_tmdb, merge_hits, PersonCard,
    PersonHit, PersonKey,
};
use serde::Deserialize;
use serde_json::{json, Value};
use worker::wasm_bindgen::JsValue;
use worker::*;

const TMDB_DEFAULT: &str = "https://api.themoviedb.org/3";
const ANILIST_DEFAULT: &str = "https://graphql.anilist.co";
const TMDB_TTL_S: u32 = 86_400;
const ANILIST_TTL_S: u32 = 3_600;

/// A setting that may be a plain variable or a secret.
pub fn setting(env: &Env, name: &str) -> Option<String> {
    env.var(name)
        .ok()
        .map(|v| v.to_string())
        .or_else(|| env.secret(name).ok().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
}

pub fn tmdb_lang(l: Locale) -> &'static str {
    match l {
        Locale::It => "it-IT",
        Locale::En => "en-US",
        Locale::Es => "es-ES",
    }
}

pub fn locale_code(l: Locale) -> &'static str {
    match l {
        Locale::It => "it",
        Locale::En => "en",
        Locale::Es => "es",
    }
}

fn unavailable() -> Fail {
    Fail::new(ErrorCode::CatalogUnavailable, 503)
}

async fn cache_get(key: &str) -> Option<Value> {
    let mut res = Cache::default().get(key, false).await.ok()??;
    res.json::<Value>().await.ok()
}

async fn cache_put(key: &str, value: &Value, ttl: u32) {
    if let Ok(mut res) = Response::from_json(value) {
        if res
            .headers_mut()
            .set("Cache-Control", &format!("public, max-age={ttl}"))
            .is_ok()
        {
            let _ = Cache::default().put(key, res).await;
        }
    }
}

/// Who pays for a network call: the person's catalogue counter.
pub struct Caller<'a> {
    pub db: &'a D1Database,
    pub user_id: &'a str,
    /// Network calls count against the person's catalogue limit. Imports do not (they have their own, per chunk).
    pub counted: bool,
}

async fn count(c: &Caller<'_>) -> R<()> {
    if !c.counted {
        return Ok(());
    }
    limit::check(c.db, &format!("act:catalog:{}", c.user_id), limits::CATALOG).await
}

pub async fn tmdb_get(env: &Env, caller: &Caller<'_>, path_and_query: &str) -> R<Value> {
    tmdb_fetch(env, caller, path_and_query)
        .await?
        .ok_or_else(unavailable)
}

/// Like `tmdb_get`, but `None` when TMDB definitively answers 404 (the title does not exist there).
async fn tmdb_fetch(env: &Env, caller: &Caller<'_>, path_and_query: &str) -> R<Option<Value>> {
    let token = setting(env, "TMDB_API_TOKEN").ok_or_else(unavailable)?;
    let base = setting(env, "TMDB_BASE_URL").unwrap_or_else(|| TMDB_DEFAULT.to_string());
    let url = format!("{base}{path_and_query}");
    if let Some(v) = cache_get(&url).await {
        return Ok(Some(v));
    }
    count(caller).await?;
    let headers = Headers::new();
    headers.set("Authorization", &format!("Bearer {token}"))?;
    headers.set("Accept", "application/json")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(headers);
    let mut res = Fetch::Request(Request::new_with_init(&url, &init)?)
        .send()
        .await?;
    if res.status_code() == 404 {
        console_error!("tmdb answered 404");
        return Ok(None);
    }
    if res.status_code() != 200 {
        console_error!("tmdb answered {}", res.status_code());
        return Err(unavailable());
    }
    let v: Value = res.json().await?;
    cache_put(&url, &v, TMDB_TTL_S).await;
    Ok(Some(v))
}

pub(crate) async fn anilist_post(
    env: &Env,
    caller: &Caller<'_>,
    query: &str,
    vars: Value,
) -> R<Value> {
    anilist_fetch(env, caller, query, vars)
        .await?
        .ok_or_else(unavailable)
}

/// Like `anilist_post`, but `None` when AniList definitively says the media does not exist (404 or a "Not Found." error).
async fn anilist_fetch(
    env: &Env,
    caller: &Caller<'_>,
    query: &str,
    vars: Value,
) -> R<Option<Value>> {
    let url = setting(env, "ANILIST_URL").unwrap_or_else(|| ANILIST_DEFAULT.to_string());
    // POST answers are not cacheable by URL, so a synthetic GET key stands for (query, variables).
    let key = format!(
        "https://cache.pausa.invalid/anilist/{}",
        pausa_core::auth::hash_token(&format!("{query}{vars}"))
    );
    if let Some(v) = cache_get(&key).await {
        return Ok(Some(v));
    }
    count(caller).await?;
    let headers = Headers::new();
    headers.set("Content-Type", "application/json")?;
    headers.set("Accept", "application/json")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(
            json!({ "query": query, "variables": vars })
                .to_string()
                .into(),
        ));
    let mut res = Fetch::Request(Request::new_with_init(&url, &init)?)
        .send()
        .await?;
    let status = res.status_code();
    if status != 200 && status != 404 {
        console_error!("anilist answered {status}");
        return Err(unavailable());
    }
    if status == 404 {
        console_error!("anilist answered 404");
        return Ok(None);
    }
    let v: Value = res.json().await?;
    if let Some(errs) = v.get("errors") {
        let not_found = errs.as_array().is_some_and(|a| {
            a.iter().any(|e| {
                e.get("message")
                    .and_then(Value::as_str)
                    .is_some_and(|m| m.contains("Not Found"))
            })
        });
        return if not_found {
            Ok(None)
        } else {
            Err(unavailable())
        };
    }
    cache_put(&key, &v, ANILIST_TTL_S).await;
    Ok(Some(v))
}

const ANILIST_SEARCH: &str = "query($q:String){Page(perPage:8){media(search:$q,type:ANIME,isAdult:false){id idMal title{romaji english native} seasonYear startDate{year} isAdult coverImage{large}}}}";
const ANILIST_MEDIA: &str = "query($id:Int){Media(id:$id,type:ANIME){id idMal title{romaji english native} seasonYear startDate{year} episodes duration description(asHtml:false) genres isAdult coverImage{large} staff(sort:RELEVANCE,perPage:25){edges{role node{id name{full} image{large}}}}}}";

#[derive(Deserialize)]
struct LocalRow {
    id: String,
    kind: String,
    title: String,
    year: Option<i64>,
    poster_path: Option<String>,
    tmdb_id: Option<i64>,
    anilist_id: Option<i64>,
}

fn to_dto(c: Candidate) -> CandidateDto {
    CandidateDto {
        key: c.key,
        kind: c.kind.as_str().into(),
        title: c.title,
        year: c.year,
        poster_path: c.poster_path,
    }
}

/// Search: titles Pausa already has (prefix match on an index), then TMDB, then AniList. Nothing is stored. A catalogue that is
/// down or not configured only removes its own results.
pub async fn search(
    env: &Env,
    db: &D1Database,
    user_id: &str,
    q: &str,
    locale: Locale,
) -> R<Vec<CandidateDto>> {
    let q = q.trim();
    if q.is_empty() || q.chars().count() > 100 {
        return Err(Fail::invalid());
    }
    let caller = Caller {
        db,
        user_id,
        counted: true,
    };

    let local_rows = match prefix_bounds(q) {
        Some((lo, hi)) => db
            .prepare(
                "SELECT e.id, e.kind, COALESCE(t.title, e.original_title) AS title, e.year, e.poster_path, e.tmdb_id, e.anilist_id FROM media_entity e \
                 LEFT JOIN media_title t ON t.media_id = e.id AND t.locale = ?3 \
                 WHERE (e.original_title >= ?1 COLLATE NOCASE AND e.original_title < ?2 COLLATE NOCASE) \
                    OR e.id IN (SELECT media_id FROM media_title WHERE title >= ?1 COLLATE NOCASE AND title < ?2 COLLATE NOCASE) LIMIT 12",
            )
            .bind(&[lo.into(), hi.into(), locale_code(locale).into()])?
            .all()
            .await?
            .results::<LocalRow>()?,
        None => Vec::new(),
    };
    // A title we already store must not come back a second time as a catalogue candidate (same TMDB or AniList id).
    let mut known: std::collections::HashSet<String> = std::collections::HashSet::new();
    for r in &local_rows {
        if let Some(id) = r.tmdb_id {
            known.insert(format!(
                "tmdb:{}:{id}",
                if r.kind == "movie" { "movie" } else { "tv" }
            ));
        }
        if let Some(id) = r.anilist_id {
            known.insert(format!("anilist:{id}"));
        }
    }
    let local: Vec<Candidate> = local_rows
        .into_iter()
        .filter_map(|r| {
            Some(Candidate {
                key: format!("local:{}", r.id),
                kind: Kind::parse(&r.kind)?,
                title: r.title,
                year: r.year,
                poster_path: r.poster_path,
            })
        })
        .collect();

    let tmdb = if q.chars().count() >= 2 && setting(env, "TMDB_API_TOKEN").is_some() {
        let path = format!(
            "/search/multi?query={}&language={}&include_adult=false&page=1",
            urlencode(q),
            tmdb_lang(locale)
        );
        match tmdb_get(env, &caller, &path).await {
            Ok(v) => candidates_from_tmdb(&v, 10)
                .into_iter()
                .filter(|c| !known.contains(&c.key))
                .collect(),
            Err(f) if f.status == 429 => return Err(f),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };

    let anilist = if q.chars().count() >= 2 {
        match anilist_post(env, &caller, ANILIST_SEARCH, json!({ "q": q })).await {
            Ok(v) => candidates_from_anilist(&v, 8)
                .into_iter()
                .filter(|c| !known.contains(&c.key))
                .collect(),
            Err(f) if f.status == 429 => return Err(f),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };

    Ok(merge_candidates(local, tmdb, anilist, 14)
        .into_iter()
        .map(to_dto)
        .collect())
}

const ANILIST_PERSON_SEARCH: &str = "query($q:String){Page(perPage:8){staff(search:$q){id name{full} primaryOccupations image{large}}}}";
const ANILIST_STAFF: &str = "query($id:Int){Staff(id:$id){id name{full} image{large} description(asHtml:false) dateOfBirth{year month day} dateOfDeath{year month day} homeTown staffMedia(type:ANIME,sort:START_DATE_DESC,perPage:50){edges{staffRole node{id type isAdult title{romaji english native} seasonYear startDate{year} coverImage{large}}}}}}";

/// People search: TMDB (directing and writing people) and AniList staff, in the same error style as `search` (one catalogue being
/// down only removes its own hits; the rate limit is not swallowed). Nothing is stored.
pub async fn person_search(
    env: &Env,
    db: &D1Database,
    user_id: &str,
    q: &str,
    locale: Locale,
) -> R<Vec<PersonHit>> {
    let q = q.trim();
    if q.chars().count() < 2 || q.chars().count() > 100 {
        return Err(Fail::invalid());
    }
    let caller = Caller {
        db,
        user_id,
        counted: true,
    };
    let tmdb = if setting(env, "TMDB_API_TOKEN").is_some() {
        let path = format!(
            "/search/person?query={}&language={}&include_adult=false&page=1",
            urlencode(q),
            tmdb_lang(locale)
        );
        match tmdb_get(env, &caller, &path).await {
            Ok(v) => hits_from_tmdb(&v, 10),
            Err(f) if f.status == 429 => return Err(f),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };
    let anilist = match anilist_post(env, &caller, ANILIST_PERSON_SEARCH, json!({ "q": q })).await {
        Ok(v) => hits_from_anilist(&v, 8),
        Err(f) if f.status == 429 => return Err(f),
        Err(_) => Vec::new(),
    };
    Ok(merge_hits(tmdb, anilist, 10))
}

/// A person's card (bio and filmography) from the catalogue the key belongs to; `None` when it has no such person.
pub async fn person_card(
    env: &Env,
    db: &D1Database,
    user_id: &str,
    key: &PersonKey,
    locale: Locale,
) -> R<Option<PersonCard>> {
    let caller = Caller {
        db,
        user_id,
        counted: true,
    };
    Ok(match key {
        PersonKey::Tmdb(id) => {
            let path = format!(
                "/person/{id}?language={}&append_to_response=combined_credits",
                tmdb_lang(locale)
            );
            tmdb_fetch(env, &caller, &path)
                .await?
                .and_then(|b| card_from_tmdb(&b))
        }
        PersonKey::Anilist(id) => anilist_fetch(env, &caller, ANILIST_STAFF, json!({ "id": id }))
            .await?
            .and_then(|b| card_from_anilist(&b)),
    })
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

#[derive(Deserialize)]
struct IdRow {
    id: String,
}

async fn first_id(db: &D1Database, sql: &str, args: &[JsValue]) -> R<Option<String>> {
    Ok(db
        .prepare(sql)
        .bind(args)?
        .first::<IdRow>(None)
        .await?
        .map(|r| r.id))
}

/// The stored id for a chosen search result, creating the title (with its details) from the catalogue the first time.
pub async fn resolve(
    env: &Env,
    db: &D1Database,
    user_id: &str,
    key: &Key,
    locale: Locale,
) -> R<String> {
    resolve_as(
        env,
        &Caller {
            db,
            user_id,
            counted: true,
        },
        key,
        locale,
    )
    .await
}

/// Same, for a given caller (imports pass one that does not count against the search limit).
pub async fn resolve_as(env: &Env, caller: &Caller<'_>, key: &Key, locale: Locale) -> R<String> {
    let db = caller.db;
    match key {
        Key::Local(id) => first_id(
            db,
            "SELECT id FROM media_entity WHERE id = ?1",
            &[id.as_str().into()],
        )
        .await?
        .ok_or_else(Fail::not_found),
        Key::Tmdb { tv, id } => {
            let kinds = if *tv { "('tv','anime')" } else { "('movie')" };
            if let Some(found) = first_id(
                db,
                &format!("SELECT id FROM media_entity WHERE tmdb_id = ?1 AND kind IN {kinds}"),
                &[(*id as f64).into()],
            )
            .await?
            {
                return Ok(found);
            }
            let path = format!(
                "/{}/{id}?language={}&append_to_response=credits,external_ids",
                if *tv { "tv" } else { "movie" },
                tmdb_lang(locale)
            );
            let body = tmdb_get(env, caller, &path).await?;
            let draft = draft_from_tmdb(*tv, &body).ok_or_else(unavailable)?;
            store(db, &draft, locale, "tmdb").await
        }
        Key::Anilist { id } => {
            if let Some(found) = first_id(
                db,
                "SELECT id FROM media_entity WHERE anilist_id = ?1",
                &[(*id as f64).into()],
            )
            .await?
            {
                return Ok(found);
            }
            let body = anilist_post(env, caller, ANILIST_MEDIA, json!({ "id": id })).await?;
            if body.pointer("/data/Media/isAdult").and_then(Value::as_bool) == Some(true) {
                return Err(Fail::invalid());
            }
            let draft = draft_from_anilist(&body).ok_or_else(unavailable)?;
            store(db, &draft, locale, "anilist").await
        }
    }
}

/// Inserts a title and its cached details in one batch. Every dependent row finds the title by its unique catalogue key, so a
/// concurrent insert of the same title (a race) is harmless: the second one is ignored and the existing row is returned.
async fn store(db: &D1Database, d: &Draft, locale: Locale, source: &str) -> R<String> {
    let kind = d.kind.ok_or_else(unavailable)?;
    let (find_sql, find_args): (&str, Vec<JsValue>) = match (d.tmdb_id, d.anilist_id) {
        (Some(t), _) => (
            "tmdb_id = ?1 AND kind = ?2",
            vec![(t as f64).into(), kind.as_str().into()],
        ),
        (None, Some(a)) => (
            "anilist_id = ?1 AND ?2 = ?2",
            vec![(a as f64).into(), kind.as_str().into()],
        ),
        _ => return Err(unavailable()),
    };
    let opt = |v: Option<i64>| -> JsValue { v.map_or(JsValue::NULL, |n| (n as f64).into()) };
    let opt_s =
        |v: &Option<String>| -> JsValue { v.as_deref().map_or(JsValue::NULL, JsValue::from) };
    let now = now_ms() as f64;
    let loc = locale_code(locale);
    let shown = d
        .localized_title
        .clone()
        .unwrap_or_else(|| d.original_title.clone());

    let mut stmts = vec![db
        .prepare(
            "INSERT OR IGNORE INTO media_entity(id, kind, tmdb_id, anilist_id, mal_id, imdb_id, original_title, year, runtime_min, episodes_total, \
             details_checked_at, poster_path, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?11)",
        )
        .bind(&[
            new_id().into(),
            kind.as_str().into(),
            opt(d.tmdb_id),
            opt(d.anilist_id),
            opt(d.mal_id),
            opt_s(&d.imdb_id),
            d.original_title.as_str().into(),
            opt(d.year),
            opt(d.runtime_min),
            opt(d.episodes_total),
            now.into(),
            opt_s(&d.poster_path),
        ])?];
    stmts.push(
        db.prepare(format!("INSERT OR IGNORE INTO media_title(media_id, locale, title) SELECT id, ?3, ?4 FROM media_entity WHERE {find_sql}"))
            .bind(&[find_args[0].clone(), find_args[1].clone(), loc.into(), shown.into()])?,
    );
    for (season, episodes) in &d.seasons {
        stmts.push(
            db.prepare(format!("INSERT OR IGNORE INTO media_season(media_id, season, episodes) SELECT id, ?3, ?4 FROM media_entity WHERE {find_sql}"))
                .bind(&[find_args[0].clone(), find_args[1].clone(), (*season as f64).into(), (*episodes as f64).into()])?,
        );
    }
    let cast: Vec<Value> = d
        .cast
        .iter()
        .map(|(n, r)| json!({ "name": n, "role": r }))
        .collect();
    let has_detail = d.overview.is_some() || !d.genres.is_empty() || !cast.is_empty();
    stmts.push(
        db.prepare(format!(
            "INSERT OR IGNORE INTO media_detail(media_id, locale, overview, genres, \"cast\", source, fetched_at) SELECT id, ?3, ?4, ?5, ?6, ?7, ?8 FROM media_entity WHERE {find_sql}"
        ))
        .bind(&[
            find_args[0].clone(),
            find_args[1].clone(),
            loc.into(),
            opt_s(&d.overview),
            serde_json::to_string(&d.genres).unwrap_or_else(|_| "[]".into()).into(),
            serde_json::to_string(&cast).unwrap_or_else(|_| "[]".into()).into(),
            (if has_detail { source } else { "none" }).into(),
            now.into(),
        ])?,
    );
    stmts.extend(v2_statements(
        db,
        Target::Find(find_sql, &find_args),
        d,
        now,
    )?);
    db.batch(stmts).await?;

    first_id(
        db,
        &format!("SELECT id FROM media_entity WHERE {find_sql}"),
        &find_args,
    )
    .await?
    .ok_or_else(Fail::internal)
}

/// How a title is addressed by the statements of a batch: by its catalogue key (`store`, the row may not exist yet when the
/// batch is built) or by its id (`fill_locale`).
enum Target<'a> {
    Find(&'a str, &'a [JsValue]),
    Id(&'a str),
}

/// The statements that write what 0003 added for a title: its stable genres and `catalog_v2_at`. Both are idempotent.
fn v2_statements(
    db: &D1Database,
    target: Target<'_>,
    d: &Draft,
    now: f64,
) -> R<Vec<D1PreparedStatement>> {
    let mut stmts = Vec::new();
    for g in &d.genre_slugs {
        stmts.push(match &target {
            Target::Find(find_sql, args) => db
                .prepare(format!("INSERT OR IGNORE INTO media_genre(media_id, genre) SELECT id, ?3 FROM media_entity WHERE {find_sql}"))
                .bind(&[args[0].clone(), args[1].clone(), (*g).into()])?,
            Target::Id(id) => db
                .prepare("INSERT OR IGNORE INTO media_genre(media_id, genre) VALUES (?1, ?2)")
                .bind(&[(*id).into(), (*g).into()])?,
        });
    }
    for c in &d.people {
        let (col, ext) = match &c.key {
            PersonKey::Tmdb(i) => ("tmdb_id", *i),
            PersonKey::Anilist(i) => ("anilist_id", *i),
        };
        let profile: JsValue = c.profile.as_deref().map_or(JsValue::NULL, JsValue::from);
        // The conflict target repeats the partial index's WHERE, as SQLite requires.
        stmts.push(
            db.prepare(format!("INSERT INTO person(id, {col}, name, profile_path) VALUES (?1, ?2, ?3, ?4) ON CONFLICT({col}) WHERE {col} IS NOT NULL DO UPDATE SET name = excluded.name, profile_path = COALESCE(excluded.profile_path, person.profile_path)"))
                .bind(&[new_id().into(), (ext as f64).into(), c.name.as_str().into(), profile])?,
        );
        let role = c.role.as_str();
        let pos = c.position as f64;
        stmts.push(match &target {
            Target::Find(find_sql, args) => db
                .prepare(format!("INSERT OR IGNORE INTO media_person(media_id, person_id, role, position) SELECT m.id, p.id, ?3, ?4 FROM media_entity m, person p WHERE m.id = (SELECT id FROM media_entity WHERE {find_sql}) AND p.{col} = ?5"))
                .bind(&[args[0].clone(), args[1].clone(), role.into(), pos.into(), (ext as f64).into()])?,
            Target::Id(id) => db
                .prepare(format!("INSERT OR IGNORE INTO media_person(media_id, person_id, role, position) SELECT ?1, p.id, ?2, ?3 FROM person p WHERE p.{col} = ?4"))
                .bind(&[(*id).into(), role.into(), pos.into(), (ext as f64).into()])?,
        });
    }
    stmts.push(match &target {
        Target::Find(find_sql, args) => db
            .prepare(format!(
                "UPDATE media_entity SET catalog_v2_at = ?3 WHERE {find_sql}"
            ))
            .bind(&[args[0].clone(), args[1].clone(), now.into()])?,
        Target::Id(id) => db
            .prepare("UPDATE media_entity SET catalog_v2_at = ?2 WHERE id = ?1")
            .bind(&[(*id).into(), now.into()])?,
    });
    Ok(stmts)
}

#[derive(Deserialize)]
struct EntityKeys {
    kind: String,
    tmdb_id: Option<i64>,
    anilist_id: Option<i64>,
}

/// Fetches a stored title again in another language: its title there and its synopsis, genres and cast. Idempotent (rows that
/// exist are kept), so it is safe to call on the first request in a language.
pub async fn fill_locale(
    env: &Env,
    db: &D1Database,
    user_id: &str,
    media_id: &str,
    locale: Locale,
) -> R<()> {
    let k = db
        .prepare("SELECT kind, tmdb_id, anilist_id FROM media_entity WHERE id = ?1")
        .bind(&[media_id.into()])?
        .first::<EntityKeys>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    let caller = Caller {
        db,
        user_id,
        counted: true,
    };
    let (draft, source) = match (k.tmdb_id, k.anilist_id) {
        (Some(id), _) => {
            let tv = k.kind != "movie";
            let path = format!(
                "/{}/{id}?language={}&append_to_response=credits,external_ids",
                if tv { "tv" } else { "movie" },
                tmdb_lang(locale)
            );
            (
                draft_from_tmdb(tv, &tmdb_get(env, &caller, &path).await?),
                "tmdb",
            )
        }
        (None, Some(id)) => (
            draft_from_anilist(
                &anilist_post(env, &caller, ANILIST_MEDIA, json!({ "id": id })).await?,
            ),
            "anilist",
        ),
        _ => return Ok(()),
    };
    let d = draft.ok_or_else(unavailable)?;
    let loc = locale_code(locale);
    let shown = d
        .localized_title
        .clone()
        .unwrap_or_else(|| d.original_title.clone());
    let cast: Vec<Value> = d
        .cast
        .iter()
        .map(|(n, r)| json!({ "name": n, "role": r }))
        .collect();
    let mut stmts = vec![
        db.prepare("INSERT OR IGNORE INTO media_title(media_id, locale, title) VALUES (?1, ?2, ?3)").bind(&[media_id.into(), loc.into(), shown.into()])?,
        db.prepare("INSERT OR IGNORE INTO media_detail(media_id, locale, overview, genres, \"cast\", source, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
            .bind(&[
                media_id.into(),
                loc.into(),
                d.overview.as_deref().map_or(JsValue::NULL, JsValue::from),
                serde_json::to_string(&d.genres).unwrap_or_else(|_| "[]".into()).into(),
                serde_json::to_string(&cast).unwrap_or_else(|_| "[]".into()).into(),
                (if d.overview.is_some() || !d.genres.is_empty() || !cast.is_empty() { source } else { "none" }).into(),
                (now_ms() as f64).into(),
            ])?,
    ];
    for (season, episodes) in &d.seasons {
        stmts.push(
            db.prepare("INSERT OR IGNORE INTO media_season(media_id, season, episodes) VALUES (?1, ?2, ?3)")
                .bind(&[media_id.into(), (*season as f64).into(), (*episodes as f64).into()])?,
        );
    }
    stmts.extend(v2_statements(
        db,
        Target::Id(media_id),
        &d,
        now_ms() as f64,
    )?);
    db.batch(stmts).await?;
    Ok(())
}

/// Refreshes a stored title's genres and authors from the catalogue (Italian: neither depends on the language). Used for titles
/// stored before migration 0003, by the backfill (`counted: false`) and lazily on the detail view (`counted: true`).
/// `catalog_v2_at` is stamped when the title was filled, or when the catalogue definitively has no such title (404) so it is not
/// retried forever. Rate limit, missing token, 5xx and network errors return `Err` without stamping: they are transient.
pub async fn fill_v2(
    env: &Env,
    db: &D1Database,
    user_id: &str,
    media_id: &str,
    counted: bool,
) -> R<()> {
    let k = db
        .prepare("SELECT kind, tmdb_id, anilist_id FROM media_entity WHERE id = ?1")
        .bind(&[media_id.into()])?
        .first::<EntityKeys>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    let caller = Caller {
        db,
        user_id,
        counted,
    };
    let draft: Option<Draft> = match (k.tmdb_id, k.anilist_id) {
        (Some(id), _) => {
            let tv = k.kind != "movie";
            let path = format!(
                "/{}/{id}?language={}&append_to_response=credits,external_ids",
                if tv { "tv" } else { "movie" },
                tmdb_lang(Locale::It)
            );
            tmdb_fetch(env, &caller, &path)
                .await?
                .and_then(|body| draft_from_tmdb(tv, &body))
        }
        (None, Some(id)) => anilist_fetch(env, &caller, ANILIST_MEDIA, json!({ "id": id }))
            .await?
            .and_then(|body| draft_from_anilist(&body)),
        _ => None,
    };
    let now = now_ms() as f64;
    match draft {
        Some(d) => {
            let mut stmts = vec![
                db.prepare("DELETE FROM media_genre WHERE media_id = ?1")
                    .bind(&[media_id.into()])?,
                db.prepare("DELETE FROM media_person WHERE media_id = ?1")
                    .bind(&[media_id.into()])?,
            ];
            stmts.extend(v2_statements(db, Target::Id(media_id), &d, now)?);
            db.batch(stmts).await?;
        }
        None => {
            db.prepare("UPDATE media_entity SET catalog_v2_at = ?2 WHERE id = ?1")
                .bind(&[media_id.into(), now.into()])?
                .run()
                .await?;
        }
    }
    Ok(())
}

/// A TMDB id for an imported row without one: by IMDb id (`/find`), else by title and year (`/search`, first result whose year is
/// within one of the row's). One or two outgoing requests.
pub async fn tmdb_lookup(
    env: &Env,
    caller: &Caller<'_>,
    tv: bool,
    imdb: Option<&str>,
    title: &str,
    year: Option<i64>,
    locale: Locale,
) -> R<Option<i64>> {
    if let Some(i) = imdb {
        let body = tmdb_get(
            env,
            caller,
            &format!(
                "/find/{i}?external_source=imdb_id&language={}",
                tmdb_lang(locale)
            ),
        )
        .await?;
        let key = if tv { "tv_results" } else { "movie_results" };
        if let Some(id) = body
            .get(key)
            .and_then(Value::as_array)
            .and_then(|a| a.first())
            .and_then(|r| r.get("id"))
            .and_then(Value::as_i64)
        {
            return Ok(Some(id));
        }
    }
    let (path, year_key, date_key) = if tv {
        ("/search/tv", "first_air_date_year", "first_air_date")
    } else {
        ("/search/movie", "year", "release_date")
    };
    let mut q = format!(
        "{path}?query={}&language={}&include_adult=false&page=1",
        urlencode(title),
        tmdb_lang(locale)
    );
    if let Some(y) = year {
        q.push_str(&format!("&{year_key}={y}"));
    }
    let body = tmdb_get(env, caller, &q).await?;
    for r in body
        .get("results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let ry = r
            .get(date_key)
            .and_then(Value::as_str)
            .and_then(|d| d.get(..4))
            .and_then(|y| y.parse::<i64>().ok());
        if year.is_none_or(|y| ry.is_some_and(|v| (v - y).abs() <= 1)) {
            if let Some(id) = r.get("id").and_then(Value::as_i64) {
                return Ok(Some(id));
            }
        }
    }
    Ok(None)
}

const ANILIST_BY_MAL: &str = "query($id:Int){Media(idMal:$id,type:ANIME){id idMal title{romaji english native} seasonYear startDate{year} episodes duration description(asHtml:false) genres isAdult coverImage{large} staff(sort:RELEVANCE,perPage:25){edges{role node{id name{full} image{large}}}}}}";

/// The stored anime for a MyAnimeList id, fetched from AniList the first time.
pub async fn resolve_mal(
    env: &Env,
    caller: &Caller<'_>,
    mal_id: i64,
    locale: Locale,
) -> R<Option<String>> {
    if let Some(found) = first_id(
        caller.db,
        "SELECT id FROM media_entity WHERE mal_id = ?1",
        &[(mal_id as f64).into()],
    )
    .await?
    {
        return Ok(Some(found));
    }
    let body = anilist_post(env, caller, ANILIST_BY_MAL, json!({ "id": mal_id })).await?;
    if body.pointer("/data/Media/isAdult").and_then(Value::as_bool) == Some(true) {
        return Ok(None);
    }
    let Some(draft) = draft_from_anilist(&body) else {
        return Ok(None);
    };
    // The same show may already be stored under its AniList id.
    if let Some(a) = draft.anilist_id {
        if let Some(found) = first_id(
            caller.db,
            "SELECT id FROM media_entity WHERE anilist_id = ?1",
            &[(a as f64).into()],
        )
        .await?
        {
            return Ok(Some(found));
        }
    }
    Ok(Some(store(caller.db, &draft, locale, "anilist").await?))
}

/// True when TMDB is configured (imports then enrich rows from it).
pub fn tmdb_enabled(env: &Env) -> bool {
    setting(env, "TMDB_API_TOKEN").is_some()
}
