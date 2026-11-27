//! Traguardi (personal milestones) and the global leaderboard, the rules only. The Worker runs the queries
//! (`crates/api/src/achievements.rs`).
//!
//! - Milestones are personal: everything counts, imports included (they describe a history, they are not a competition).
//! - The leaderboard is opt-in: a person joins with a public name chosen for it, and can leave (their row and scores go).
//!   Its score counts only viewings logged by hand (imports never count), at most `DAILY_CAP` per day, the day being the one
//!   the viewing was *written* (not the `watched_on` date, which anyone can backdate). Scores are computed by the hourly cron,
//!   never on read.

use crate::dto::{Milestone, MilestoneKind};

/// Viewings logged by hand that count towards the leaderboard per calendar day (UTC) of writing.
pub const DAILY_CAP: i64 = 5;
/// Rows the leaderboard answers with.
pub const BOARD_SIZE: u32 = 50;
pub const NAME_MIN: usize = 2;
pub const NAME_MAX: usize = 32;

/// The ladder of each milestone: the steps a person climbs, in order.
pub fn steps(kind: MilestoneKind) -> &'static [i64] {
    match kind {
        MilestoneKind::Viewings => &[1, 10, 50, 100, 250, 500, 1000],
        MilestoneKind::Reviews => &[1, 10, 50, 100],
        MilestoneKind::Serate => &[1, 5, 25],
        MilestoneKind::Hosted => &[1, 5, 25],
        MilestoneKind::Genres => &[3, 6, 10],
        MilestoneKind::Rewatches => &[1, 10],
    }
}

pub const KINDS: [MilestoneKind; 6] = [
    MilestoneKind::Viewings,
    MilestoneKind::Reviews,
    MilestoneKind::Serate,
    MilestoneKind::Hosted,
    MilestoneKind::Genres,
    MilestoneKind::Rewatches,
];

/// Where a count stands on its ladder: the last step reached (0 = none yet) and the next one (`None` at the top).
pub fn milestone(kind: MilestoneKind, value: i64) -> Milestone {
    let ladder = steps(kind);
    let reached = ladder.iter().copied().rfind(|s| value >= *s).unwrap_or(0);
    let next = ladder.iter().copied().find(|s| value < *s);
    Milestone {
        kind,
        value,
        reached,
        next,
        level: ladder.iter().filter(|s| value >= **s).count() as u32,
        levels: ladder.len() as u32,
    }
}

/// A public name: trimmed, inner runs of whitespace folded, 2..=32 characters, no control characters, and not an email address
/// or a link (the board is read by strangers). `None` when it is not acceptable.
pub fn clean_public_name(raw: &str) -> Option<String> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let n = name.chars().count();
    let lower = name.to_lowercase();
    let ok = (NAME_MIN..=NAME_MAX).contains(&n)
        && !name.chars().any(|c| c.is_control())
        && !name.contains('@')
        && !lower.contains("http")
        && !lower.contains("www.");
    ok.then_some(name)
}

/// The period of the monthly board for a UTC timestamp: `"2026-11"`. The all-time board is `"all"`.
pub fn month_of(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    // civil-from-days (Howard Hinnant), UTC
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    format!("{:04}-{:02}", if m <= 2 { y + 1 } else { y }, m)
}

/// The score of a list of per-day counts (hand-logged viewings written that day): each day capped at `DAILY_CAP`.
pub fn score(per_day: &[i64]) -> i64 {
    per_day.iter().map(|n| (*n).clamp(0, DAILY_CAP)).sum()
}

/// The SQL that recomputes one period's scores for every member, in one statement (`?1` = now in ms, `?2` = period, `?3` =
/// the `strftime('%Y-%m')` filter or `'%'` for all time). Kept here, next to `score`, so the rule has one home; the test below
/// runs it on an in-memory table shape check only (D1 runs it for real in the end-to-end tests).
pub const RECOMPUTE_SQL: &str = "INSERT INTO leaderboard_score (period, user_id, score, computed_at) \
     SELECT ?2, d.user_id, SUM(MIN(d.n, 5)), ?1 FROM ( \
       SELECT l.user_id, date(l.created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM log l \
       JOIN leaderboard_member m ON m.user_id = l.user_id \
       WHERE l.import_batch_id IS NULL AND strftime('%Y-%m', l.created_at / 1000, 'unixepoch') LIKE ?3 \
       GROUP BY l.user_id, day) d GROUP BY d.user_id";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ladders_climb_and_stop_at_the_top() {
        let m = milestone(MilestoneKind::Viewings, 0);
        assert_eq!((m.reached, m.next, m.level), (0, Some(1), 0));
        let m = milestone(MilestoneKind::Viewings, 57);
        assert_eq!(
            (m.reached, m.next, m.level, m.levels),
            (50, Some(100), 3, 7)
        );
        let m = milestone(MilestoneKind::Viewings, 5000);
        assert_eq!((m.reached, m.next, m.level), (1000, None, 7));
        for k in KINDS {
            let s = steps(k);
            assert!(s.windows(2).all(|w| w[0] < w[1]), "{k:?} ladder must grow");
        }
    }

    #[test]
    fn public_names_are_cleaned_or_refused() {
        assert_eq!(
            clean_public_name("  Giulia   B. ").as_deref(),
            Some("Giulia B.")
        );
        assert_eq!(clean_public_name("Zoë 🎬").as_deref(), Some("Zoë 🎬"));
        for bad in [
            "",
            "x",
            "a@b.it",
            "www.spam.it",
            "see http://x",
            &"y".repeat(33),
            "tab\u{7}bell",
        ] {
            assert_eq!(clean_public_name(bad), None, "{bad:?}");
        }
        assert!(clean_public_name(&"y".repeat(32)).is_some());
    }

    #[test]
    fn the_daily_cap_keeps_a_binge_from_buying_the_board() {
        assert_eq!(score(&[1, 2, 3]), 6);
        assert_eq!(score(&[40, 1]), DAILY_CAP + 1);
        assert_eq!(score(&[]), 0);
        assert!(
            RECOMPUTE_SQL.contains(&format!("MIN(d.n, {DAILY_CAP})")),
            "the SQL cap must match DAILY_CAP"
        );
        assert!(
            RECOMPUTE_SQL.contains("import_batch_id IS NULL"),
            "imports never count"
        );
    }

    #[test]
    fn months_are_utc() {
        assert_eq!(month_of(0), "1970-01");
        assert_eq!(month_of(1_795_785_974_284), "2026-11");
        assert_eq!(month_of(1_798_761_599_999), "2026-12"); // 2026-12-31T23:59:59.999Z
        assert_eq!(month_of(1_798_761_600_000), "2027-01");
        assert_eq!(month_of(951_782_400_000), "2000-02"); // leap day 2000-02-29
    }
}
