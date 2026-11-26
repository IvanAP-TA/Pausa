//! "For you": what to watch next, from what this person loved. The candidates come from TMDB's "recommendations" for each loved
//! title; here we pick the seeds' scoring and rank what comes back. Titles are not stored until somebody picks one.

use crate::catalog::{tmdb_candidate, Candidate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use ts_rs::TS;

/// A rating of 8 or more (four stars) makes a title a seed.
pub const SEED_MIN_RATING: i64 = 8;
/// TMDB also recommends obscure TV movies and shorts: only titles people actually know.
pub const MIN_VOTES: i64 = 500;
/// Seeds per request: each one is a catalogue call.
pub const MAX_SEEDS: usize = 5;

/// One loved title that points at candidates.
#[derive(Clone, Debug, PartialEq)]
pub struct Seed {
    pub media_id: String,
    pub title: String,
    pub rating: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Because {
    pub media_id: String,
    pub title: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ForYouPick {
    /// `tmdb:movie:603`: pass it to `POST /api/logs` as `mediaKey` or to the title search flow.
    pub key: String,
    pub kind: String,
    pub title: String,
    pub year: Option<i64>,
    pub poster_path: Option<String>,
    pub score: f64,
    pub because: Vec<Because>,
    /// Which of the viewer's own streaming services carry it (empty when they set none, or it is on none of them).
    #[serde(default)]
    pub on: Vec<crate::streaming::Provider>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ForYou {
    /// False when no catalogue is configured: the client says "off", not "nothing to suggest".
    pub enabled: bool,
    /// How many loved titles were used.
    pub seeded: u32,
    pub picks: Vec<ForYouPick>,
}

/// `GET /3/{movie|tv}/{id}/recommendations`: with a poster and enough votes, at most 12, as candidates.
pub fn candidates_from_recommendations(body: &Value, tv: bool) -> Vec<Candidate> {
    let media_type = if tv { "tv" } else { "movie" };
    body.get("results")
        .and_then(Value::as_array)
        .map(|rs| {
            rs.iter()
                .filter(|r| {
                    r.get("poster_path").is_some_and(|p| p.is_string())
                        && r.get("vote_count").and_then(Value::as_i64).unwrap_or(0) >= MIN_VOTES
                })
                .filter_map(|r| {
                    let mut r = r.clone();
                    r.as_object_mut()?
                        .insert("media_type".into(), Value::String(media_type.into()));
                    tmdb_candidate(&r)
                })
                .take(12)
                .collect()
        })
        .unwrap_or_default()
}

/// Merges the candidates of every seed. A candidate scores more the more you loved the titles that point to it, and more when
/// several of them do; earlier in TMDB's list counts a little more. Anything in `exclude` (keys of titles already logged) is
/// never suggested. Best first, then more seeds, then title.
pub fn rank_discovery(
    input: &[(Seed, Vec<Candidate>)],
    exclude: &HashSet<String>,
    limit: usize,
) -> Vec<ForYouPick> {
    let mut by_key: HashMap<String, ForYouPick> = HashMap::new();
    for (seed, candidates) in input {
        let weight = (seed.rating - 5) as f64 / 5.0; // 8 -> 0.6, 10 -> 1
        for (i, c) in candidates.iter().enumerate() {
            if exclude.contains(&c.key) {
                continue;
            }
            let e = by_key.entry(c.key.clone()).or_insert_with(|| ForYouPick {
                key: c.key.clone(),
                kind: c.kind.as_str().to_string(),
                title: c.title.clone(),
                year: c.year,
                poster_path: c.poster_path.clone(),
                score: 0.0,
                because: Vec::new(),
                on: Vec::new(),
            });
            e.score += weight / (1.0 + i as f64 * 0.08);
            if !e.because.iter().any(|b| b.media_id == seed.media_id) {
                e.because.push(Because {
                    media_id: seed.media_id.clone(),
                    title: seed.title.clone(),
                });
            }
        }
    }
    let mut out: Vec<ForYouPick> = by_key.into_values().collect();
    out.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then(b.because.len().cmp(&a.because.len()))
            .then(a.title.cmp(&b.title))
            .then(a.key.cmp(&b.key))
    });
    out.truncate(limit);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::Kind;
    use serde_json::json;

    fn cand(key: &str, title: &str) -> Candidate {
        Candidate {
            key: key.into(),
            kind: Kind::Movie,
            title: title.into(),
            year: Some(2000),
            poster_path: Some("/p.jpg".into()),
        }
    }
    fn seed(id: &str, rating: i64) -> Seed {
        Seed {
            media_id: id.into(),
            title: format!("Seed {id}"),
            rating,
        }
    }

    #[test]
    fn recommendations_need_a_poster_and_enough_votes() {
        let body = json!({"results": [
            {"id": 1, "title": "Known", "release_date": "2001-01-01", "poster_path": "/a.jpg", "vote_count": 900, "genre_ids": []},
            {"id": 2, "title": "Obscure", "poster_path": "/b.jpg", "vote_count": 10},
            {"id": 3, "title": "No poster", "poster_path": null, "vote_count": 5000},
            {"id": 4, "title": "Adult", "adult": true, "poster_path": "/c.jpg", "vote_count": 5000}]});
        let got = candidates_from_recommendations(&body, false);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].key, "tmdb:movie:1");
        let tv = candidates_from_recommendations(
            &json!({"results": [{"id": 9, "name": "Show", "first_air_date": "2010-05-05", "poster_path": "/s.jpg", "vote_count": 800}]}),
            true,
        );
        assert_eq!(tv[0].key, "tmdb:tv:9");
    }

    #[test]
    fn more_loved_seeds_and_more_seeds_pointing_at_it_score_higher() {
        let input = vec![
            (
                seed("a", 10),
                vec![cand("tmdb:movie:1", "Uno"), cand("tmdb:movie:2", "Due")],
            ),
            (
                seed("b", 8),
                vec![cand("tmdb:movie:2", "Due"), cand("tmdb:movie:3", "Tre")],
            ),
        ];
        let got = rank_discovery(&input, &HashSet::new(), 8);
        // Due: 1/1.08 + 0.6/1 = 1.526; Uno: 1.0; Tre: 0.6/1.08 = 0.556
        assert_eq!(
            got.iter().map(|p| p.key.as_str()).collect::<Vec<_>>(),
            ["tmdb:movie:2", "tmdb:movie:1", "tmdb:movie:3"]
        );
        assert_eq!(got[0].because.len(), 2);
        assert!((got[0].score - (1.0 / 1.08 + 0.6)).abs() < 1e-9);
    }

    #[test]
    fn logged_titles_are_never_suggested_and_the_limit_holds() {
        let input = vec![(
            seed("a", 9),
            (1..=10)
                .map(|i| cand(&format!("tmdb:movie:{i}"), &format!("T{i:02}")))
                .collect(),
        )];
        let exclude: HashSet<String> = ["tmdb:movie:1".to_string()].into();
        let got = rank_discovery(&input, &exclude, 3);
        assert_eq!(got.len(), 3);
        assert!(got.iter().all(|p| p.key != "tmdb:movie:1"));
        assert_eq!(got[0].key, "tmdb:movie:2");
        assert!(rank_discovery(&[], &exclude, 8).is_empty());
    }

    #[test]
    fn ties_go_to_the_title() {
        let input = vec![
            (seed("a", 10), vec![cand("tmdb:movie:5", "Zeta")]),
            (seed("b", 10), vec![cand("tmdb:movie:6", "Alfa")]),
        ];
        let got = rank_discovery(&input, &HashSet::new(), 8);
        assert_eq!(got[0].title, "Alfa");
    }
}
