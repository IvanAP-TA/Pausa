//! Directors, creators and original authors: credits on a title, person search hits and a person's filmography. Pure
//! parsing (JSON in, plain structs out) like [`crate::catalog`].

use crate::catalog::{
    anilist_poster, anilist_titles, anilist_year, n, s, strip_html, tmdb_kind, tmdb_poster_str,
    year_of, Kind,
};
use crate::ranking::fold;
use serde_json::Value;
use std::collections::HashSet;
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Director,
    Creator,
    Author,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Director => "director",
            Role::Creator => "creator",
            Role::Author => "author",
        }
    }
    pub fn parse(s: &str) -> Option<Role> {
        match s {
            "director" => Some(Role::Director),
            "creator" => Some(Role::Creator),
            "author" => Some(Role::Author),
            _ => None,
        }
    }
}

/// `tmdb:5655` or `anilist:96881`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PersonKey {
    Tmdb(i64),
    Anilist(i64),
}

impl PersonKey {
    /// Only the canonical spelling: `tmdb:05` or `tmdb:+5` are not keys.
    pub fn parse(s: &str) -> Option<PersonKey> {
        let (src, id) = s.split_once(':')?;
        let id: i64 = id.parse().ok().filter(|n| *n > 0)?;
        let key = match src {
            "tmdb" => PersonKey::Tmdb(id),
            "anilist" => PersonKey::Anilist(id),
            _ => return None,
        };
        (key.to_string() == s).then_some(key)
    }

    /// A key taken from a URL path segment, which the worker hands over still percent-encoded (`tmdb%3A9339`).
    pub fn from_path(segment: &str) -> Option<PersonKey> {
        PersonKey::parse(&percent_decode(segment)?)
    }
}

/// Decodes `%XX` escapes; `None` on a broken escape or bytes that are not UTF-8.
fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

impl fmt::Display for PersonKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PersonKey::Tmdb(i) => write!(f, "tmdb:{i}"),
            PersonKey::Anilist(i) => write!(f, "anilist:{i}"),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Credit {
    pub key: PersonKey,
    pub name: String,
    pub profile: Option<String>,
    pub role: Role,
    pub position: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PersonHit {
    pub key: PersonKey,
    pub name: String,
    pub profile: Option<String>,
    pub known_for: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PersonWork {
    /// Catalog key text: `tmdb:movie:1`, `tmdb:tv:2` or `anilist:3`.
    pub work_key: String,
    pub kind: Kind,
    pub title: String,
    pub year: Option<i64>,
    pub poster_path: Option<String>,
    pub role: Role,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PersonCard {
    pub key: PersonKey,
    pub name: String,
    pub profile: Option<String>,
    pub born: Option<String>,
    pub died: Option<String>,
    pub place: Option<String>,
    pub bio: Option<String>,
    pub works: Vec<PersonWork>,
}

fn anilist_role(role: &str) -> Option<Role> {
    let r = role.trim();
    if r.starts_with("Original Creator")
        || r.starts_with("Original Story")
        || r.starts_with("Story & Art")
        || r == "Story"
    {
        Some(Role::Author)
    } else if r == "Director" || r == "Chief Director" {
        Some(Role::Director)
    } else {
        None
    }
}

/// Collapse spaces and fold accents/case so "Hayao  Miyazaki" and "hayao miyazaki" meet.
fn name_key(name: &str) -> String {
    fold(&name.split_whitespace().collect::<Vec<_>>().join(" "))
}

fn tmdb_profile(v: &Value) -> Option<String> {
    tmdb_poster_str(s(v, "profile_path"))
}

fn anilist_image(v: &Value) -> Option<String> {
    let url = v
        .get("image")
        .and_then(|i| s(i, "large").or_else(|| s(i, "medium")))?;
    url.starts_with("https://s4.anilist.co/").then_some(url)
}

fn anilist_name(v: &Value) -> Option<String> {
    v.get("name").and_then(|n| s(n, "full"))
}

fn tmdb_credit(v: &Value, role: Role) -> Option<(i64, Credit)> {
    let id = n(v, "id")?;
    Some((
        id,
        Credit {
            key: PersonKey::Tmdb(id),
            name: s(v, "name")?,
            profile: tmdb_profile(v),
            role,
            position: 0,
        },
    ))
}

fn finish(found: Vec<(i64, Credit)>) -> Vec<Credit> {
    let mut seen = HashSet::new();
    found
        .into_iter()
        .filter(|(id, _)| seen.insert(*id))
        .map(|(_, c)| c)
        .take(3)
        .enumerate()
        .map(|(i, mut c)| {
            c.position = i as i64;
            c
        })
        .collect()
}

/// Films: crew with job "Director". Series: `created_by`.
pub fn credits_from_tmdb(tv: bool, body: &Value) -> Vec<Credit> {
    let found: Vec<(i64, Credit)> = if tv {
        body.get("created_by")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|p| tmdb_credit(p, Role::Creator))
                    .collect()
            })
            .unwrap_or_default()
    } else {
        body.pointer("/credits/crew")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter(|p| s(p, "job").as_deref() == Some("Director"))
                    .filter_map(|p| tmdb_credit(p, Role::Director))
                    .collect()
            })
            .unwrap_or_default()
    };
    finish(found)
}

/// `staff.edges` of an anime: original authors; if there are none, the directors.
pub fn credits_from_anilist(media: &Value) -> Vec<Credit> {
    let mut found: Vec<(i64, Credit)> = Vec::new();
    if let Some(edges) = media.pointer("/staff/edges").and_then(Value::as_array) {
        for e in edges {
            let (Some(role), Some(node)) = (
                s(e, "role").as_deref().and_then(anilist_role),
                e.get("node"),
            ) else {
                continue;
            };
            let (Some(id), Some(name)) = (n(node, "id"), anilist_name(node)) else {
                continue;
            };
            found.push((
                id,
                Credit {
                    key: PersonKey::Anilist(id),
                    name,
                    profile: anilist_image(node),
                    role,
                    position: 0,
                },
            ));
        }
    }
    if found.iter().any(|(_, c)| c.role == Role::Author) {
        found.retain(|(_, c)| c.role == Role::Author);
    } else {
        found.retain(|(_, c)| c.role == Role::Director);
    }
    finish(found)
}

/// `/search/person`: directing, writing and creator people only.
pub fn hits_from_tmdb(body: &Value, max: usize) -> Vec<PersonHit> {
    body.get("results")
        .and_then(Value::as_array)
        .map(|rs| {
            rs.iter()
                .filter(|r| {
                    matches!(
                        s(r, "known_for_department").as_deref(),
                        Some("Directing" | "Writing" | "Creator")
                    )
                })
                .filter_map(|r| {
                    let id = n(r, "id")?;
                    let known_for = r
                        .get("known_for")
                        .and_then(Value::as_array)
                        .map(|a| {
                            a.iter()
                                .filter_map(|k| s(k, "title").or_else(|| s(k, "name")))
                                .take(3)
                                .collect()
                        })
                        .unwrap_or_default();
                    Some(PersonHit {
                        key: PersonKey::Tmdb(id),
                        name: s(r, "name")?,
                        profile: tmdb_profile(r),
                        known_for,
                    })
                })
                .take(max)
                .collect()
        })
        .unwrap_or_default()
}

/// `Page.staff` of an AniList staff search: people whose occupations include a creative one.
pub fn hits_from_anilist(body: &Value, max: usize) -> Vec<PersonHit> {
    body.pointer("/data/Page/staff")
        .and_then(Value::as_array)
        .map(|rs| {
            rs.iter()
                .filter(|r| {
                    r.get("primaryOccupations")
                        .and_then(Value::as_array)
                        .is_some_and(|o| {
                            o.iter().filter_map(Value::as_str).any(|x| {
                                matches!(
                                    x,
                                    "Mangaka"
                                        | "Director"
                                        | "Writer"
                                        | "Original Creator"
                                        | "Story"
                                )
                            })
                        })
                })
                .filter_map(|r| {
                    Some(PersonHit {
                        key: PersonKey::Anilist(n(r, "id")?),
                        name: anilist_name(r)?,
                        profile: anilist_image(r),
                        known_for: Vec::new(),
                    })
                })
                .take(max)
                .collect()
        })
        .unwrap_or_default()
}

/// TMDB first; an AniList person with the same folded name is the same person and is dropped.
pub fn merge_hits(tmdb: Vec<PersonHit>, anilist: Vec<PersonHit>, max: usize) -> Vec<PersonHit> {
    let mut names = HashSet::new();
    let mut keys = HashSet::new();
    let mut out = Vec::new();
    for h in tmdb.into_iter().chain(anilist) {
        if matches!(h.key, PersonKey::Anilist(_)) && names.contains(&name_key(&h.name)) {
            continue;
        }
        if keys.insert(h.key.to_string()) {
            names.insert(name_key(&h.name));
            out.push(h);
        }
    }
    out.truncate(max);
    out
}

fn sort_works(mut works: Vec<PersonWork>) -> Vec<PersonWork> {
    works.sort_by(|a, b| {
        b.year
            .cmp(&a.year)
            .then_with(|| fold(&a.title).cmp(&fold(&b.title)))
    });
    works
}

/// `/person/{id}?append_to_response=combined_credits`: films directed, series created. TMDB lists a creator either with
/// `job: "Creator"` or `department: "Creator"`, so both are accepted.
pub fn card_from_tmdb(body: &Value) -> Option<PersonCard> {
    let id = n(body, "id")?;
    let mut seen = HashSet::new();
    let mut works = Vec::new();
    for c in body
        .pointer("/combined_credits/crew")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
    {
        let tv = match s(c, "media_type").as_deref() {
            Some("movie") => false,
            Some("tv") => true,
            _ => continue,
        };
        let job = s(c, "job");
        let role = if !tv && job.as_deref() == Some("Director") {
            Role::Director
        } else if tv
            && (job.as_deref() == Some("Creator")
                || s(c, "department").as_deref() == Some("Creator"))
        {
            Role::Creator
        } else {
            continue;
        };
        let (Some(wid), Some(title)) = (n(c, "id"), s(c, "title").or_else(|| s(c, "name"))) else {
            continue;
        };
        let work_key = format!("tmdb:{}:{wid}", if tv { "tv" } else { "movie" });
        if !seen.insert(work_key.clone()) {
            continue;
        }
        let genre_ids: Vec<i64> = c
            .get("genre_ids")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_i64).collect())
            .unwrap_or_default();
        works.push(PersonWork {
            work_key,
            kind: tmdb_kind(tv, &genre_ids, s(c, "original_language").as_deref()),
            title,
            year: year_of(s(c, if tv { "first_air_date" } else { "release_date" })),
            poster_path: tmdb_poster_str(s(c, "poster_path")),
            role,
        });
    }
    Some(PersonCard {
        key: PersonKey::Tmdb(id),
        name: s(body, "name")?,
        profile: tmdb_profile(body),
        born: s(body, "birthday"),
        died: s(body, "deathday"),
        place: s(body, "place_of_birth"),
        bio: s(body, "biography"),
        works: sort_works(works),
    })
}

/// AniList FuzzyDate: "YYYY-MM-DD" when complete, "YYYY" when only the year is known.
fn fuzzy_date(d: Option<&Value>) -> Option<String> {
    let d = d?;
    let y = n(d, "year")?;
    match (n(d, "month"), n(d, "day")) {
        (Some(m), Some(day)) => Some(format!("{y:04}-{m:02}-{day:02}")),
        _ => Some(format!("{y:04}")),
    }
}

/// `data.Staff` with `staffMedia`: anime where they are original author or director.
pub fn card_from_anilist(body: &Value) -> Option<PersonCard> {
    let st = body.pointer("/data/Staff")?;
    let id = n(st, "id")?;
    let mut seen = HashSet::new();
    let mut works = Vec::new();
    for e in st
        .pointer("/staffMedia/edges")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
    {
        let Some(node) = e.get("node") else { continue };
        // Adult works stay out, as in the title search.
        if s(node, "type").as_deref() != Some("ANIME")
            || node.get("isAdult").and_then(Value::as_bool) == Some(true)
        {
            continue;
        }
        let Some(role) = s(e, "staffRole").as_deref().and_then(anilist_role) else {
            continue;
        };
        let (Some(wid), Some((_, title))) = (n(node, "id"), anilist_titles(node)) else {
            continue;
        };
        let work_key = format!("anilist:{wid}");
        if !seen.insert(work_key.clone()) {
            continue;
        }
        works.push(PersonWork {
            work_key,
            kind: Kind::Anime,
            title,
            year: anilist_year(node),
            poster_path: anilist_poster(node),
            role,
        });
    }
    Some(PersonCard {
        key: PersonKey::Anilist(id),
        name: anilist_name(st)?,
        profile: anilist_image(st),
        born: fuzzy_date(st.get("dateOfBirth")),
        died: fuzzy_date(st.get("dateOfDeath")),
        place: s(st, "homeTown"),
        bio: s(st, "description")
            .map(|d| strip_html(&d))
            .filter(|d| !d.is_empty()),
        works: sort_works(works),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keys_round_trip() {
        assert_eq!(PersonKey::parse("tmdb:5655"), Some(PersonKey::Tmdb(5655)));
        assert_eq!(
            PersonKey::parse("anilist:96881"),
            Some(PersonKey::Anilist(96881))
        );
        assert_eq!(PersonKey::parse("tmdb:0"), None);
        assert_eq!(PersonKey::parse("imdb:1"), None);
        assert_eq!(PersonKey::Tmdb(7).to_string(), "tmdb:7");
    }

    #[test]
    fn keys_must_be_canonical() {
        assert_eq!(PersonKey::parse("tmdb:05"), None);
        assert_eq!(PersonKey::parse("tmdb:+5"), None);
        assert_eq!(PersonKey::parse("anilist:007"), None);
    }

    #[test]
    fn keys_from_encoded_path_segments() {
        assert_eq!(
            PersonKey::from_path("tmdb%3A9339"),
            Some(PersonKey::Tmdb(9339))
        );
        assert_eq!(
            PersonKey::from_path("anilist%3a96881"),
            Some(PersonKey::Anilist(96881))
        );
        assert_eq!(
            PersonKey::from_path("tmdb:9339"),
            Some(PersonKey::Tmdb(9339))
        );
        assert_eq!(PersonKey::from_path("tmdb%3"), None);
        assert_eq!(PersonKey::from_path("tmdb%zz9"), None);
        assert_eq!(PersonKey::from_path("tmdb%3A%2B5"), None);
    }

    #[test]
    fn film_directors_from_crew() {
        let b = json!({"credits": {"crew": [
            {"id": 1, "name": "Lana Wachowski", "job": "Director", "profile_path": "/l.jpg"},
            {"id": 2, "name": "Lilly Wachowski", "job": "Director"},
            {"id": 3, "name": "Bill Pope", "job": "Director of Photography"}
        ]}});
        let c = credits_from_tmdb(false, &b);
        assert_eq!(
            c.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(),
            ["Lana Wachowski", "Lilly Wachowski"]
        );
        assert!(c.iter().all(|x| x.role == Role::Director));
    }

    #[test]
    fn series_creators_from_created_by() {
        let b = json!({"created_by": [{"id": 1223786, "name": "David Simon", "profile_path": "/ds.jpg"}], "credits": {"crew": [{"id": 9, "name": "Ep Director", "job": "Director"}]}});
        let c = credits_from_tmdb(true, &b);
        assert_eq!(c.len(), 1);
        assert_eq!(
            (c[0].name.as_str(), c[0].role),
            ("David Simon", Role::Creator)
        );
        assert_eq!(c[0].key, PersonKey::Tmdb(1223786));
    }

    #[test]
    fn anime_original_author_first_then_director() {
        let m = json!({"staff": {"edges": [
            {"role": "Director", "node": {"id": 10, "name": {"full": "Masayuki Kojima"}}},
            {"role": "Original Creator", "node": {"id": 11, "name": {"full": "Naoki Urasawa"}, "image": {"large": "https://s4.anilist.co/u.jpg"}}}
        ]}});
        let c = credits_from_anilist(&m);
        assert_eq!(c.len(), 1);
        assert_eq!(
            (c[0].name.as_str(), c[0].role),
            ("Naoki Urasawa", Role::Author)
        );
        let only_dir = json!({"staff": {"edges": [{"role": "Director", "node": {"id": 10, "name": {"full": "Masayuki Kojima"}}}]}});
        assert_eq!(credits_from_anilist(&only_dir)[0].role, Role::Director);
    }

    #[test]
    fn person_search_keeps_directors_and_writers_only() {
        let b = json!({"results": [
            {"id": 1, "name": "Christopher Nolan", "known_for_department": "Directing", "known_for": [{"title": "Inception"}]},
            {"id": 2, "name": "Keanu Reeves", "known_for_department": "Acting"},
            {"id": 3, "name": "David Simon", "known_for_department": "Writing", "known_for": [{"name": "The Wire"}]}
        ]});
        let h = hits_from_tmdb(&b, 10);
        assert_eq!(
            h.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(),
            ["Christopher Nolan", "David Simon"]
        );
        assert_eq!(h[1].known_for, ["The Wire"]);
    }

    #[test]
    fn merged_hits_drop_the_anilist_twin() {
        let t = vec![PersonHit {
            key: PersonKey::Tmdb(1),
            name: "Hayao Miyazaki".into(),
            profile: None,
            known_for: vec![],
        }];
        let a = vec![
            PersonHit {
                key: PersonKey::Anilist(9),
                name: "Hayao  Miyazaki".into(),
                profile: None,
                known_for: vec![],
            },
            PersonHit {
                key: PersonKey::Anilist(8),
                name: "Naoki Urasawa".into(),
                profile: None,
                known_for: vec![],
            },
        ];
        let m = merge_hits(t, a, 10);
        assert_eq!(
            m.iter().map(|x| x.key.to_string()).collect::<Vec<_>>(),
            ["tmdb:1", "anilist:8"]
        );
    }

    #[test]
    fn tmdb_card_lists_directed_films_and_created_series_by_year() {
        let b = json!({"id": 1223786, "name": "David Simon", "birthday": "1960-02-09", "place_of_birth": "Washington, D.C.", "biography": "Writer.", "profile_path": "/ds.jpg",
        "combined_credits": {"cast": [{"id": 5, "media_type": "tv", "name": "Cameo"}], "crew": [
            {"id": 1438, "media_type": "tv", "name": "The Wire", "first_air_date": "2002-06-02", "job": "Creator", "department": "Creator", "genre_ids": [80, 18], "original_language": "en", "poster_path": "/w.jpg"},
            {"id": 1438, "media_type": "tv", "name": "The Wire", "first_air_date": "2002-06-02", "job": "Executive Producer", "department": "Production"},
            {"id": 4, "media_type": "tv", "name": "Treme", "first_air_date": "2010-04-11", "job": "Creator", "department": "Creator", "genre_ids": [18], "original_language": "en"},
            {"id": 7, "media_type": "tv", "name": "Some Show", "first_air_date": "2015-01-01", "job": "Writer", "department": "Writing"}
        ]}});
        let c = card_from_tmdb(&b).unwrap();
        assert_eq!(
            c.works
                .iter()
                .map(|w| (w.title.as_str(), w.work_key.as_str()))
                .collect::<Vec<_>>(),
            [("Treme", "tmdb:tv:4"), ("The Wire", "tmdb:tv:1438")]
        );
        assert!(c
            .works
            .iter()
            .all(|w| w.role == Role::Creator && w.kind == Kind::Tv));
        assert_eq!(c.born.as_deref(), Some("1960-02-09"));
    }

    #[test]
    fn anilist_card_keeps_anime_where_they_are_author_or_director() {
        let b = json!({"data": {"Staff": {"id": 11, "name": {"full": "Naoki Urasawa"}, "image": {"large": "https://s4.anilist.co/u.jpg"}, "description": "Mangaka.", "dateOfBirth": {"year": 1960, "month": 1, "day": 2},
        "staffMedia": {"edges": [
            {"staffRole": "Original Creator", "node": {"id": 19, "type": "ANIME", "title": {"romaji": "Monster", "english": "Monster"}, "seasonYear": 2004, "coverImage": {"large": "https://s4.anilist.co/m.jpg"}}},
            {"staffRole": "Theme Song Lyrics", "node": {"id": 20, "type": "ANIME", "title": {"romaji": "Other"}}},
            {"staffRole": "Story & Art", "node": {"id": 30, "type": "MANGA", "title": {"romaji": "Monster"}}},
            {"staffRole": "Original Creator", "node": {"id": 40, "type": "ANIME", "isAdult": true, "title": {"romaji": "Adult"}}}
        ]}}}});
        let c = card_from_anilist(&b).unwrap();
        assert_eq!(c.works.len(), 1);
        assert_eq!(
            (
                c.works[0].work_key.as_str(),
                c.works[0].role,
                c.works[0].kind
            ),
            ("anilist:19", Role::Author, Kind::Anime)
        );
        assert_eq!(c.born.as_deref(), Some("1960-01-02"));
    }
}
