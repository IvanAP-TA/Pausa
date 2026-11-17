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

/* ───────────── Wire types ───────────── */

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

/* ───────────── The maths ───────────── */

type Ratings<'a> = HashMap<&'a str, HashMap<&'a str, f64>>;

/// Latest rating per person per title (facts are chronological: a later rating replaces an earlier one).
fn latest_ratings(facts: &[Fact]) -> Ratings<'_> {
    let mut out: Ratings = HashMap::new();
    for f in facts {
        if let Some(r) = f.rating {
            out.entry(f.user_id.as_str()).or_default().insert(f.media_id.as_str(), r);
        }
    }
    out
}

/// (titles both rated, 0..1 similarity or None until they share MIN_COMMON titles).
fn taste_similarity(a: Option<&HashMap<&str, f64>>, b: Option<&HashMap<&str, f64>>) -> (usize, Option<f64>) {
    let (Some(a), Some(b)) = (a, b) else { return (0, None) };
    let mut sum = 0.0;
    let mut common = 0usize;
    for (media, ra) in a {
        if let Some(rb) = b.get(media) {
            sum += (ra - rb).abs();
            common += 1;
        }
    }
    let score = if common < MIN_COMMON { None } else { Some(1.0 - sum / common as f64 / MAX_DIFF) };
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
    let in_progress: std::collections::HashSet<(&str, &str)> =
        req.watching.iter().map(|w| (w.user_id.as_str(), w.media_id.as_str())).collect();

    // Similarity is symmetric and pure, so each pair of people is computed once, on demand.
    let n = req.people.len();
    let mut sim: Vec<Option<Option<f64>>> = vec![None; n * n];
    let mut similarity = |i: usize, j: usize| -> Option<f64> {
        let key = i.min(j) * n + i.max(j);
        *sim[key].get_or_insert_with(|| {
            taste_similarity(ratings.get(req.people[i].id.as_str()), ratings.get(req.people[j].id.as_str())).1
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
            .filter_map(|i| ratings.get(req.people[i].id.as_str()).and_then(|m| m.get(media)).map(|r| (i, *r)))
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
            .map(|&(i, r)| Loved { person: req.people[i].clone(), rating: r })
            .collect();
        loved.sort_by(|a, b| b.rating.partial_cmp(&a.rating).unwrap_or(std::cmp::Ordering::Equal));
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
            let (common, score) = taste_similarity(ratings.get(req.people[i].id.as_str()), ratings.get(req.people[j].id.as_str()));
            out.push(Pair { a: req.people[i].clone(), b: req.people[j].clone(), common, score });
        }
    }
    out
}

/* ───────────── C interface ───────────── */

pub const OP_RECOMMEND: u32 = 1;
pub const OP_TASTE_PAIRS: u32 = 2;

/// Runs one operation on a JSON request and returns the JSON reply (an `{"error": ...}` object on bad input).
pub fn handle(op: u32, input: &[u8]) -> Vec<u8> {
    let req: Request = match serde_json::from_slice(input) {
        Ok(r) => r,
        Err(e) => return serde_json::to_vec(&serde_json::json!({ "error": e.to_string() })).unwrap_or_default(),
    };
    let reply = match op {
        OP_RECOMMEND => serde_json::to_vec(&recommend(&req)),
        OP_TASTE_PAIRS => serde_json::to_vec(&taste_pairs(&req)),
        _ => serde_json::to_vec(&serde_json::json!({ "error": "unknown operation" })),
    };
    reply.unwrap_or_default()
}

/// Reserves `len` bytes in the module's memory for the caller to write into.
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}

/// Releases memory from `alloc` or from a reply (`len` must be the size it was created with).
///
/// # Safety
/// `ptr` and `len` must come from `alloc` (or `run`, whose reply is `4 + payload length` bytes) and not be freed twice.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}

/// Runs `op` on the JSON at `ptr..ptr+len`. The reply is `[u32 little-endian length][JSON bytes]`; free it with `dealloc(ptr, 4 + length)`.
///
/// # Safety
/// `ptr..ptr+len` must be readable memory obtained from `alloc`.
#[no_mangle]
pub unsafe extern "C" fn run(op: u32, ptr: *const u8, len: usize) -> *mut u8 {
    let input = std::slice::from_raw_parts(ptr, len);
    let body = handle(op, input);
    let mut out = Vec::with_capacity(4 + body.len());
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    Box::into_raw(out.into_boxed_slice()) as *mut u8
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(json: &str) -> Request {
        serde_json::from_str(json).expect("valid request")
    }

    fn fact(user: &str, media: &str, rating: Option<f64>) -> String {
        let r = rating.map_or("null".to_string(), |r| r.to_string());
        format!(r#"{{"userId":"{user}","mediaId":"{media}","rating":{r},"title":"T {media}","kind":"movie","year":2000,"posterPath":null}}"#)
    }

    fn people(ids: &[&str]) -> String {
        ids.iter().map(|i| format!(r#"{{"id":"{i}","name":"{i}"}}"#)).collect::<Vec<_>>().join(",")
    }

    #[test]
    fn needs_at_least_two_people() {
        let r = req(&format!(r#"{{"facts":[{}],"people":[{}]}}"#, fact("a", "m1", Some(10.0)), people(&["a"])));
        assert!(recommend(&r).is_empty());
    }

    #[test]
    fn suggests_a_loved_title_to_someone_who_has_not_seen_it() {
        let r = req(&format!(r#"{{"facts":[{}],"people":[{}]}}"#, fact("a", "m1", Some(10.0)), people(&["a", "b"])));
        let recs = recommend(&r);
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].unseen_by.len(), 1);
        assert_eq!(recs[0].unseen_by[0].id, "b");
        assert_eq!(recs[0].score, 10.0); // not comparable yet: face value
    }

    #[test]
    fn skips_titles_somebody_is_already_watching() {
        let r = req(&format!(
            r#"{{"facts":[{}],"people":[{}],"watching":[{{"userId":"b","mediaId":"m1"}}]}}"#,
            fact("a", "m1", Some(10.0)),
            people(&["a", "b"])
        ));
        assert!(recommend(&r).is_empty());
    }

    #[test]
    fn mirrors_the_taste_of_someone_with_opposite_taste() {
        // a and c rate the same three titles in opposite ways, so a's 10 on m9 means c would give about a 1.
        let mut facts = Vec::new();
        for (i, (ra, rc)) in [(10.0, 1.0), (1.0, 10.0), (10.0, 1.0)].iter().enumerate() {
            facts.push(fact("a", &format!("m{i}"), Some(*ra)));
            facts.push(fact("c", &format!("m{i}"), Some(*rc)));
        }
        facts.push(fact("a", "m9", Some(10.0)));
        let r = req(&format!(r#"{{"facts":[{}],"people":[{}]}}"#, facts.join(","), people(&["a", "c"])));
        let recs = recommend(&r);
        assert!(recs.iter().all(|x| x.media_id != "m9"), "an opposite-taste favourite must not be recommended");
    }

    #[test]
    fn similarity_needs_three_shared_titles() {
        let a: HashMap<&str, f64> = [("m1", 5.0), ("m2", 5.0)].into_iter().collect();
        let b = a.clone();
        assert_eq!(taste_similarity(Some(&a), Some(&b)), (2, None));
        let a3: HashMap<&str, f64> = [("m1", 5.0), ("m2", 5.0), ("m3", 5.0)].into_iter().collect();
        assert_eq!(taste_similarity(Some(&a3), Some(&a3.clone())), (3, Some(1.0)));
    }

    #[test]
    fn bad_input_gives_an_error_reply_not_a_crash() {
        let out = String::from_utf8(handle(OP_RECOMMEND, b"not json")).unwrap();
        assert!(out.contains("error"));
        let out = String::from_utf8(handle(99, br#"{"people":[]}"#)).unwrap();
        assert!(out.contains("unknown operation"));
    }
}
