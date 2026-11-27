//! Traguardi, the opt-in global leaderboard, the public profile page and the person's own statistics. The rules (ladders, the
//! daily cap, what a public name may be) live in `pausa_core::achievements`; here are the queries.

use crate::diary::{num, query_param};
use crate::http::{body, client_ip, finish, json, no_content, now_ms, random, Fail, R};
use crate::{limit, session};
use pausa_core::achievements::{
    clean_public_name, milestone, month_of, BOARD_SIZE, DAILY_CAP, KINDS, RECOMPUTE_SQL,
};
use pausa_core::dto::{
    AchievementsDto, BoardDto, BoardMe, BoardRow, CountBy, JoinBoardInput, Milestone,
    MilestoneKind, PersonalStatsDto, PublicProfileDto,
};
use pausa_core::limits;
use serde::Deserialize;
use worker::*;

#[derive(Deserialize)]
struct Counts {
    viewings: i64,
    reviews: i64,
    serate: i64,
    hosted: i64,
    genres: i64,
    rewatches: i64,
}

async fn milestones(db: &D1Database, user_id: &str) -> R<Vec<Milestone>> {
    let c = db
        .prepare(
            "SELECT (SELECT COUNT(*) FROM log WHERE user_id = ?1) AS viewings, \
               (SELECT COUNT(*) FROM log WHERE user_id = ?1 AND review IS NOT NULL AND trim(review) <> '') AS reviews, \
               (SELECT COUNT(*) FROM serata_participant p JOIN serata s ON s.id = p.serata_id WHERE p.user_id = ?1 AND s.status = 'done') AS serate, \
               (SELECT COUNT(*) FROM serata WHERE host_id = ?1 AND status = 'done') AS hosted, \
               (SELECT COUNT(DISTINCT g.genre) FROM log l JOIN media_genre g ON g.media_id = l.media_id WHERE l.user_id = ?1) AS genres, \
               (SELECT COUNT(*) FROM log WHERE user_id = ?1 AND is_rewatch = 1) AS rewatches",
        )
        .bind(&[user_id.into()])?
        .first::<Counts>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    Ok(KINDS
        .iter()
        .map(|&k| {
            let v = match k {
                MilestoneKind::Viewings => c.viewings,
                MilestoneKind::Reviews => c.reviews,
                MilestoneKind::Serate => c.serate,
                MilestoneKind::Hosted => c.hosted,
                MilestoneKind::Genres => c.genres,
                MilestoneKind::Rewatches => c.rewatches,
            };
            milestone(k, v)
        })
        .collect())
}

#[derive(Deserialize)]
struct MemberRow {
    public_name: String,
    public_profile: i64,
    handle: String,
}

async fn member(db: &D1Database, user_id: &str) -> R<Option<MemberRow>> {
    Ok(db
        .prepare(
            "SELECT public_name, public_profile, handle FROM leaderboard_member WHERE user_id = ?1",
        )
        .bind(&[user_id.into()])?
        .first::<MemberRow>(None)
        .await?)
}

#[derive(Deserialize)]
struct ScoreRank {
    score: Option<i64>,
    rank: Option<i64>,
}

/// A member's score in a period and their rank (1 + how many scored more); `(None, None)` before their first computation.
async fn score_rank(db: &D1Database, user_id: &str, period: &str) -> R<(Option<i64>, Option<i64>)> {
    let r = db
        .prepare(
            "SELECT s.score AS score, 1 + (SELECT COUNT(*) FROM leaderboard_score o WHERE o.period = s.period AND o.score > s.score) AS rank \
             FROM leaderboard_score s WHERE s.period = ?1 AND s.user_id = ?2",
        )
        .bind(&[period.into(), user_id.into()])?
        .first::<ScoreRank>(None)
        .await?;
    Ok(r.map(|r| (r.score, r.rank)).unwrap_or((None, None)))
}

/// `GET /api/me/achievements`.
pub async fn mine(req: Request, env: Env) -> Result<Response> {
    finish(mine_inner(&req, &env).await)
}

async fn mine_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let milestones = milestones(&db, &s.user_id).await?;
    let board = match member(&db, &s.user_id).await? {
        None => BoardMe {
            joined: false,
            public_name: None,
            public_profile: false,
            handle: None,
            score_all: None,
            score_month: None,
            rank_all: None,
            rank_month: None,
        },
        Some(m) => {
            let (score_all, rank_all) = score_rank(&db, &s.user_id, "all").await?;
            let (score_month, rank_month) =
                score_rank(&db, &s.user_id, &month_of(now_ms())).await?;
            BoardMe {
                joined: true,
                public_name: Some(m.public_name),
                public_profile: m.public_profile == 1,
                handle: Some(m.handle),
                score_all,
                score_month,
                rank_all,
                rank_month,
            }
        }
    };
    json(
        &AchievementsDto {
            milestones,
            board,
            daily_cap: DAILY_CAP,
        },
        200,
    )
}

/// A handle nobody can guess from the name or the account: 12 characters of [a-z2-9].
fn new_handle() -> String {
    const ALPHABET: &[u8; 32] = b"abcdefghjkmnpqrstuvwxyz23456789x";
    random::<12>()
        .iter()
        .map(|b| ALPHABET[(b & 31) as usize] as char)
        .collect()
}

/// `PUT /api/me/leaderboard`: join with a public name, or change the name / the public page. Guests (Serata, no account) cannot.
pub async fn join(mut req: Request, env: Env) -> Result<Response> {
    finish(join_inner(&mut req, &env).await)
}

async fn join_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(pausa_core::dto::ErrorCode::Forbidden, 403));
    }
    let input: JoinBoardInput = body(req).await?;
    let name = clean_public_name(&input.public_name).ok_or_else(Fail::invalid)?;
    limit::check(&db, &format!("board:{}", s.user_id), limits::BOARD_JOIN).await?;
    db.prepare(
        "INSERT INTO leaderboard_member (user_id, public_name, public_profile, handle, joined_at) VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(user_id) DO UPDATE SET public_name = excluded.public_name, public_profile = excluded.public_profile",
    )
    .bind(&[
        s.user_id.as_str().into(),
        name.as_str().into(),
        num(input.public_profile as i64),
        new_handle().into(),
        num(now_ms()),
    ])?
    .run()
    .await?;
    mine_inner(req, env).await
}

/// `DELETE /api/me/leaderboard`: off the board, at once. The name, the handle and every score go; the public page stops answering.
pub async fn leave(req: Request, env: Env) -> Result<Response> {
    finish(leave_inner(&req, &env).await)
}

async fn leave_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    db.batch(vec![
        db.prepare("DELETE FROM leaderboard_score WHERE user_id = ?1")
            .bind(&[s.user_id.as_str().into()])?,
        db.prepare("DELETE FROM leaderboard_member WHERE user_id = ?1")
            .bind(&[s.user_id.as_str().into()])?,
    ])
    .await?;
    no_content()
}

#[derive(Deserialize)]
struct BoardLine {
    user_id: String,
    score: i64,
    public_name: String,
    public_profile: i64,
    handle: String,
}

#[derive(Deserialize)]
struct Meta {
    members: i64,
    computed_at: Option<i64>,
}

/// `GET /api/leaderboard?period=all|month`: the top of the board, for anyone signed in. Ties share a rank (1, 2, 2, 4).
pub async fn board(req: Request, env: Env) -> Result<Response> {
    finish(board_inner(&req, &env).await)
}

async fn board_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let period = match query_param(req, "period").as_deref() {
        Some("month") => month_of(now_ms()),
        None | Some("all") => "all".to_string(),
        _ => return Err(Fail::invalid()),
    };
    let lines = db
        .prepare(
            "SELECT s.user_id, s.score, m.public_name, m.public_profile, m.handle FROM leaderboard_score s \
             JOIN leaderboard_member m ON m.user_id = s.user_id WHERE s.period = ?1 AND s.score > 0 \
             ORDER BY s.score DESC, m.joined_at ASC LIMIT ?2",
        )
        .bind(&[period.as_str().into(), num(BOARD_SIZE as i64)])?
        .all()
        .await?
        .results::<BoardLine>()?;
    let meta = db
        .prepare(
            "SELECT (SELECT COUNT(*) FROM leaderboard_member) AS members, \
               (SELECT MAX(computed_at) FROM leaderboard_score WHERE period = ?1) AS computed_at",
        )
        .bind(&[period.as_str().into()])?
        .first::<Meta>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    let mut rows = Vec::with_capacity(lines.len());
    let mut rank = 0;
    let mut prev: Option<i64> = None;
    for (i, l) in lines.into_iter().enumerate() {
        if prev != Some(l.score) {
            rank = i as i64 + 1;
            prev = Some(l.score);
        }
        rows.push(BoardRow {
            rank,
            public_name: l.public_name,
            score: l.score,
            handle: (l.public_profile == 1).then_some(l.handle),
            me: l.user_id == s.user_id,
        });
    }
    json(
        &BoardDto {
            period,
            rows,
            computed_at: meta.computed_at.map(|v| v as f64),
            members: meta.members,
        },
        200,
    )
}

/// `GET /api/u/:handle`, no sign-in: the public page a member turned on. 404 for anyone else (off, left, never joined).
pub async fn public_profile(req: Request, env: Env, handle: &str) -> Result<Response> {
    finish(public_inner(&req, &env, handle).await)
}

#[derive(Deserialize)]
struct PublicRow {
    user_id: String,
    public_name: String,
    joined_at: i64,
}

async fn public_inner(req: &Request, env: &Env, handle: &str) -> R<Response> {
    let db = env.d1("DB")?;
    limit::check(
        &db,
        &format!("profile:ip:{}", client_ip(req)),
        limits::PUBLIC_PROFILE,
    )
    .await?;
    if handle.len() != 12
        || !handle
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    {
        return Err(Fail::not_found());
    }
    let row = db
        .prepare("SELECT user_id, public_name, joined_at FROM leaderboard_member WHERE handle = ?1 AND public_profile = 1")
        .bind(&[handle.into()])?
        .first::<PublicRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    let reached: Vec<Milestone> = milestones(&db, &row.user_id)
        .await?
        .into_iter()
        .filter(|m| m.reached > 0)
        .collect();
    let (score_all, rank_all) = score_rank(&db, &row.user_id, "all").await?;
    let mut res = json(
        &PublicProfileDto {
            public_name: row.public_name,
            milestones: reached,
            score_all,
            rank_all,
            since: row.joined_at as f64,
        },
        200,
    )?;
    res.headers_mut()
        .set("Cache-Control", "public, max-age=300")?;
    Ok(res)
}

#[derive(Deserialize)]
struct KindLine {
    kind: String,
    episode: i64,
    n: i64,
    mins: i64,
    no_runtime: i64,
}

#[derive(Deserialize)]
struct KeyCount {
    key: Option<String>,
    n: i64,
}

#[derive(Deserialize)]
struct RatingLine {
    rating: i64,
    n: i64,
}

/// `GET /api/me/stats`: the person's own numbers over everything they logged.
pub async fn stats(req: Request, env: Env) -> Result<Response> {
    finish(stats_inner(&req, &env).await)
}

async fn stats_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let uid = s.user_id.as_str();
    // A film counts its runtime; an episode its episode runtime; a whole series logged at once has no honest runtime: it is
    // counted among the viewings "without runtime" and the hours are a floor.
    let kinds = db
        .prepare(
            "SELECT e.kind AS kind, (l.episode IS NOT NULL) AS episode, COUNT(*) AS n, \
               SUM(CASE WHEN e.kind = 'movie' OR l.episode IS NOT NULL THEN COALESCE(e.runtime_min, 0) ELSE 0 END) AS mins, \
               SUM(CASE WHEN (e.kind = 'movie' OR l.episode IS NOT NULL) AND e.runtime_min IS NOT NULL THEN 0 ELSE 1 END) AS no_runtime \
             FROM log l JOIN media_entity e ON e.id = l.media_id WHERE l.user_id = ?1 GROUP BY e.kind, (l.episode IS NOT NULL)",
        )
        .bind(&[uid.into()])?
        .all()
        .await?
        .results::<KindLine>()?;
    let genres = db
        .prepare(
            "SELECT g.genre AS key, COUNT(*) AS n FROM log l JOIN media_genre g ON g.media_id = l.media_id WHERE l.user_id = ?1 \
             GROUP BY g.genre ORDER BY n DESC, g.genre",
        )
        .bind(&[uid.into()])?
        .all()
        .await?
        .results::<KeyCount>()?;
    let years = db
        .prepare("SELECT substr(watched_on, 1, 4) AS key, COUNT(*) AS n FROM log WHERE user_id = ?1 GROUP BY key ORDER BY key")
        .bind(&[uid.into()])?
        .all()
        .await?
        .results::<KeyCount>()?;
    let ratings = db
        .prepare("SELECT rating, COUNT(*) AS n FROM log WHERE user_id = ?1 AND rating IS NOT NULL GROUP BY rating ORDER BY rating")
        .bind(&[uid.into()])?
        .all()
        .await?
        .results::<RatingLine>()?;
    let mut out = PersonalStatsDto {
        viewings: 0,
        films: 0,
        series: 0,
        episodes: 0,
        minutes: 0,
        without_runtime: 0,
        rated: 0,
        average: None,
        genres: genres
            .into_iter()
            .filter_map(|g| {
                Some(CountBy {
                    key: g.key?,
                    count: g.n,
                })
            })
            .collect(),
        years: years
            .into_iter()
            .filter_map(|y| {
                Some(CountBy {
                    key: y.key?,
                    count: y.n,
                })
            })
            .collect(),
        ratings: ratings
            .iter()
            .map(|r| CountBy {
                key: r.rating.to_string(),
                count: r.n,
            })
            .collect(),
    };
    for k in kinds {
        out.viewings += k.n;
        if k.kind == "movie" {
            out.films += k.n;
        } else {
            out.series += k.n;
            if k.episode == 1 {
                out.episodes += k.n;
            }
        }
        out.minutes += k.mins;
        out.without_runtime += k.no_runtime;
    }
    out.rated = ratings.iter().map(|r| r.n).sum();
    if out.rated > 0 {
        let total: i64 = ratings.iter().map(|r| r.rating * r.n).sum();
        out.average = Some((total as f64 / out.rated as f64 * 10.0).round() / 10.0);
    }
    json(&out, 200)
}

/// The hourly cron: recompute the all-time and this month's board for every member, from scratch (one statement each).
pub async fn recompute(env: &Env) -> Result<()> {
    let db = env.d1("DB")?;
    let now = now_ms();
    let month = month_of(now);
    db.batch(vec![
        db.prepare("DELETE FROM leaderboard_score WHERE period IN ('all', ?1) OR user_id NOT IN (SELECT user_id FROM leaderboard_member)")
            .bind(&[month.as_str().into()])?,
        db.prepare(RECOMPUTE_SQL).bind(&[num(now), "all".into(), "%".into()])?,
        db.prepare(RECOMPUTE_SQL).bind(&[num(now), month.as_str().into(), month.as_str().into()])?,
    ])
    .await?;
    Ok(())
}
