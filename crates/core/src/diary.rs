//! Logging a viewing: validation and the small pure rules around it. Ported from `lib/actions.ts` `logInput` and
//! `lib/core/{content,episodes,progress}.ts`, with the gaps v1 left (future dates, per-episode ratings) closed.

pub const MAX_REVIEW: usize = 4000;
pub const MAX_PLATFORM: usize = 60;
pub const MAX_WATCHED_WITH: usize = 20;
pub const MAX_OVERVIEW: usize = 1200;
pub const MAX_COMMENT: usize = 2000;
pub const MAX_REPORT_NOTE: usize = 500;
pub const MAX_EXCERPT: usize = 280;
/// The five reactions (the emoji is the stored key; the app draws line icons).
pub const REACTIONS: [&str; 5] = ["😭", "🍿", "❤️", "😂", "🤯"];
pub const REPORT_REASONS: [&str; 4] = ["spam", "abuse", "privacy", "other"];

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LogError {
    Date,
    Rating,
    Review,
    Platform,
    Season,
    Episode,
    TooManyPeople,
}

/// What a client may send for a viewing (already deserialised, not yet trusted).
#[derive(Clone, Debug, Default)]
pub struct LogInput {
    pub watched_on: String,
    /// 0 or `None` = not rated, 1..=10 half stars.
    pub rating: Option<i64>,
    pub review: Option<String>,
    pub platform: Option<String>,
    pub season: Option<i64>,
    pub episode: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CleanLog {
    pub watched_on: String,
    pub rating: Option<u8>,
    pub review: Option<String>,
    pub platform: Option<String>,
    pub season: Option<i64>,
    pub episode: Option<i64>,
}

fn trimmed(s: &Option<String>, max: usize, err: LogError) -> Result<Option<String>, LogError> {
    match s.as_deref().map(str::trim) {
        None | Some("") => Ok(None),
        Some(t) if t.chars().count() <= max => Ok(Some(t.to_string())),
        Some(_) => Err(err),
    }
}

/// `today` is `YYYY-MM-DD` for the server's now. One day of slack covers every timezone.
pub fn clean_log(input: &LogInput, today: &str) -> Result<CleanLog, LogError> {
    if !is_valid_date(&input.watched_on) || input.watched_on.as_str() > next_day(today).as_str() {
        return Err(LogError::Date);
    }
    let rating = match input.rating {
        None | Some(0) => None,
        Some(r @ 1..=10) => Some(r as u8),
        Some(_) => return Err(LogError::Rating),
    };
    // v1: an invalid season/episode silently became "none"; an out-of-range one is an error here so the client learns.
    if input.season.is_some_and(|s| !(1..=99).contains(&s)) {
        return Err(LogError::Season);
    }
    if input.episode.is_some_and(|e| !(1..=9999).contains(&e)) {
        return Err(LogError::Episode);
    }
    // An episode only makes sense inside a season.
    if input.episode.is_some() && input.season.is_none() {
        return Err(LogError::Season);
    }
    Ok(CleanLog {
        watched_on: input.watched_on.clone(),
        rating,
        review: trimmed(&input.review, MAX_REVIEW, LogError::Review)?,
        platform: trimmed(&input.platform, MAX_PLATFORM, LogError::Platform)?,
        season: input.season,
        episode: input.episode,
    })
}

/// A whole-title log (no season, no episode) is the one that sets a person's rating of the title.
pub fn sets_title_rating(season: Option<i64>, episode: Option<i64>) -> bool {
    season.is_none() && episode.is_none()
}

/// Cuts a season/episode to what exists when the counts are known: `seasons` = `(season, episodes)`.
pub fn clamp_position(
    season: Option<i64>,
    episode: Option<i64>,
    seasons: &[(i64, i64)],
) -> (Option<i64>, Option<i64>) {
    let Some(s) = season else {
        return (None, episode);
    };
    let Some(last) = seasons.iter().map(|x| x.0).max() else {
        return (season, episode);
    };
    let s = s.min(last);
    let count = seasons.iter().find(|x| x.0 == s).map(|x| x.1);
    let e = match (episode, count) {
        (Some(e), Some(c)) if c > 0 => Some(e.min(c)),
        (e, _) => e,
    };
    (Some(s), e)
}

/// "+1 episode": next episode, rolling into the next season when the counts say the season is over; the very last episode stays.
/// With no counts it just adds one (up to 9999).
pub fn advance(season: i64, episode: i64, seasons: &[(i64, i64)]) -> (i64, i64) {
    if seasons.is_empty() {
        return (season, (episode + 1).min(9999));
    }
    let count = seasons.iter().find(|x| x.0 == season).map_or(0, |x| x.1);
    if count > 0 && episode >= count {
        return match seasons.iter().map(|x| x.0).filter(|&s| s > season).min() {
            Some(next) => (next, 1),
            None => (season, episode), // the last episode of the last season
        };
    }
    (season, episode + 1)
}

/* ───────────── dates (no chrono: Workers pay for every kilobyte and millisecond) ───────────── */

fn leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn days_in_month(y: i64, m: i64) -> i64 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap(y) => 29,
        2 => 28,
        _ => 0,
    }
}

fn parse_date(s: &str) -> Option<(i64, i64, i64)> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let num = |a: usize, b: usize| -> Option<i64> {
        let part = s.get(a..b)?;
        part.bytes()
            .all(|c| c.is_ascii_digit())
            .then(|| part.parse().ok())
            .flatten()
    };
    let (y, m, d) = (num(0, 4)?, num(5, 7)?, num(8, 10)?);
    ((1..=12).contains(&m) && d >= 1 && d <= days_in_month(y, m) && y >= 1888).then_some((y, m, d))
}

/// A real calendar date `YYYY-MM-DD`, not before the first film (1888).
pub fn is_valid_date(s: &str) -> bool {
    parse_date(s).is_some()
}

/// Days since 1970-01-01 (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// `YYYY-MM-DD` (UTC) of a millisecond timestamp.
pub fn date_of_ms(ms: i64) -> String {
    let (y, m, d) = civil_from_days(ms.div_euclid(86_400_000));
    format!("{y:04}-{m:02}-{d:02}")
}

/// The day after a valid date; an invalid input is returned unchanged.
pub fn next_day(date: &str) -> String {
    match parse_date(date) {
        Some((y, m, d)) => {
            let (y, m, d) = civil_from_days(days_from_civil(y, m, d) + 1);
            format!("{y:04}-{m:02}-{d:02}")
        }
        None => date.to_string(),
    }
}

/// Milliseconds at 00:00 UTC of a date, for ordering.
pub fn ms_of_date(date: &str) -> Option<i64> {
    let (y, m, d) = parse_date(date)?;
    Some(days_from_civil(y, m, d) * 86_400_000)
}

/// Text cut to `max` characters, at the end of a sentence when there is one in the last quarter, else at a word.
pub fn cut_at_sentence(text: &str, max: usize) -> String {
    let t = text.trim();
    if t.chars().count() <= max {
        return t.to_string();
    }
    let head: String = t.chars().take(max).collect();
    let floor = head.chars().count() * 3 / 4;
    if let Some(pos) = head
        .char_indices()
        .filter(|(_, c)| matches!(c, '.' | '!' | '?'))
        .map(|(i, _)| i)
        .rfind(|&i| head[..i].chars().count() >= floor)
    {
        return head[..=pos].to_string();
    }
    match head.rfind(' ') {
        Some(i) => head[..i].to_string(),
        None => head,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(date: &str) -> LogInput {
        LogInput {
            watched_on: date.into(),
            ..Default::default()
        }
    }

    #[test]
    fn dates_are_real_calendar_dates() {
        assert!(
            is_valid_date("2026-11-25")
                && is_valid_date("2024-02-29")
                && is_valid_date("1895-12-28")
        );
        for bad in [
            "2026-02-29",
            "2026-13-01",
            "2026-00-10",
            "2026-04-31",
            "26-11-25",
            "2026/11/25",
            "2026-11-2",
            "abcd-ef-gh",
            "1800-01-01",
            "",
        ] {
            assert!(!is_valid_date(bad), "{bad}");
        }
        assert!(!is_valid_date("2026-1\u{e9}-25"), "no panic on non-ASCII");
    }

    #[test]
    fn civil_calendar_round_trips() {
        assert_eq!(date_of_ms(0), "1970-01-01");
        assert_eq!(date_of_ms(1_800_000_000_000), "2027-01-15");
        assert_eq!(date_of_ms(-1), "1969-12-31");
        assert_eq!(next_day("2026-12-31"), "2027-01-01");
        assert_eq!(next_day("2024-02-28"), "2024-02-29");
        assert_eq!(next_day("2025-02-28"), "2025-03-01");
        assert_eq!(ms_of_date("1970-01-02"), Some(86_400_000));
        assert_eq!(ms_of_date("nope"), None);
        for ms in [0i64, 951_782_400_000, 1_709_164_800_000, 4_102_444_800_000] {
            assert_eq!(
                ms_of_date(&date_of_ms(ms)),
                Some(ms - ms.rem_euclid(86_400_000))
            );
        }
    }

    #[test]
    fn future_dates_are_refused_with_a_day_of_slack() {
        assert!(clean_log(&input("2026-11-25"), "2026-11-25").is_ok());
        assert!(
            clean_log(&input("2026-11-26"), "2026-11-25").is_ok(),
            "timezones ahead of UTC"
        );
        assert_eq!(
            clean_log(&input("2026-11-27"), "2026-11-25").unwrap_err(),
            LogError::Date
        );
        assert_eq!(
            clean_log(&input("2026-02-30"), "2026-11-25").unwrap_err(),
            LogError::Date
        );
    }

    #[test]
    fn rating_text_and_position_are_validated() {
        let mut i = input("2026-11-20");
        i.rating = Some(0);
        assert_eq!(clean_log(&i, "2026-11-25").unwrap().rating, None);
        i.rating = Some(7);
        assert_eq!(clean_log(&i, "2026-11-25").unwrap().rating, Some(7));
        i.rating = Some(11);
        assert_eq!(clean_log(&i, "2026-11-25").unwrap_err(), LogError::Rating);
        i.rating = Some(-1);
        assert_eq!(clean_log(&i, "2026-11-25").unwrap_err(), LogError::Rating);
        i.rating = None;
        i.review = Some("   ".into());
        assert_eq!(clean_log(&i, "2026-11-25").unwrap().review, None);
        i.review = Some("x".repeat(MAX_REVIEW + 1));
        assert_eq!(clean_log(&i, "2026-11-25").unwrap_err(), LogError::Review);
        i.review = Some("è".repeat(MAX_REVIEW));
        assert!(
            clean_log(&i, "2026-11-25").is_ok(),
            "limits count characters, not bytes"
        );
        i.review = None;
        i.platform = Some("n".repeat(61));
        assert_eq!(clean_log(&i, "2026-11-25").unwrap_err(), LogError::Platform);
        i.platform = None;
        i.season = Some(100);
        assert_eq!(clean_log(&i, "2026-11-25").unwrap_err(), LogError::Season);
        i.season = None;
        i.episode = Some(3);
        assert_eq!(
            clean_log(&i, "2026-11-25").unwrap_err(),
            LogError::Season,
            "an episode needs a season"
        );
        i.season = Some(2);
        i.episode = Some(10_000);
        assert_eq!(clean_log(&i, "2026-11-25").unwrap_err(), LogError::Episode);
        i.episode = Some(3);
        assert!(clean_log(&i, "2026-11-25").is_ok());
    }

    #[test]
    fn only_whole_title_logs_set_the_title_rating() {
        assert!(sets_title_rating(None, None));
        assert!(!sets_title_rating(Some(1), None));
        assert!(!sets_title_rating(Some(1), Some(4)));
    }

    #[test]
    fn positions_are_cut_to_what_exists() {
        let seasons = [(1, 10), (2, 8)];
        assert_eq!(
            clamp_position(Some(3), Some(5), &seasons),
            (Some(2), Some(5))
        );
        assert_eq!(
            clamp_position(Some(2), Some(99), &seasons),
            (Some(2), Some(8))
        );
        assert_eq!(clamp_position(Some(1), None, &seasons), (Some(1), None));
        assert_eq!(
            clamp_position(Some(7), Some(7), &[]),
            (Some(7), Some(7)),
            "unknown counts: untouched"
        );
        assert_eq!(clamp_position(None, Some(5), &seasons), (None, Some(5)));
    }

    #[test]
    fn plus_one_episode_rolls_over_seasons() {
        let seasons = [(1, 3), (2, 2)];
        assert_eq!(advance(1, 1, &seasons), (1, 2));
        assert_eq!(advance(1, 3, &seasons), (2, 1));
        assert_eq!(
            advance(2, 2, &seasons),
            (2, 2),
            "the very last episode stays"
        );
        assert_eq!(advance(4, 9, &[]), (4, 10));
        assert_eq!(advance(4, 9999, &[]), (4, 9999));
    }

    #[test]
    fn long_text_is_cut_at_a_sentence() {
        assert_eq!(cut_at_sentence("Short.", 50), "Short.");
        let t = "Prima frase. Seconda frase che continua per un bel po' di parole ancora e ancora";
        assert_eq!(
            cut_at_sentence(t, 40),
            "Prima frase. Seconda frase che continua"
        );
        assert_eq!(cut_at_sentence(&"parola ".repeat(30), 20), "parola parola");
        assert_eq!(cut_at_sentence(&"x".repeat(30), 10).len(), 10);
    }
}
