//! Serata, Worker side: create a room, join, vote, history, repeat, "we watched it". The room itself is the Durable Object in
//! `serata_room.rs`; here we authenticate, validate, write the D1 records (the room's row, candidates, invitations) and forward.

use crate::diary::{locale_of, num, placeholders, query_param};
use crate::http::{body, client_ip, finish, json, new_id, no_content, now_ms, random, Fail, R};
use crate::{catalog, limit, manage, session, stats};
use pausa_core::catalog::Key;
use pausa_core::dto::{
    CircleServices, ErrorCode, Locale, MediaDto, SerataCreated, SerataPublicResult, SerataSuggest,
    SerataSummary,
};
use pausa_core::limits;
use pausa_core::profile::GUEST_AVATARS;
use pausa_core::serata::{
    build_roster, normalize_code, room_code, Candidate, Mode, NewRoom, Participant, Room,
    RosterTitle, Timing, MAX_CANDIDATES, MIN_CANDIDATES,
};
use pausa_core::streaming::{common_providers, default_country, is_country, Provider};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use worker::wasm_bindgen::JsValue;
use worker::*;

fn code_of(raw: &str) -> R<String> {
    normalize_code(raw).ok_or_else(Fail::not_found)
}

async fn stub(env: &Env, code: &str) -> R<Stub> {
    Ok(env.durable_object("SERATA")?.get_by_name(code)?)
}

/// Sends a request to the room as `user_id` and gives back its answer as it is (status and body).
async fn forward(
    env: &Env,
    code: &str,
    path: &str,
    user_id: Option<&str>,
    body: Option<String>,
    upgrade: bool,
) -> R<Response> {
    let headers = Headers::new();
    headers.set("content-type", "application/json")?;
    if let Some(u) = user_id {
        headers.set("x-user-id", u)?;
    }
    if upgrade {
        headers.set("upgrade", "websocket")?;
    }
    let mut init = RequestInit::new();
    init.with_method(if body.is_some() {
        Method::Post
    } else {
        Method::Get
    })
    .with_headers(headers);
    if let Some(b) = body {
        init.with_body(Some(b.into()));
    }
    let req = Request::new_with_init(&format!("https://serata.internal/{path}"), &init)?;
    Ok(stub(env, code).await?.fetch_with_request(req).await?)
}

fn timing(env: &Env) -> Timing {
    let d = Timing::default();
    let get = |name: &str, default: i64| {
        catalog::setting(env, name)
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|v| *v >= 500)
            .unwrap_or(default)
    };
    Timing {
        match_ms: get("SERATA_MATCH_MS", d.match_ms),
        table_ms: get("SERATA_TABLE_MS", d.table_ms),
        lobby_ttl_ms: get("SERATA_LOBBY_TTL_MS", d.lobby_ttl_ms),
    }
}

#[derive(Deserialize)]
struct UserRow {
    name: String,
    image: Option<String>,
    is_anonymous: i64,
}

async fn user_row(db: &D1Database, id: &str) -> R<UserRow> {
    db.prepare("SELECT name, image, is_anonymous FROM user WHERE id = ?1")
        .bind(&[id.into()])?
        .first::<UserRow>(None)
        .await?
        .ok_or_else(Fail::unauthorized)
}

#[derive(Deserialize)]
struct CandRow {
    id: String,
    kind: String,
    title: String,
    year: Option<i64>,
    poster_path: Option<String>,
}

fn parse_mode(m: &str) -> R<Mode> {
    match m {
        "bracket" => Ok(Mode::Bracket),
        "table" => Ok(Mode::Table),
        _ => Err(Fail::invalid()),
    }
}

fn mode_str(m: Mode) -> &'static str {
    match m {
        Mode::Bracket => "bracket",
        Mode::Table => "table",
    }
}

/// Writes the room's D1 records and opens the Durable Object. `media_ids` are stored titles, first = seed 0.
/// What a new room is made from.
struct RoomSpec<'a> {
    user_id: &'a str,
    circle_id: &'a str,
    mode: Mode,
    /// Stored title ids; the first one is seed 0.
    media_ids: Vec<String>,
    locale: Locale,
    repeated_from: Option<String>,
}

async fn open_room(env: &Env, db: &D1Database, spec: RoomSpec<'_>) -> R<String> {
    let RoomSpec {
        user_id,
        circle_id,
        mode,
        media_ids,
        locale,
        repeated_from,
    } = spec;
    if !(MIN_CANDIDATES..=MAX_CANDIDATES).contains(&media_ids.len()) {
        return Err(Fail::invalid());
    }
    let mut args: Vec<JsValue> = vec![catalog::locale_code(locale).into()];
    args.extend(media_ids.iter().map(|m| JsValue::from(m.as_str())));
    let rows = db
        .prepare(format!(
            "SELECT e.id, e.kind, COALESCE(mt.title, e.original_title) AS title, e.year, e.poster_path FROM media_entity e \
             LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?1 WHERE e.id IN ({})",
            placeholders(2, media_ids.len())
        ))
        .bind(&args)?
        .all()
        .await?
        .results::<CandRow>()?;
    let mut candidates = Vec::with_capacity(media_ids.len());
    for id in &media_ids {
        let r = rows
            .iter()
            .find(|r| &r.id == id)
            .ok_or_else(Fail::not_found)?;
        candidates.push(Candidate {
            id: r.id.clone(),
            kind: r.kind.clone(),
            title: r.title.clone(),
            year: r.year,
            poster_path: r.poster_path.clone(),
        });
    }
    let host = user_row(db, user_id).await?;
    let now = now_ms();
    let serata_id = new_id();
    for _ in 0..3 {
        let code = room_code(&random::<6>());
        let room = Room::new(NewRoom {
            serata_id: serata_id.clone(),
            code: code.clone(),
            mode,
            host: Participant {
                user_id: user_id.to_string(),
                name: host.name.clone(),
                image: host.image.clone(),
                is_guest: false,
            },
            circle_id: Some(circle_id.to_string()),
            candidates: candidates.clone(),
            timing: timing(env),
            now,
        })
        .map_err(|_| Fail::invalid())?;
        let mut stmts = vec![db
            .prepare("INSERT INTO serata(id, code, circle_id, host_id, mode, status, repeated_from, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'lobby', ?6, ?7)")
            .bind(&[
                serata_id.as_str().into(),
                code.as_str().into(),
                circle_id.into(),
                user_id.into(),
                mode_str(mode).into(),
                repeated_from.as_deref().map_or(JsValue::NULL, JsValue::from),
                num(now),
            ])?];
        for (seed, c) in candidates.iter().enumerate() {
            stmts.push(
                db.prepare(
                    "INSERT INTO serata_candidate(serata_id, media_id, seed) VALUES (?1, ?2, ?3)",
                )
                .bind(&[
                    serata_id.as_str().into(),
                    c.id.as_str().into(),
                    num(seed as i64),
                ])?,
            );
        }
        // The others in the Cerchia are told, unless they muted it or switched invitations off.
        stmts.push(
            db.prepare(
                "INSERT INTO notification(id, user_id, type, actor_id, circle_id, serata_code, created_at) \
                 SELECT lower(hex(randomblob(16))), m.user_id, 'serata_invite', ?1, ?2, ?3, ?4 FROM circle_member m \
                 WHERE m.circle_id = ?2 AND m.user_id <> ?1 AND m.muted = 0 \
                   AND NOT EXISTS (SELECT 1 FROM notification_off o WHERE o.user_id = m.user_id AND o.type = 'serata_invite')",
            )
            .bind(&[user_id.into(), circle_id.into(), code.as_str().into(), num(now)])?,
        );
        match db.batch(stmts).await {
            Ok(_) => {
                let res = forward(
                    env,
                    &code,
                    "init",
                    None,
                    Some(serde_json::to_string(&room)?),
                    false,
                )
                .await?;
                if res.status_code() != 200 {
                    let _ = db
                        .prepare(
                            "UPDATE serata SET status = 'expired', finished_at = ?2 WHERE id = ?1",
                        )
                        .bind(&[serata_id.as_str().into(), num(now)])?
                        .run()
                        .await;
                    return Err(Fail::internal());
                }
                return Ok(code);
            }
            Err(e) if e.to_string().contains("UNIQUE") && e.to_string().contains("code") => {
                continue
            }
            Err(e) => return Err(e.into()),
        }
    }
    Err(Fail::internal())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateIn {
    circle_id: String,
    mode: String,
    /// Search result keys or stored title ids (`local:<id>`); the order is the seeding.
    media_keys: Vec<String>,
    locale: Option<String>,
}

/// `POST /api/serate {circleId, mode: "bracket"|"table", mediaKeys: [2..8]}`: members only, no guests.
pub async fn create(mut req: Request, env: Env) -> Result<Response> {
    finish(create_inner(&mut req, &env).await)
}

async fn create_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    limit::check(
        &db,
        &format!("act:createSerata:{}", s.user_id),
        limits::CREATE_SERATA,
    )
    .await?;
    let input: CreateIn = body(req).await?;
    manage::my_role(&db, &input.circle_id, &s.user_id).await?;
    let mode = parse_mode(&input.mode)?;
    let locale = input
        .locale
        .as_deref()
        .and_then(Locale::from_code)
        .unwrap_or_else(|| locale_of(req));
    if !(MIN_CANDIDATES..=MAX_CANDIDATES).contains(&input.media_keys.len()) {
        return Err(Fail::invalid());
    }
    let mut ids: Vec<String> = Vec::new();
    for k in &input.media_keys {
        let id = catalog::resolve(
            env,
            &db,
            &s.user_id,
            &Key::parse(k).ok_or_else(Fail::invalid)?,
            locale,
        )
        .await?;
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    let code = open_room(
        env,
        &db,
        RoomSpec {
            user_id: &s.user_id,
            circle_id: &input.circle_id,
            mode,
            media_ids: ids,
            locale,
            repeated_from: None,
        },
    )
    .await?;
    json(&SerataCreated { code }, 201)
}

#[derive(Deserialize)]
struct SerataRow {
    id: String,
    circle_id: Option<String>,
    mode: String,
}

async fn serata_row(db: &D1Database, code: &str) -> R<SerataRow> {
    db.prepare("SELECT id, circle_id, mode FROM serata WHERE code = ?1")
        .bind(&[code.into()])?
        .first::<SerataRow>(None)
        .await?
        .ok_or_else(Fail::not_found)
}

#[derive(Deserialize)]
struct CandidateSeed {
    media_id: String,
}

/// `POST /api/serate/:code/repeat`: the same titles and mode in a new room, hosted by me. I must be in the Cerchia.
pub async fn repeat(req: Request, env: Env, code: &str) -> Result<Response> {
    finish(repeat_inner(&req, &env, code).await)
}

async fn repeat_inner(req: &Request, env: &Env, code: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    let code = code_of(code)?;
    let old = serata_row(&db, &code).await?;
    let circle = old.circle_id.clone().ok_or_else(Fail::not_found)?;
    manage::my_role(&db, &circle, &s.user_id).await?;
    let seeds = db
        .prepare("SELECT media_id FROM serata_candidate WHERE serata_id = ?1 ORDER BY seed")
        .bind(&[old.id.as_str().into()])?
        .all()
        .await?
        .results::<CandidateSeed>()?;
    let new_code = open_room(
        env,
        &db,
        RoomSpec {
            user_id: &s.user_id,
            circle_id: &circle,
            mode: parse_mode(&old.mode)?,
            media_ids: seeds.into_iter().map(|c| c.media_id).collect(),
            locale: locale_of(req),
            repeated_from: Some(old.id),
        },
    )
    .await?;
    json(&SerataCreated { code: new_code }, 201)
}

/// `GET /api/serate/:code`: the room as I see it. Anyone signed in with the code may look; `joined` says whether I am in.
pub async fn state(req: Request, env: Env, code: &str) -> Result<Response> {
    finish(state_inner(&req, &env, code).await)
}

async fn state_inner(req: &Request, env: &Env, code: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    forward(env, &code_of(code)?, "state", Some(&s.user_id), None, false).await
}

/// `GET /api/serate/:code/ws` (WebSocket upgrade): the room pushes each change as my own view. Falls back to polling `state`.
pub async fn ws(req: Request, env: Env, code: &str) -> Result<Response> {
    finish(ws_inner(&req, &env, code).await)
}

async fn ws_inner(req: &Request, env: &Env, code: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if req.headers().get("upgrade")?.as_deref() != Some("websocket") {
        return Err(Fail::invalid());
    }
    forward(env, &code_of(code)?, "ws", Some(&s.user_id), None, true).await
}

#[derive(Deserialize, Default)]
struct JoinIn {
    name: Option<String>,
    avatar: Option<String>,
}

/// `POST /api/serate/:code/join {name?, avatar?}`. A member joins under their own name; a guest (anonymous session) picks a name
/// (1..24) and one of the eight guest pictures. Only possible before voting starts.
pub async fn join(mut req: Request, env: Env, code: &str) -> Result<Response> {
    finish(join_inner(&mut req, &env, code).await)
}

async fn join_inner(req: &mut Request, env: &Env, code: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let code = code_of(code)?;
    let input: JoinIn = body(req).await.unwrap_or_default();
    let u = user_row(&db, &s.user_id).await?;
    let guest = u.is_anonymous != 0;
    let (name, image) = if guest {
        let name: String = input
            .name
            .as_deref()
            .map(str::trim)
            .unwrap_or("")
            .chars()
            .take(24)
            .collect();
        if name.is_empty() {
            return Err(Fail::invalid());
        }
        let image = input
            .avatar
            .as_deref()
            .filter(|a| GUEST_AVATARS.contains(a))
            .map(|a| format!("emoji:{a}"))
            .or(u.image.clone());
        db.prepare("UPDATE user SET name = ?2, image = ?3 WHERE id = ?1")
            .bind(&[
                s.user_id.as_str().into(),
                name.as_str().into(),
                image.as_deref().map_or(JsValue::NULL, JsValue::from),
            ])?
            .run()
            .await?;
        (name, image)
    } else {
        (u.name, u.image)
    };
    let p = Participant {
        user_id: s.user_id.clone(),
        name,
        image,
        is_guest: guest,
    };
    forward(
        env,
        &code,
        "join",
        Some(&s.user_id),
        Some(serde_json::to_string(&p)?),
        false,
    )
    .await
}

/// Start, vote, ballot, force and leave: the room decides, the Worker only vouches for who is asking.
pub async fn act(mut req: Request, env: Env, code: &str, op: &str) -> Result<Response> {
    finish(act_inner(&mut req, &env, code, op).await)
}

async fn act_inner(req: &mut Request, env: &Env, code: &str, op: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let code = code_of(code)?;
    let payload = match op {
        "vote" | "ballot" => {
            let v: serde_json::Value = body(req).await?;
            serde_json::to_string(&v)?
        }
        _ => "{}".to_string(),
    };
    forward(env, &code, op, Some(&s.user_id), Some(payload), false).await
}

#[derive(Deserialize)]
struct SummaryRow {
    code: String,
    mode: String,
    status: String,
    created_at: i64,
    finished_at: Option<i64>,
    watched: i64,
    people: i64,
    w_id: Option<String>,
    w_kind: Option<String>,
    w_title: Option<String>,
    w_year: Option<i64>,
    w_poster: Option<String>,
}

/// `GET /api/circles/:id/serate`: the Cerchia's recent Serate, newest first (v1 had no pagination and listed unfinished ones for ever).
pub async fn history(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(history_inner(&req, &env, circle_id).await)
}

async fn history_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    manage::my_role(&db, circle_id, &s.user_id).await?;
    let loc = catalog::locale_code(locale_of(req));
    let limit = query_param(req, "limit")
        .and_then(|l| l.parse::<i64>().ok())
        .unwrap_or(20)
        .clamp(1, 50);
    let rows = db
        .prepare(
            "SELECT s.code, s.mode, s.status, s.created_at, s.finished_at, (s.watched_log_id IS NOT NULL) AS watched, \
               (SELECT COUNT(*) FROM serata_participant p WHERE p.serata_id = s.id) AS people, \
               e.id AS w_id, e.kind AS w_kind, COALESCE(mt.title, e.original_title) AS w_title, e.year AS w_year, e.poster_path AS w_poster \
             FROM serata s LEFT JOIN media_entity e ON e.id = s.winner_media_id LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 \
             WHERE s.circle_id = ?1 AND s.status IN ('done', 'voting', 'lobby') ORDER BY s.created_at DESC LIMIT ?3",
        )
        .bind(&[circle_id.into(), loc.into(), num(limit)])?
        .all()
        .await?
        .results::<SummaryRow>()?;
    let out: Vec<SerataSummary> = rows
        .into_iter()
        .map(|r| SerataSummary {
            code: r.code,
            mode: r.mode,
            status: r.status,
            created_at: r.created_at,
            finished_at: r.finished_at,
            winner: r.w_id.map(|id| MediaDto {
                id,
                kind: r.w_kind.unwrap_or_default(),
                title: r.w_title.unwrap_or_default(),
                year: r.w_year,
                poster_path: r.w_poster,
            }),
            people: r.people as u32,
            watched: r.watched != 0,
        })
        .collect();
    json(&out, 200)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WatchedIn {
    log_id: String,
}

#[derive(Deserialize)]
struct WinnerRow {
    winner_media_id: Option<String>,
    circle_id: Option<String>,
}

#[derive(Deserialize)]
struct MediaOnly {
    media_id: String,
}

/// `POST /api/serate/:code/watched {logId}`: "we watched it". Links the Serata to one of MY diary entries for the winning title.
pub async fn watched(mut req: Request, env: Env, code: &str) -> Result<Response> {
    finish(watched_inner(&mut req, &env, code).await)
}

async fn watched_inner(req: &mut Request, env: &Env, code: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let code = code_of(code)?;
    let input: WatchedIn = body(req).await?;
    let w = db
        .prepare(
            "SELECT winner_media_id, circle_id FROM serata WHERE code = ?1 AND status = 'done'",
        )
        .bind(&[code.as_str().into()])?
        .first::<WinnerRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    manage::my_role(
        &db,
        w.circle_id.as_deref().ok_or_else(Fail::not_found)?,
        &s.user_id,
    )
    .await?;
    let log = db
        .prepare("SELECT media_id FROM log WHERE id = ?1 AND user_id = ?2")
        .bind(&[input.log_id.as_str().into(), s.user_id.as_str().into()])?
        .first::<MediaOnly>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    if Some(&log.media_id) != w.winner_media_id.as_ref() {
        return Err(Fail::invalid());
    }
    db.prepare("UPDATE serata SET watched_log_id = ?2 WHERE code = ?1")
        .bind(&[code.as_str().into(), input.log_id.as_str().into()])?
        .run()
        .await?;
    no_content()
}

#[derive(Deserialize)]
struct PublicRow {
    code: String,
    mode: String,
    finished_at: Option<i64>,
    result: Option<String>,
    circle_id: Option<String>,
    circle_name: Option<String>,
    w_id: Option<String>,
    w_kind: Option<String>,
    w_title: Option<String>,
    w_year: Option<i64>,
    w_poster: Option<String>,
}

/// `GET /api/serate/:code/result`, no sign-in: the data for the share card (winner, Cerchia, date, mode, turns, people). The card
/// itself is drawn by the client. Limited per IP; never who voted what.
pub async fn public_result(req: Request, env: Env, code: &str) -> Result<Response> {
    finish(public_inner(&req, &env, code).await)
}

async fn public_inner(req: &Request, env: &Env, code: &str) -> R<Response> {
    let db = env.d1("DB")?;
    limit::check(
        &db,
        &format!("serata:ip:{}", client_ip(req)),
        limits::JOIN_PREVIEW,
    )
    .await?;
    let code = code_of(code)?;
    let loc = catalog::locale_code(locale_of(req));
    let row = db
        .prepare(
            "SELECT s.code, s.mode, s.finished_at, s.result, s.circle_id, c.name AS circle_name, e.id AS w_id, e.kind AS w_kind, COALESCE(mt.title, e.original_title) AS w_title, \
               e.year AS w_year, e.poster_path AS w_poster FROM serata s LEFT JOIN circle c ON c.id = s.circle_id JOIN media_entity e ON e.id = s.winner_media_id \
             LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 WHERE s.code = ?1 AND s.status = 'done'",
        )
        .bind(&[code.as_str().into(), loc.into()])?
        .first::<PublicRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    let result: serde_json::Value = row
        .result
        .as_deref()
        .and_then(|r| serde_json::from_str(r).ok())
        .unwrap_or_default();
    // An open invitation to the Cerchia, so a guest who has just seen the result can ask to join (the newest one that still works).
    // As in v1, only for someone who took part in this Serata: the result page is public (the card's QR leads here), the Cerchia's
    // door is not.
    let viewer = session::current(req, &db).await?.map(|s| s.user_id);
    let invite_code = match (row.circle_id.as_deref(), viewer) {
        (Some(cid), Some(uid)) => {
            #[derive(Deserialize)]
            struct Inv {
                code: String,
            }
            db.prepare(
                "SELECT code FROM invite WHERE circle_id = ?1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?2) \
                 AND (max_uses IS NULL OR uses < max_uses) \
                 AND EXISTS (SELECT 1 FROM serata_participant p JOIN serata s ON s.id = p.serata_id WHERE s.code = ?3 AND p.user_id = ?4) \
                 ORDER BY created_at DESC LIMIT 1",
            )
            .bind(&[cid.into(), num(now_ms()), code.as_str().into(), uid.as_str().into()])?
            .first::<Inv>(None)
            .await?
            .map(|i| i.code)
        }
        _ => None,
    };
    json(
        &SerataPublicResult {
            code: row.code,
            winner: MediaDto {
                id: row.w_id.unwrap_or_default(),
                kind: row.w_kind.unwrap_or_default(),
                title: row.w_title.unwrap_or_default(),
                year: row.w_year,
                poster_path: row.w_poster,
            },
            circle_name: row.circle_name,
            mode: row.mode,
            turns: result.get("turns").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            people: result.get("people").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            drew: result
                .get("drew")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            finished_at: row.finished_at.unwrap_or(0),
            invite_code,
        },
        200,
    )
}

#[derive(Deserialize)]
struct MemberProvider {
    user_id: String,
    provider_id: i64,
    name: String,
    logo_path: Option<String>,
}

/// The services every member who set theirs has, and how many members that is (v1's `circleServices`).
async fn circle_services(db: &D1Database, circle_id: &str) -> R<(Vec<Provider>, u32, u32)> {
    #[derive(Deserialize)]
    struct N {
        n: i64,
    }
    let res = db
        .batch(vec![
            db.prepare("SELECT COUNT(*) AS n FROM circle_member WHERE circle_id = ?1")
                .bind(&[circle_id.into()])?,
            db.prepare(
                "SELECT p.user_id, p.provider_id, p.name, p.logo_path FROM user_provider p \
                 JOIN circle_member m ON m.user_id = p.user_id WHERE m.circle_id = ?1 ORDER BY p.user_id, p.name",
            )
            .bind(&[circle_id.into()])?,
        ])
        .await?;
    let members = res[0]
        .results::<N>()?
        .first()
        .map(|n| n.n as u32)
        .unwrap_or(0);
    let mut by_user: Vec<(String, Vec<Provider>)> = Vec::new();
    for r in res[1].results::<MemberProvider>()? {
        let p = Provider {
            id: r.provider_id,
            name: r.name,
            logo_path: r.logo_path,
        };
        match by_user.last_mut() {
            Some((u, list)) if *u == r.user_id => list.push(p),
            _ => by_user.push((r.user_id, vec![p])),
        }
    }
    let sets: Vec<Vec<Provider>> = by_user.into_iter().map(|(_, l)| l).collect();
    let set_by = sets.len() as u32;
    Ok((common_providers(&sets), set_by, members))
}

/// `GET /api/circles/:id/serate/services`: what the Cerchia can stream together.
pub async fn services(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(services_inner(&req, &env, circle_id).await)
}

async fn services_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    manage::my_role(&db, circle_id, &s.user_id).await?;
    let (common, set_by, members) = circle_services(&db, circle_id).await?;
    json(
        &CircleServices {
            names: common.into_iter().map(|p| p.name).collect(),
            set_by,
            members,
        },
        200,
    )
}

#[derive(Deserialize)]
struct IdRow {
    id: String,
}

#[derive(Deserialize)]
struct SeenRow {
    media_id: String,
    n: i64,
}

#[derive(Deserialize)]
struct AvailRow {
    media_id: String,
    provider_id: i64,
}

#[derive(Deserialize)]
struct TitleRow {
    id: String,
    kind: String,
    title: String,
    year: Option<i64>,
    poster_path: Option<String>,
}

/// `GET /api/circles/:id/serate/suggest`: "fill the roster for us". Only what Pausa already holds (no TMDB call here: a Worker request
/// has little CPU). A title's services are read from the weekly availability cache; a title not in it is unknown, never hidden.
pub async fn suggest(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(suggest_inner(&req, &env, circle_id).await)
}

async fn suggest_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    manage::my_role(&db, circle_id, &s.user_id).await?;
    let locale = locale_of(req);
    let loc = catalog::locale_code(locale);
    let res = db
        .batch(vec![
            db.prepare(
                "SELECT i.media_id AS id FROM list_item i JOIN list l ON l.id = i.list_id WHERE l.circle_id = ?1 \
                 ORDER BY CASE WHEN l.kind = 'watchlist' THEN 0 ELSE 1 END, l.created_at, i.position LIMIT 40",
            )
            .bind(&[circle_id.into()])?,
            db.prepare(
                "SELECT l.media_id, COUNT(DISTINCT l.user_id) AS n FROM log_share sh JOIN log l ON l.id = sh.log_id \
                 JOIN circle_member m ON m.circle_id = sh.circle_id AND m.user_id = l.user_id WHERE sh.circle_id = ?1 \
                 AND l.user_id NOT IN (SELECT blocked_id FROM user_block WHERE blocker_id = ?2) GROUP BY l.media_id",
            )
            .bind(&[circle_id.into(), s.user_id.as_str().into()])?,
            db.prepare("SELECT country FROM user WHERE id = ?1")
                .bind(&[s.user_id.as_str().into()])?,
        ])
        .await?;
    let watchlist: Vec<String> = res[0]
        .results::<IdRow>()?
        .into_iter()
        .map(|r| r.id)
        .collect();
    let seen_by: HashMap<String, u32> = res[1]
        .results::<SeenRow>()?
        .into_iter()
        .map(|r| (r.media_id, r.n as u32))
        .collect();
    #[derive(Deserialize)]
    struct Country {
        country: Option<String>,
    }
    let country = res[2]
        .results::<Country>()?
        .into_iter()
        .next()
        .and_then(|c| c.country)
        .filter(|c| is_country(c))
        .unwrap_or_else(|| default_country(loc).to_string());

    let recs = stats::recommend_list(&db, circle_id, loc, 12).await?;
    let recommended: Vec<RosterTitle> = recs
        .iter()
        .map(|r| RosterTitle {
            id: r.media.id.clone(),
            score: (r.score * 100.0).round() as i64,
        })
        .collect();
    let (common, _, members) = circle_services(&db, circle_id).await?;

    // Which services carry the candidates: what is already stored for this country.
    let mut ids: Vec<String> = watchlist.clone();
    for r in &recommended {
        if !ids.contains(&r.id) {
            ids.push(r.id.clone());
        }
    }
    ids.truncate(60);
    let mut known: HashSet<String> = HashSet::new();
    let mut carried: HashMap<String, HashSet<i64>> = HashMap::new();
    if !common.is_empty() && !ids.is_empty() {
        let ph = placeholders(2, ids.len());
        let mut args: Vec<JsValue> = vec![country.as_str().into()];
        args.extend(ids.iter().map(|i| JsValue::from(i.as_str())));
        let a = db
            .batch(vec![
                db.prepare(format!(
                    "SELECT media_id FROM media_availability_check WHERE country = ?1 AND media_id IN ({ph})"
                ))
                .bind(&args)?,
                db.prepare(format!(
                    "SELECT media_id, provider_id FROM media_provider WHERE country = ?1 AND media_id IN ({ph})"
                ))
                .bind(&args)?,
            ])
            .await?;
        #[derive(Deserialize)]
        struct M {
            media_id: String,
        }
        for r in a[0].results::<M>()? {
            known.insert(r.media_id);
        }
        for r in a[1].results::<AvailRow>()? {
            carried.entry(r.media_id).or_default().insert(r.provider_id);
        }
    }
    let on_common = |id: &str| -> Vec<String> {
        carried
            .get(id)
            .map(|set| {
                common
                    .iter()
                    .filter(|p| set.contains(&p.id))
                    .map(|p| p.name.clone())
                    .collect()
            })
            .unwrap_or_default()
    };
    let blocked = |id: &str| !common.is_empty() && known.contains(id) && on_common(id).is_empty();
    let picked = build_roster(
        &watchlist,
        &recommended,
        &seen_by,
        members,
        &blocked,
        MAX_CANDIDATES,
    );

    let mut titles: Vec<MediaDto> = Vec::new();
    if !picked.is_empty() {
        let ph = placeholders(2, picked.len());
        let mut args: Vec<JsValue> = vec![loc.into()];
        args.extend(picked.iter().map(|i| JsValue::from(i.as_str())));
        let rows = db
            .prepare(format!(
                "SELECT e.id, e.kind, COALESCE(mt.title, e.original_title) AS title, e.year, e.poster_path FROM media_entity e \
                 LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?1 WHERE e.id IN ({ph})"
            ))
            .bind(&args)?
            .all()
            .await?
            .results::<TitleRow>()?;
        for id in &picked {
            if let Some(r) = rows.iter().find(|r| &r.id == id) {
                titles.push(MediaDto {
                    id: r.id.clone(),
                    kind: r.kind.clone(),
                    title: r.title.clone(),
                    year: r.year,
                    poster_path: r.poster_path.clone(),
                });
            }
        }
    }
    let on: HashMap<String, Vec<String>> = titles
        .iter()
        .map(|t| (t.id.clone(), on_common(&t.id)))
        .filter(|(_, v)| !v.is_empty())
        .collect();
    json(&SerataSuggest { titles, on }, 200)
}

#[derive(Deserialize)]
struct PreviewRow {
    status: String,
    mode: String,
    host: Option<String>,
    n: i64,
    w_title: Option<String>,
    w_year: Option<i64>,
}

/// What the link preview of a room shows, owned so it outlives the query. `None` for an unknown or expired room: the page then
/// keeps the generic app image.
pub struct Preview {
    done: bool,
    bracket: bool,
    host: String,
    count: u32,
    title: String,
    year: Option<i64>,
}

impl Preview {
    pub fn card(&self) -> pausa_og::Card<'_> {
        if self.done {
            pausa_og::Card::Result {
                title: &self.title,
                year: self.year,
            }
        } else {
            pausa_og::Card::Invite {
                host: &self.host,
                bracket: self.bracket,
                count: self.count,
            }
        }
    }
    /// Part of the image address, so a room that has just decided gets a fresh image instead of the cached invitation.
    pub fn state(&self) -> &'static str {
        if self.done {
            "done"
        } else {
            "open"
        }
    }
}

pub async fn preview(db: &D1Database, code: &str, locale: Locale) -> R<Option<Preview>> {
    let Some(code) = normalize_code(code) else {
        return Ok(None);
    };
    let row = db
        .prepare(
            "SELECT s.status, s.mode, u.name AS host, (SELECT COUNT(*) FROM serata_candidate c WHERE c.serata_id = s.id) AS n, \
               COALESCE(mt.title, e.original_title) AS w_title, e.year AS w_year \
             FROM serata s JOIN user u ON u.id = s.host_id LEFT JOIN media_entity e ON e.id = s.winner_media_id \
             LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 WHERE s.code = ?1",
        )
        .bind(&[code.as_str().into(), catalog::locale_code(locale).into()])?
        .first::<PreviewRow>(None)
        .await?;
    Ok(row.and_then(|r| {
        let done = r.status == "done" && r.w_title.is_some();
        (done || matches!(r.status.as_str(), "lobby" | "voting")).then(|| Preview {
            done,
            bracket: r.mode == "bracket",
            host: r.host.unwrap_or_default(),
            count: r.n.max(0) as u32,
            title: r.w_title.unwrap_or_default(),
            year: r.w_year,
        })
    }))
}

/// `GET /api/og/serata/:code?locale=it&s=open`: the PNG of the link preview. Drawn once per address and data centre, then
/// served from the edge cache (five minutes while the room is open, a day once decided).
pub async fn og_image(req: Request, env: Env, code: &str) -> Result<Response> {
    finish(og_inner(&req, &env, code).await)
}

async fn og_inner(req: &Request, env: &Env, code: &str) -> R<Response> {
    let key = req.url()?.to_string();
    let cache = Cache::default();
    if let Ok(Some(hit)) = cache.get(&key, false).await {
        return Ok(hit);
    }
    let db = env.d1("DB")?;
    let locale = locale_of(req);
    let p = preview(&db, code, locale)
        .await?
        .ok_or_else(Fail::not_found)?;
    let png = pausa_og::render(&p.card(), catalog::locale_code(locale));
    let ttl = if p.done { 86_400 } else { 300 };
    let mut res = Response::from_bytes(png)?;
    res.headers_mut().set("Content-Type", "image/png")?;
    res.headers_mut()
        .set("Cache-Control", &format!("public, max-age={ttl}"))?;
    res.headers_mut()
        .set("Cross-Origin-Resource-Policy", "cross-origin")?;
    if let Ok(copy) = res.cloned() {
        let _ = cache.put(&key, copy).await;
    }
    Ok(res)
}
