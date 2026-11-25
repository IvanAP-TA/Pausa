//! What Cerchia members do around a viewing: reactions, comments, reports. Everything is scoped to one Cerchia: the same viewing
//! has a separate thread in each Cerchia it is shared with (v1 showed one thread everywhere).

use crate::diary::num;
use crate::http::{body, finish, json, new_id, no_content, now_ms, Fail, R};
use crate::{limit, manage, session};
use pausa_core::diary::{
    cut_at_sentence, MAX_COMMENT, MAX_EXCERPT, MAX_REPORT_NOTE, REACTIONS, REPORT_REASONS,
};
use pausa_core::dto::{ErrorCode, ReactionToggled};
use pausa_core::limits;
use serde::Deserialize;
use serde_json::json;
use worker::wasm_bindgen::JsValue;
use worker::*;

#[derive(Deserialize)]
struct ShareRow {
    author: String,
    media_id: String,
}

/// The viewing as this Cerchia sees it: shared here and its author still a member. 404 otherwise.
async fn shared_here(db: &D1Database, circle_id: &str, log_id: &str) -> R<ShareRow> {
    db.prepare(
        "SELECT l.user_id AS author, l.media_id FROM log_share s JOIN log l ON l.id = s.log_id \
         JOIN circle_member m ON m.circle_id = s.circle_id AND m.user_id = l.user_id WHERE s.circle_id = ?1 AND s.log_id = ?2",
    )
    .bind(&[circle_id.into(), log_id.into()])?
    .first::<ShareRow>(None)
    .await?
    .ok_or_else(Fail::not_found)
}

#[derive(Deserialize)]
struct ReactIn {
    emoji: String,
}

/// `POST /api/circles/:id/logs/:logId/reactions {emoji}`: toggles. Putting one back after taking it off does not nudge the
/// author again while their earlier notice is still unread.
pub async fn react(mut req: Request, env: Env, circle_id: &str, log_id: &str) -> Result<Response> {
    finish(react_inner(&mut req, &env, circle_id, log_id).await)
}

async fn react_inner(req: &mut Request, env: &Env, circle_id: &str, log_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    manage::my_role(&db, circle_id, &s.user_id).await?;
    let input: ReactIn = body(req).await?;
    if !REACTIONS.contains(&input.emoji.as_str()) {
        return Err(Fail::invalid());
    }
    let log = shared_here(&db, circle_id, log_id).await?;
    let now = now_ms();
    let res = db
        .batch(vec![
            db.prepare("DELETE FROM reaction WHERE log_id = ?1 AND circle_id = ?2 AND user_id = ?3 AND emoji = ?4")
                .bind(&[log_id.into(), circle_id.into(), s.user_id.as_str().into(), input.emoji.as_str().into()])?,
            db.prepare("INSERT INTO reaction(log_id, circle_id, user_id, emoji, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE (SELECT changes()) = 0")
                .bind(&[log_id.into(), circle_id.into(), s.user_id.as_str().into(), input.emoji.as_str().into(), num(now)])?,
            // `changes()` is now 1 only if the row above was inserted: the notice goes out only then.
            db.prepare(
                "INSERT INTO notification(id, user_id, type, actor_id, circle_id, log_id, media_id, created_at) \
                 SELECT lower(hex(randomblob(16))), m.user_id, 'reaction', ?1, ?2, ?3, ?4, ?5 FROM circle_member m \
                 WHERE (SELECT changes()) = 1 AND m.circle_id = ?2 AND m.user_id = ?6 AND m.user_id <> ?1 AND m.muted = 0 \
                   AND NOT EXISTS (SELECT 1 FROM notification_off o WHERE o.user_id = m.user_id AND o.type = 'reaction') \
                   AND NOT EXISTS (SELECT 1 FROM notification n WHERE n.user_id = m.user_id AND n.type = 'reaction' AND n.actor_id = ?1 \
                                   AND n.log_id = ?3 AND n.read_at IS NULL)",
            )
            .bind(&[s.user_id.as_str().into(), circle_id.into(), log_id.into(), log.media_id.as_str().into(), num(now), log.author.as_str().into()])?,
        ])
        .await?;
    let on = res[1]
        .meta()
        .ok()
        .flatten()
        .and_then(|m| m.changes)
        .unwrap_or(0)
        == 1;
    json(&ReactionToggled { on }, 200)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommentIn {
    body: String,
    #[serde(default)]
    is_spoiler: bool,
    parent_id: Option<String>,
}

fn clean_body(raw: &str) -> R<String> {
    let b = raw.trim();
    if b.is_empty() || b.chars().count() > MAX_COMMENT {
        return Err(Fail::invalid());
    }
    Ok(b.to_string())
}

/// `POST /api/circles/:id/logs/:logId/comments {body, isSpoiler, parentId?}`. Notifies the viewing's author and everyone who
/// already commented in this thread (except me), minus those who muted the Cerchia or switched comments off.
pub async fn add_comment(
    mut req: Request,
    env: Env,
    circle_id: &str,
    log_id: &str,
) -> Result<Response> {
    finish(add_comment_inner(&mut req, &env, circle_id, log_id).await)
}

#[derive(Deserialize)]
struct OneRow {
    #[allow(dead_code)]
    n: i64,
}

async fn add_comment_inner(
    req: &mut Request,
    env: &Env,
    circle_id: &str,
    log_id: &str,
) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    manage::my_role(&db, circle_id, &s.user_id).await?;
    limit::check(&db, &format!("act:comment:{}", s.user_id), limits::COMMENT).await?;
    let input: CommentIn = body(req).await?;
    let text = clean_body(&input.body)?;
    let log = shared_here(&db, circle_id, log_id).await?;
    if let Some(parent) = &input.parent_id {
        let found = db
            .prepare("SELECT 1 AS n FROM comment WHERE id = ?1 AND log_id = ?2 AND circle_id = ?3")
            .bind(&[parent.as_str().into(), log_id.into(), circle_id.into()])?
            .first::<OneRow>(None)
            .await?;
        if found.is_none() {
            return Err(Fail::invalid());
        }
    }
    let id = new_id();
    let now = now_ms();
    let parent: JsValue = input
        .parent_id
        .as_deref()
        .map_or(JsValue::NULL, JsValue::from);
    db.batch(vec![
        db.prepare("INSERT INTO comment(id, log_id, circle_id, user_id, parent_id, body, is_spoiler, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
            .bind(&[id.as_str().into(), log_id.into(), circle_id.into(), s.user_id.as_str().into(), parent, text.into(), num(i64::from(input.is_spoiler)), num(now)])?,
        db.prepare(
            "INSERT INTO notification(id, user_id, type, actor_id, circle_id, log_id, media_id, created_at) \
             SELECT lower(hex(randomblob(16))), t.uid, 'comment', ?1, ?2, ?3, ?4, ?5 \
             FROM (SELECT user_id AS uid FROM log WHERE id = ?3 UNION SELECT user_id FROM comment WHERE log_id = ?3 AND circle_id = ?2) t \
             JOIN circle_member m ON m.circle_id = ?2 AND m.user_id = t.uid \
             WHERE t.uid <> ?1 AND m.muted = 0 AND NOT EXISTS (SELECT 1 FROM notification_off o WHERE o.user_id = t.uid AND o.type = 'comment')",
        )
        .bind(&[s.user_id.as_str().into(), circle_id.into(), log_id.into(), log.media_id.as_str().into(), num(now)])?,
    ])
    .await?;
    json(&json!({ "id": id }), 201)
}

#[derive(Deserialize)]
struct CommentOwnerRow {
    user_id: String,
    log_author: String,
    circle_id: String,
}

async fn comment_row(db: &D1Database, comment_id: &str, viewer: &str) -> R<CommentOwnerRow> {
    let row = db
        .prepare("SELECT c.user_id, l.user_id AS log_author, c.circle_id FROM comment c JOIN log l ON l.id = c.log_id WHERE c.id = ?1")
        .bind(&[comment_id.into()])?
        .first::<CommentOwnerRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    // Not in the Cerchia the comment lives in: it does not exist for you.
    manage::my_role(db, &row.circle_id, viewer).await?;
    Ok(row)
}

/// `PATCH /api/comments/:id {body, isSpoiler}`: only the commenter. No notice.
pub async fn edit_comment(mut req: Request, env: Env, comment_id: &str) -> Result<Response> {
    finish(edit_inner(&mut req, &env, comment_id).await)
}

async fn edit_inner(req: &mut Request, env: &Env, comment_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let row = comment_row(&db, comment_id, &s.user_id).await?;
    if row.user_id != s.user_id {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    let input: CommentIn = body(req).await?;
    let text = clean_body(&input.body)?;
    db.prepare("UPDATE comment SET body = ?2, is_spoiler = ?3 WHERE id = ?1")
        .bind(&[
            comment_id.into(),
            text.into(),
            num(i64::from(input.is_spoiler)),
        ])?
        .run()
        .await?;
    no_content()
}

/// `DELETE /api/comments/:id`: the commenter, or the author of the viewing under which it was written. Replies go with it.
pub async fn delete_comment(req: Request, env: Env, comment_id: &str) -> Result<Response> {
    finish(delete_comment_inner(&req, &env, comment_id).await)
}

async fn delete_comment_inner(req: &Request, env: &Env, comment_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let row = comment_row(&db, comment_id, &s.user_id).await?;
    if row.user_id != s.user_id && row.log_author != s.user_id {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    db.prepare("DELETE FROM comment WHERE id = ?1")
        .bind(&[comment_id.into()])?
        .run()
        .await?;
    no_content()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportIn {
    kind: String,
    target_id: String,
    reason: String,
    note: Option<String>,
}

#[derive(Deserialize)]
struct TargetRow {
    author: String,
    text: Option<String>,
    circle_id: String,
}

/// `POST /api/reports {kind: "comment"|"log", targetId, reason, note?}`. You can report what you can see, not your own. A second
/// report of the same thing by the same person changes nothing and is not an error. Nothing is hidden automatically.
pub async fn report(mut req: Request, env: Env) -> Result<Response> {
    finish(report_inner(&mut req, &env).await)
}

async fn report_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    limit::check(&db, &format!("act:report:{}", s.user_id), limits::REPORT).await?;
    let input: ReportIn = body(req).await?;
    if !REPORT_REASONS.contains(&input.reason.as_str()) {
        return Err(Fail::invalid());
    }
    let note = input
        .note
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty());
    if note.is_some_and(|n| n.chars().count() > MAX_REPORT_NOTE) {
        return Err(Fail::invalid());
    }
    let sql = match input.kind.as_str() {
        "comment" => {
            "SELECT c.user_id AS author, c.body AS text, c.circle_id FROM comment c JOIN circle_member m ON m.circle_id = c.circle_id AND m.user_id = ?2 WHERE c.id = ?1"
        }
        "log" => {
            "SELECT l.user_id AS author, l.review AS text, s.circle_id FROM log l JOIN log_share s ON s.log_id = l.id \
             JOIN circle_member m ON m.circle_id = s.circle_id AND m.user_id = ?2 WHERE l.id = ?1 LIMIT 1"
        }
        _ => return Err(Fail::invalid()),
    };
    let target = db
        .prepare(sql)
        .bind(&[input.target_id.as_str().into(), s.user_id.as_str().into()])?
        .first::<TargetRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    if target.author == s.user_id {
        return Err(Fail::invalid());
    }
    let excerpt = target
        .text
        .as_deref()
        .map(|t| cut_at_sentence(t, MAX_EXCERPT));
    db.prepare(
        "INSERT OR IGNORE INTO report(id, reporter_id, kind, target_id, circle_id, reason, note, excerpt, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(&[
        new_id().into(),
        s.user_id.as_str().into(),
        input.kind.as_str().into(),
        input.target_id.as_str().into(),
        target.circle_id.as_str().into(),
        input.reason.as_str().into(),
        note.map_or(JsValue::NULL, JsValue::from),
        excerpt.as_deref().map_or(JsValue::NULL, JsValue::from),
        num(now_ms()),
    ])?
    .run()
    .await?;
    no_content()
}
