//! Turning TMDB and AniList answers into Pausa titles. Pure (JSON in, plain structs out) so it is tested with fixtures and the
//! Worker only has to fetch. Ported from `lib/tmdb.ts` and `lib/anilist.ts`.

use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Movie,
    Tv,
    Anime,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Movie => "movie",
            Kind::Tv => "tv",
            Kind::Anime => "anime",
        }
    }
    pub fn parse(s: &str) -> Option<Kind> {
        match s {
            "movie" => Some(Kind::Movie),
            "tv" => Some(Kind::Tv),
            "anime" => Some(Kind::Anime),
            _ => None,
        }
    }
}

/// Where a title comes from, as a client names it when choosing a search result: `tmdb:movie:603`, `tmdb:tv:1396`, `anilist:21`
/// or `local:<uuid>` (a title Pausa already has).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Key {
    Tmdb { tv: bool, id: i64 },
    Anilist { id: i64 },
    Local(String),
}

impl Key {
    pub fn parse(s: &str) -> Option<Key> {
        let mut p = s.splitn(3, ':');
        match (p.next()?, p.next()?, p.next()) {
            ("tmdb", "movie", Some(id)) => Some(Key::Tmdb {
                tv: false,
                id: id.parse().ok().filter(|n| *n > 0)?,
            }),
            ("tmdb", "tv", Some(id)) => Some(Key::Tmdb {
                tv: true,
                id: id.parse().ok().filter(|n| *n > 0)?,
            }),
            ("anilist", id, None) => Some(Key::Anilist {
                id: id.parse().ok().filter(|n| *n > 0)?,
            }),
            ("local", id, None) if !id.is_empty() && id.len() <= 64 => {
                Some(Key::Local(id.to_string()))
            }
            _ => None,
        }
    }
}

/// One search result. Nothing is stored until somebody picks it (v1 stored up to 18 rows per search, chosen or not).
#[derive(Clone, Debug, PartialEq)]
pub struct Candidate {
    pub key: String,
    pub kind: Kind,
    pub title: String,
    pub year: Option<i64>,
    pub poster_path: Option<String>,
}

/// Everything needed to create the title and its cached details in one go.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Draft {
    pub kind: Option<Kind>,
    pub tmdb_id: Option<i64>,
    pub anilist_id: Option<i64>,
    pub mal_id: Option<i64>,
    pub imdb_id: Option<String>,
    pub original_title: String,
    pub localized_title: Option<String>,
    pub year: Option<i64>,
    pub runtime_min: Option<i64>,
    pub episodes_total: Option<i64>,
    pub poster_path: Option<String>,
    pub seasons: Vec<(i64, i64)>,
    pub overview: Option<String>,
    pub genres: Vec<String>,
    /// Stable codes from [`crate::genre`], sorted and unique.
    pub genre_slugs: Vec<&'static str>,
    pub cast: Vec<(String, Option<String>)>,
    /// Directors (films), creators (series) or original authors (anime), at most 3.
    pub people: Vec<crate::people::Credit>,
}

pub(crate) fn s(v: &Value, k: &str) -> Option<String> {
    v.get(k)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_string)
}

pub(crate) fn n(v: &Value, k: &str) -> Option<i64> {
    v.get(k).and_then(Value::as_i64)
}

pub(crate) fn year_of(date: Option<String>) -> Option<i64> {
    date?
        .get(..4)?
        .parse()
        .ok()
        .filter(|y| (1888..=2200).contains(y))
}

/// Japanese animation series are "anime" (TMDB genre 16 + original language ja); a Japanese animated *film* stays a movie.
pub(crate) fn tmdb_kind(tv: bool, genre_ids: &[i64], lang: Option<&str>) -> Kind {
    if !tv {
        Kind::Movie
    } else if genre_ids.contains(&16) && lang == Some("ja") {
        Kind::Anime
    } else {
        Kind::Tv
    }
}

fn genre_ids(v: &Value) -> Vec<i64> {
    if let Some(a) = v.get("genre_ids").and_then(Value::as_array) {
        return a.iter().filter_map(Value::as_i64).collect();
    }
    v.get("genres")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|g| n(g, "id")).collect())
        .unwrap_or_default()
}

/// A TMDB poster path ("/abc.jpg"): anything else is not stored (it ends up in an image URL).
fn tmdb_poster(v: &Value) -> Option<String> {
    tmdb_poster_str(s(v, "poster_path"))
}

/// Same validation for a path that is not under `poster_path` (e.g. a person's `profile_path`).
pub(crate) fn tmdb_poster_str(path: Option<String>) -> Option<String> {
    path.filter(|p| {
        p.starts_with('/')
            && p.len() < 100
            && p.bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'.' | b'_' | b'-'))
    })
}

/// `GET /3/search/multi` results: films and series only, never adult.
pub fn candidates_from_tmdb(body: &Value, max: usize) -> Vec<Candidate> {
    body.get("results")
        .and_then(Value::as_array)
        .map(|rs| rs.iter().filter_map(tmdb_candidate).take(max).collect())
        .unwrap_or_default()
}

pub fn tmdb_candidate(r: &Value) -> Option<Candidate> {
    let tv = match r.get("media_type").and_then(Value::as_str)? {
        "movie" => false,
        "tv" => true,
        _ => return None,
    };
    if r.get("adult").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    let id = n(r, "id")?;
    let title = s(r, if tv { "name" } else { "title" }).or_else(|| {
        s(
            r,
            if tv {
                "original_name"
            } else {
                "original_title"
            },
        )
    })?;
    let year = year_of(s(r, if tv { "first_air_date" } else { "release_date" }));
    let kind = tmdb_kind(tv, &genre_ids(r), s(r, "original_language").as_deref());
    Some(Candidate {
        key: format!("tmdb:{}:{id}", if tv { "tv" } else { "movie" }),
        kind,
        title,
        year,
        poster_path: tmdb_poster(r),
    })
}

/// `GET /3/{movie|tv}/{id}?append_to_response=credits,external_ids`.
pub fn draft_from_tmdb(tv: bool, body: &Value) -> Option<Draft> {
    let id = n(body, "id")?;
    let (title_key, orig_key, date_key) = if tv {
        ("name", "original_name", "first_air_date")
    } else {
        ("title", "original_title", "release_date")
    };
    let localized = s(body, title_key);
    let original = s(body, orig_key).or_else(|| localized.clone())?;
    let kind = tmdb_kind(
        tv,
        &genre_ids(body),
        s(body, "original_language").as_deref(),
    );
    // Series: the average episode runtime when TMDB gives one; films: the runtime.
    let runtime = if tv {
        body.get("episode_run_time")
            .and_then(Value::as_array)
            .and_then(|a| a.first())
            .and_then(Value::as_i64)
    } else {
        n(body, "runtime")
    }
    .filter(|m| *m > 0);
    // Season 0 (specials) and empty seasons are never stored.
    let seasons = body
        .get("seasons")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| Some((n(x, "season_number")?, n(x, "episode_count")?)))
                .filter(|&(sn, c)| sn >= 1 && c >= 1)
                .collect()
        })
        .unwrap_or_default();
    let imdb = s(body, "imdb_id")
        .or_else(|| body.get("external_ids").and_then(|e| s(e, "imdb_id")))
        .filter(|i| i.starts_with("tt") && i.len() <= 12);
    let genres = body
        .get("genres")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|g| s(g, "name")).take(4).collect())
        .unwrap_or_default();
    let cast = body
        .get("credits")
        .and_then(|c| c.get("cast"))
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|p| Some((s(p, "name")?, s(p, "character"))))
                .take(6)
                .collect()
        })
        .unwrap_or_default();
    Some(Draft {
        kind: Some(kind),
        tmdb_id: Some(id),
        imdb_id: imdb,
        original_title: original,
        localized_title: localized,
        year: year_of(s(body, date_key)),
        runtime_min: runtime,
        poster_path: tmdb_poster(body),
        seasons,
        overview: s(body, "overview"),
        genres,
        genre_slugs: crate::genre::collect(
            genre_ids(body)
                .into_iter()
                .flat_map(|id| crate::genre::from_tmdb(id).iter().copied()),
        ),
        cast,
        people: crate::people::credits_from_tmdb(tv, body),
        ..Default::default()
    })
}

/// AniList descriptions are HTML ("<br>", "<i>"): plain text only.
pub fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut tag = String::new();
    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                tag.clear();
            }
            '>' if in_tag => {
                in_tag = false;
                if tag.to_ascii_lowercase().starts_with("br") || tag.starts_with("/p") {
                    out.push(' ');
                }
            }
            _ if in_tag => tag.push(c),
            _ => out.push(c),
        }
    }
    out.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#039;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Only AniList's own CDN is accepted as a poster URL.
pub(crate) fn anilist_poster(m: &Value) -> Option<String> {
    let url = m
        .get("coverImage")
        .and_then(|c| s(c, "large").or_else(|| s(c, "medium")))?;
    url.starts_with("https://s4.anilist.co/").then_some(url)
}

pub(crate) fn anilist_titles(m: &Value) -> Option<(String, String)> {
    let t = m.get("title")?;
    let (romaji, english, native) = (s(t, "romaji"), s(t, "english"), s(t, "native"));
    let original = romaji.clone().or(english.clone()).or(native.clone())?;
    let shown = english.or(romaji).or(native)?;
    Some((original, shown))
}

pub(crate) fn anilist_year(m: &Value) -> Option<i64> {
    n(m, "seasonYear").or_else(|| m.get("startDate").and_then(|d| n(d, "year")))
}

/// `Page.media` of an AniList search: anime only, never adult.
pub fn candidates_from_anilist(body: &Value, max: usize) -> Vec<Candidate> {
    body.pointer("/data/Page/media")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter(|m| m.get("isAdult").and_then(Value::as_bool) != Some(true))
                .filter_map(|m| {
                    let (_, shown) = anilist_titles(m)?;
                    Some(Candidate {
                        key: format!("anilist:{}", n(m, "id")?),
                        kind: Kind::Anime,
                        title: shown,
                        year: anilist_year(m),
                        poster_path: anilist_poster(m),
                    })
                })
                .take(max)
                .collect()
        })
        .unwrap_or_default()
}

/// AniList's own recommendations of an anime (`Media.recommendations`, best rated first): the "Per te" candidates of an anime
/// that TMDB does not know. Never adult, never the same title twice.
pub const ANILIST_RECOMMENDATIONS: &str = "query($id:Int){Media(id:$id,type:ANIME){recommendations(sort:RATING_DESC,perPage:12){nodes{mediaRecommendation{id title{romaji english native} seasonYear startDate{year} isAdult coverImage{large}}}}}}";

pub fn candidates_from_anilist_recommendations(body: &Value, max: usize) -> Vec<Candidate> {
    let mut seen = std::collections::HashSet::new();
    body.pointer("/data/Media/recommendations/nodes")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|node| node.get("mediaRecommendation").filter(|m| m.is_object()))
                .filter(|m| m.get("isAdult").and_then(Value::as_bool) != Some(true))
                .filter_map(|m| {
                    let id = n(m, "id")?;
                    if !seen.insert(id) {
                        return None;
                    }
                    let (_, shown) = anilist_titles(m)?;
                    Some(Candidate {
                        key: format!("anilist:{id}"),
                        kind: Kind::Anime,
                        title: shown,
                        year: anilist_year(m),
                        poster_path: anilist_poster(m),
                    })
                })
                .take(max)
                .collect()
        })
        .unwrap_or_default()
}

/// Where an anime streams, as AniList lists it (`Media.externalLinks` of type STREAMING): sites and links, the same in every
/// country (AniList does not say where each one is available).
pub const ANILIST_STREAMING: &str =
    "query($id:Int){Media(id:$id,type:ANIME){externalLinks{site url type}}}";

pub fn anilist_streaming_links(body: &Value) -> Vec<crate::dto::StreamLink> {
    let mut seen = std::collections::HashSet::new();
    body.pointer("/data/Media/externalLinks")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter(|l| l.get("type").and_then(Value::as_str) == Some("STREAMING"))
                .filter_map(|l| {
                    let site = s(l, "site")?;
                    let url =
                        s(l, "url").filter(|u| u.starts_with("https://") && u.len() <= 300)?;
                    seen.insert(site.to_lowercase())
                        .then_some(crate::dto::StreamLink { site, url })
                })
                .take(12)
                .collect()
        })
        .unwrap_or_default()
}

/// `data.Media` of an AniList lookup by id.
pub fn draft_from_anilist(body: &Value) -> Option<Draft> {
    let m = body.pointer("/data/Media")?;
    let (original, shown) = anilist_titles(m)?;
    // Slugs come from every AniList genre, not only the four kept for display.
    let names: Vec<&str> = m
        .get("genres")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let genre_slugs = crate::genre::collect(
        names
            .iter()
            .flat_map(|name| crate::genre::from_anilist(name).iter().copied())
            .chain(["animation"]),
    );
    Some(Draft {
        kind: Some(Kind::Anime),
        anilist_id: Some(n(m, "id")?),
        mal_id: n(m, "idMal"),
        original_title: original,
        localized_title: Some(shown),
        year: anilist_year(m),
        runtime_min: n(m, "duration").filter(|d| *d > 0),
        episodes_total: n(m, "episodes").filter(|e| *e > 0),
        poster_path: anilist_poster(m),
        // AniList's synopsis is English whatever the app language: stored under the requested language anyway (v1 behaviour).
        overview: s(m, "description")
            .map(|d| strip_html(&d))
            .filter(|d| !d.is_empty()),
        genres: m
            .get("genres")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|g| g.as_str().map(str::to_string))
                    .take(4)
                    .collect()
            })
            .unwrap_or_default(),
        genre_slugs,
        people: crate::people::credits_from_anilist(m),
        ..Default::default()
    })
}

/// Merges search lists in the order local, TMDB, AniList, dropping duplicates by key and an AniList anime whose
/// `title|year` already appears (the same show listed by both catalogues), cut to `max`.
pub fn merge_candidates(
    local: Vec<Candidate>,
    tmdb: Vec<Candidate>,
    anilist: Vec<Candidate>,
    max: usize,
) -> Vec<Candidate> {
    let norm = |c: &Candidate| format!("{}|{}", c.title.to_lowercase(), c.year.unwrap_or(0));
    let mut seen_keys = std::collections::HashSet::new();
    let mut seen_titles = std::collections::HashSet::new();
    let mut out = Vec::new();
    for c in local.into_iter().chain(tmdb) {
        if seen_keys.insert(c.key.clone()) {
            seen_titles.insert(norm(&c));
            out.push(c);
        }
    }
    for c in anilist {
        if !seen_titles.contains(&norm(&c)) && seen_keys.insert(c.key.clone()) {
            out.push(c);
        }
    }
    out.truncate(max);
    out
}

/// Index-friendly bounds for a prefix search: `title >= lo AND title < hi` (with NOCASE collation). v1 ran `LIKE '%q%'` over the
/// whole catalogue on every keystroke; that would read every title row per search (D1 free: 5 M rows read/day). Substring and
/// fuzzy matching is TMDB's job. `None` for an empty term.
pub fn prefix_bounds(q: &str) -> Option<(String, String)> {
    let lo: String = q.trim().chars().take(100).collect();
    let mut hi = lo.clone();
    let last = hi.pop()?;
    hi.push(char::from_u32(last as u32 + 1).unwrap_or(last));
    Some((lo, hi))
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keys_parse_and_reject_garbage() {
        assert_eq!(
            Key::parse("tmdb:movie:603"),
            Some(Key::Tmdb { tv: false, id: 603 })
        );
        assert_eq!(
            Key::parse("tmdb:tv:1396"),
            Some(Key::Tmdb { tv: true, id: 1396 })
        );
        assert_eq!(Key::parse("anilist:21"), Some(Key::Anilist { id: 21 }));
        assert_eq!(
            Key::parse("local:abc-123"),
            Some(Key::Local("abc-123".into()))
        );
        for bad in [
            "",
            "tmdb",
            "tmdb:movie",
            "tmdb:movie:0",
            "tmdb:movie:-4",
            "tmdb:movie:abc",
            "tmdb:show:1",
            "anilist:x",
            "anilist:1:2",
            "local:",
            "http://x",
        ] {
            assert_eq!(Key::parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn tmdb_search_keeps_films_and_series_only() {
        let body = json!({"results": [
            {"id": 603, "media_type": "movie", "title": "Matrix", "original_title": "The Matrix", "release_date": "1999-03-30", "poster_path": "/p.jpg", "genre_ids": [28], "original_language": "en"},
            {"id": 31, "media_type": "person", "name": "Someone"},
            {"id": 9, "media_type": "movie", "title": "Adult", "adult": true},
            {"id": 37854, "media_type": "tv", "name": "One Piece", "first_air_date": "1999-10-20", "genre_ids": [16, 10759], "original_language": "ja"},
            {"id": 1396, "media_type": "tv", "name": "Breaking Bad", "first_air_date": "2008-01-20", "genre_ids": [18], "original_language": "en", "poster_path": "http://evil/x.jpg"},
            {"id": 128, "media_type": "movie", "title": "Princess Mononoke", "release_date": "1997-07-12", "genre_ids": [16], "original_language": "ja"},
        ]});
        let c = candidates_from_tmdb(&body, 10);
        let keys: Vec<&str> = c.iter().map(|x| x.key.as_str()).collect();
        assert_eq!(
            keys,
            [
                "tmdb:movie:603",
                "tmdb:tv:37854",
                "tmdb:tv:1396",
                "tmdb:movie:128"
            ]
        );
        assert_eq!(c[0].year, Some(1999));
        assert_eq!(c[1].kind, Kind::Anime, "Japanese animated series are anime");
        assert_eq!(
            c[3].kind,
            Kind::Movie,
            "a Japanese animated film stays a movie"
        );
        assert_eq!(
            c[2].poster_path, None,
            "a poster that is not a TMDB path is dropped"
        );
        assert_eq!(candidates_from_tmdb(&body, 2).len(), 2);
        assert!(candidates_from_tmdb(&json!({}), 5).is_empty());
    }

    #[test]
    fn tmdb_movie_detail() {
        let body = json!({"id": 603, "title": "Matrix", "original_title": "The Matrix", "release_date": "1999-03-30", "runtime": 136,
            "poster_path": "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", "overview": "Un hacker.", "imdb_id": "tt0133093", "original_language": "en",
            "genres": [{"id": 28, "name": "Azione"}, {"id": 878, "name": "Fantascienza"}],
            "credits": {"cast": [{"name": "Keanu Reeves", "character": "Neo"}, {"name": "Laurence Fishburne"}]}});
        let d = draft_from_tmdb(false, &body).unwrap();
        assert_eq!(
            (d.kind, d.tmdb_id, d.year, d.runtime_min),
            (Some(Kind::Movie), Some(603), Some(1999), Some(136))
        );
        assert_eq!(
            (d.original_title.as_str(), d.localized_title.as_deref()),
            ("The Matrix", Some("Matrix"))
        );
        assert_eq!(d.imdb_id.as_deref(), Some("tt0133093"));
        assert_eq!(d.genres, ["Azione", "Fantascienza"]);
        assert_eq!(
            d.cast,
            [
                ("Keanu Reeves".to_string(), Some("Neo".to_string())),
                ("Laurence Fishburne".to_string(), None)
            ]
        );
        assert!(d.seasons.is_empty());
    }

    #[test]
    fn tmdb_series_detail_skips_specials_and_empty_seasons() {
        let body = json!({"id": 1396, "name": "Breaking Bad", "original_name": "Breaking Bad", "first_air_date": "2008-01-20", "episode_run_time": [47, 45],
            "original_language": "en", "genres": [{"id": 18, "name": "Drama"}], "external_ids": {"imdb_id": "tt0903747"},
            "seasons": [{"season_number": 0, "episode_count": 9}, {"season_number": 1, "episode_count": 7}, {"season_number": 2, "episode_count": 13}, {"season_number": 3, "episode_count": 0}]});
        let d = draft_from_tmdb(true, &body).unwrap();
        assert_eq!(d.kind, Some(Kind::Tv));
        assert_eq!(d.seasons, [(1, 7), (2, 13)]);
        assert_eq!(d.runtime_min, Some(47));
        assert_eq!(d.imdb_id.as_deref(), Some("tt0903747"));
        assert!(draft_from_tmdb(true, &json!({"name": "no id"})).is_none());
    }

    #[test]
    fn anilist_search_and_detail() {
        let page = json!({"data": {"Page": {"media": [
            {"id": 21, "idMal": 21, "title": {"romaji": "ONE PIECE", "english": "One Piece", "native": "ワンピース"}, "seasonYear": 1999, "isAdult": false, "coverImage": {"large": "https://s4.anilist.co/file/a.jpg"}},
            {"id": 5, "title": {"romaji": "Hentai"}, "isAdult": true},
            {"id": 6, "title": {"romaji": "Bad Cover"}, "startDate": {"year": 2001}, "coverImage": {"large": "https://evil.example/x.jpg"}},
        ]}}});
        let c = candidates_from_anilist(&page, 8);
        assert_eq!(c.len(), 2);
        assert_eq!(
            (c[0].key.as_str(), c[0].title.as_str(), c[0].year),
            ("anilist:21", "One Piece", Some(1999))
        );
        assert_eq!(c[1].poster_path, None, "only AniList's own CDN is accepted");
        assert_eq!(c[1].year, Some(2001));

        let detail = json!({"data": {"Media": {"id": 21, "idMal": 21, "title": {"romaji": "ONE PIECE", "english": "One Piece"}, "seasonYear": 1999, "episodes": 1100,
            "duration": 24, "description": "Gold Roger.<br><br>Il <i>mare</i> &amp; l'avventura.", "genres": ["Action", "Adventure", "Comedy", "Drama", "Fantasy"],
            "coverImage": {"large": "https://s4.anilist.co/file/a.jpg"}}}});
        let d = draft_from_anilist(&detail).unwrap();
        assert_eq!(
            (
                d.kind,
                d.anilist_id,
                d.mal_id,
                d.episodes_total,
                d.runtime_min
            ),
            (Some(Kind::Anime), Some(21), Some(21), Some(1100), Some(24))
        );
        assert_eq!(
            (d.original_title.as_str(), d.localized_title.as_deref()),
            ("ONE PIECE", Some("One Piece"))
        );
        assert_eq!(
            d.overview.as_deref(),
            Some("Gold Roger. Il mare & l'avventura.")
        );
        assert_eq!(d.genres.len(), 4, "at most four genres");
    }

    #[test]
    fn drafts_carry_stable_genre_slugs() {
        let tv = json!({"id": 1, "name": "X", "genres": [{"id": 10759, "name": "Azione e avventura"}, {"id": 18, "name": "Dramma"}]});
        assert_eq!(
            draft_from_tmdb(true, &tv).unwrap().genre_slugs,
            vec!["action", "adventure", "drama"]
        );
        let ani = json!({"data": {"Media": {"id": 5, "title": {"romaji": "X"}, "genres": ["Action", "Slice of Life"]}}});
        assert_eq!(
            draft_from_anilist(&ani).unwrap().genre_slugs,
            vec!["action", "animation"]
        );
    }

    #[test]
    fn html_is_stripped() {
        assert_eq!(strip_html("a<br>b<i>c</i> &amp; d"), "a bc & d");
        assert_eq!(strip_html("<p>x</p><p>y</p>"), "x y");
        assert_eq!(strip_html("2 < 3"), "2");
    }

    #[test]
    fn search_lists_are_merged_without_duplicates() {
        let c = |key: &str, title: &str, year| Candidate {
            key: key.into(),
            kind: Kind::Anime,
            title: title.into(),
            year,
            poster_path: None,
        };
        let local = vec![c("local:1", "Death Note", Some(2006))];
        let tmdb = vec![
            c("tmdb:tv:13916", "Death Note", Some(2006)),
            c("local:1", "dup", None),
            c("tmdb:tv:1", "Other", Some(2000)),
        ];
        let ani = vec![
            c("anilist:1535", "death note", Some(2006)),
            c("anilist:2", "Fresh", Some(2020)),
        ];
        let m = merge_candidates(local, tmdb, ani, 14);
        let keys: Vec<&str> = m.iter().map(|x| x.key.as_str()).collect();
        assert_eq!(keys, ["local:1", "tmdb:tv:13916", "tmdb:tv:1", "anilist:2"]);
        assert_eq!(
            merge_candidates(
                vec![],
                vec![c("a:1", "x", None), c("a:2", "y", None)],
                vec![],
                1
            )
            .len(),
            1
        );
    }

    #[test]
    fn prefix_bounds_cover_exactly_the_prefix() {
        assert_eq!(
            prefix_bounds("  star "),
            Some(("star".into(), "stas".into()))
        );
        assert_eq!(prefix_bounds(""), None);
        assert_eq!(prefix_bounds("   "), None);
        let (lo, hi) = prefix_bounds("100%").unwrap();
        assert!(
            "100%abc" >= lo.as_str() && "100%abc" < hi.as_str() && "101" >= hi.as_str(),
            "wildcards are plain characters"
        );
    }
}

#[cfg(test)]
mod anilist_extra_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn recommendations_skip_adult_missing_and_repeated() {
        let body = json!({"data":{"Media":{"recommendations":{"nodes":[
            {"mediaRecommendation":{"id":1,"title":{"romaji":"Mushishi","english":null},"seasonYear":2005,"isAdult":false,"coverImage":{"large":"https://s4.anilist.co/a.jpg"}}},
            {"mediaRecommendation":null},
            {"mediaRecommendation":{"id":2,"title":{"romaji":"X"},"isAdult":true}},
            {"mediaRecommendation":{"id":1,"title":{"romaji":"Mushishi"}}},
            {"mediaRecommendation":{"id":3,"title":{"romaji":"Natsume","english":"Natsume's Book of Friends"},"startDate":{"year":2008}}}
        ]}}}});
        let c = candidates_from_anilist_recommendations(&body, 10);
        assert_eq!(
            c.iter().map(|c| c.key.as_str()).collect::<Vec<_>>(),
            ["anilist:1", "anilist:3"]
        );
        assert_eq!(c[0].kind, Kind::Anime);
        assert_eq!(c[1].year, Some(2008));
        assert!(candidates_from_anilist_recommendations(&json!({}), 10).is_empty());
    }

    #[test]
    fn streaming_links_are_streaming_https_and_once_per_site() {
        let body = json!({"data":{"Media":{"externalLinks":[
            {"site":"Crunchyroll","url":"https://www.crunchyroll.com/series/x","type":"STREAMING"},
            {"site":"Official Site","url":"https://x.jp","type":"INFO"},
            {"site":"crunchyroll","url":"https://www.crunchyroll.com/other","type":"STREAMING"},
            {"site":"Bad","url":"javascript:alert(1)","type":"STREAMING"},
            {"site":"Netflix","url":"https://www.netflix.com/title/1","type":"STREAMING"}
        ]}}});
        let l = anilist_streaming_links(&body);
        assert_eq!(
            l.iter().map(|l| l.site.as_str()).collect::<Vec<_>>(),
            ["Crunchyroll", "Netflix"]
        );
    }
}
