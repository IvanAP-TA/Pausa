//! Importing a viewing history from another service. The file is parsed on the client (TypeScript, the v1 parsers); the server
//! receives normalised rows in small chunks. This module validates ONE row at a time (v1 refused the whole chunk of 30 for a single
//! bad row) and holds the small pure rules; the Worker does the lookups and writes.

use crate::catalog::Kind;
use crate::diary::{date_of_ms, is_valid_date, next_day};

/// Rows per request: the Worker has 50 outgoing requests per invocation, and a new title costs one to three of them.
pub const CHUNK_LIMIT: usize = 30;
pub const MAX_REVIEW_IN: usize = 20_000;
/// What is stored of a review (v1: accepted 20 000, kept 4 000).
pub const MAX_REVIEW_KEPT: usize = 4_000;
pub const MAX_TITLE: usize = 300;
pub const SOURCES: [&str; 6] = [
    "letterboxd",
    "imdb",
    "trakt",
    "cinemaniac",
    "anilist",
    "mal",
];

/// One normalised row as the client sends it. Unknown fields are ignored (v1 dropped cover, localized titles and runtime: the
/// server looks those up itself).
#[derive(Clone, Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRow {
    pub kind: String,
    pub title: String,
    pub year: Option<i64>,
    /// Half stars 1..=10.
    pub rating: Option<i64>,
    pub watched_on: Option<String>,
    #[serde(default)]
    pub rewatch: bool,
    pub review: Option<String>,
    pub letterboxd_uri: Option<String>,
    pub anilist_id: Option<i64>,
    pub mal_id: Option<i64>,
    pub tmdb_id: Option<i64>,
    pub imdb_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Clean {
    pub kind: Kind,
    pub title: String,
    pub year: Option<i64>,
    pub rating: Option<u8>,
    pub watched_on: Option<String>,
    pub rewatch: bool,
    pub review: Option<String>,
    pub letterboxd_uri: Option<String>,
    pub anilist_id: Option<i64>,
    pub mal_id: Option<i64>,
    pub tmdb_id: Option<i64>,
    pub imdb_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reject {
    /// Empty or over 300 characters.
    Title,
    Kind,
    /// A review beyond what any export holds.
    Review,
}

impl Reject {
    pub fn code(self) -> &'static str {
        match self {
            Reject::Title => "title",
            Reject::Kind => "kind",
            Reject::Review => "review",
        }
    }
}

fn positive(v: Option<i64>) -> Option<i64> {
    v.filter(|n| *n > 0 && *n < 1_000_000_000_000)
}

/// `https://boxd.it/<alphanumerics>`, at most 60 characters: the only Letterboxd link kept as an identity.
pub fn valid_letterboxd_uri(u: &str) -> bool {
    u.len() <= 60
        && u.strip_prefix("https://boxd.it/")
            .is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_alphanumeric()))
}

/// `tt` and 1..=10 digits.
pub fn valid_imdb_id(i: &str) -> bool {
    i.strip_prefix("tt")
        .is_some_and(|d| (1..=10).contains(&d.len()) && d.bytes().all(|b| b.is_ascii_digit()))
}

/// Validates one row. A bad *optional* field (year, rating, date, link) is dropped, not fatal: the row is still worth importing.
/// A row without a usable title or kind is rejected on its own. `today` is `YYYY-MM-DD` (UTC).
pub fn clean_row(r: &ImportRow, today: &str) -> Result<Clean, Reject> {
    let kind = Kind::parse(r.kind.trim()).ok_or(Reject::Kind)?;
    let title = r.title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE {
        return Err(Reject::Title);
    }
    if r.review
        .as_ref()
        .is_some_and(|v| v.chars().count() > MAX_REVIEW_IN)
    {
        return Err(Reject::Review);
    }
    let review = r
        .review
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.chars().take(MAX_REVIEW_KEPT).collect::<String>());
    // A date in the future (beyond one day of slack for timezones) is a data error: the viewing counts as undated.
    let watched_on = r
        .watched_on
        .as_deref()
        .map(str::trim)
        .filter(|d| is_valid_date(d) && *d <= next_day(today).as_str())
        .map(str::to_string);
    Ok(Clean {
        kind,
        title: title.to_string(),
        year: r.year.filter(|y| (1870..=2200).contains(y)),
        rating: r.rating.filter(|v| (1..=10).contains(v)).map(|v| v as u8),
        watched_on,
        rewatch: r.rewatch,
        review,
        letterboxd_uri: r.letterboxd_uri.clone().filter(|u| valid_letterboxd_uri(u)),
        anilist_id: positive(r.anilist_id),
        mal_id: positive(r.mal_id),
        tmdb_id: positive(r.tmdb_id),
        imdb_id: r.imdb_id.clone().filter(|i| valid_imdb_id(i)),
    })
}

/// When an imported viewing "happened" for ordering in feeds: noon UTC on its day (v1 convention, so years of history do not
/// jump to the top of a Cerchia's feed). Rows without a date are today at noon.
pub fn created_at_for(watched_on: &str) -> i64 {
    crate::diary::ms_of_date(watched_on).map_or(0, |ms| ms + 12 * 3_600_000)
}

pub fn today_of(now_ms: i64) -> String {
    date_of_ms(now_ms)
}

/// What a chunk did, for the progress bar and the final summary.
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Counts {
    pub imported: u32,
    pub already: u32,
    pub new_titles: u32,
    pub skipped_undated: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    const TODAY: &str = "2026-11-25";

    fn row() -> ImportRow {
        ImportRow {
            kind: "movie".into(),
            title: "  Amélie ".into(),
            year: Some(2001),
            rating: Some(9),
            watched_on: Some("2026-01-02".into()),
            ..Default::default()
        }
    }

    #[test]
    fn a_good_row_is_cleaned() {
        let c = clean_row(&row(), TODAY).unwrap();
        assert_eq!(
            (
                c.kind,
                c.title.as_str(),
                c.year,
                c.rating,
                c.watched_on.as_deref()
            ),
            (
                Kind::Movie,
                "Amélie",
                Some(2001),
                Some(9),
                Some("2026-01-02")
            )
        );
    }

    #[test]
    fn a_row_without_a_usable_title_or_kind_is_rejected_alone() {
        let mut r = row();
        r.title = "   ".into();
        assert_eq!(clean_row(&r, TODAY), Err(Reject::Title));
        r.title = "x".repeat(301);
        assert_eq!(clean_row(&r, TODAY), Err(Reject::Title));
        let mut r = row();
        r.kind = "book".into();
        assert_eq!(clean_row(&r, TODAY), Err(Reject::Kind));
        let mut r = row();
        r.review = Some("x".repeat(20_001));
        assert_eq!(clean_row(&r, TODAY), Err(Reject::Review));
        assert_eq!(Reject::Title.code(), "title");
    }

    #[test]
    fn a_bad_optional_field_is_dropped_not_fatal() {
        let mut r = row();
        r.year = Some(1500);
        r.rating = Some(11);
        r.watched_on = Some("2026-02-30".into());
        r.letterboxd_uri = Some("https://evil.example/x".into());
        r.imdb_id = Some("nm0000001".into());
        r.tmdb_id = Some(-4);
        r.anilist_id = Some(0);
        let c = clean_row(&r, TODAY).unwrap();
        assert_eq!(
            (
                c.year,
                c.rating,
                c.watched_on,
                c.letterboxd_uri,
                c.imdb_id,
                c.tmdb_id,
                c.anilist_id
            ),
            (None, None, None, None, None, None, None)
        );
        assert_eq!(c.title, "Amélie", "the row itself is kept");
    }

    #[test]
    fn dates_in_the_future_make_the_viewing_undated() {
        let mut r = row();
        r.watched_on = Some("2026-11-26".into());
        assert!(
            clean_row(&r, TODAY).unwrap().watched_on.is_some(),
            "one day of slack for timezones"
        );
        r.watched_on = Some("2026-12-31".into());
        assert_eq!(clean_row(&r, TODAY).unwrap().watched_on, None);
    }

    #[test]
    fn reviews_are_trimmed_and_cut_to_4000_characters() {
        let mut r = row();
        r.review = Some("  ".into());
        assert_eq!(clean_row(&r, TODAY).unwrap().review, None);
        r.review = Some("è".repeat(10_000));
        assert_eq!(
            clean_row(&r, TODAY)
                .unwrap()
                .review
                .unwrap()
                .chars()
                .count(),
            4000
        );
    }

    #[test]
    fn identity_links_have_strict_shapes() {
        assert!(valid_letterboxd_uri("https://boxd.it/1a2B"));
        for bad in [
            "http://boxd.it/1",
            "https://boxd.it/",
            "https://boxd.it/a/b",
            "https://boxd.it/ab c",
            &format!("https://boxd.it/{}", "a".repeat(60)),
        ] {
            assert!(!valid_letterboxd_uri(bad), "{bad}");
        }
        assert!(valid_imdb_id("tt0133093") && valid_imdb_id("tt1"));
        for bad in ["tt", "tt12345678901", "0133093", "ttx1", "TT1"] {
            assert!(!valid_imdb_id(bad), "{bad}");
        }
    }

    #[test]
    fn imported_viewings_sort_at_noon_of_their_day() {
        assert_eq!(created_at_for("1970-01-02"), 86_400_000 + 12 * 3_600_000);
        assert_eq!(created_at_for("garbage"), 0);
        assert_eq!(today_of(0), "1970-01-01");
        assert_eq!(SOURCES.len(), 6);
    }
}
