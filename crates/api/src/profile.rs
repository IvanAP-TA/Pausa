//! Me: profile, preferences, favourites, per-Cerchia switches, the notification inbox; and other members' profiles.

use crate::diary::{locale_of, num, query_param};
use crate::http::{body, finish, json, no_content, now_ms, Fail, R};
use crate::{catalog, manage, session};
use pausa_core::dto::{
    CircleMySettings, KindCount, Locale, MediaDto, MySettings, NotificationDto, NotificationPage, PersonDto,
    PersonProfile, WatchingDto,
};
use pausa_core::profile::{
    avatar_change, clean_bio, clean_display_name, clean_genres, AvatarChange, COUNTRIES,
    MAX_FAVORITES, NOTIFICATION_TYPES,
};
use serde::Deserialize;
use worker::wasm_bindgen::JsValue;
use worker::*;

#[derive(Deserialize)]
struct UserRow {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
    bio: Option<String>,
    favorite_genres: String,
    locale: Option<String>,
    country: Option<String>,
    email_digest: i64,
}

#[derive(Deserialize)]
struct MediaRow {
    id: String,
    kind: String,
    original_title: String,
    loc_title: Option<String>,
    year: Option<i64>,
    poster_path: Option<String>,
}

impl MediaRow {
    fn dto(self) -> MediaDto {
        MediaDto {
            id: self.id,
            kind: self.kind,
            title: self.loc_title.unwrap_or(self.original_title),
            year: self.year,
            poster_path: self.poster_path,
        }
    }
}

#[derive(Deserialize)]
struct TypeRow {
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Deserialize)]
struct CountsRow {
    logs: i64,
    private_logs: i64,
    brought: i64,
}

#[derive(Deserialize)]
struct CircleSettingsRow {
    circle_id: String,
    name: String,
    muted: i64,
    hide_watching: i64,
}

fn favorites_stmt(db: &D1Database, user_id: &str, loc: &str) -> Result<D1PreparedStatement> {
    db.prepare(
        "SELECT e.id, e.kind, e.original_title, mt.title AS loc_title, e.year, e.poster_path FROM favorite f JOIN media_entity e ON e.id = f.media_id \
         LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 WHERE f.user_id = ?1 ORDER BY f.position",
    )
    .bind(&[user_id.into(), loc.into()])
}

/// `GET /api/me/settings`: profile, preferences, favourites and the per-Cerchia switches, one batch.
pub async fn settings(req: Request, env: Env) -> Result<Response> {
    finish(settings_inner(&req, &env).await)
}

async fn settings_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let loc = catalog::locale_code(locale_of(req));
    let res = db
        .batch(vec![
            db.prepare("SELECT id, name, email, image, bio, favorite_genres, locale, country, email_digest FROM user WHERE id = ?1").bind(&[s.user_id.as_str().into()])?,
            favorites_stmt(&db, &s.user_id, loc)?,
            db.prepare("SELECT type FROM notification_off WHERE user_id = ?1 ORDER BY type").bind(&[s.user_id.as_str().into()])?,
            db.prepare(
                "SELECT m.circle_id, c.name, m.muted, m.hide_watching FROM circle_member m JOIN circle c ON c.id = m.circle_id WHERE m.user_id = ?1 ORDER BY m.joined_at",
            )
            .bind(&[s.user_id.as_str().into()])?,
            db.prepare(
                "SELECT (SELECT COUNT(*) FROM log WHERE user_id = ?1) AS logs,                         (SELECT COUNT(*) FROM log l WHERE l.user_id = ?1 AND NOT EXISTS (SELECT 1 FROM log_share s WHERE s.log_id = l.id)) AS private_logs,                         (SELECT COUNT(DISTINCT u.user_id) FROM invite_use u JOIN invite i ON i.id = u.invite_id WHERE i.created_by = ?1 AND u.user_id <> ?1) AS brought",
            )
            .bind(&[s.user_id.as_str().into()])?,
        ])
        .await?;
    let counts = res[4]
        .results::<CountsRow>()?
        .into_iter()
        .next()
        .unwrap_or(CountsRow { logs: 0, private_logs: 0, brought: 0 });
    let u = res[0]
        .results::<UserRow>()?
        .into_iter()
        .next()
        .ok_or_else(Fail::unauthorized)?;
    json(
        &MySettings {
            id: u.id,
            name: u.name,
            email: u.email,
            image: u.image,
            bio: u.bio,
            genres: serde_json::from_str(&u.favorite_genres).unwrap_or_default(),
            favorites: res[1]
                .results::<MediaRow>()?
                .into_iter()
                .map(MediaRow::dto)
                .collect(),
            locale: u.locale.as_deref().and_then(Locale::from_code),
            country: u.country,
            email_digest: u.email_digest != 0,
            notify_off: res[2]
                .results::<TypeRow>()?
                .into_iter()
                .map(|t| t.kind)
                .collect(),
            circles: res[3]
                .results::<CircleSettingsRow>()?
                .into_iter()
                .map(|c| CircleMySettings {
                    circle_id: c.circle_id,
                    name: c.name,
                    muted: c.muted != 0,
                    hide_watching: c.hide_watching != 0,
                })
                .collect(),
            logs: counts.logs.max(0) as u32,
            private_logs: counts.private_logs.max(0) as u32,
            brought: counts.brought.max(0) as u32,
        },
        200,
    )
}

#[derive(Deserialize)]
struct ProfileIn {
    name: String,
    bio: Option<String>,
    #[serde(default)]
    genres: Vec<String>,
    /// "" or absent keeps the picture; "none" goes back to the initial; an avatar glyph picks it.
    avatar: Option<String>,
}

/// `PUT /api/me/profile {name, bio?, genres?, avatar?}`: name 1..40, bio cut to 280, up to five known genres.
pub async fn save_profile(mut req: Request, env: Env) -> Result<Response> {
    finish(save_profile_inner(&mut req, &env).await)
}

async fn save_profile_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let input: ProfileIn = body(req).await?;
    let name = clean_display_name(&input.name).ok_or_else(Fail::invalid)?;
    let bio: JsValue = input
        .bio
        .as_deref()
        .and_then(clean_bio)
        .map_or(JsValue::NULL, JsValue::from);
    let genres =
        serde_json::to_string(&clean_genres(&input.genres)).unwrap_or_else(|_| "[]".into());
    let now = now_ms();
    let stmt = match avatar_change(input.avatar.as_deref()) {
        AvatarChange::Invalid => return Err(Fail::invalid()),
        AvatarChange::Keep => db
            .prepare("UPDATE user SET name = ?2, bio = ?3, favorite_genres = ?4, updated_at = ?5 WHERE id = ?1")
            .bind(&[s.user_id.as_str().into(), name.into(), bio, genres.into(), num(now)])?,
        AvatarChange::Initial => db
            .prepare("UPDATE user SET name = ?2, bio = ?3, favorite_genres = ?4, image = NULL, updated_at = ?5 WHERE id = ?1")
            .bind(&[s.user_id.as_str().into(), name.into(), bio, genres.into(), num(now)])?,
        AvatarChange::Emoji(img) => db
            .prepare("UPDATE user SET name = ?2, bio = ?3, favorite_genres = ?4, image = ?6, updated_at = ?5 WHERE id = ?1")
            .bind(&[s.user_id.as_str().into(), name.into(), bio, genres.into(), num(now), img.into()])?,
    };
    stmt.run().await?;
    no_content()
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PrefsIn {
    locale: Option<String>,
    country: Option<String>,
    email_digest: Option<bool>,
    notify_off: Option<Vec<String>>,
}

/// `PUT /api/me/settings {locale?, country?, emailDigest?, notifyOff?}`: only what is sent changes. `notifyOff` replaces the set.
pub async fn save_settings(mut req: Request, env: Env) -> Result<Response> {
    finish(save_settings_inner(&mut req, &env).await)
}

async fn save_settings_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let input: PrefsIn = body(req).await?;
    let mut sets: Vec<&str> = Vec::new();
    let mut args: Vec<JsValue> = vec![s.user_id.as_str().into()];
    if let Some(l) = &input.locale {
        // "" = follow the browser again.
        args.push(if l.is_empty() {
            JsValue::NULL
        } else {
            catalog::locale_code(Locale::from_code(l).ok_or_else(Fail::invalid)?).into()
        });
        sets.push("locale");
    }
    if let Some(c) = &input.country {
        args.push(if c.is_empty() {
            JsValue::NULL
        } else if COUNTRIES.contains(&c.as_str()) {
            c.as_str().into()
        } else {
            return Err(Fail::invalid());
        });
        sets.push("country");
    }
    if let Some(d) = input.email_digest {
        args.push(num(i64::from(d)));
        sets.push("email_digest");
    }
    let mut stmts = Vec::new();
    if !sets.is_empty() {
        let assignments: Vec<String> = sets
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{c} = ?{}", i + 2))
            .collect();
        stmts.push(
            db.prepare(format!(
                "UPDATE user SET {} WHERE id = ?1",
                assignments.join(", ")
            ))
            .bind(&args)?,
        );
    }
    if let Some(off) = &input.notify_off {
        if off
            .iter()
            .any(|t| !NOTIFICATION_TYPES.contains(&t.as_str()))
        {
            return Err(Fail::invalid());
        }
        stmts.push(
            db.prepare("DELETE FROM notification_off WHERE user_id = ?1")
                .bind(&[s.user_id.as_str().into()])?,
        );
        let mut seen = std::collections::HashSet::new();
        for t in off.iter().filter(|t| seen.insert(t.as_str())) {
            stmts.push(
                db.prepare("INSERT INTO notification_off(user_id, type) VALUES (?1, ?2)")
                    .bind(&[s.user_id.as_str().into(), t.as_str().into()])?,
            );
        }
    }
    if stmts.is_empty() {
        return Err(Fail::invalid());
    }
    db.batch(stmts).await?;
    no_content()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CircleMeIn {
    muted: Option<bool>,
    hide_watching: Option<bool>,
}

/// `PUT /api/circles/:id/me {muted?, hideWatching?}`: my personal switches for one Cerchia.
pub async fn circle_me(mut req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(circle_me_inner(&mut req, &env, circle_id).await)
}

async fn circle_me_inner(req: &mut Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    manage::my_role(&db, circle_id, &s.user_id).await?;
    let input: CircleMeIn = body(req).await?;
    let mut sets: Vec<&str> = Vec::new();
    let mut args: Vec<JsValue> = vec![circle_id.into(), s.user_id.as_str().into()];
    if let Some(m) = input.muted {
        args.push(num(i64::from(m)));
        sets.push("muted");
    }
    if let Some(h) = input.hide_watching {
        args.push(num(i64::from(h)));
        sets.push("hide_watching");
    }
    if sets.is_empty() {
        return Err(Fail::invalid());
    }
    let assignments: Vec<String> = sets
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{c} = ?{}", i + 3))
        .collect();
    db.prepare(format!(
        "UPDATE circle_member SET {} WHERE circle_id = ?1 AND user_id = ?2",
        assignments.join(", ")
    ))
    .bind(&args)?
    .run()
    .await?;
    no_content()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FavoriteIn {
    media_id: String,
}

#[derive(Deserialize)]
struct PosRow {
    media_id: String,
    position: i64,
}

/// `POST /api/me/favorites {mediaId}`: pins a title at the end of the shelf (5 at most; already there is fine).
pub async fn add_favorite(mut req: Request, env: Env) -> Result<Response> {
    finish(add_favorite_inner(&mut req, &env).await)
}

async fn add_favorite_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let input: FavoriteIn = body(req).await?;
    let current = db
        .prepare("SELECT media_id, position FROM favorite WHERE user_id = ?1")
        .bind(&[s.user_id.as_str().into()])?
        .all()
        .await?
        .results::<PosRow>()?;
    if current.iter().any(|f| f.media_id == input.media_id) {
        return no_content();
    }
    if current.len() >= MAX_FAVORITES {
        return Err(Fail::new(pausa_core::dto::ErrorCode::Conflict, 409));
    }
    let next = current.iter().map(|f| f.position + 1).max().unwrap_or(0);
    let res = db
        .prepare("INSERT INTO favorite(user_id, media_id, position) SELECT ?1, id, ?3 FROM media_entity WHERE id = ?2")
        .bind(&[s.user_id.as_str().into(), input.media_id.as_str().into(), num(next)])?
        .run()
        .await?;
    if res.meta()?.and_then(|m| m.changes).unwrap_or(0) == 0 {
        return Err(Fail::not_found());
    }
    no_content()
}

/// `DELETE /api/me/favorites/:mediaId`. Positions are not compacted (order is all that matters).
pub async fn remove_favorite(req: Request, env: Env, media_id: &str) -> Result<Response> {
    finish(remove_favorite_inner(&req, &env, media_id).await)
}

async fn remove_favorite_inner(req: &Request, env: &Env, media_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    db.prepare("DELETE FROM favorite WHERE user_id = ?1 AND media_id = ?2")
        .bind(&[s.user_id.as_str().into(), media_id.into()])?
        .run()
        .await?;
    no_content()
}

#[derive(Deserialize)]
struct PersonRow {
    id: String,
    name: String,
    image: Option<String>,
    bio: Option<String>,
    favorite_genres: String,
    joined_at: i64,
}

#[derive(Deserialize)]
struct StatsRow {
    logs: i64,
    avg_rating: Option<f64>,
}

#[derive(Deserialize)]
struct KindRow {
    kind: String,
    n: i64,
}

#[derive(Deserialize)]
struct LovedRatingRow {
    rating: i64,
}

#[derive(Deserialize)]
struct LiveRow {
    user_id: String,
    name: String,
    image: Option<String>,
    media_id: String,
    season: Option<i64>,
    episode: Option<i64>,
    updated_at: i64,
    kind: String,
    original_title: String,
    loc_title: Option<String>,
    year: Option<i64>,
    poster_path: Option<String>,
}

#[derive(Deserialize)]
struct RatingRow {
    media_id: String,
    rating: i64,
}

/// Similarity of two rating lists, via the recommendation engine's own function (same maths as everywhere else).
fn match_with(a: &[RatingRow], b: &[RatingRow]) -> (usize, Option<f64>) {
    let mut ids: Vec<&str> = a.iter().chain(b).map(|r| r.media_id.as_str()).collect();
    ids.sort_unstable();
    ids.dedup();
    let dense = |list: &[RatingRow]| -> Vec<(u32, f64)> {
        let mut v: Vec<(u32, f64)> = list
            .iter()
            .filter_map(|r| {
                Some((
                    ids.binary_search(&r.media_id.as_str()).ok()? as u32,
                    r.rating as f64,
                ))
            })
            .collect();
        v.sort_by_key(|x| x.0);
        v
    };
    pausa_engine::taste_similarity(&dense(a), &dense(b))
}

/// `GET /api/circles/:id/people/:userId`: another member as this Cerchia sees them. Only what was shared here counts: their
/// viewings count, average rating, titles they loved, and how alike your tastes are.
pub async fn person(req: Request, env: Env, circle_id: &str, user_id: &str) -> Result<Response> {
    finish(person_inner(&req, &env, circle_id, user_id).await)
}

async fn person_inner(req: &Request, env: &Env, circle_id: &str, user_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    manage::my_role(&db, circle_id, &s.user_id).await?;
    let loc = catalog::locale_code(locale_of(req));
    let res = db
        .batch(vec![
            db.prepare(
                "SELECT u.id, u.name, u.image, u.bio, u.favorite_genres, m.joined_at FROM circle_member m JOIN user u ON u.id = m.user_id WHERE m.circle_id = ?1 AND m.user_id = ?2",
            )
            .bind(&[circle_id.into(), user_id.into()])?,
            favorites_stmt(&db, user_id, loc)?,
            db.prepare("SELECT COUNT(*) AS logs, (SELECT AVG(rating) FROM rating_current WHERE circle_id = ?1 AND user_id = ?2) AS avg_rating FROM log_share s JOIN log l ON l.id = s.log_id WHERE s.circle_id = ?1 AND l.user_id = ?2")
                .bind(&[circle_id.into(), user_id.into()])?,
            db.prepare(
                "SELECT e.id, e.kind, e.original_title, mt.title AS loc_title, e.year, e.poster_path FROM rating_current r JOIN media_entity e ON e.id = r.media_id \
                 LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?3 WHERE r.circle_id = ?1 AND r.user_id = ?2 AND r.rating >= 8 ORDER BY r.rating DESC, r.rated_at DESC LIMIT 12",
            )
            .bind(&[circle_id.into(), user_id.into(), loc.into()])?,
            db.prepare("SELECT media_id, rating FROM rating_current WHERE circle_id = ?1 AND user_id = ?2").bind(&[circle_id.into(), s.user_id.as_str().into()])?,
            db.prepare("SELECT media_id, rating FROM rating_current WHERE circle_id = ?1 AND user_id = ?2").bind(&[circle_id.into(), user_id.into()])?,
            db.prepare(
                "SELECT e.kind, COUNT(DISTINCT l.media_id) AS n FROM log_share s JOIN log l ON l.id = s.log_id JOIN media_entity e ON e.id = l.media_id                  WHERE s.circle_id = ?1 AND l.user_id = ?2 GROUP BY e.kind",
            )
            .bind(&[circle_id.into(), user_id.into()])?,
            db.prepare("SELECT r.rating FROM rating_current r WHERE r.circle_id = ?1 AND r.user_id = ?2 AND r.rating >= 8 ORDER BY r.rating DESC, r.rated_at DESC LIMIT 12")
                .bind(&[circle_id.into(), user_id.into()])?,
            // Same rule as the hub's "now watching": off when the Cerchia, that person or the viewer switched it off.
            db.prepare(
                "SELECT w.user_id, u.name, u.image, w.media_id, w.season, w.episode, w.updated_at, e.kind, e.original_title, mt.title AS loc_title, e.year, e.poster_path                  FROM watch_progress w JOIN circle c ON c.id = ?1 AND c.live_watching = 1                  JOIN circle_member m ON m.circle_id = ?1 AND m.user_id = w.user_id AND m.hide_watching = 0                  JOIN user u ON u.id = w.user_id JOIN media_entity e ON e.id = w.media_id                  LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?3                  WHERE w.user_id = ?4 AND w.status = 'watching' AND NOT EXISTS                    (SELECT 1 FROM circle_member me WHERE me.circle_id = ?1 AND me.user_id = ?2 AND me.hide_watching = 1)                  ORDER BY w.updated_at DESC LIMIT 1",
            )
            .bind(&[circle_id.into(), s.user_id.as_str().into(), loc.into(), user_id.into()])?,
        ])
        .await?;
    let p = res[0]
        .results::<PersonRow>()?
        .into_iter()
        .next()
        .ok_or_else(Fail::not_found)?;
    let stats = res[2].results::<StatsRow>()?.into_iter().next();
    let (common, score) = if s.user_id == user_id {
        (0, None)
    } else {
        match_with(
            &res[4].results::<RatingRow>()?,
            &res[5].results::<RatingRow>()?,
        )
    };
    let kinds: Vec<KindCount> = ["movie", "tv", "anime"]
        .iter()
        .filter_map(|k| {
            let n = res[6].results::<KindRow>().ok()?.into_iter().find(|r| r.kind == *k)?.n;
            (n > 0).then(|| KindCount { kind: (*k).to_string(), count: n as u32 })
        })
        .collect();
    let titles = kinds.iter().map(|k| k.count).sum();
    let loved_ratings = res[7].results::<LovedRatingRow>()?.into_iter().map(|r| r.rating as u8).collect();
    let watching = res[8].results::<LiveRow>()?.into_iter().next().map(|r| WatchingDto {
        user: PersonDto { id: r.user_id, name: r.name, image: r.image },
        media: MediaDto { id: r.media_id, kind: r.kind, title: r.loc_title.unwrap_or(r.original_title), year: r.year, poster_path: r.poster_path },
        season: r.season,
        episode: r.episode,
        updated_at: r.updated_at,
    });
    json(
        &PersonProfile {
            person: PersonDto {
                id: p.id,
                name: p.name,
                image: p.image,
            },
            bio: p.bio,
            genres: serde_json::from_str(&p.favorite_genres).unwrap_or_default(),
            favorites: res[1]
                .results::<MediaRow>()?
                .into_iter()
                .map(MediaRow::dto)
                .collect(),
            logs: stats.as_ref().map_or(0, |x| x.logs as u32),
            avg_rating: stats.and_then(|x| x.avg_rating),
            loved: res[3]
                .results::<MediaRow>()?
                .into_iter()
                .map(MediaRow::dto)
                .collect(),
            taste_match: score,
            taste_common: common as u32,
            joined_at: p.joined_at,
            titles,
            kinds,
            loved_ratings,
            watching,
        },
        200,
    )
}

#[derive(Deserialize)]
struct NoteRow {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    actor_id: Option<String>,
    actor_name: Option<String>,
    actor_image: Option<String>,
    circle_id: Option<String>,
    circle_name: Option<String>,
    log_id: Option<String>,
    serata_code: Option<String>,
    read_at: Option<i64>,
    created_at: i64,
    m_id: Option<String>,
    m_kind: Option<String>,
    m_original: Option<String>,
    m_title: Option<String>,
    m_year: Option<i64>,
    m_poster: Option<String>,
}

#[derive(Deserialize)]
struct CountRow {
    n: i64,
}

const NOTE_PAGE: usize = 30;

/// `GET /api/notifications?circle=&before=&locale=`: my inbox across every Cerchia (or one), newest first. A notice about a
/// Cerchia I am no longer in is not shown.
pub async fn notifications(req: Request, env: Env) -> Result<Response> {
    finish(notifications_inner(&req, &env).await)
}

async fn notifications_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let loc = catalog::locale_code(locale_of(req));
    let circle = query_param(req, "circle");
    let cursor = query_param(req, "before").and_then(|c| {
        c.split_once('.')
            .map(|(a, b)| (a.to_string(), b.to_string()))
    });
    let mut args: Vec<JsValue> = vec![s.user_id.as_str().into(), loc.into()];
    let mut filters = String::new();
    if let Some(c) = &circle {
        args.push(c.as_str().into());
        filters.push_str(&format!(" AND n.circle_id = ?{}", args.len()));
    }
    if let Some((at, id)) = &cursor {
        let at: i64 = at.parse().map_err(|_| Fail::invalid())?;
        args.push(num(at));
        let at_n = args.len();
        args.push(id.as_str().into());
        filters.push_str(&format!(
            " AND (n.created_at < ?{at_n} OR (n.created_at = ?{at_n} AND n.id < ?{}))",
            at_n + 1
        ));
    }
    let sql = format!(
        "SELECT n.id, n.type, n.actor_id, a.name AS actor_name, a.image AS actor_image, n.circle_id, c.name AS circle_name, n.log_id, n.serata_code, \
           n.read_at, n.created_at, e.id AS m_id, e.kind AS m_kind, e.original_title AS m_original, mt.title AS m_title, e.year AS m_year, e.poster_path AS m_poster \
         FROM notification n LEFT JOIN user a ON a.id = n.actor_id LEFT JOIN circle c ON c.id = n.circle_id \
           LEFT JOIN media_entity e ON e.id = n.media_id LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 \
         WHERE n.user_id = ?1 AND (n.circle_id IS NULL OR EXISTS (SELECT 1 FROM circle_member cm WHERE cm.circle_id = n.circle_id AND cm.user_id = n.user_id)){filters} ORDER BY n.created_at DESC, n.id DESC LIMIT {}",
        NOTE_PAGE + 1
    );
    let res = db
        .batch(vec![
            db.prepare(sql).bind(&args)?,
            db.prepare("SELECT COUNT(*) AS n FROM (SELECT 1 FROM notification WHERE user_id = ?1 AND read_at IS NULL LIMIT 100)").bind(&[s.user_id.as_str().into()])?,
        ])
        .await?;
    let rows = res[0].results::<NoteRow>()?;
    let next = (rows.len() > NOTE_PAGE)
        .then(|| {
            rows.get(NOTE_PAGE - 1)
                .map(|r| format!("{}.{}", r.created_at, r.id))
        })
        .flatten();
    let items = rows
        .into_iter()
        .take(NOTE_PAGE)
        .map(|r| NotificationDto {
            id: r.id,
            kind: r.kind,
            actor: r.actor_id.map(|id| PersonDto {
                id,
                name: r.actor_name.unwrap_or_default(),
                image: r.actor_image,
            }),
            circle_id: r.circle_id,
            circle_name: r.circle_name,
            log_id: r.log_id,
            media: r.m_id.map(|id| MediaDto {
                id,
                kind: r.m_kind.unwrap_or_default(),
                title: r.m_title.or(r.m_original).unwrap_or_default(),
                year: r.m_year,
                poster_path: r.m_poster,
            }),
            serata_code: r.serata_code,
            read: r.read_at.is_some(),
            created_at: r.created_at,
        })
        .collect();
    let unread = res[1].results::<CountRow>()?.first().map_or(0, |c| c.n) as u32;
    json(
        &NotificationPage {
            items,
            next,
            unread,
        },
        200,
    )
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ReadIn {
    circle_id: Option<String>,
}

/// `POST /api/notifications/read {circleId?}`: marks mine read, in one Cerchia or all (v1 always marked every Cerchia).
pub async fn mark_read(mut req: Request, env: Env) -> Result<Response> {
    finish(mark_read_inner(&mut req, &env).await)
}

async fn mark_read_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let input: ReadIn = body(req).await.unwrap_or_default();
    let now = num(now_ms());
    let stmt = match &input.circle_id {
        Some(c) => db
            .prepare("UPDATE notification SET read_at = ?3 WHERE user_id = ?1 AND circle_id = ?2 AND read_at IS NULL")
            .bind(&[s.user_id.as_str().into(), c.as_str().into(), now])?,
        None => db.prepare("UPDATE notification SET read_at = ?2 WHERE user_id = ?1 AND read_at IS NULL").bind(&[s.user_id.as_str().into(), now])?,
    };
    stmt.run().await?;
    no_content()
}
