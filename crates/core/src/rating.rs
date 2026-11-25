//! Ratings are stored as half stars: an integer from 1 to 10 (0.5 to 5 stars). `None` means "not rated".

/// Validates a rating coming from a client.
pub fn parse_half_stars(value: i64) -> Option<u8> {
    (1..=10).contains(&value).then_some(value as u8)
}

/// Converts a 0.5-step star rating (as Letterboxd and Trakt export it) to half stars, rounding to the nearest half.
/// Anything outside 0.5..=5 is not a rating.
pub fn from_stars(stars: f64) -> Option<u8> {
    if !stars.is_finite() || !(0.25..=5.25).contains(&stars) {
        return None;
    }
    let half = (stars * 2.0).round() as i64;
    parse_half_stars(half)
}

/// Converts a rating on a 1..=`scale` integer scale (IMDb 1..10, MyAnimeList 1..10, AniList 1..100 with `scale = 100`)
/// to half stars. A score of 0 means "not rated" on all of them.
pub fn from_scale(score: f64, scale: f64) -> Option<u8> {
    if !score.is_finite() || score <= 0.0 || score > scale {
        return None;
    }
    let half = (score / scale * 10.0).round() as i64;
    parse_half_stars(half.max(1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn half_stars_are_one_to_ten() {
        assert_eq!(parse_half_stars(0), None);
        assert_eq!(parse_half_stars(1), Some(1));
        assert_eq!(parse_half_stars(10), Some(10));
        assert_eq!(parse_half_stars(11), None);
    }

    #[test]
    fn stars_round_to_the_nearest_half() {
        assert_eq!(from_stars(0.5), Some(1));
        assert_eq!(from_stars(3.5), Some(7));
        assert_eq!(from_stars(5.0), Some(10));
        assert_eq!(from_stars(0.0), None);
        assert_eq!(from_stars(f64::NAN), None);
        assert_eq!(from_stars(6.0), None);
    }

    #[test]
    fn other_scales_map_onto_half_stars() {
        assert_eq!(from_scale(10.0, 10.0), Some(10));
        assert_eq!(from_scale(7.0, 10.0), Some(7));
        assert_eq!(from_scale(1.0, 10.0), Some(1));
        assert_eq!(from_scale(0.0, 10.0), None);
        assert_eq!(from_scale(85.0, 100.0), Some(9)); // 8.5 rounds half away from zero
        assert_eq!(from_scale(3.0, 100.0), Some(1)); // never rounds a real rating down to "not rated"
    }
}
