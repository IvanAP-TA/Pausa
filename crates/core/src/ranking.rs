//! The Cerchia's ranking and the small insights built on ratings. Ported from `lib/core/ranking.ts` and `lib/core/insights.ts`.
//! Ratings are half stars 1..=10; the average is on the same scale. A person counts once per title, with their latest rating.

use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sort {
    Avg,
    Votes,
    Year,
    Recent,
    Title,
}

impl Sort {
    pub fn parse(s: Option<&str>) -> Sort {
        match s {
            Some("votes") => Sort::Votes,
            Some("year") => Sort::Year,
            Some("recent") => Sort::Recent,
            Some("title") => Sort::Title,
            _ => Sort::Avg,
        }
    }
}

/// One title as the Cerchia sees it.
#[derive(Clone, Debug)]
pub struct Title {
    pub media_id: String,
    pub title: String,
    pub kind: String,
    pub year: Option<i64>,
    pub poster_path: Option<String>,
    /// Latest rating of each person who rated it: `(user_id, rating)`.
    pub ratings: Vec<(String, i64)>,
    pub watched_by: Vec<String>,
    /// `YYYY-MM-DD` of the most recent viewing.
    pub last_watched: String,
}

#[derive(Clone, Debug, Default)]
pub struct Filters {
    pub q: Option<String>,
    pub kind: Option<String>,
    pub year_from: Option<i64>,
    pub year_to: Option<i64>,
    /// At least this many people rated it (default 1: unrated titles are left out).
    pub min_votes: Option<usize>,
    /// Only titles every member has watched.
    pub everyone: bool,
    /// Only titles this person watched.
    pub by: Option<String>,
    pub sort: Option<Sort>,
}

#[derive(Clone, Debug)]
pub struct Ranked {
    pub title: Title,
    pub avg: Option<f64>,
    pub votes: usize,
}

/// Lower case with the common Latin accents removed, so "Amélie" is found by "amelie".
pub fn fold(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => {
                'a'
            }
            'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => 'e',
            'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => 'i',
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' => 'o',
            'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => 'u',
            'ñ' | 'Ñ' => 'n',
            'ç' | 'Ç' => 'c',
            other => other,
        })
        .flat_map(char::to_lowercase)
        .collect()
}

fn by_name(a: &Title, b: &Title) -> std::cmp::Ordering {
    fold(&a.title).cmp(&fold(&b.title))
}

pub fn rank(titles: Vec<Title>, people: &[String], f: &Filters) -> Vec<Ranked> {
    let q =
        f.q.as_deref()
            .map(|q| fold(q.trim()))
            .filter(|q| !q.is_empty());
    let mut out: Vec<Ranked> = titles
        .into_iter()
        .map(|t| {
            let votes = t.ratings.len();
            let avg = (votes > 0)
                .then(|| t.ratings.iter().map(|r| r.1 as f64).sum::<f64>() / votes as f64);
            Ranked {
                title: t,
                avg,
                votes,
            }
        })
        .filter(|r| {
            let t = &r.title;
            q.as_ref()
                .is_none_or(|q| fold(&t.title).contains(q.as_str()))
                && f.kind.as_ref().is_none_or(|k| &t.kind == k)
                && f.year_from.is_none_or(|y| t.year.is_some_and(|ty| ty >= y))
                && f.year_to.is_none_or(|y| t.year.is_some_and(|ty| ty <= y))
                && r.votes >= f.min_votes.unwrap_or(1)
                && (!f.everyone || people.iter().all(|p| t.watched_by.contains(p)))
                && f.by.as_ref().is_none_or(|b| t.watched_by.contains(b))
        })
        .collect();
    let desc = |a: f64, b: f64| b.partial_cmp(&a).unwrap_or(std::cmp::Ordering::Equal);
    out.sort_by(|a, b| match f.sort.unwrap_or(Sort::Avg) {
        Sort::Votes => b
            .votes
            .cmp(&a.votes)
            .then(desc(a.avg.unwrap_or(0.0), b.avg.unwrap_or(0.0)))
            .then(by_name(&a.title, &b.title)),
        Sort::Year => b
            .title
            .year
            .unwrap_or(0)
            .cmp(&a.title.year.unwrap_or(0))
            .then(by_name(&a.title, &b.title)),
        Sort::Recent => b
            .title
            .last_watched
            .cmp(&a.title.last_watched)
            .then(by_name(&a.title, &b.title)),
        Sort::Title => by_name(&a.title, &b.title),
        Sort::Avg => desc(a.avg.unwrap_or(-1.0), b.avg.unwrap_or(-1.0))
            .then(b.votes.cmp(&a.votes))
            .then(by_name(&a.title, &b.title)),
    });
    out
}

/// Oldest and newest release year among the titles (for the filter menus).
pub fn year_span(titles: &[Title]) -> Option<(i64, i64)> {
    let ys: Vec<i64> = titles.iter().filter_map(|t| t.year).collect();
    Some((*ys.iter().min()?, *ys.iter().max()?))
}

/// "Agree" and "split": titles at least two members rated. Agree: average at least 8 and spread (max − min) at most 2. Split:
/// spread at least 4. Three of each, best/most divided first.
pub struct Disagreements {
    pub agree: Vec<usize>,
    pub split: Vec<usize>,
}

pub fn agree_and_split(titles: &[Title]) -> Disagreements {
    let mut agree: Vec<(usize, f64)> = Vec::new();
    let mut split: Vec<(usize, i64)> = Vec::new();
    for (i, t) in titles.iter().enumerate() {
        if t.ratings.len() < 2 {
            continue;
        }
        let max = t.ratings.iter().map(|r| r.1).max().unwrap_or(0);
        let min = t.ratings.iter().map(|r| r.1).min().unwrap_or(0);
        let avg = t.ratings.iter().map(|r| r.1 as f64).sum::<f64>() / t.ratings.len() as f64;
        if avg >= 8.0 && max - min <= 2 {
            agree.push((i, avg));
        }
        if max - min >= 4 {
            split.push((i, max - min));
        }
    }
    agree.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(by_name(&titles[a.0], &titles[b.0]))
    });
    split.sort_by(|a, b| b.1.cmp(&a.1).then(by_name(&titles[a.0], &titles[b.0])));
    Disagreements {
        agree: agree.into_iter().take(3).map(|x| x.0).collect(),
        split: split.into_iter().take(3).map(|x| x.0).collect(),
    }
}

/// Counts per key, most frequent first (ties: smaller key first). Used for "busiest month", "top platform".
pub fn most_common<'a>(items: impl IntoIterator<Item = &'a str>) -> Option<(String, usize)> {
    let mut m: HashMap<&str, usize> = HashMap::new();
    for i in items {
        *m.entry(i).or_default() += 1;
    }
    m.into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(a.0)))
        .map(|(k, n)| (k.to_string(), n))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(
        id: &str,
        title: &str,
        kind: &str,
        year: i64,
        ratings: &[(&str, i64)],
        watched: &[&str],
        last: &str,
    ) -> Title {
        Title {
            media_id: id.into(),
            title: title.into(),
            kind: kind.into(),
            year: Some(year),
            poster_path: None,
            ratings: ratings.iter().map(|(u, r)| (u.to_string(), *r)).collect(),
            watched_by: watched.iter().map(|s| s.to_string()).collect(),
            last_watched: last.into(),
        }
    }

    fn sample() -> Vec<Title> {
        vec![
            t(
                "a",
                "Amélie",
                "movie",
                2001,
                &[("u1", 9), ("u2", 7)],
                &["u1", "u2", "u3"],
                "2026-01-10",
            ),
            t(
                "b",
                "Berserk",
                "anime",
                1997,
                &[("u1", 10), ("u2", 10), ("u3", 9)],
                &["u1", "u2", "u3"],
                "2026-03-01",
            ),
            t(
                "c",
                "Cars",
                "movie",
                2006,
                &[("u2", 4)],
                &["u2"],
                "2026-02-01",
            ),
            t("d", "Dune", "movie", 2021, &[], &["u1"], "2026-04-01"),
            t(
                "e",
                "Eva",
                "anime",
                1995,
                &[("u1", 8), ("u2", 8)],
                &["u1", "u2"],
                "2026-02-15",
            ),
        ]
    }

    fn ids(r: &[Ranked]) -> Vec<&str> {
        r.iter().map(|x| x.title.media_id.as_str()).collect()
    }

    fn people() -> Vec<String> {
        ["u1", "u2", "u3"].iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn average_is_the_plain_mean_and_unrated_titles_are_left_out() {
        let r = rank(sample(), &people(), &Filters::default());
        assert_eq!(ids(&r), ["b", "a", "e", "c"], "avg desc; Amélie and Eva tie at 8.0 with two votes each, so the name decides; Dune has no votes");
        assert_eq!(r[0].votes, 3);
        assert!((r[0].avg.unwrap() - 29.0 / 3.0).abs() < 1e-12);
        let all = rank(
            sample(),
            &people(),
            &Filters {
                min_votes: Some(0),
                ..Default::default()
            },
        );
        assert_eq!(all.len(), 5);
        assert_eq!(all.last().unwrap().avg, None, "unrated sorts last");
    }

    #[test]
    fn sorts() {
        let f = |s| Filters {
            sort: Some(s),
            min_votes: Some(0),
            ..Default::default()
        };
        assert_eq!(
            ids(&rank(sample(), &people(), &f(Sort::Votes))),
            ["b", "a", "e", "c", "d"]
        );
        assert_eq!(
            ids(&rank(sample(), &people(), &f(Sort::Year))),
            ["d", "c", "a", "b", "e"]
        );
        assert_eq!(
            ids(&rank(sample(), &people(), &f(Sort::Recent))),
            ["d", "b", "e", "c", "a"]
        );
        assert_eq!(
            ids(&rank(sample(), &people(), &f(Sort::Title))),
            ["a", "b", "c", "d", "e"]
        );
        assert_eq!(Sort::parse(Some("year")), Sort::Year);
        assert_eq!(Sort::parse(Some("nonsense")), Sort::Avg);
    }

    #[test]
    fn filters() {
        let run = |mut f: Filters| {
            f.min_votes.get_or_insert(0);
            ids(&rank(sample(), &people(), &f)).join("")
        };
        assert_eq!(
            run(Filters {
                kind: Some("anime".into()),
                ..Default::default()
            }),
            "be"
        );
        assert_eq!(
            run(Filters {
                year_from: Some(2000),
                year_to: Some(2010),
                ..Default::default()
            }),
            "ac"
        );
        assert_eq!(
            run(Filters {
                q: Some("amelie".into()),
                ..Default::default()
            }),
            "a",
            "accent-insensitive search"
        );
        assert_eq!(
            run(Filters {
                everyone: true,
                ..Default::default()
            }),
            "ba"
        );
        assert_eq!(
            run(Filters {
                by: Some("u3".into()),
                ..Default::default()
            }),
            "ba"
        );
        assert_eq!(
            run(Filters {
                min_votes: Some(2),
                ..Default::default()
            }),
            "bae"
        );
        assert_eq!(year_span(&sample()), Some((1995, 2021)));
        assert_eq!(year_span(&[]), None);
    }

    #[test]
    fn agree_and_split_lists() {
        let ts = sample();
        let d = agree_and_split(&ts);
        assert_eq!(
            d.agree
                .iter()
                .map(|&i| ts[i].media_id.as_str())
                .collect::<Vec<_>>(),
            ["b", "a", "e"],
            "avg >= 8 and spread <= 2 (Amélie is exactly 8.0 / 2), best first, ties by name"
        );
        assert!(d.split.is_empty());
        let mut more = sample();
        more.push(t(
            "f",
            "Flop",
            "movie",
            2020,
            &[("u1", 10), ("u2", 2)],
            &["u1", "u2"],
            "2026-01-01",
        ));
        let d = agree_and_split(&more);
        assert_eq!(
            d.split
                .iter()
                .map(|&i| more[i].media_id.as_str())
                .collect::<Vec<_>>(),
            ["f"]
        );
        assert!(
            agree_and_split(&[t(
                "x",
                "Solo",
                "movie",
                2000,
                &[("u1", 9)],
                &["u1"],
                "2026-01-01"
            )])
            .agree
            .is_empty(),
            "needs two voters"
        );
    }

    #[test]
    fn most_common_breaks_ties_alphabetically() {
        assert_eq!(
            most_common(["netflix", "prime", "netflix"]),
            Some(("netflix".into(), 2))
        );
        assert_eq!(most_common(["b", "a"]), Some(("a".into(), 1)));
        assert_eq!(most_common(std::iter::empty::<&str>()), None);
    }
}
