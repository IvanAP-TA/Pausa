//! Stable genre codes, the same in every language: TMDB numeric ids and AniList names map onto the slugs the app already labels
//! (`profile.genres.*`). A genre with no slug is dropped.

pub const SLUGS: [&str; 18] = [
    "action",
    "adventure",
    "animation",
    "comedy",
    "crime",
    "documentary",
    "drama",
    "family",
    "fantasy",
    "history",
    "horror",
    "musical",
    "mystery",
    "romance",
    "scifi",
    "thriller",
    "war",
    "western",
];

pub fn from_tmdb(id: i64) -> &'static [&'static str] {
    match id {
        28 => &["action"],
        12 => &["adventure"],
        16 => &["animation"],
        35 => &["comedy"],
        80 => &["crime"],
        99 => &["documentary"],
        18 => &["drama"],
        10751 | 10762 => &["family"],
        14 => &["fantasy"],
        36 => &["history"],
        27 => &["horror"],
        10402 => &["musical"],
        9648 => &["mystery"],
        10749 => &["romance"],
        878 => &["scifi"],
        53 => &["thriller"],
        10752 | 10768 => &["war"],
        37 => &["western"],
        10759 => &["action", "adventure"],
        10765 => &["fantasy", "scifi"],
        _ => &[],
    }
}

pub fn from_anilist(name: &str) -> &'static [&'static str] {
    match name {
        "Action" => &["action"],
        "Adventure" => &["adventure"],
        "Comedy" => &["comedy"],
        "Drama" => &["drama"],
        "Fantasy" | "Mahou Shoujo" | "Supernatural" => &["fantasy"],
        "Horror" => &["horror"],
        "Music" => &["musical"],
        "Mystery" => &["mystery"],
        "Romance" => &["romance"],
        "Sci-Fi" | "Mecha" => &["scifi"],
        "Thriller" | "Psychological" => &["thriller"],
        _ => &[],
    }
}

pub fn collect(slugs: impl IntoIterator<Item = &'static str>) -> Vec<&'static str> {
    let mut v: Vec<&'static str> = slugs.into_iter().collect();
    v.sort_unstable();
    v.dedup();
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tmdb_movie_and_tv_ids_map_to_the_same_slugs() {
        assert_eq!(from_tmdb(28), ["action"]);
        assert_eq!(from_tmdb(10759), ["action", "adventure"]);
        assert_eq!(from_tmdb(10765), ["fantasy", "scifi"]);
        assert_eq!(from_tmdb(10768), ["war"]);
        assert!(from_tmdb(10767).is_empty(), "talk shows have no slug");
    }
    #[test]
    fn anilist_names() {
        assert_eq!(from_anilist("Sci-Fi"), ["scifi"]);
        assert_eq!(from_anilist("Mecha"), ["scifi"]);
        assert!(from_anilist("Slice of Life").is_empty());
    }
    #[test]
    fn collect_sorts_and_dedupes() {
        assert_eq!(
            collect(["scifi", "action", "scifi"]),
            vec!["action", "scifi"]
        );
    }
    #[test]
    fn every_mapped_slug_is_known() {
        for id in [
            28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53, 10752, 37,
            10759, 10762, 10765, 10768,
        ] {
            for s in from_tmdb(id) {
                assert!(SLUGS.contains(s), "{s}");
            }
        }
    }
}
