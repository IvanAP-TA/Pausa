//! What a Cerchia can read about its own taste: ranking, insights, group recommendations. Everything is computed from what was
//! shared in that Cerchia (`log_share`, `rating_current`), nothing else leaks in.

use crate::diary::{locale_of, query_param};
use crate::http::{finish, json, now_ms, R};
use crate::{catalog, manage, session};
use pausa_core::diary::date_of_ms;
use pausa_core::dto::{
    Counted, Insights, LovedBy, MediaDto, PairDto, PersonCount, PersonDto, PersonRating, RankedDto,
    RankingPage, Recommendation, YearReview,
};
use pausa_core::ranking::{agree_and_split, rank, year_span, Filters, Ranked, Sort, Title};
use serde::Deserialize;
use std::collections::HashMap;
use worker::*;

const PAGE: usize = 40;

#[derive(Deserialize)]
struct MemberRow {
    id: String,
    name: String,
    image: Option<String>,
}

#[derive(Deserialize)]
struct RatingRow {
    media_id: String,
    user_id: String,
    rating: i64,
}

#[derive(Deserialize)]
struct WatchRow {
    media_id: String,
    user_id: String,
    last: String,
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

fn media_dto(m: &MediaRow) -> MediaDto {
    MediaDto {
        id: m.id.clone(),
        kind: m.kind.clone(),
        title: m
            .loc_title
            .clone()
            .unwrap_or_else(|| m.original_title.clone()),
        year: m.year,
        poster_path: m.poster_path.clone(),
    }
}

/// Everything the three endpoints need, read in one batch: members (in the order they joined), the ratings that count here, who
/// watched what, and the titles themselves.
struct CircleData {
    members: Vec<MemberRow>,
    ratings: Vec<RatingRow>,
    watched: Vec<WatchRow>,
    media: Vec<MediaRow>,
}

async fn load(db: &D1Database, circle_id: &str, loc: &str) -> R<CircleData> {
    let res = db
        .batch(vec![
            db.prepare("SELECT u.id, u.name, u.image FROM circle_member m JOIN user u ON u.id = m.user_id WHERE m.circle_id = ?1 ORDER BY m.joined_at, u.id")
                .bind(&[circle_id.into()])?,
            db.prepare(
                "SELECT r.media_id, r.user_id, r.rating FROM rating_current r JOIN circle_member m ON m.circle_id = r.circle_id AND m.user_id = r.user_id WHERE r.circle_id = ?1",
            )
            .bind(&[circle_id.into()])?,
            db.prepare(
                "SELECT l.media_id, l.user_id, MAX(l.watched_on) AS last FROM log_share s JOIN log l ON l.id = s.log_id \
                 JOIN circle_member m ON m.circle_id = s.circle_id AND m.user_id = l.user_id WHERE s.circle_id = ?1 GROUP BY l.media_id, l.user_id ORDER BY MIN(l.watched_on), l.media_id",
            )
            .bind(&[circle_id.into()])?,
            db.prepare(
                "SELECT e.id, e.kind, e.original_title, mt.title AS loc_title, e.year, e.poster_path FROM media_entity e \
                 LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 \
                 WHERE e.id IN (SELECT l.media_id FROM log_share s JOIN log l ON l.id = s.log_id WHERE s.circle_id = ?1)",
            )
            .bind(&[circle_id.into(), loc.into()])?,
        ])
        .await?;
    Ok(CircleData {
        members: res[0].results()?,
        ratings: res[1].results()?,
        watched: res[2].results()?,
        media: res[3].results()?,
    })
}

fn titles_of(d: &CircleData) -> Vec<Title> {
    let mut by: HashMap<&str, Title> = HashMap::new();
    for m in &d.media {
        by.insert(
            m.id.as_str(),
            Title {
                media_id: m.id.clone(),
                title: m
                    .loc_title
                    .clone()
                    .unwrap_or_else(|| m.original_title.clone()),
                kind: m.kind.clone(),
                year: m.year,
                poster_path: m.poster_path.clone(),
                ratings: Vec::new(),
                watched_by: Vec::new(),
                last_watched: String::new(),
            },
        );
    }
    for w in &d.watched {
        if let Some(t) = by.get_mut(w.media_id.as_str()) {
            t.watched_by.push(w.user_id.clone());
            if w.last > t.last_watched {
                t.last_watched = w.last.clone();
            }
        }
    }
    for r in &d.ratings {
        if let Some(t) = by.get_mut(r.media_id.as_str()) {
            t.ratings.push((r.user_id.clone(), r.rating));
        }
    }
    let mut v: Vec<Title> = by.into_values().collect();
    v.sort_by(|a, b| a.media_id.cmp(&b.media_id)); // deterministic input for the sorts
    v
}

fn ranked_dto(r: &Ranked) -> RankedDto {
    RankedDto {
        media: MediaDto {
            id: r.title.media_id.clone(),
            kind: r.title.kind.clone(),
            title: r.title.title.clone(),
            year: r.title.year,
            poster_path: r.title.poster_path.clone(),
        },
        avg: r.avg,
        votes: r.votes as u32,
        watchers: r.title.watched_by.len() as u32,
        last_watched: r.title.last_watched.clone(),
        ratings: r
            .title
            .ratings
            .iter()
            .map(|(u, x)| PersonRating {
                user_id: u.clone(),
                rating: *x as u8,
            })
            .collect(),
    }
}

fn person(m: &MemberRow) -> PersonDto {
    PersonDto {
        id: m.id.clone(),
        name: m.name.clone(),
        image: m.image.clone(),
    }
}

/// `GET /api/circles/:id/ranking?q=&kind=&yearFrom=&yearTo=&minVotes=&everyone=1&by=&sort=avg|votes|year|recent|title&page=`
pub async fn ranking(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(ranking_inner(&req, &env, circle_id).await)
}

async fn ranking_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    manage::my_role(&db, circle_id, &s.user_id).await?;
    let d = load(&db, circle_id, catalog::locale_code(locale_of(req))).await?;
    let titles = titles_of(&d);
    let span = year_span(&titles);
    let num_param = |k: &str| query_param(req, k).and_then(|v| v.parse::<i64>().ok());
    let filters = Filters {
        q: query_param(req, "q"),
        kind: query_param(req, "kind").filter(|k| matches!(k.as_str(), "movie" | "tv" | "anime")),
        year_from: num_param("yearFrom"),
        year_to: num_param("yearTo"),
        min_votes: num_param("minVotes").map(|v| v.clamp(0, 50) as usize),
        everyone: query_param(req, "everyone").as_deref() == Some("1"),
        by: query_param(req, "by"),
        sort: Some(Sort::parse(query_param(req, "sort").as_deref())),
    };
    let people: Vec<String> = d.members.iter().map(|m| m.id.clone()).collect();
    let ranked = rank(titles, &people, &filters);
    let total = ranked.len() as u32;
    let page = num_param("page").unwrap_or(0).max(0) as usize;
    let items = ranked
        .iter()
        .skip(page * PAGE)
        .take(PAGE)
        .map(ranked_dto)
        .collect();
    json(
        &RankingPage {
            items,
            total,
            page: page as u32,
            page_size: PAGE as u32,
            year_min: span.map(|x| x.0),
            year_max: span.map(|x| x.1),
        },
        200,
    )
}

#[derive(Deserialize)]
struct StatsRow {
    logs: i64,
    titles: i64,
    hours: Option<f64>,
    avg: Option<f64>,
}

#[derive(Deserialize)]
struct KindCount {
    kind: String,
    n: i64,
}

#[derive(Deserialize)]
struct UserCount {
    user_id: String,
    n: i64,
}

#[derive(Deserialize)]
struct KeyCount {
    k: String,
    n: i64,
}

#[derive(Deserialize)]
struct MediaAvg {
    media_id: String,
    a: f64,
}

#[derive(Deserialize)]
struct YearRow {
    y: String,
}

/// Taste similarity between every pair, with the recommendation engine's own maths.
fn pairs_of(d: &CircleData) -> Vec<PairDto> {
    let idx: HashMap<&str, u32> = d
        .members
        .iter()
        .enumerate()
        .map(|(i, m)| (m.id.as_str(), i as u32))
        .collect();
    let mut mid: HashMap<&str, u32> = HashMap::new();
    let mut facts = Vec::new();
    for r in &d.ratings {
        let next = mid.len() as u32;
        let media = *mid.entry(r.media_id.as_str()).or_insert(next);
        if let Some(&p) = idx.get(r.user_id.as_str()) {
            facts.push(pausa_engine::Fact {
                person: Some(p),
                media,
                rating: Some(r.rating as f64),
            });
        }
    }
    let input = pausa_engine::Input {
        people: d.members.len() as u32,
        media_count: mid.len() as u32,
        facts,
        watching: Vec::new(),
    };
    let mut pairs: Vec<PairDto> = pausa_engine::taste_pairs(&input)
        .into_iter()
        .map(|p| PairDto {
            a: person(&d.members[p.a as usize]),
            b: person(&d.members[p.b as usize]),
            common: p.common as u32,
            score: p.score,
        })
        .collect();
    // Pairs with a score first (best first), then the rest by shared titles.
    pairs.sort_by(|x, y| match (x.score, y.score) {
        (Some(a), Some(b)) => b.partial_cmp(&a).unwrap_or(std::cmp::Ordering::Equal),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => y.common.cmp(&x.common),
    });
    pairs
}

/// `GET /api/circles/:id/insights?year=`: where the Cerchia agrees and splits, who is alike, and its year in review.
pub async fn insights(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(insights_inner(&req, &env, circle_id).await)
}

async fn insights_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    manage::my_role(&db, circle_id, &s.user_id).await?;
    let loc = catalog::locale_code(locale_of(req));
    let d = load(&db, circle_id, loc).await?;
    let year = query_param(req, "year")
        .and_then(|y| y.parse::<i64>().ok())
        .filter(|y| (1888..=2200).contains(y))
        .unwrap_or_else(|| date_of_ms(now_ms())[..4].parse().unwrap_or(2026));
    let (from, to) = (format!("{year}-01-01"), format!("{}-01-01", year + 1));
    let base = "FROM log_share s JOIN log l ON l.id = s.log_id JOIN circle_member m ON m.circle_id = s.circle_id AND m.user_id = l.user_id \
                JOIN media_entity e ON e.id = l.media_id WHERE s.circle_id = ?1 AND l.watched_on >= ?2 AND l.watched_on < ?3";
    let args = [circle_id.into(), from.as_str().into(), to.as_str().into()];
    let res = db
        .batch(vec![
            db.prepare(format!("SELECT COUNT(*) AS logs, COUNT(DISTINCT l.media_id) AS titles, SUM(CASE WHEN e.kind = 'movie' THEN COALESCE(e.runtime_min, 0) ELSE 0 END) / 60.0 AS hours, AVG(l.rating) AS avg {base}")).bind(&args)?,
            db.prepare(format!("SELECT e.kind, COUNT(*) AS n {base} GROUP BY e.kind")).bind(&args)?,
            db.prepare(format!("SELECT l.user_id, COUNT(*) AS n {base} GROUP BY l.user_id ORDER BY n DESC, l.user_id LIMIT 1")).bind(&args)?,
            db.prepare(format!("SELECT substr(l.watched_on, 1, 7) AS k, COUNT(*) AS n {base} GROUP BY k ORDER BY n DESC, k LIMIT 1")).bind(&args)?,
            db.prepare(format!("SELECT l.platform AS k, COUNT(*) AS n {base} AND l.platform IS NOT NULL GROUP BY l.platform ORDER BY n DESC, l.platform LIMIT 1")).bind(&args)?,
            db.prepare(format!("SELECT l.media_id, AVG(l.rating) AS a {base} AND l.rating IS NOT NULL GROUP BY l.media_id HAVING COUNT(DISTINCT l.user_id) >= 2 ORDER BY a DESC, l.media_id LIMIT 1")).bind(&args)?,
            db.prepare(format!("SELECT l.media_id, MAX(l.rating) AS a {base} AND l.rating IS NOT NULL GROUP BY l.media_id ORDER BY a DESC, l.media_id LIMIT 1")).bind(&args)?,
            db.prepare("SELECT DISTINCT substr(l.watched_on, 1, 4) AS y FROM log_share s JOIN log l ON l.id = s.log_id WHERE s.circle_id = ?1 ORDER BY y DESC").bind(&[circle_id.into()])?,
        ])
        .await?;
    let st = res[0].results::<StatsRow>()?.into_iter().next();
    let by_kind: HashMap<String, i64> = res[1]
        .results::<KindCount>()?
        .into_iter()
        .map(|k| (k.kind, k.n))
        .collect();
    let most_active = res[2]
        .results::<UserCount>()?
        .into_iter()
        .next()
        .and_then(|u| {
            d.members
                .iter()
                .find(|m| m.id == u.user_id)
                .map(|m| PersonCount {
                    person: person(m),
                    count: u.n as u32,
                })
        });
    let counted = |i: usize| -> R<Option<Counted>> {
        Ok(res[i]
            .results::<KeyCount>()?
            .into_iter()
            .next()
            .map(|c| Counted {
                key: c.k,
                count: c.n as u32,
            }))
    };
    let best = match res[5].results::<MediaAvg>()?.into_iter().next() {
        Some(b) => Some(b),
        None => res[6].results::<MediaAvg>()?.into_iter().next(),
    };
    let titles = titles_of(&d);
    let ranked_all = rank(
        titles.clone(),
        &[],
        &Filters {
            min_votes: Some(0),
            ..Default::default()
        },
    );
    let title_of_the_year = best.and_then(|b| {
        ranked_all
            .iter()
            .find(|r| r.title.media_id == b.media_id)
            .map(|r| {
                let mut dto = ranked_dto(r);
                dto.avg = Some(b.a);
                dto
            })
    });
    let rated = rank(
        titles.clone(),
        &[],
        &Filters {
            min_votes: Some(2),
            ..Default::default()
        },
    );
    let dis = agree_and_split(&rated.iter().map(|r| r.title.clone()).collect::<Vec<_>>());
    let pick =
        |ix: &[usize]| -> Vec<RankedDto> { ix.iter().map(|&i| ranked_dto(&rated[i])).collect() };
    let years_with_logs = res[7]
        .results::<YearRow>()?
        .into_iter()
        .filter_map(|y| y.y.parse().ok())
        .collect();
    json(
        &Insights {
            agree: pick(&dis.agree),
            split: pick(&dis.split),
            pairs: pairs_of(&d),
            year: YearReview {
                year,
                logs: st.as_ref().map_or(0, |x| x.logs as u32),
                titles: st.as_ref().map_or(0, |x| x.titles as u32),
                movies: *by_kind.get("movie").unwrap_or(&0) as u32,
                series: *by_kind.get("tv").unwrap_or(&0) as u32,
                anime: *by_kind.get("anime").unwrap_or(&0) as u32,
                movie_hours: st
                    .as_ref()
                    .and_then(|x| x.hours)
                    .map(|h| (h * 10.0).round() / 10.0)
                    .unwrap_or(0.0),
                avg_stars: st.as_ref().and_then(|x| x.avg).map(|a| a / 2.0),
                most_active,
                busiest_month: counted(3)?,
                top_platform: counted(4)?,
                title_of_the_year,
            },
            years_with_logs,
        },
        200,
    )
}

#[derive(Deserialize)]
struct SeenRow {
    user_id: String,
    media_id: String,
}

/// `GET /api/circles/:id/recommendations?limit=`: titles somebody here loved that others have not seen, scored for the people
/// who have not. The engine reads dense indices straight from the rows (no JSON), the cost that used to dominate (BUDGET.md).
pub async fn recommendations(req: Request, env: Env, circle_id: &str) -> Result<Response> {
    finish(recommendations_inner(&req, &env, circle_id).await)
}

async fn recommendations_inner(req: &Request, env: &Env, circle_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    manage::my_role(&db, circle_id, &s.user_id).await?;
    let loc = catalog::locale_code(locale_of(req));
    let limit = query_param(req, "limit")
        .and_then(|l| l.parse::<usize>().ok())
        .unwrap_or(12)
        .clamp(1, 30);
    let d = load(&db, circle_id, loc).await?;
    if d.members.len() < 2 {
        return json(&Vec::<Recommendation>::new(), 200);
    }
    let progress = db
        .prepare(
            "SELECT w.user_id, w.media_id FROM watch_progress w JOIN circle_member m ON m.user_id = w.user_id AND m.circle_id = ?1 WHERE w.status = 'watching'",
        )
        .bind(&[circle_id.into()])?
        .all()
        .await?
        .results::<SeenRow>()?;

    let person_ix: HashMap<&str, u32> = d
        .members
        .iter()
        .enumerate()
        .map(|(i, m)| (m.id.as_str(), i as u32))
        .collect();
    let rating_of: HashMap<(&str, &str), i64> = d
        .ratings
        .iter()
        .map(|r| ((r.user_id.as_str(), r.media_id.as_str()), r.rating))
        .collect();
    let mut media_ix: HashMap<&str, u32> = HashMap::new();
    let mut media_ids: Vec<&str> = Vec::new();
    let mut facts = Vec::with_capacity(d.watched.len());
    for w in &d.watched {
        let Some(&p) = person_ix.get(w.user_id.as_str()) else {
            continue;
        };
        let next = media_ids.len() as u32;
        let m = *media_ix.entry(w.media_id.as_str()).or_insert_with(|| {
            media_ids.push(w.media_id.as_str());
            next
        });
        facts.push(pausa_engine::Fact {
            person: Some(p),
            media: m,
            rating: rating_of
                .get(&(w.user_id.as_str(), w.media_id.as_str()))
                .map(|r| *r as f64),
        });
    }
    let watching = progress
        .iter()
        .filter_map(|w| {
            Some((
                *person_ix.get(w.user_id.as_str())?,
                *media_ix.get(w.media_id.as_str())?,
            ))
        })
        .collect();
    let input = pausa_engine::Input {
        people: d.members.len() as u32,
        media_count: media_ids.len() as u32,
        facts,
        watching,
    };
    let mut recs = pausa_engine::recommend(&input);

    let info: HashMap<&str, &MediaRow> = d.media.iter().map(|m| (m.id.as_str(), m)).collect();
    let title_of = |ix: u32| {
        info.get(media_ids[ix as usize])
            .map(|m| {
                m.loc_title
                    .clone()
                    .unwrap_or_else(|| m.original_title.clone())
            })
            .unwrap_or_default()
    };
    // score desc, then more people who would watch it, then title (locale-aware ordering stays outside the engine).
    recs.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.unseen_by.len().cmp(&a.unseen_by.len()))
            .then(
                pausa_core::ranking::fold(&title_of(a.media))
                    .cmp(&pausa_core::ranking::fold(&title_of(b.media))),
            )
    });
    let out: Vec<Recommendation> = recs
        .into_iter()
        .take(limit)
        .filter_map(|r| {
            let m = info.get(media_ids[r.media as usize])?;
            Some(Recommendation {
                media: media_dto(m),
                score: r.score,
                unseen_by: r
                    .unseen_by
                    .iter()
                    .map(|&i| person(&d.members[i as usize]))
                    .collect(),
                loved_by: r
                    .loved_by
                    .iter()
                    .map(|&(i, x)| LovedBy {
                        person: person(&d.members[i as usize]),
                        rating: x as u8,
                    })
                    .collect(),
            })
        })
        .collect();
    json(&out, 200)
}
