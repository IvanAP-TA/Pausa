//! Pausa's recommendation engine.
//!
//! A faithful port of the pure functions in `src/lib/core/insights.ts` (`recommend`, `tastePairs`, `tasteSimilarity`):
//! same inputs, same formulas, same order of floating point operations, so results match the TypeScript reference exactly
//! (a parity test in `src/lib/engine/engine.parity.test.ts` checks this on thousands of random Cerchie).
//!
//! It is compiled to WebAssembly and called through a tiny C interface: the caller allocates memory with `alloc`, writes a
//! JSON request, calls `run(op, ptr, len)` and reads a length-prefixed JSON reply, then frees both with `dealloc`.
//! Sorting by title (locale-aware in JavaScript) is deliberately left to the caller, so Rust never has to guess a locale.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Pairs need this many titles rated by both before a similarity means anything.
const MIN_COMMON: usize = 3;
/// Ratings are 1..10, so two people differ by at most 9.
const MAX_DIFF: f64 = 9.0;
/// What a group recommendation must score to be worth suggesting (7 = 3.5 stars).
const RECOMMEND_MIN: f64 = 7.0;
/// Weight for someone we cannot compare yet (counted at face value).
const NEUTRAL_WEIGHT: f64 = 0.5;
/// An opposite-taste "9" says the other person would give about a 2.
const MIRROR: f64 = 11.0;

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Wire types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fact {
    user_id: String,
    media_id: String,
    rating: Option<f64>,
    title: String,
    kind: String,
    year: Option<i32>,
    poster_path: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
struct Person {
    id: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Watching {
    user_id: String,
    media_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    #[serde(default)]
    facts: Vec<Fact>,
    people: Vec<Person>,
    #[serde(default)]
    watching: Vec<Watching>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Loved {
    person: Person,
    rating: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Recommendation {
    media_id: String,
    title: String,
    poster_path: Option<String>,
    kind: String,
    year: Option<i32>,
    score: f64,
    unseen_by: Vec<Person>,
    loved_by: Vec<Loved>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Pair {
    a: Person,
    b: Person,
    common: usize,
    score: Option<f64>,
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ The maths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

type Ratings<'a> = HashMap<&'a str, HashMap<&'a str, f64>>;

/// Latest rating per person per title (facts are chronological: a later rating replaces an earlier one).
fn latest_ratings(facts: &[Fact]) -> Ratings<'_> {
    let mut out: Ratings = HashMap::new();
    for f in facts {
        if let Some(r) = f.rating {
            out.entry(f.user_id.as_str())
                .or_default()
                .insert(f.media_id.as_str(), r);
        }
    }
    out
}

/// (titles both rated, 0..1 similarity or None until they share MIN_COMMON titles).
fn taste_similarity(
    a: Option<&HashMap<&str, f64>>,
    b: Option<&HashMap<&str, f64>>,
) -> (usize, Option<f64>) {
    let (Some(a), Some(b)) = (a, b) else {
        return (0, None);
    };
    let mut sum = 0.0;
    let mut common = 0usize;
    for (media, ra) in a {
        if let Some(rb) = b.get(media) {
            sum += (ra - rb).abs();
            common += 1;
        }
    }
    let score = if common < MIN_COMMON {
        None
    } else {
        Some(1.0 - sum / common as f64 / MAX_DIFF)
    };
    (common, score)
}

/// Group recommendations, unsorted and unlimited: the caller orders them (it owns locale-aware title comparison).
fn recommend(req: &Request) -> Vec<Recommendation> {
    if req.people.len() < 2 {
        return Vec::new();
    }
    let ratings = latest_ratings(&req.facts);

    // Titles in order of first appearance, who has logged each, and the last fact per title (it supplies the display data).
    let mut order: Vec<&str> = Vec::new();
    let mut seen_by: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut info: HashMap<&str, &Fact> = HashMap::new();
    for f in &req.facts {
        let m = f.media_id.as_str();
        info.insert(m, f);
        let users = seen_by.entry(m).or_insert_with(|| {
            order.push(m);
            Vec::new()
        });
        if !users.contains(&f.user_id.as_str()) {
            users.push(f.user_id.as_str());
        }
    }
    let in_progress: std::collections::HashSet<(&str, &str)> = req
        .watching
        .iter()
        .map(|w| (w.user_id.as_str(), w.media_id.as_str()))
        .collect();

    // Similarity is symmetric and pure, so each pair of people is computed once, on demand.
    let n = req.people.len();
    let mut sim: Vec<Option<Option<f64>>> = vec![None; n * n];
    let mut similarity = |i: usize, j: usize| -> Option<f64> {
        let key = i.min(j) * n + i.max(j);
        *sim[key].get_or_insert_with(|| {
            taste_similarity(
                ratings.get(req.people[i].id.as_str()),
                ratings.get(req.people[j].id.as_str()),
            )
            .1
        })
    };

    let mut recs = Vec::new();
    for media in order {
        let seen = &seen_by[media];
        let unseen: Vec<usize> = (0..n)
            .filter(|&i| {
                let id = req.people[i].id.as_str();
                !seen.contains(&id) && !in_progress.contains(&(id, media))
            })
            .collect();
        if unseen.is_empty() {
            continue;
        }
        // Everyone in the Cerchia who rated it, in the Cerchia order.
        let raters: Vec<(usize, f64)> = (0..n)
            .filter_map(|i| {
                ratings
                    .get(req.people[i].id.as_str())
                    .and_then(|m| m.get(media))
                    .map(|r| (i, *r))
            })
            .collect();
        if !raters.iter().any(|(_, r)| *r >= RECOMMEND_MIN) {
            continue;
        }

        let mut total = 0.0;
        for &u in &unseen {
            let mut num = 0.0;
            let mut den = 0.0;
            for &(rp, rating) in &raters {
                let signed = similarity(u, rp).map(|s| 2.0 * s - 1.0); // -1 (opposite) .. 1 (identical)
                let w = signed.map_or(NEUTRAL_WEIGHT, f64::abs);
                let value = match signed {
                    Some(s) if s < 0.0 => MIRROR - rating,
                    _ => rating,
                };
                num += w * value;
                den += w;
            }
            let prediction = if den > 0.0 {
                num / den
            } else {
                raters.iter().fold(0.0, |s, (_, r)| s + r) / raters.len() as f64
            };
            total += prediction;
        }
        let score = total / unseen.len() as f64;
        if score < RECOMMEND_MIN {
            continue;
        }

        let f = info[media];
        let mut loved: Vec<Loved> = raters
            .iter()
            .filter(|(_, r)| *r >= RECOMMEND_MIN)
            .map(|&(i, r)| Loved {
                person: req.people[i].clone(),
                rating: r,
            })
            .collect();
        loved.sort_by(|a, b| {
            b.rating
                .partial_cmp(&a.rating)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        recs.push(Recommendation {
            media_id: media.to_string(),
            title: f.title.clone(),
            poster_path: f.poster_path.clone(),
            kind: f.kind.clone(),
            year: f.year,
            score,
            unseen_by: unseen.iter().map(|&i| req.people[i].clone()).collect(),
            loved_by: loved,
        });
    }
    recs
}

/// Every pair of people with how many titles they share and their similarity, in the Cerchia's pair order (unsorted).
fn taste_pairs(req: &Request) -> Vec<Pair> {
    let ratings = latest_ratings(&req.facts);
    let mut out = Vec::new();
    for i in 0..req.people.len() {
        for j in (i + 1)..req.people.len() {
            let (common, score) = taste_similarity(
                ratings.get(req.people[i].id.as_str()),
                ratings.get(req.people[j].id.as_str()),
            );
            out.push(Pair {
                a: req.people[i].clone(),
                b: req.people[j].clone(),
                common,
                score,
            });
        }
    }
    out
}

/* ───────────── Test support and parity with the compact engine ───────────── */

pub mod tests_support {
    use crate::{Fact, Input};

    pub struct Lcg(pub u64);
    impl Lcg {
        pub fn next(&mut self) -> u32 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (self.0 >> 33) as u32
        }
    }

    /// Deterministic synthetic Cerchia: every person rates about `density` % of the titles.
    pub fn synthetic_compact(people: u32, titles: u32, density: u32) -> Input {
        let mut rng = Lcg(42);
        let mut facts = Vec::new();
        for m in 0..titles {
            for p in 0..people {
                if rng.next() % 100 < density {
                    facts.push(Fact {
                        person: Some(p),
                        media: m,
                        rating: Some((rng.next() % 10 + 1) as f64),
                    });
                }
            }
        }
        Input {
            people,
            media_count: titles,
            facts,
            watching: vec![],
        }
    }
}

#[cfg(test)]
mod parity {
    use super::tests_support::Lcg;
    use super::*;
    use std::collections::HashMap as Map;

    /// Builds the same random Cerchia for the string-based reference and for the compact engine.
    fn random_case(seed: u64) -> (Request, crate::Input, Vec<String>) {
        let mut rng = Lcg(seed);
        let people = (rng.next() % 7 + 1) as usize; // 1..=7 (includes the "fewer than 2" edge)
        let outsiders = (rng.next() % 3) as usize; // people who logged but are not in the Cerchia
        let titles = (rng.next() % 25 + 1) as usize;
        let n_facts = (rng.next() % 120) as usize;
        let ids: Vec<String> = (0..people)
            .map(|i| format!("u{i}"))
            .chain((0..outsiders).map(|i| format!("x{i}")))
            .collect();

        let mut facts = Vec::new();
        let mut cfacts = Vec::new();
        for _ in 0..n_facts {
            let u = (rng.next() as usize) % ids.len();
            let m = (rng.next() as usize) % titles;
            let rating = if rng.next().is_multiple_of(10) {
                None
            } else {
                Some((rng.next() % 10 + 1) as f64)
            };
            facts.push(Fact {
                user_id: ids[u].clone(),
                media_id: format!("m{m}"),
                rating,
                title: format!("T{m}"),
                kind: "movie".into(),
                year: Some(2000),
                poster_path: None,
            });
            cfacts.push(crate::Fact {
                person: (u < people).then_some(u as u32),
                media: m as u32,
                rating,
            });
        }
        let mut watching = Vec::new();
        let mut cwatching = Vec::new();
        for _ in 0..(rng.next() % 4) {
            let u = (rng.next() as usize) % people;
            let m = (rng.next() as usize) % titles;
            watching.push(Watching {
                user_id: ids[u].clone(),
                media_id: format!("m{m}"),
            });
            cwatching.push((u as u32, m as u32));
        }
        let req = Request {
            facts,
            people: (0..people)
                .map(|i| Person {
                    id: ids[i].clone(),
                    name: format!("P{i}"),
                })
                .collect(),
            watching,
        };
        let input = crate::Input {
            people: people as u32,
            media_count: titles as u32,
            facts: cfacts,
            watching: cwatching,
        };
        (req, input, ids)
    }

    #[test]
    fn compact_engine_matches_the_string_reference_bit_for_bit() {
        let mut compared_recs = 0usize;
        for seed in 0..4000u64 {
            let (req, input, _ids) = random_case(seed);

            let old = recommend(&req);
            let new = crate::recommend(&input);
            assert_eq!(
                old.len(),
                new.len(),
                "seed {seed}: number of recommendations"
            );
            for (o, n) in old.iter().zip(&new) {
                assert_eq!(o.media_id, format!("m{}", n.media), "seed {seed}: order");
                assert_eq!(o.score, n.score, "seed {seed}: score must be bit-identical");
                let ou: Vec<&str> = o.unseen_by.iter().map(|p| p.id.as_str()).collect();
                let nu: Vec<String> = n.unseen_by.iter().map(|p| format!("u{p}")).collect();
                assert_eq!(ou, nu, "seed {seed}: unseen_by");
                let ol: Vec<(String, f64)> = o
                    .loved_by
                    .iter()
                    .map(|l| (l.person.id.clone(), l.rating))
                    .collect();
                let nl: Vec<(String, f64)> = n
                    .loved_by
                    .iter()
                    .map(|&(p, r)| (format!("u{p}"), r))
                    .collect();
                assert_eq!(ol, nl, "seed {seed}: loved_by");
                compared_recs += 1;
            }

            let op = taste_pairs(&req);
            let np = crate::taste_pairs(&input);
            assert_eq!(op.len(), np.len(), "seed {seed}: pairs");
            for (o, n) in op.iter().zip(&np) {
                assert_eq!(
                    (o.a.id.as_str(), o.b.id.as_str()),
                    (format!("u{}", n.a).as_str(), format!("u{}", n.b).as_str())
                );
                assert_eq!(o.common, n.common, "seed {seed}: common");
                assert_eq!(o.score, n.score, "seed {seed}: pair score");
            }
        }
        assert!(
            compared_recs > 500,
            "the random cases must actually produce recommendations (got {compared_recs})"
        );
        let _ = Map::<u8, u8>::new();
    }
}
