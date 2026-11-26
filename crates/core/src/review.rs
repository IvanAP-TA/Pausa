//! The app-store review account: what a reviewer, who cannot receive an email link, is shown after typing the review password.
//!
//! Pure pieces only (the password check and the demo data); the Worker (`crates/api/src/review.rs`) does the I/O. The password and
//! the address live in the environment (`REVIEW_PASSWORD`, `REVIEW_EMAIL`) and nowhere in the code.

use crate::auth::hash_token;

pub const REVIEW_USER_ID: &str = "u-review";
pub const REVIEW_CIRCLE_ID: &str = "c-review";

/// Compares two byte strings looking at every byte whatever the first difference is.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// True when `given` is `expected`. Both are hashed first (fixed length, so neither the length nor the content leaks through the
/// time it takes), then compared without stopping at the first different byte. An empty `expected` never matches.
pub fn password_matches(given: &str, expected: &str) -> bool {
    if expected.is_empty() {
        return false;
    }
    constant_time_eq(
        hash_token(given).as_bytes(),
        hash_token(expected).as_bytes(),
    )
}

/// The demo group's people: `(id, name, email, role)`. The reviewer's own address comes from the environment, so it is not here.
pub const DEMO_PEOPLE: [(&str, &str, &str, &str); 2] = [
    (
        "u-review-anna",
        "Anna (demo)",
        "anna@review.invalid",
        "member",
    ),
    (
        "u-review-marco",
        "Marco (demo)",
        "marco@review.invalid",
        "member",
    ),
];

/// Demo films: `(id, title, year, runtime in minutes)`.
pub const DEMO_FILMS: [(&str, &str, i64, i64); 6] = [
    ("m-review-1", "Nosferatu", 1922, 94),
    ("m-review-2", "Metropolis", 1927, 153),
    ("m-review-3", "The Cabinet of Dr. Caligari", 1920, 76),
    ("m-review-4", "A Trip to the Moon", 1902, 14),
    ("m-review-5", "The General", 1926, 78),
    ("m-review-6", "Battleship Potemkin", 1925, 75),
];

/// One demo viewing: `(person id, film index, rating in half stars, days ago, review)`.
pub type DemoLog = (&'static str, usize, Option<i64>, i64, Option<&'static str>);

/// Demo viewings.
pub const DEMO_LOGS: [DemoLog; 9] = [
    (
        REVIEW_USER_ID,
        0,
        Some(9),
        2,
        Some("Still creepy after a hundred years."),
    ),
    (REVIEW_USER_ID, 1, Some(10), 6, None),
    (REVIEW_USER_ID, 4, Some(8), 14, Some("Great stunts.")),
    ("u-review-anna", 0, Some(8), 2, None),
    (
        "u-review-anna",
        2,
        Some(7),
        9,
        Some("Weird sets, loved them."),
    ),
    ("u-review-anna", 3, Some(9), 20, None),
    (
        "u-review-marco",
        1,
        Some(9),
        6,
        Some("A bit long, worth it."),
    ),
    ("u-review-marco", 4, Some(7), 14, None),
    ("u-review-marco", 5, Some(8), 25, None),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_check() {
        assert!(password_matches("correct horse", "correct horse"));
        assert!(!password_matches("correct horsf", "correct horse"));
        assert!(!password_matches("", "correct horse"));
        assert!(!password_matches("correct horse ", "correct horse"));
        // Not configured: nothing matches, not even an empty guess.
        assert!(!password_matches("", ""));
        assert!(!password_matches("x", ""));
    }

    #[test]
    fn demo_data_is_consistent() {
        for (_, film, ..) in DEMO_LOGS {
            assert!(film < DEMO_FILMS.len());
        }
        let mut ids: Vec<&str> = DEMO_FILMS.iter().map(|f| f.0).collect();
        ids.dedup();
        assert_eq!(ids.len(), DEMO_FILMS.len());
    }
}
