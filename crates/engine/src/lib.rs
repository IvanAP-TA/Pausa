//! Pausa's recommendation engine.
//!
//! Same maths as the TypeScript reference (`src/lib/core/insights.ts`: `recommend`, `tastePairs`, `tasteSimilarity`) and as the
//! first Rust port in `engine/`, but on compact input: people and titles are dense `u32` indices, ratings are read straight
//! from database rows, and nothing is serialised to JSON on the hot path. In the first spike the JSON round trip cost about
//! 60 % of a call (30 people × 1 000 titles: 11.9 ms of 19.7 ms), which does not fit a 10 ms CPU budget.
//!
//! Results are bit-identical to the string-based reference kept in `reference.rs` (checked on random Cerchie by the tests):
//! same formulas, same order of floating point operations. Sorting by title is left to the caller (it owns locale rules).

/// Pairs need this many titles rated by both before a similarity means anything.
pub const MIN_COMMON: usize = 3;
/// Ratings are 1..10, so two people differ by at most 9.
pub const MAX_DIFF: f64 = 9.0;
/// What a group recommendation must score to be worth suggesting (7 = 3.5 stars).
pub const RECOMMEND_MIN: f64 = 7.0;
/// Weight for someone we cannot compare yet (counted at face value).
pub const NEUTRAL_WEIGHT: f64 = 0.5;
/// An opposite-taste "9" says the other person would give about a 2.
pub const MIRROR: f64 = 11.0;

/// One logged viewing, in chronological order (a later rating replaces an earlier one).
#[derive(Clone, Copy, Debug)]
pub struct Fact {
    /// Index into [`Input::people`]; `None` for someone who is not (any longer) in the Cerchia.
    pub person: Option<u32>,
    /// Dense title index, `0..media_count`.
    pub media: u32,
    pub rating: Option<f64>,
}

#[derive(Clone, Debug, Default)]
pub struct Input {
    /// Number of people in the Cerchia, in the Cerchia's order. Facts and `watching` refer to indices in `0..people`.
    pub people: u32,
    /// Number of distinct titles; every `Fact::media` must be below it.
    pub media_count: u32,
    pub facts: Vec<Fact>,
    /// (person, media) pairs somebody is already watching: never suggested to them.
    pub watching: Vec<(u32, u32)>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Recommendation {
    pub media: u32,
    pub score: f64,
    pub unseen_by: Vec<u32>,
    /// People who rated it at least [`RECOMMEND_MIN`], best rating first (ties keep the Cerchia's order).
    pub loved_by: Vec<(u32, f64)>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Pair {
    pub a: u32,
    pub b: u32,
    pub common: usize,
    pub score: Option<f64>,
}

/// Latest rating per person: `(media, rating)` sorted by media, one entry per title.
fn latest_ratings(input: &Input) -> Vec<Vec<(u32, f64)>> {
    let mut per: Vec<Vec<(u32, f64)>> = vec![Vec::new(); input.people as usize];
    for f in &input.facts {
        if let (Some(p), Some(r)) = (f.person, f.rating) {
            per[p as usize].push((f.media, r));
        }
    }
    for list in &mut per {
        // Stable sort keeps chronological order among equal titles; the last one wins.
        list.sort_by_key(|&(m, _)| m);
        let mut out: Vec<(u32, f64)> = Vec::with_capacity(list.len());
        for &(m, r) in list.iter() {
            match out.last_mut() {
                Some(last) if last.0 == m => last.1 = r,
                _ => out.push((m, r)),
            }
        }
        *list = out;
    }
    per
}

/// (titles both rated, 0..1 similarity or `None` until they share [`MIN_COMMON`] titles). Merge join on sorted lists.
pub fn taste_similarity(a: &[(u32, f64)], b: &[(u32, f64)]) -> (usize, Option<f64>) {
    let (mut i, mut j) = (0, 0);
    let mut sum = 0.0;
    let mut common = 0usize;
    while i < a.len() && j < b.len() {
        match a[i].0.cmp(&b[j].0) {
            std::cmp::Ordering::Less => i += 1,
            std::cmp::Ordering::Greater => j += 1,
            std::cmp::Ordering::Equal => {
                sum += (a[i].1 - b[j].1).abs();
                common += 1;
                i += 1;
                j += 1;
            }
        }
    }
    let score = if common < MIN_COMMON {
        None
    } else {
        Some(1.0 - sum / common as f64 / MAX_DIFF)
    };
    (common, score)
}

/// Group recommendations, unsorted and unlimited, titles in order of first appearance.
pub fn recommend(input: &Input) -> Vec<Recommendation> {
    let n = input.people as usize;
    if n < 2 {
        return Vec::new();
    }
    let m_count = input.media_count as usize;
    let ratings = latest_ratings(input);

    // Titles in order of first appearance, and who has logged each (bit set per title).
    let words = n.div_ceil(64);
    let mut seen_bits = vec![0u64; m_count * words];
    let mut appeared = vec![false; m_count];
    let mut order: Vec<u32> = Vec::new();
    for f in &input.facts {
        let m = f.media as usize;
        if !appeared[m] {
            appeared[m] = true;
            order.push(f.media);
        }
        if let Some(p) = f.person {
            seen_bits[m * words + (p as usize) / 64] |= 1u64 << (p % 64);
        }
    }
    let seen = |m: usize, p: usize| seen_bits[m * words + p / 64] >> (p % 64) & 1 == 1;
    // Somebody already watching a title counts as "not to suggest to them", same bit layout as `seen_bits`.
    let mut watching_bits = vec![0u64; m_count * words];
    for &(p, m) in &input.watching {
        watching_bits[m as usize * words + (p as usize) / 64] |= 1u64 << (p % 64);
    }
    let in_progress = |m: usize, p: usize| watching_bits[m * words + p / 64] >> (p % 64) & 1 == 1;

    // Everyone who rated each title, in the Cerchia's order (people ascending by construction).
    let mut raters: Vec<Vec<(u32, f64)>> = vec![Vec::new(); m_count];
    for (p, list) in ratings.iter().enumerate() {
        for &(m, r) in list {
            raters[m as usize].push((p as u32, r));
        }
    }

    // Similarity is symmetric and pure, so each pair of people is computed once, on demand.
    let mut sim: Vec<Option<Option<f64>>> = vec![None; n * n];
    let mut similarity = |i: usize, j: usize| -> Option<f64> {
        let key = i.min(j) * n + i.max(j);
        *sim[key].get_or_insert_with(|| taste_similarity(&ratings[i], &ratings[j]).1)
    };

    let mut recs = Vec::new();
    for &media in &order {
        let m = media as usize;
        // Both skips are plain `continue`s, so checking the cheaper one first does not change the result.
        let rs = &raters[m];
        if !rs.iter().any(|&(_, r)| r >= RECOMMEND_MIN) {
            continue;
        }
        let unseen: Vec<usize> = (0..n)
            .filter(|&i| !seen(m, i) && !in_progress(m, i))
            .collect();
        if unseen.is_empty() {
            continue;
        }

        let mut total = 0.0;
        for &u in &unseen {
            let mut num = 0.0;
            let mut den = 0.0;
            for &(rp, rating) in rs {
                let signed = similarity(u, rp as usize).map(|s| 2.0 * s - 1.0); // -1 (opposite) .. 1 (identical)
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
                rs.iter().fold(0.0, |s, (_, r)| s + r) / rs.len() as f64
            };
            total += prediction;
        }
        let score = total / unseen.len() as f64;
        if score < RECOMMEND_MIN {
            continue;
        }

        let mut loved: Vec<(u32, f64)> = rs
            .iter()
            .filter(|&&(_, r)| r >= RECOMMEND_MIN)
            .copied()
            .collect();
        loved.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        recs.push(Recommendation {
            media,
            score,
            unseen_by: unseen.iter().map(|&i| i as u32).collect(),
            loved_by: loved,
        });
    }
    recs
}

/// Every pair of people with how many titles they share and their similarity, in the Cerchia's pair order (unsorted).
pub fn taste_pairs(input: &Input) -> Vec<Pair> {
    let ratings = latest_ratings(input);
    let n = input.people as usize;
    let mut out = Vec::with_capacity(n * n.saturating_sub(1) / 2);
    for i in 0..n {
        for j in (i + 1)..n {
            let (common, score) = taste_similarity(&ratings[i], &ratings[j]);
            out.push(Pair {
                a: i as u32,
                b: j as u32,
                common,
                score,
            });
        }
    }
    out
}

#[cfg(test)]
mod reference;

#[cfg(test)]
mod tests {
    use super::*;

    fn f(person: u32, media: u32, rating: Option<f64>) -> Fact {
        Fact {
            person: Some(person),
            media,
            rating,
        }
    }

    #[test]
    fn needs_at_least_two_people() {
        let input = Input {
            people: 1,
            media_count: 1,
            facts: vec![f(0, 0, Some(10.0))],
            watching: vec![],
        };
        assert!(recommend(&input).is_empty());
    }

    #[test]
    fn suggests_a_loved_title_to_someone_who_has_not_seen_it() {
        let input = Input {
            people: 2,
            media_count: 1,
            facts: vec![f(0, 0, Some(10.0))],
            watching: vec![],
        };
        let recs = recommend(&input);
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].unseen_by, vec![1]);
        assert_eq!(recs[0].score, 10.0);
    }

    #[test]
    fn skips_titles_somebody_is_already_watching() {
        let input = Input {
            people: 2,
            media_count: 1,
            facts: vec![f(0, 0, Some(10.0))],
            watching: vec![(1, 0)],
        };
        assert!(recommend(&input).is_empty());
    }

    #[test]
    fn mirrors_the_taste_of_someone_with_opposite_taste() {
        let mut facts = Vec::new();
        for (i, (ra, rc)) in [(10.0, 1.0), (1.0, 10.0), (10.0, 1.0)].iter().enumerate() {
            facts.push(f(0, i as u32, Some(*ra)));
            facts.push(f(1, i as u32, Some(*rc)));
        }
        facts.push(f(0, 3, Some(10.0)));
        let input = Input {
            people: 2,
            media_count: 4,
            facts,
            watching: vec![],
        };
        assert!(
            recommend(&input).iter().all(|r| r.media != 3),
            "an opposite-taste favourite must not be recommended"
        );
    }

    #[test]
    fn similarity_needs_three_shared_titles() {
        let a = [(1, 5.0), (2, 5.0)];
        assert_eq!(taste_similarity(&a, &a), (2, None));
        let a3 = [(1, 5.0), (2, 5.0), (3, 5.0)];
        assert_eq!(taste_similarity(&a3, &a3), (3, Some(1.0)));
    }

    #[test]
    fn a_later_rating_replaces_an_earlier_one() {
        let input = Input {
            people: 2,
            media_count: 1,
            facts: vec![f(0, 0, Some(2.0)), f(0, 0, Some(9.0))],
            watching: vec![],
        };
        let recs = recommend(&input);
        assert_eq!(recs[0].score, 9.0);
    }

    /// Timing, not a pass/fail check: `cargo test -p pausa-engine --release -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn bench_by_cerchia_size() {
        for (people, titles) in [(8u32, 300u32), (30, 1000), (100, 2000)] {
            let input = reference::tests_support::synthetic_compact(people, titles, 60);
            let t = std::time::Instant::now();
            let reps = 20;
            let mut n = 0;
            for _ in 0..reps {
                n = recommend(&input).len();
            }
            let per = t.elapsed().as_secs_f64() * 1000.0 / reps as f64;
            println!("people={people:>3} titles={titles:>4} facts={:>6} recs={n:>4}  {per:.2} ms/call (native)", input.facts.len());
        }
    }
}
