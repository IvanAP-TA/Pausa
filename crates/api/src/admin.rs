//! Moderation and the operator's numbers, plus the per-person block list.
//!
//! The operator is whoever signs in with a verified email listed in the `OPERATOR_EMAILS` variable (comma separated). Anyone
//! else gets a 404 on `/api/admin/*`: its existence is not revealed. Nothing is hidden automatically by a report; the operator
//! decides, and removing something is limited to the Cerchia where it was reported.

use crate::catalog;
use crate::diary::{num, query_param, rating_refresh};
use crate::http::{body, finish, json, no_content, now_ms, Fail, R};
use crate::session;
use pausa_core::dto::{
    AdminMetrics, AdminReport, AdminReports, BlockedUser, BlockedUsers, ErrorCode,
};
use serde::Deserialize;
use worker::*;

const WEEK_MS: i64 = 7 * 24 * 3600 * 1000;

#[derive(Deserialize)]
struct EmailRow {
    email: String,
    email_verified: i64,
    is_anonymous: i64,
}

/// True when `email` is in the comma separated `list` (case-insensitive, spaces ignored). Empty list: nobody.
pub fn in_operator_list(list: &str, email: &str) -> bool {
    let email = email.trim().to_lowercase();
    !email.is_empty()
        && list
            .split(',')
            .map(|e| e.trim().to_lowercase())
            .any(|e| !e.is_empty() && e == email)
}

async fn require_operator(req: &Request, env: &Env, db: &D1Database) -> R<String> {
    let s = session::require(req, db).await?;
    let list = env
        .var("OPERATOR_EMAILS")
        .map(|v| v.to_string())
        .unwrap_or_default();
    if list.trim().is_empty() {
        return Err(Fail::not_found());
    }
    let row = db
        .prepare("SELECT email, email_verified, is_anonymous FROM user WHERE id = ?1")
        .bind(&[s.user_id.as_str().into()])?
        .first::<EmailRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    if row.is_anonymous != 0 || row.email_verified == 0 || !in_operator_list(&list, &row.email) {
        return Err(Fail::not_found());
    }
    Ok(s.user_id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportRow {
    id: String,
    kind: String,
    target_id: String,
    reason: String,
    note: Option<String>,
    excerpt: Option<String>,
    reporter_name: Option<String>,
    circle_name: Option<String>,
    created_at: f64,
    resolved_at: Option<f64>,
    resolution: Option<String>,
}

/// `GET /api/admin/reports?status=open|resolved`: the oldest open reports first, the latest resolved first. 100 at most.
pub async fn reports(req: Request, env: Env) -> Result<Response> {
    finish(reports_inner(&req, &env).await)
}

async fn reports_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    require_operator(req, env, &db).await?;
    let url = req.url()?;
    let resolved = url
        .query_pairs()
        .any(|(k, v)| k == "status" && v == "resolved");
    let (filter, order) = if resolved {
        ("r.resolved_at IS NOT NULL", "r.resolved_at DESC")
    } else {
        ("r.resolved_at IS NULL", "r.created_at ASC")
    };
    let rows = db
        .prepare(format!(
            "SELECT r.id, r.kind, r.target_id AS targetId, r.reason, r.note, r.excerpt, u.name AS reporterName, c.name AS circleName, \
             r.created_at AS createdAt, r.resolved_at AS resolvedAt, r.resolution \
             FROM report r LEFT JOIN user u ON u.id = r.reporter_id LEFT JOIN circle c ON c.id = r.circle_id \
             WHERE {filter} ORDER BY {order} LIMIT 100"
        ))
        .all()
        .await?
        .results::<ReportRow>()?;
    json(
        &AdminReports {
            reports: rows
                .into_iter()
                .map(|r| AdminReport {
                    id: r.id,
                    kind: r.kind,
                    target_id: r.target_id,
                    reason: r.reason,
                    note: r.note,
                    excerpt: r.excerpt,
                    reporter_name: r.reporter_name,
                    circle_name: r.circle_name,
                    created_at: r.created_at,
                    resolved_at: r.resolved_at,
                    resolution: r.resolution,
                })
                .collect(),
        },
        200,
    )
}

#[derive(Deserialize)]
struct ResolveIn {
    resolution: String,
}

#[derive(Deserialize)]
struct OpenReport {
    kind: String,
    target_id: String,
    circle_id: Option<String>,
    resolved_at: Option<i64>,
}

/// `POST /api/admin/reports/:id/resolve {resolution: "dismissed"|"removed"|"user_disabled"}`.
/// `removed`: deletes the reported comment, or takes the reported viewing out of the Cerchia where it was reported (the viewing
/// stays in the author's diary and in their other Cerchie). `user_disabled`: also removes the author's sessions.
pub async fn resolve(mut req: Request, env: Env, id: &str) -> Result<Response> {
    finish(resolve_inner(&mut req, &env, id).await)
}

async fn resolve_inner(req: &mut Request, env: &Env, id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    require_operator(req, env, &db).await?;
    let input: ResolveIn = body(req).await?;
    if !["dismissed", "removed", "user_disabled"].contains(&input.resolution.as_str()) {
        return Err(Fail::invalid());
    }
    let rep = db
        .prepare("SELECT kind, target_id, circle_id, resolved_at FROM report WHERE id = ?1")
        .bind(&[id.into()])?
        .first::<OpenReport>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    if rep.resolved_at.is_some() {
        return Err(Fail::new(ErrorCode::Conflict, 409));
    }
    // Who wrote it (for `user_disabled`) and which title (to refresh the ratings after a viewing is taken out).
    #[derive(Deserialize)]
    struct Author {
        user_id: Option<String>,
        media_id: Option<String>,
    }
    let author_sql = match rep.kind.as_str() {
        "comment" => "SELECT user_id, NULL AS media_id FROM comment WHERE id = ?1",
        "log" => "SELECT user_id, media_id FROM log WHERE id = ?1",
        _ => "SELECT id AS user_id, NULL AS media_id FROM user WHERE id = ?1",
    };
    let author = db
        .prepare(author_sql)
        .bind(&[rep.target_id.as_str().into()])?
        .first::<Author>(None)
        .await?;

    let mut stmts: Vec<D1PreparedStatement> = Vec::new();
    let res = input.resolution.as_str();
    if res == "removed" || res == "user_disabled" {
        match (rep.kind.as_str(), rep.circle_id.as_deref()) {
            ("comment", _) => stmts.push(
                db.prepare("DELETE FROM comment WHERE id = ?1")
                    .bind(&[rep.target_id.as_str().into()])?,
            ),
            ("log", Some(circle)) => {
                stmts.push(
                    db.prepare("DELETE FROM log_share WHERE log_id = ?1 AND circle_id = ?2")
                        .bind(&[rep.target_id.as_str().into(), circle.into()])?,
                );
                stmts.push(
                    db.prepare("DELETE FROM comment WHERE log_id = ?1 AND circle_id = ?2")
                        .bind(&[rep.target_id.as_str().into(), circle.into()])?,
                );
                if let Some(Author {
                    user_id: Some(u),
                    media_id: Some(m),
                }) = &author
                {
                    stmts.extend(rating_refresh(&db, u, m)?);
                }
            }
            _ => {}
        }
    }
    if res == "user_disabled" {
        if let Some(Author {
            user_id: Some(u), ..
        }) = &author
        {
            stmts.push(
                db.prepare("UPDATE user SET disabled_at = ?2 WHERE id = ?1")
                    .bind(&[u.as_str().into(), num(now_ms())])?,
            );
            stmts.push(
                db.prepare("DELETE FROM session WHERE user_id = ?1")
                    .bind(&[u.as_str().into()])?,
            );
        }
    }
    stmts.push(
        db.prepare("UPDATE report SET resolved_at = ?2, resolution = ?3 WHERE id = ?1 AND resolved_at IS NULL")
            .bind(&[id.into(), num(now_ms()), res.into()])?,
    );
    db.batch(stmts).await?;
    no_content()
}

/// `GET /api/admin/metrics`: totals only.
pub async fn metrics(req: Request, env: Env) -> Result<Response> {
    finish(metrics_inner(&req, &env).await)
}

async fn metrics_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    require_operator(req, env, &db).await?;
    let since = now_ms() - WEEK_MS;
    let row = db
        .prepare(
            "SELECT (SELECT COUNT(*) FROM user WHERE is_anonymous = 0) AS users, \
             (SELECT COUNT(DISTINCT user_id) FROM session WHERE last_seen_at >= ?1) AS active, \
             (SELECT COUNT(*) FROM circle) AS circles, (SELECT COUNT(*) FROM log) AS logs, \
             (SELECT COUNT(*) FROM log WHERE created_at >= ?1) AS logs7, (SELECT COUNT(*) FROM serata) AS serate, \
             (SELECT COUNT(*) FROM report WHERE resolved_at IS NULL) AS reports, \
             (SELECT COUNT(*) FROM event WHERE name = 'card_shared' AND created_at >= ?1) AS cards, \
             (SELECT COUNT(*) FROM event WHERE name = 'invite_shared' AND created_at >= ?1) AS invites",
        )
        .bind(&[num(since)])?
        .first::<serde_json::Value>(None)
        .await?
        .unwrap_or_default();
    let f = |k: &str| row.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0);

    // The early success numbers: one statement of scalar subqueries (one D1 call) plus the finished Serate durations, whose
    // median is cheaper to take here than in SQL. Anonymous guests are not counted as people.
    const WK: &str = "604800000";
    let retention = |d: i64| {
        let from = d * 86_400_000;
        let to = (d + 7) * 86_400_000;
        format!(
            "(SELECT COUNT(*) FROM circle c WHERE ?1 - c.created_at >= {to}) AS elig{d}, \
             (SELECT COUNT(*) FROM circle c WHERE ?1 - c.created_at >= {to} AND (EXISTS \
                (SELECT 1 FROM log l JOIN circle_member m ON m.user_id = l.user_id WHERE m.circle_id = c.id \
                 AND l.created_at >= c.created_at + {from} AND l.created_at < c.created_at + {to}) \
              OR EXISTS (SELECT 1 FROM serata s WHERE s.circle_id = c.id \
                 AND s.created_at >= c.created_at + {from} AND s.created_at < c.created_at + {to}))) AS kept{d}"
        )
    };
    let more = db
        .prepare(format!(
            "SELECT \
             (SELECT COUNT(*) FROM user u WHERE u.is_anonymous = 0 AND ?1 - u.created_at >= {WK}) AS cohort, \
             (SELECT COUNT(*) FROM user u WHERE u.is_anonymous = 0 AND ?1 - u.created_at >= {WK} AND EXISTS \
                (SELECT 1 FROM circle_member m WHERE m.user_id = u.id AND m.joined_at - u.created_at <= {WK})) AS joined7, \
             (SELECT AVG(n) FROM (SELECT COUNT(*) AS n FROM log l JOIN circle_member m ON m.user_id = l.user_id \
                WHERE l.created_at <= ?1 AND l.created_at > ?1 - 4 * {WK} \
                GROUP BY m.circle_id, CAST((?1 - l.created_at) / {WK} AS INTEGER))) AS per_week, \
             (SELECT COUNT(DISTINCT circle_id) FROM list WHERE circle_id IS NOT NULL) AS with_lists, \
             (SELECT COUNT(*) FROM circle) AS circles, \
             (SELECT COUNT(*) FROM serata WHERE status = 'done' AND finished_at IS NOT NULL) AS done, \
             (SELECT COUNT(*) FROM serata WHERE status = 'done' AND finished_at IS NOT NULL AND finished_at - created_at < 120000) AS under120, \
             (SELECT COUNT(*) FROM serata s WHERE s.status = 'done' AND s.finished_at IS NOT NULL AND EXISTS \
                (SELECT 1 FROM event e WHERE e.serata_id = s.id AND e.name = 'card_shared')) AS card, \
             (SELECT COUNT(*) FROM serata s WHERE s.status = 'done' AND s.finished_at IS NOT NULL AND EXISTS \
                (SELECT 1 FROM event e WHERE e.serata_id = s.id AND e.name = 'invite_shared')) AS invite, \
             {}, {}, \
             (SELECT COUNT(DISTINCT user_id) FROM circle_member) AS people, \
             (SELECT COUNT(*) FROM (SELECT user_id FROM watch_progress UNION SELECT actor_id FROM notification \
                WHERE type = 'now_watching' AND actor_id IS NOT NULL) w WHERE w.user_id IN (SELECT user_id FROM circle_member)) AS watchers",
            retention(7),
            retention(30)
        ))
        .bind(&[num(now_ms())])?
        .first::<serde_json::Value>(None)
        .await?
        .unwrap_or_default();
    let x = |k: &str| more.get(k).and_then(|v| v.as_f64());
    let f2 = |k: &str| x(k).unwrap_or(0.0);
    #[derive(Deserialize)]
    struct Secs {
        s: f64,
    }
    let durations: Vec<f64> = db
        .prepare("SELECT (finished_at - created_at) / 1000.0 AS s FROM serata WHERE status = 'done' AND finished_at IS NOT NULL ORDER BY 1 LIMIT 20000")
        .all()
        .await?
        .results::<Secs>()?
        .into_iter()
        .map(|m| m.s)
        .collect();
    json(
        &AdminMetrics {
            users: f("users"),
            active_7d: f("active"),
            circles: f("circles"),
            logs: f("logs"),
            logs_7d: f("logs7"),
            serate: f("serate"),
            open_reports: f("reports"),
            cards_shared_7d: f("cards"),
            invites_shared_7d: f("invites"),
            circle_within_7d: ratio(x("joined7"), x("cohort")),
            circle_within_7d_cohort: f2("cohort"),
            logs_per_active_circle_week: x("per_week"),
            circles_using_lists: ratio(x("with_lists"), x("circles")),
            serata_median_seconds: median_sorted(&durations),
            serata_under_120: ratio(x("under120"), x("done")),
            serata_finished: f2("done"),
            serata_card_rate: ratio(x("card"), x("done")),
            serata_invite_rate: ratio(x("invite"), x("done")),
            retention_d7: ratio(x("kept7"), x("elig7")),
            retention_d7_eligible: f2("elig7"),
            retention_d30: ratio(x("kept30"), x("elig30")),
            retention_d30_eligible: f2("elig30"),
            now_watching_rate: ratio(x("watchers"), x("people")),
            now_watching_people: f2("people"),
        },
        200,
    )
}

/// `part / whole`, or `None` (not enough data yet) when there is no whole or no part counted.
fn ratio(part: Option<f64>, whole: Option<f64>) -> Option<f64> {
    match (part, whole) {
        (Some(p), Some(w)) if w > 0.0 => Some(p / w),
        _ => None,
    }
}

/// The median of values already sorted ascending; `None` for no values.
fn median_sorted(v: &[f64]) -> Option<f64> {
    let m = v.len() / 2;
    match v.len() {
        0 => None,
        n if n % 2 == 1 => Some(v[m]),
        _ => Some((v[m - 1] + v[m]) / 2.0),
    }
}

#[derive(Deserialize)]
struct BlockRow {
    id: String,
    name: String,
    blocked_at: f64,
}

/// `GET /api/me/blocks`.
pub async fn blocks(req: Request, env: Env) -> Result<Response> {
    finish(blocks_inner(&req, &env).await)
}

async fn blocks_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let rows = db
        .prepare(
            "SELECT u.id, u.name, b.created_at AS blocked_at FROM user_block b JOIN user u ON u.id = b.blocked_id \
             WHERE b.blocker_id = ?1 ORDER BY b.created_at DESC LIMIT 200",
        )
        .bind(&[s.user_id.as_str().into()])?
        .all()
        .await?
        .results::<BlockRow>()?;
    json(
        &BlockedUsers {
            blocked: rows
                .into_iter()
                .map(|r| BlockedUser {
                    id: r.id,
                    name: r.name,
                    blocked_at: r.blocked_at,
                })
                .collect(),
        },
        200,
    )
}

/// `PUT /api/me/blocks/:userId`: hides that person's comments and reactions from you everywhere. They are not told. You can only
/// block someone you share a Cerchia with, and not yourself.
pub async fn block(req: Request, env: Env, user: &str) -> Result<Response> {
    finish(block_inner(&req, &env, user).await)
}

async fn block_inner(req: &Request, env: &Env, user: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if user == s.user_id {
        return Err(Fail::invalid());
    }
    db.prepare(
            "INSERT OR IGNORE INTO user_block(blocker_id, blocked_id, created_at) \
             SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM circle_member a JOIN circle_member b ON b.circle_id = a.circle_id \
             WHERE a.user_id = ?1 AND b.user_id = ?2) OR EXISTS (SELECT 1 FROM user_block WHERE blocker_id = ?1 AND blocked_id = ?2)",
        )
        .bind(&[s.user_id.as_str().into(), user.into(), num(now_ms())])?
        .run()
        .await?;
    let present = db
        .prepare("SELECT 1 AS ok FROM user_block WHERE blocker_id = ?1 AND blocked_id = ?2")
        .bind(&[s.user_id.as_str().into(), user.into()])?
        .first::<serde_json::Value>(None)
        .await?;
    if present.is_none() {
        return Err(Fail::not_found());
    }
    no_content()
}

/// `DELETE /api/me/blocks/:userId`.
pub async fn unblock(req: Request, env: Env, user: &str) -> Result<Response> {
    finish(unblock_inner(&req, &env, user).await)
}

async fn unblock_inner(req: &Request, env: &Env, user: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    db.prepare("DELETE FROM user_block WHERE blocker_id = ?1 AND blocked_id = ?2")
        .bind(&[s.user_id.as_str().into(), user.into()])?
        .run()
        .await?;
    no_content()
}

#[cfg(test)]
mod tests {
    use super::{in_operator_list, median_sorted, ratio};

    #[test]
    fn ratio_and_median() {
        assert_eq!(ratio(Some(1.0), Some(4.0)), Some(0.25));
        assert_eq!(ratio(Some(0.0), Some(4.0)), Some(0.0));
        assert_eq!(ratio(Some(1.0), Some(0.0)), None);
        assert_eq!(ratio(None, Some(2.0)), None);
        assert_eq!(median_sorted(&[]), None);
        assert_eq!(median_sorted(&[5.0]), Some(5.0));
        assert_eq!(median_sorted(&[1.0, 3.0]), Some(2.0));
        assert_eq!(median_sorted(&[1.0, 2.0, 9.0]), Some(2.0));
    }

    #[test]
    fn operator_list_matching() {
        assert!(in_operator_list("a@x.it, B@X.it", "b@x.it"));
        assert!(in_operator_list("a@x.it", " A@x.it "));
        assert!(!in_operator_list("", "a@x.it"));
        assert!(!in_operator_list("a@x.it,,", ""));
        assert!(!in_operator_list("aa@x.it", "a@x.it"));
    }
}

#[derive(Deserialize)]
struct BackfillIdRow {
    id: String,
}

#[derive(Deserialize)]
struct BackfillCount {
    n: i64,
}

/// `POST /api/admin/catalog-backfill?limit=5`: genres and authors for titles stored before migration 0003, a few per call
/// (each title is one or two catalogue requests; the CPU budget is 10 ms, network waits do not count). The final COUNT reads
/// every `media_entity` row: acceptable because the backfill runs only a few times.
pub async fn catalog_backfill(req: Request, env: Env) -> Result<Response> {
    finish(catalog_backfill_inner(&req, &env).await)
}

async fn catalog_backfill_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let user_id = require_operator(req, env, &db).await?;
    let limit = query_param(req, "limit")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(5)
        .clamp(1, 10);
    let ids: Vec<BackfillIdRow> = db
        .prepare(
            "SELECT id FROM media_entity WHERE catalog_v2_at IS NULL ORDER BY created_at LIMIT ?1",
        )
        .bind(&[num(limit)])?
        .all()
        .await?
        .results()?;
    let (mut done, mut failed) = (0, 0);
    for r in &ids {
        // Not counted against the operator's catalogue limit: the CLI paces the calls. A transient error (catalogue down, no
        // token, rate limited) leaves the title unstamped for a later call; a rate limit or outage stops the batch.
        match catalog::fill_v2(env, &db, &user_id, &r.id, false).await {
            Ok(()) => done += 1,
            Err(f) => {
                failed += 1;
                if f.status == 429 || f.status == 503 {
                    break;
                }
            }
        }
    }
    let left = db
        .prepare("SELECT COUNT(*) AS n FROM media_entity WHERE catalog_v2_at IS NULL")
        .first::<BackfillCount>(None)
        .await?
        .map_or(0, |c| c.n);
    json(
        &serde_json::json!({ "done": done, "failed": failed, "left": left }),
        200,
    )
}
