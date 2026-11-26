//! Managing a Cerchia: detail, invites, settings, roles, removal, leaving, hand-over, deletion.
//! Rule everywhere: someone who is not in the Cerchia gets 404 (its existence is private), a member without the right gets 403.

use crate::http::{body, finish, json, new_id, no_content, now_ms, random, Fail, R};
use crate::{catalog, limit, session};
use crate::diary::locale_of;
use pausa_core::circles::{
    can_remove, can_set_role, clean_description, clean_name, invite_code, leave_outcome,
    valid_cover, Denied, LeaveOutcome, EXPIRY_CHOICES, MAX_USES_CHOICES,
};
use pausa_core::dto::{CircleDetail, CircleExtras, ErrorCode, MemoryDto, InviteDto, MediaDto, MemberDto, PersonDto, Role, WatchingDto};
use pausa_core::limits;
use serde::Deserialize;
use worker::wasm_bindgen::JsValue;
use worker::*;

fn forbidden() -> Fail {
    Fail::new(ErrorCode::Forbidden, 403)
}

fn denied(d: Denied) -> Fail {
    match d {
        Denied::SelfAction => Fail::invalid(),
        _ => forbidden(),
    }
}

fn num(v: i64) -> JsValue {
    (v as f64).into()
}

#[derive(Deserialize)]
struct RoleRow {
    role: String,
}

/// My role in the Cerchia, or 404.
pub async fn my_role(db: &D1Database, circle_id: &str, user_id: &str) -> R<Role> {
    role_of(db, circle_id, user_id)
        .await?
        .ok_or_else(Fail::not_found)
}

async fn role_of(db: &D1Database, circle_id: &str, user_id: &str) -> R<Option<Role>> {
    let row = db
        .prepare("SELECT role FROM circle_member WHERE circle_id = ?1 AND user_id = ?2")
        .bind(&[circle_id.into(), user_id.into()])?
        .first::<RoleRow>(None)
        .await?;
    Ok(row.and_then(|r| Role::from_db(&r.role)))
}

#[derive(Deserialize)]
struct CircleRow {
    id: String,
    name: String,
    description: Option<String>,
    cover: Option<String>,
    live_watching: i64,
}

#[derive(Deserialize)]
struct MemberRow {
    user_id: String,
    name: String,
    image: Option<String>,
    role: String,
    joined_at: i64,
}

#[derive(Deserialize)]
struct InviteRow {
    id: String,
    code: String,
    expires_at: Option<i64>,
    max_uses: Option<i64>,
    uses: i64,
}

#[derive(Deserialize)]
struct WatchingRow {
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

/// `GET /api/circles/:id`: one batch for the Cerchia, its people and its active invites.
pub async fn detail(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(detail_inner(&req, &env, circle_id).await)
}

async fn detail_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let now = now_ms();
    let year: i64 = pausa_core::diary::date_of_ms(now)[..4].parse().unwrap_or(1970);
    let loc = catalog::locale_code(locale_of(req));
    let results = db
        .batch(vec![
            db.prepare("SELECT id, name, description, cover, live_watching FROM circle WHERE id = ?1").bind(&[circle_id.into()])?,
            db.prepare(
                "SELECT m.user_id, u.name, u.image, m.role, m.joined_at FROM circle_member m JOIN user u ON u.id = m.user_id \
                 WHERE m.circle_id = ?1 ORDER BY m.joined_at, m.user_id",
            )
            .bind(&[circle_id.into()])?,
            db.prepare(
                "SELECT id, code, expires_at, max_uses, uses FROM invite WHERE circle_id = ?1 AND revoked_at IS NULL \
                 AND (expires_at IS NULL OR expires_at > ?2) AND (max_uses IS NULL OR uses < max_uses) ORDER BY created_at DESC",
            )
            .bind(&[circle_id.into(), num(now)])?,
            db.prepare(
                "SELECT COUNT(*) AS n FROM log_share s JOIN log l ON l.id = s.log_id                  JOIN circle_member m ON m.circle_id = s.circle_id AND m.user_id = l.user_id                  WHERE s.circle_id = ?1 AND l.watched_on >= ?2 AND l.watched_on < ?3",
            )
            .bind(&[circle_id.into(), format!("{year:04}-01-01").into(), format!("{:04}-01-01", year + 1).into()])?,
            // Newest first; the first row of each person is the one shown. Off when the Cerchia or I switched it off.
            db.prepare(
                "SELECT w.user_id, u.name, u.image, w.media_id, w.season, w.episode, w.updated_at,                  e.kind, e.original_title, mt.title AS loc_title, e.year, e.poster_path                  FROM watch_progress w                  JOIN circle c ON c.id = ?1 AND c.live_watching = 1                  JOIN circle_member m ON m.circle_id = ?1 AND m.user_id = w.user_id AND m.hide_watching = 0                  JOIN user u ON u.id = w.user_id JOIN media_entity e ON e.id = w.media_id                  LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?3                  WHERE w.status = 'watching' AND NOT EXISTS                    (SELECT 1 FROM circle_member me WHERE me.circle_id = ?1 AND me.user_id = ?2 AND me.hide_watching = 1)                  ORDER BY w.updated_at DESC LIMIT 200",
            )
            .bind(&[circle_id.into(), s.user_id.as_str().into(), loc.into()])?,
        ])
        .await?;
    let logs_this_year = results[3].results::<CountRow>()?.first().map(|r| r.n).unwrap_or(0);
    let mut seen = std::collections::HashSet::new();
    let watching: Vec<WatchingDto> = results[4]
        .results::<WatchingRow>()?
        .into_iter()
        .filter(|r| seen.insert(r.user_id.clone()))
        .map(|r| WatchingDto {
            user: PersonDto { id: r.user_id, name: r.name, image: r.image },
            media: MediaDto { id: r.media_id, kind: r.kind, title: r.loc_title.unwrap_or(r.original_title), year: r.year, poster_path: r.poster_path },
            season: r.season,
            episode: r.episode,
            updated_at: r.updated_at,
        })
        .collect();
    let members: Vec<MemberDto> = results[1]
        .results::<MemberRow>()?
        .into_iter()
        .filter_map(|m| {
            Some(MemberDto {
                user_id: m.user_id,
                name: m.name,
                image: m.image,
                role: Role::from_db(&m.role)?,
                joined_at: m.joined_at,
            })
        })
        .collect();
    let my_role = members
        .iter()
        .find(|m| m.user_id == s.user_id)
        .map(|m| m.role)
        .ok_or_else(Fail::not_found)?;
    let c = results[0]
        .results::<CircleRow>()?
        .into_iter()
        .next()
        .ok_or_else(Fail::not_found)?;
    let invites = results[2]
        .results::<InviteRow>()?
        .into_iter()
        .map(|i| InviteDto {
            id: i.id,
            code: i.code,
            expires_at: i.expires_at,
            max_uses: i.max_uses,
            uses: i.uses,
        })
        .collect();
    json(
        &CircleDetail {
            id: c.id,
            name: c.name,
            description: c.description,
            cover: c.cover,
            live_watching: c.live_watching != 0,
            my_role,
            members,
            invites,
            logs_this_year,
            watching,
        },
        200,
    )
}

#[derive(Deserialize)]
struct StepsRow {
    mine: i64,
    members: i64,
    serate: i64,
}

#[derive(Deserialize)]
struct MemoryRow {
    log_id: String,
    watched_on: String,
    rating: Option<i64>,
    review: Option<String>,
    contains_spoilers: i64,
    user_id: String,
    name: String,
    image: Option<String>,
    media_id: String,
    kind: String,
    original_title: String,
    loc_title: Option<String>,
    year: Option<i64>,
    poster_path: Option<String>,
}

/// `GET /api/circles/:id/extras`: "Per cominciare" and "Un anno fa… e oltre" under the diary head. Its own call, so the head
/// does not wait for it and the other screens that read the Cerchia detail do not pay for it.
pub async fn extras(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(extras_inner(&req, &env, circle_id).await)
}

async fn extras_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    my_role(&db, circle_id, &s.user_id).await?;
    let today = pausa_core::diary::date_of_ms(now_ms());
    let this_year: i64 = today[..4].parse().unwrap_or(1970);
    let days = pausa_core::diary::memory_days(&today, 3);
    let days_json = serde_json::to_string(&days).map_err(|_| Fail::invalid())?;
    let loc = catalog::locale_code(locale_of(req));
    let res = db
        .batch(vec![
            db.prepare(
                "SELECT (SELECT COUNT(*) FROM log WHERE user_id = ?2) AS mine, \
                 (SELECT COUNT(*) FROM circle_member WHERE circle_id = ?1) AS members, \
                 (SELECT COUNT(*) FROM serata WHERE circle_id = ?1 AND status = 'done') AS serate",
            )
            .bind(&[circle_id.into(), s.user_id.as_str().into()])?,
            // Shared here, by someone still here and not blocked by me, on one of the days around today, in an earlier year.
            db.prepare(
                "SELECT l.id AS log_id, l.watched_on, l.rating, l.review, l.contains_spoilers, u.id AS user_id, u.name, u.image, \
                 e.id AS media_id, e.kind, e.original_title, mt.title AS loc_title, e.year, e.poster_path \
                 FROM log_share sh JOIN log l ON l.id = sh.log_id \
                 JOIN circle_member m ON m.circle_id = sh.circle_id AND m.user_id = l.user_id \
                 JOIN user u ON u.id = l.user_id JOIN media_entity e ON e.id = l.media_id \
                 LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?3 \
                 WHERE sh.circle_id = ?1 AND l.user_id NOT IN (SELECT blocked_id FROM user_block WHERE blocker_id = ?2) \
                 AND substr(l.watched_on, 6, 5) IN (SELECT value FROM json_each(?4)) \
                 AND CAST(substr(l.watched_on, 1, 4) AS INTEGER) < ?5 \
                 ORDER BY l.watched_on DESC LIMIT 60",
            )
            .bind(&[circle_id.into(), s.user_id.as_str().into(), loc.into(), days_json.into(), num(this_year)])?,
        ])
        .await?;
    let steps = res[0].results::<StepsRow>()?.into_iter().next().unwrap_or(StepsRow { mine: 0, members: 1, serate: 0 });
    let mut rows = res[1].results::<MemoryRow>()?;
    // Closest to today's date first, then the most recent year (v1 memoriesFor).
    rows.sort_by_key(|r| {
        (
            pausa_core::diary::memory_distance(&days, r.watched_on.get(5..).unwrap_or("")),
            this_year - r.watched_on.get(..4).and_then(|y| y.parse::<i64>().ok()).unwrap_or(0),
        )
    });
    let memories = rows
        .into_iter()
        .take(3)
        .map(|r| MemoryDto {
            years_ago: this_year - r.watched_on.get(..4).and_then(|y| y.parse::<i64>().ok()).unwrap_or(this_year),
            log_id: r.log_id,
            media: MediaDto { id: r.media_id, kind: r.kind, title: r.loc_title.unwrap_or(r.original_title), year: r.year, poster_path: r.poster_path },
            author: PersonDto { id: r.user_id, name: r.name, image: r.image },
            watched_on: r.watched_on,
            rating: r.rating,
            review: if r.contains_spoilers != 0 { None } else { r.review },
        })
        .collect();
    json(
        &CircleExtras {
            has_log: steps.mine > 0,
            has_company: steps.members > 1,
            has_serata: steps.serate > 0,
            memories,
        },
        200,
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InviteIn {
    expiry: Option<String>,
    max_uses: Option<i64>,
}

/// `POST /api/circles/:id/invites {expiry: "1d"|"7d"|"30d"|"never", maxUses: 1|5|10|25|null}`. Admins and the owner.
pub async fn create_invite(mut req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(create_invite_inner(&mut req, &env, circle_id).await)
}

async fn create_invite_inner(req: &mut Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    // Counted before the permission check, like v1.
    limit::check(
        &db,
        &format!("act:createInvite:{}", s.user_id),
        limits::CREATE_INVITE,
    )
    .await?;
    let role = my_role(&db, circle_id, &s.user_id).await?;
    if !role.can_manage() {
        return Err(forbidden());
    }
    let input: InviteIn = body(req).await?;
    let expiry_key = input.expiry.as_deref().unwrap_or("7d");
    let ttl = EXPIRY_CHOICES
        .iter()
        .find(|(k, _)| *k == expiry_key)
        .ok_or_else(Fail::invalid)?
        .1;
    if input
        .max_uses
        .is_some_and(|m| !MAX_USES_CHOICES.contains(&m))
    {
        return Err(Fail::invalid());
    }
    let now = now_ms();
    let id = new_id();
    for _ in 0..3 {
        let code = invite_code(&random::<8>());
        let expires: JsValue = ttl.map_or(JsValue::NULL, |t| num(now + t));
        let max: JsValue = input.max_uses.map_or(JsValue::NULL, num);
        let stmt = db
            .prepare("INSERT INTO invite(id, circle_id, code, created_by, expires_at, max_uses, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
            .bind(&[id.clone().into(), circle_id.into(), code.clone().into(), s.user_id.clone().into(), expires.clone(), max.clone(), num(now)])?;
        match stmt.run().await {
            Ok(_) => {
                return json(
                    &InviteDto {
                        id,
                        code,
                        expires_at: ttl.map(|t| now + t),
                        max_uses: input.max_uses,
                        uses: 0,
                    },
                    201,
                )
            }
            Err(e) if e.to_string().contains("UNIQUE") => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(Fail::internal())
}

/// `POST /api/circles/:id/invites/:inviteId/revoke`. An unknown id is not an error (v1 behaviour); it cannot be undone.
pub async fn revoke_invite(
    req: Request,
    env: Env,
    circle_id: &str,
    invite_id: &str,
) -> Result<Response> {
    finish(revoke_inner(&req, &env, circle_id, invite_id).await)
}

async fn revoke_inner(req: &Request, env: &Env, circle_id: &str, invite_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if !my_role(&db, circle_id, &s.user_id).await?.can_manage() {
        return Err(forbidden());
    }
    db.prepare(
        "UPDATE invite SET revoked_at = ?3 WHERE id = ?1 AND circle_id = ?2 AND revoked_at IS NULL",
    )
    .bind(&[invite_id.into(), circle_id.into(), num(now_ms())])?
    .run()
    .await?;
    no_content()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsIn {
    name: Option<String>,
    description: Option<String>,
    cover: Option<String>,
    live_watching: Option<bool>,
}

/// `PATCH /api/circles/:id`: only the fields sent change. Admins and the owner.
pub async fn update(mut req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(update_inner(&mut req, &env, circle_id).await)
}

async fn update_inner(req: &mut Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if !my_role(&db, circle_id, &s.user_id).await?.can_manage() {
        return Err(forbidden());
    }
    let input: SettingsIn = body(req).await?;
    let mut sets: Vec<&str> = Vec::new();
    let mut args: Vec<JsValue> = vec![circle_id.into()];
    if let Some(n) = &input.name {
        args.push(clean_name(n).ok_or_else(Fail::invalid)?.into());
        sets.push("name");
    }
    if let Some(d) = &input.description {
        args.push(
            clean_description(d)
                .ok_or_else(Fail::invalid)?
                .map_or(JsValue::NULL, JsValue::from),
        );
        sets.push("description");
    }
    if let Some(c) = &input.cover {
        // An empty string clears the cover; anything else must be a preset key.
        if c.is_empty() {
            args.push(JsValue::NULL);
        } else if valid_cover(c) {
            args.push(c.as_str().into());
        } else {
            return Err(Fail::invalid());
        }
        sets.push("cover");
    }
    if let Some(l) = input.live_watching {
        args.push(num(i64::from(l)));
        sets.push("live_watching");
    }
    if sets.is_empty() {
        return Err(Fail::invalid());
    }
    let assignments: Vec<String> = sets
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{c} = ?{}", i + 2))
        .collect();
    db.prepare(format!(
        "UPDATE circle SET {} WHERE id = ?1",
        assignments.join(", ")
    ))
    .bind(&args)?
    .run()
    .await?;
    no_content()
}

#[derive(Deserialize)]
struct RoleIn {
    role: String,
}

/// `PUT /api/circles/:id/members/:userId/role {role: "admin"|"member"}`. Owner only; nobody becomes owner this way.
pub async fn set_role(
    mut req: Request,
    env: Env,
    circle_id: &str,
    user_id: &str,
) -> Result<Response> {
    finish(set_role_inner(&mut req, &env, circle_id, user_id).await)
}

async fn set_role_inner(
    req: &mut Request,
    env: &Env,
    circle_id: &str,
    user_id: &str,
) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let actor = my_role(&db, circle_id, &s.user_id).await?;
    let input: RoleIn = body(req).await?;
    let new = Role::from_db(&input.role).ok_or_else(Fail::invalid)?;
    let target = role_of(&db, circle_id, user_id)
        .await?
        .ok_or_else(Fail::not_found)?;
    can_set_role(actor, target, new).map_err(denied)?;
    db.prepare("UPDATE circle_member SET role = ?3 WHERE circle_id = ?1 AND user_id = ?2")
        .bind(&[circle_id.into(), user_id.into(), input.role.into()])?
        .run()
        .await?;
    no_content()
}

/// `DELETE /api/circles/:id/members/:userId`. Their logs, comments and notifications stay (v1 behaviour).
pub async fn remove_member(
    req: Request,
    env: Env,
    circle_id: &str,
    user_id: &str,
) -> Result<Response> {
    finish(remove_inner(&req, &env, circle_id, user_id).await)
}

async fn remove_inner(req: &Request, env: &Env, circle_id: &str, user_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let actor = my_role(&db, circle_id, &s.user_id).await?;
    let target = role_of(&db, circle_id, user_id)
        .await?
        .ok_or_else(Fail::not_found)?;
    can_remove(actor, target, s.user_id == user_id).map_err(denied)?;
    db.batch(leave_stmts(&db, circle_id, user_id)?).await?;
    no_content()
}

/// Taking someone out of a Cerchia (they left, or were removed): the membership, and their viewings leave with them. Their
/// viewings stay in their own diary and in other Cerchie; their comments stay (v1 behaviour).
fn leave_stmts(
    db: &D1Database,
    circle_id: &str,
    user_id: &str,
) -> Result<Vec<D1PreparedStatement>> {
    let args = [circle_id.into(), user_id.into()];
    Ok(vec![
        db.prepare("DELETE FROM log_share WHERE circle_id = ?1 AND log_id IN (SELECT id FROM log WHERE user_id = ?2)").bind(&args)?,
        db.prepare("DELETE FROM rating_current WHERE circle_id = ?1 AND user_id = ?2").bind(&args)?,
        db.prepare("DELETE FROM circle_member WHERE circle_id = ?1 AND user_id = ?2").bind(&args)?,
    ])
}

#[derive(Deserialize)]
struct CountRow {
    n: i64,
}

/// `POST /api/circles/:id/leave`. The owner must transfer first, unless alone (then the Cerchia is deleted with them).
pub async fn leave(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(leave_inner(&req, &env, circle_id).await)
}

async fn leave_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let role = my_role(&db, circle_id, &s.user_id).await?;
    let members = db
        .prepare("SELECT COUNT(*) AS n FROM circle_member WHERE circle_id = ?1")
        .bind(&[circle_id.into()])?
        .first::<CountRow>(None)
        .await?
        .map_or(0, |r| r.n);
    match leave_outcome(role, members as u32) {
        LeaveOutcome::MustTransfer => Err(Fail::new(ErrorCode::MustTransfer, 409)),
        LeaveOutcome::DeleteCircle => {
            db.prepare("DELETE FROM circle WHERE id = ?1")
                .bind(&[circle_id.into()])?
                .run()
                .await?;
            no_content()
        }
        LeaveOutcome::Leave => {
            db.batch(leave_stmts(&db, circle_id, &s.user_id)?).await?;
            no_content()
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferIn {
    user_id: String,
}

/// `POST /api/circles/:id/transfer {userId}`: the owner hands the Cerchia to another member and becomes an admin.
pub async fn transfer(mut req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(transfer_inner(&mut req, &env, circle_id).await)
}

async fn transfer_inner(req: &mut Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if !my_role(&db, circle_id, &s.user_id).await?.is_owner() {
        return Err(forbidden());
    }
    let input: TransferIn = body(req).await?;
    if input.user_id == s.user_id || role_of(&db, circle_id, &input.user_id).await?.is_none() {
        return Err(Fail::invalid());
    }
    // Statements run in order: the old owner steps down first, so the one-owner index is never violated.
    db.batch(vec![
        db.prepare("UPDATE circle_member SET role = 'admin' WHERE circle_id = ?1 AND user_id = ?2 AND role = 'owner'")
            .bind(&[circle_id.into(), s.user_id.into()])?,
        db.prepare("UPDATE circle_member SET role = 'owner' WHERE circle_id = ?1 AND user_id = ?2")
            .bind(&[circle_id.into(), input.user_id.into()])?,
    ])
    .await?;
    no_content()
}

#[derive(Deserialize)]
struct DeleteIn {
    /// Must equal the Cerchia's name, as on the confirmation screen.
    name: String,
}

/// `DELETE /api/circles/:id {name}`: owner only, with the name typed as confirmation. Everything in it is deleted by cascade.
pub async fn delete(mut req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(delete_inner(&mut req, &env, circle_id).await)
}

#[derive(Deserialize)]
struct NameRow {
    name: String,
}

async fn delete_inner(req: &mut Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if !my_role(&db, circle_id, &s.user_id).await?.is_owner() {
        return Err(forbidden());
    }
    let input: DeleteIn = body(req).await?;
    let row = db
        .prepare("SELECT name FROM circle WHERE id = ?1")
        .bind(&[circle_id.into()])?
        .first::<NameRow>(None)
        .await?;
    if row.is_none_or(|r| r.name != input.name.trim()) {
        return Err(Fail::invalid());
    }
    db.prepare("DELETE FROM circle WHERE id = ?1")
        .bind(&[circle_id.into()])?
        .run()
        .await?;
    no_content()
}
