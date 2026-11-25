//! The profile: who a person is in Pausa. Lists and limits ported from `lib/core/profile.ts` and `lib/avatars.ts`.

pub const GENRES: [&str; 19] = [
    "action",
    "adventure",
    "animation",
    "anime",
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
pub const MAX_GENRES: usize = 5;
pub const MAX_FAVORITES: usize = 5;
pub const MAX_BIO: usize = 280;
pub const MAX_NAME: usize = 40;

/// Pictures without photos: guests pick one of the first eight when joining a Serata, members any of the 24.
pub const GUEST_AVATARS: [&str; 8] = ["🦊", "🐙", "🦉", "🐸", "🦄", "🐧", "🦋", "🐢"];
pub const AVATARS: [&str; 24] = [
    "🦊", "🐙", "🦉", "🐸", "🦄", "🐧", "🦋", "🐢", "🍿", "🎬", "📼", "🎞️", "👽", "🤖", "🧛", "🦖",
    "🐱", "🐶", "🦁", "🐼", "🌙", "🌵", "🍕", "🍩",
];
const PREFIX: &str = "emoji:";

pub fn is_avatar(glyph: &str) -> bool {
    AVATARS.contains(&glyph)
}

/// What is stored in `user.image` for an emoji avatar.
pub fn avatar_image(glyph: &str) -> Option<String> {
    is_avatar(glyph).then(|| format!("{PREFIX}{glyph}"))
}

/// The glyph if an `image` value is an emoji avatar; anything else is a real image URL.
pub fn emoji_of(image: Option<&str>) -> Option<&str> {
    image?.strip_prefix(PREFIX).filter(|g| is_avatar(g))
}

/// The display name: trimmed, 1..=40 characters.
pub fn clean_display_name(raw: &str) -> Option<String> {
    let n = raw.trim();
    (1..=MAX_NAME)
        .contains(&n.chars().count())
        .then(|| n.to_string())
}

/// A bio is accepted up to twice the limit and cut to it (v1 behaviour), so pasting a long text is not an error. Empty = none.
pub fn clean_bio(raw: &str) -> Option<String> {
    let b: String = raw.trim().chars().take(MAX_BIO).collect();
    let b = b.trim_end().to_string();
    (!b.is_empty()).then_some(b)
}

/// Known genre keys only, no duplicates, at most five, in the order given.
pub fn clean_genres(raw: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for g in raw {
        if GENRES.contains(&g.as_str()) && !out.contains(g) && out.len() < MAX_GENRES {
            out.push(g.clone());
        }
    }
    out
}

/// What a change of avatar asks for.
#[derive(Debug, PartialEq, Eq)]
pub enum AvatarChange {
    Keep,
    /// The initial on a tint: `image = NULL`.
    Initial,
    Emoji(String),
    Invalid,
}

/// `""` keeps the picture (a photo from Google stays), `"none"` goes back to the initial, a glyph from the list picks it.
pub fn avatar_change(raw: Option<&str>) -> AvatarChange {
    match raw.map(str::trim) {
        None | Some("") => AvatarChange::Keep,
        Some("none") => AvatarChange::Initial,
        Some(g) => avatar_image(g).map_or(AvatarChange::Invalid, AvatarChange::Emoji),
    }
}

/// Notification types a person can switch off (the inbox and push both honour it).
pub const NOTIFICATION_TYPES: [&str; 7] = [
    "log",
    "comment",
    "reaction",
    "now_watching",
    "serata_invite",
    "circle_join",
    "mention",
];

/// Countries TMDB watch providers are asked for (v1 list of 15).
pub const COUNTRIES: [&str; 15] = [
    "IT", "GB", "US", "ES", "FR", "DE", "PT", "NL", "BE", "CH", "AT", "IE", "CA", "AU", "BR",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_match_v1() {
        assert_eq!(GENRES.len(), 19);
        assert_eq!(AVATARS.len(), 24);
        assert!(GUEST_AVATARS.iter().all(|g| AVATARS.contains(g)));
        assert_eq!(&AVATARS[..8], &GUEST_AVATARS[..]);
        assert_eq!(COUNTRIES.len(), 15);
    }

    #[test]
    fn avatars_round_trip() {
        assert_eq!(avatar_image("🍿"), Some("emoji:🍿".into()));
        assert_eq!(avatar_image("💩"), None);
        assert_eq!(emoji_of(Some("emoji:🍿")), Some("🍿"));
        assert_eq!(emoji_of(Some("emoji:💩")), None);
        assert_eq!(emoji_of(Some("https://lh3.googleusercontent.com/a")), None);
        assert_eq!(emoji_of(None), None);
        assert_eq!(avatar_change(None), AvatarChange::Keep);
        assert_eq!(avatar_change(Some("")), AvatarChange::Keep);
        assert_eq!(avatar_change(Some("none")), AvatarChange::Initial);
        assert_eq!(
            avatar_change(Some("🐼")),
            AvatarChange::Emoji("emoji:🐼".into())
        );
        assert_eq!(
            avatar_change(Some("javascript:alert(1)")),
            AvatarChange::Invalid
        );
    }

    #[test]
    fn name_bio_and_genres_are_cleaned() {
        assert_eq!(clean_display_name("  Giulia "), Some("Giulia".into()));
        assert_eq!(clean_display_name("   "), None);
        assert_eq!(clean_display_name(&"a".repeat(41)), None);
        assert_eq!(clean_bio("  Amo i noir.  "), Some("Amo i noir.".into()));
        assert_eq!(clean_bio("   "), None);
        assert_eq!(
            clean_bio(&"x".repeat(1000)).map(|b| b.chars().count()),
            Some(280),
            "long bios are cut, not refused"
        );
        let g = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            clean_genres(&g(&[
                "horror", "horror", "nope", "anime", "drama", "comedy", "war", "western"
            ])),
            g(&["horror", "anime", "drama", "comedy", "war"])
        );
        assert!(clean_genres(&[]).is_empty());
    }
}
