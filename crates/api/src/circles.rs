//! `/api/me` and Cerchie: create, join.

use crate::http::{body, finish, json, new_id, now_ms, random, Fail, R};
use crate::{limit, session};
use pausa_core::circles::{
    clean_name, invite_code, invite_state, normalize_code, InviteState, DEFAULT_INVITE_MS,
    MAX_MEMBERS,
};
use pausa_core::dto::{
    CircleCreated, CircleSummary, ErrorCode, InvitePreview, JoinResult, Locale, Me, Role,
};
use pausa_core::limits;
use serde::Deserialize;
use worker::*;

#[derive(Deserialize)]
struct MeRow {
    name: String,
    image: Option<String>,
    is_anonymous: i64,
    locale: Option<String>,
}

#[derive(Deserialize)]
struct CircleRow {
    id: String,
    name: String,
    cover: Option<String>,
    role: String,
    muted: i64,
    unread: i64,
}

/// `GET /api/me`: the person and their Cerchie. The session lookup and the Cerchie go out as one D1 batch.
pub async fn me(req: Request, env: Env) -> Result<Response> {
    finish(me_inner(&req, &env).await)
}

async fn me_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let rows = db
        .prepare(
            "SELECT c.id, c.name, c.cover, m.role, m.muted, \
               (SELECT COUNT(*) FROM (SELECT 1 FROM notification n WHERE n.user_id = m.user_id AND n.circle_id = c.id \
                  AND n.read_at IS NULL LIMIT 100)) AS unread \
             FROM circle_member m JOIN circle c ON c.id = m.circle_id WHERE m.user_id = ?1 ORDER BY m.joined_at",
        )
        .bind(&[s.user_id.clone().into()])?
        .all()
        .await?;
    let user = db
        .prepare("SELECT name, image, is_anonymous, locale FROM user WHERE id = ?1")
        .bind(&[s.user_id.clone().into()])?
        .first::<MeRow>(None)
        .await?
        .ok_or_else(Fail::unauthorized)?;
    let circles = rows
        .results::<CircleRow>()?
        .into_iter()
        .filter_map(|c| {
            Some(CircleSummary {
                id: c.id,
                name: c.name,
                cover: c.cover,
                role: Role::from_db(&c.role)?,
                muted: c.muted != 0,
                unread: c.unread as u32,
            })
        })
        .collect();
    json(
        &Me {
            id: s.user_id,
            name: user.name,
            image: user.image,
            is_anonymous: user.is_anonymous != 0,
            locale: user.locale.as_deref().and_then(Locale::from_code),
            circles,
        },
        200,
    )
}

#[derive(Deserialize)]
struct CreateIn {
    name: String,
}

/// `POST /api/circles`: the Cerchia, its owner and its first invite in one atomic batch (v1 used three separate inserts).
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
        &format!("act:createCircle:{}", s.user_id),
        limits::CREATE_CIRCLE,
    )
    .await?;
    let input: CreateIn = body(req).await?;
    let name = clean_name(&input.name).ok_or_else(Fail::invalid)?;

    let id = new_id();
    let now = now_ms();
    // An invite-code collision (1 in 2^40) fails the whole batch; a fresh code fixes it.
    for _ in 0..3 {
        let code = invite_code(&random::<8>());
        let stmts = vec![
            db.prepare("INSERT INTO circle(id, name, created_by, created_at) VALUES (?1, ?2, ?3, ?4)")
                .bind(&[id.clone().into(), name.clone().into(), s.user_id.clone().into(), (now as f64).into()])?,
            db.prepare("INSERT INTO circle_member(circle_id, user_id, role, joined_at) VALUES (?1, ?2, 'owner', ?3)")
                .bind(&[id.clone().into(), s.user_id.clone().into(), (now as f64).into()])?,
            db.prepare("INSERT INTO invite(id, circle_id, code, created_by, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
                .bind(&[
                    new_id().into(),
                    id.clone().into(),
                    code.clone().into(),
                    s.user_id.clone().into(),
                    ((now + DEFAULT_INVITE_MS) as f64).into(),
                    (now as f64).into(),
                ])?,
        ];
        match db.batch(stmts).await {
            Ok(_) => {
                return json(
                    &CircleCreated {
                        id,
                        invite_code: code,
                    },
                    201,
                )
            }
            Err(e) if e.to_string().contains("UNIQUE") && e.to_string().contains("invite.code") => {
                continue
            }
            Err(e) => return Err(e.into()),
        }
    }
    Err(Fail::internal())
}

#[derive(Deserialize)]
struct JoinIn {
    code: String,
}

#[derive(Deserialize)]
struct InviteRow {
    id: String,
    circle_id: String,
    expires_at: Option<i64>,
    max_uses: Option<i64>,
    uses: i64,
    revoked_at: Option<i64>,
    members: i64,
    is_member: Option<i64>,
}

/// `POST /api/circles/join {code}`. One read, one write batch.
pub async fn join(mut req: Request, env: Env) -> Result<Response> {
    finish(join_inner(&mut req, &env).await)
}

async fn join_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    // Counted before validating, like v1: this is also what stops guessing invite codes.
    limit::check(
        &db,
        &format!("act:joinCircle:{}", s.user_id),
        limits::JOIN_CIRCLE,
    )
    .await?;
    let input: JoinIn = body(req).await?;
    let code = normalize_code(&input.code).ok_or_else(Fail::not_found)?;

    let inv = db
        .prepare(
            "SELECT i.id, i.circle_id, i.expires_at, i.max_uses, i.uses, i.revoked_at, \
               (SELECT COUNT(*) FROM circle_member m WHERE m.circle_id = i.circle_id) AS members, \
               (SELECT 1 FROM circle_member m WHERE m.circle_id = i.circle_id AND m.user_id = ?2) AS is_member \
             FROM invite i WHERE i.code = ?1",
        )
        .bind(&[code.into(), s.user_id.clone().into()])?
        .first::<InviteRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;

    if inv.is_member.is_some() {
        return json(
            &JoinResult {
                circle_id: inv.circle_id,
                joined: false,
            },
            200,
        );
    }
    let now = now_ms();
    match invite_state(inv.revoked_at, inv.expires_at, inv.uses, inv.max_uses, now) {
        InviteState::Active => {}
        InviteState::Revoked => return Err(Fail::new(ErrorCode::InviteRevoked, 409)),
        InviteState::Expired => return Err(Fail::new(ErrorCode::InviteExpired, 409)),
        InviteState::Exhausted => return Err(Fail::new(ErrorCode::InviteExhausted, 409)),
    }
    if inv.members >= i64::from(MAX_MEMBERS) {
        return Err(Fail::new(ErrorCode::CircleFull, 409));
    }

    // The invite counter moves first and only if the invite is still usable; the member row and the "who joined through whom"
    // row are written only when it did (`changes()` is the row count of the statement just before).
    let results = db
        .batch(vec![
            db.prepare(
                "UPDATE invite SET uses = uses + 1 WHERE id = ?1 AND revoked_at IS NULL \
                 AND (max_uses IS NULL OR uses < max_uses) AND (expires_at IS NULL OR expires_at > ?2)",
            )
            .bind(&[inv.id.clone().into(), (now as f64).into()])?,
            db.prepare(
                "INSERT OR IGNORE INTO circle_member(circle_id, user_id, role, joined_at) \
                 SELECT ?1, ?2, 'member', ?3 WHERE (SELECT changes()) = 1",
            )
            .bind(&[inv.circle_id.clone().into(), s.user_id.clone().into(), (now as f64).into()])?,
            // Upsert (not "or ignore"): somebody removed and re-invited through the same invite gets a fresh row.
            db.prepare(
                "INSERT INTO invite_use(invite_id, user_id, used_at) SELECT ?1, ?2, ?3 WHERE (SELECT changes()) = 1 \
                 ON CONFLICT(invite_id, user_id) DO UPDATE SET used_at = excluded.used_at",
            )
            .bind(&[inv.id.clone().into(), s.user_id.clone().into(), (now as f64).into()])?,
            // Tell the others, unless they muted the Cerchia or switched this type off. Only when the row above was written.
            db.prepare(
                "INSERT INTO notification(id, user_id, type, actor_id, circle_id, created_at) \
                 SELECT lower(hex(randomblob(16))), m.user_id, 'circle_join', ?1, ?2, ?3 FROM circle_member m \
                 WHERE m.circle_id = ?2 AND m.user_id <> ?1 AND m.muted = 0 \
                   AND NOT EXISTS (SELECT 1 FROM notification_off o WHERE o.user_id = m.user_id AND o.type = 'circle_join') \
                   AND EXISTS (SELECT 1 FROM invite_use u WHERE u.invite_id = ?4 AND u.user_id = ?1 AND u.used_at = ?3)",
            )
            .bind(&[s.user_id.into(), inv.circle_id.clone().into(), (now as f64).into(), inv.id.into()])?,
        ])
        .await?;
    let joined = results
        .get(1)
        .and_then(|r| r.meta().ok().flatten())
        .and_then(|m| m.changes)
        .unwrap_or(0)
        == 1;
    if !joined {
        return Err(Fail::new(ErrorCode::InviteExhausted, 409)); // used up by someone else between the read and the write
    }
    json(
        &JoinResult {
            circle_id: inv.circle_id,
            joined: true,
        },
        200,
    )
}

#[derive(Deserialize)]
struct PreviewRow {
    name: String,
    expires_at: Option<i64>,
    max_uses: Option<i64>,
    uses: i64,
    revoked_at: Option<i64>,
    members: i64,
}

/// `GET /api/invites/:code`, no sign-in: the Cerchia's name, how many people are in it and whether the invite still works, so an
/// invitation page can say who is inviting before asking anyone to sign in. The code is the secret that allows this; guessing
/// is limited per IP.
pub async fn preview(req: Request, env: Env, code: &str) -> Result<Response> {
    finish(preview_inner(&req, &env, code).await)
}

async fn preview_inner(req: &Request, env: &Env, code: &str) -> R<Response> {
    let db = env.d1("DB")?;
    limit::check(
        &db,
        &format!("invite:ip:{}", crate::http::client_ip(req)),
        limits::JOIN_PREVIEW,
    )
    .await?;
    let code = normalize_code(code).ok_or_else(Fail::not_found)?;
    let row = db
        .prepare(
            "SELECT c.name, i.expires_at, i.max_uses, i.uses, i.revoked_at, (SELECT COUNT(*) FROM circle_member m WHERE m.circle_id = c.id) AS members \
             FROM invite i JOIN circle c ON c.id = i.circle_id WHERE i.code = ?1",
        )
        .bind(&[code.into()])?
        .first::<PreviewRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    let state = match invite_state(
        row.revoked_at,
        row.expires_at,
        row.uses,
        row.max_uses,
        now_ms(),
    ) {
        InviteState::Active => "active",
        InviteState::Revoked => "revoked",
        InviteState::Expired => "expired",
        InviteState::Exhausted => "exhausted",
    };
    json(
        &InvitePreview {
            circle_name: row.name,
            members: row.members as u32,
            state: state.into(),
        },
        200,
    )
}
