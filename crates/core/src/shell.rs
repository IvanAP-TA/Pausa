//! Which exported app page answers a private deep link.
//!
//! The client is a static export (`apps/mobile/dist`): one HTML file per route, with `[param]` in the name for the dynamic ones
//! (`it/c/[id].html`). A browser opening `/it/c/abc123` has no file of that name, so the Worker maps the URL to the right shell
//! and the client router reads the real id from the address. Pure and tested here; the Worker only fetches the result.
//! Keep in step with `SHELL` in `apps/mobile/scripts/postexport.mjs`.

const LOCALES: [&str; 3] = ["it", "en", "es"];

fn plain(seg: &str) -> bool {
    !seg.is_empty()
        && seg.len() <= 64
        && seg
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b':' | b'.'))
}

/// `/it/c/abc/log/xyz` -> `Some("/it/c/[id]/log/[logId]")`. `None` for anything that is not a dynamic private route (static
/// pages are plain files and never come here), so the caller can let the asset host answer, 404 included.
pub fn shell_path(path: &str) -> Option<String> {
    let segs: Vec<&str> = path.trim_matches('/').split('/').collect();
    let (locale, rest) = segs.split_first()?;
    if !LOCALES.contains(locale) || !rest.iter().all(|s| plain(s)) {
        return None;
    }
    let tail = match rest {
        ["c", _] => "c/[id]".to_string(),
        ["c", _, page @ ("settings" | "feed" | "ranking" | "insights" | "serate" | "members")] => {
            format!("c/[id]/{page}")
        }
        ["c", _, "log", _] => "c/[id]/log/[logId]".to_string(),
        ["c", _, "log", _, "edit"] => "c/[id]/log/[logId]/edit".to_string(),
        ["c", _, "m", _] => "c/[id]/m/[mediaId]".to_string(),
        ["c", _, "people", _] => "c/[id]/people/[userId]".to_string(),
        ["c", _, "person", _] => "c/[id]/person/[key]".to_string(),
        ["join", _] => "join/[code]".to_string(),
        ["log", _] => "log/[logId]".to_string(),
        ["t", _] => "t/[mediaId]".to_string(),
        ["person", _] => "person/[key]".to_string(),
        ["s", _] => "s/[code]".to_string(),
        ["s", _, sub] if sub.bytes().all(|b| b.is_ascii_lowercase()) => format!("s/[code]/{sub}"),
        ["lists", _] => "lists/[id]".to_string(),
        ["u", _] => "u/[handle]".to_string(),
        _ => return None,
    };
    Some(format!("/{locale}/{tail}"))
}

/// Where `/` leads, as in v1: the landing in the browser's language (the first of `Accept-Language` that Pausa speaks,
/// Italian otherwise). `?app` is v1's installed web app (`start_url` "/?app=1"): it opens on home. The rest of the query
/// (campaign tags) is kept.
pub fn root_redirect(accept_language: &str, query: Option<&str>) -> String {
    let locale = accept_language
        .split(',')
        .filter_map(|part| part.trim().get(..2))
        .find_map(|code| LOCALES.into_iter().find(|l| code.eq_ignore_ascii_case(l)))
        .unwrap_or("it");
    let mut app = false;
    let rest: Vec<&str> = query
        .unwrap_or("")
        .split('&')
        .filter(|pair| !pair.is_empty())
        .filter(|pair| {
            let is_app = *pair == "app" || pair.starts_with("app=");
            app |= is_app;
            !is_app
        })
        .collect();
    let target = format!("/{locale}/{}", if app { "home" } else { "" });
    with_query(&target, Some(&rest.join("&")))
}

/// Addresses of the old app (branch `legacy`) that moved: bookmarks, shared links and installed apps still open them.
/// `/it/c/abc/serata` -> `Some("/it/c/abc/serate")`. The result may carry its own query (`?circle=`); the caller appends the
/// request's query after it. `None` when the path is not an old address.
pub fn legacy_redirect(path: &str) -> Option<String> {
    let segs: Vec<&str> = path.trim_matches('/').split('/').collect();
    let (locale, rest) = segs.split_first()?;
    if !LOCALES.contains(locale) || !rest.iter().all(|s| plain(s) && !s.starts_with('.')) {
        return None;
    }
    let tail = match rest {
        ["me", "edit"] => "me/profile".to_string(),
        ["me", "diary"] => "diary".to_string(),
        ["me", "lists"] => "lists".to_string(),
        ["me", "import"] => "import".to_string(),
        ["me", "imports"] => "imports".to_string(),
        ["c", id, "serata"] => format!("c/{id}/serate"),
        ["c", id, "log"] => format!("log?circle={id}"),
        ["c", _, "notifications"] => "notifications".to_string(),
        ["c", id, "lists"] => format!("lists?circle={id}"),
        ["c", _, "import"] => "import".to_string(),
        ["c", id, "l", log] => format!("c/{id}/log/{log}"),
        ["c", id, "l", log, "edit"] => format!("c/{id}/log/{log}/edit"),
        ["c", id, "p", user] => format!("c/{id}/people/{user}"),
        _ => return None,
    };
    Some(format!("/{locale}/{tail}"))
}

/// Joins a redirect target (maybe with its own `?a=b`) and the request query (without `?`).
pub fn with_query(target: &str, query: Option<&str>) -> String {
    match query.filter(|q| !q.is_empty()) {
        None => target.to_string(),
        Some(q) if target.contains('?') => format!("{target}&{q}"),
        Some(q) => format!("{target}?{q}"),
    }
}

/// `/it/s/6QLMP4` or `/it/s/6QLMP4/card` -> `Some(("it", "6QLMP4"))`: a shared Serata link, whose page gets the preview tags.
pub fn serata_code(path: &str) -> Option<(&str, &str)> {
    let segs: Vec<&str> = path.trim_matches('/').split('/').collect();
    match segs.as_slice() {
        [l, "s", code] | [l, "s", code, "card"]
            if LOCALES.contains(l) && plain(code) && !code.starts_with('.') =>
        {
            Some((l, code))
        }
        _ => None,
    }
}

fn attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// The Open Graph and Twitter tags of a link preview; every value escaped (a film title can hold quotes).
pub fn preview_tags(title: &str, description: &str, image: &str) -> String {
    let (t, d, i) = (attr(title), attr(description), attr(image));
    format!(
        "<meta property=\"og:type\" content=\"website\"/><meta property=\"og:site_name\" content=\"Pausa\"/>         <meta property=\"og:title\" content=\"{t}\"/><meta property=\"og:description\" content=\"{d}\"/>         <meta property=\"og:image\" content=\"{i}\"/><meta property=\"og:image:width\" content=\"1200\"/>         <meta property=\"og:image:height\" content=\"630\"/><meta name=\"twitter:card\" content=\"summary_large_image\"/>         <meta name=\"twitter:title\" content=\"{t}\"/><meta name=\"twitter:description\" content=\"{d}\"/>         <meta name=\"twitter:image\" content=\"{i}\"/>"
    )
}

/// `tags` placed right before `</head>`; `None` when the page has no head to put them in.
pub fn inject_head(html: &str, tags: &str) -> Option<String> {
    let at = html.find("</head>")?;
    Some(format!("{}{tags}{}", &html[..at], &html[at..]))
}

#[cfg(test)]
mod preview_tests {
    use super::*;

    #[test]
    fn serata_links_are_recognised() {
        assert_eq!(serata_code("/it/s/6QLMP4"), Some(("it", "6QLMP4")));
        assert_eq!(serata_code("/en/s/6QLMP4/card/"), Some(("en", "6QLMP4")));
        for p in [
            "/fr/s/X",
            "/it/s",
            "/it/s/X/result",
            "/it/s/../x",
            "/it/c/X",
            "/s/X",
        ] {
            assert_eq!(serata_code(p), None, "{p}");
        }
    }

    #[test]
    fn tags_are_escaped_and_go_in_the_head() {
        let tags = preview_tags("Ecco \"Heat\"", "a <b> & c", "https://x/i?a=1&b=2");
        assert!(tags.contains("content=\"Ecco &quot;Heat&quot;\""));
        assert!(tags.contains("a &lt;b&gt; &amp; c"));
        assert!(tags.contains("https://x/i?a=1&amp;b=2"));
        assert!(!tags.contains("<b>"));
        let html = inject_head(
            "<html><head><title>P</title></head><body></body></html>",
            "<meta x/>",
        )
        .unwrap();
        assert_eq!(
            html,
            "<html><head><title>P</title><meta x/></head><body></body></html>"
        );
        assert_eq!(inject_head("<p>no head</p>", "<meta/>"), None);
    }
}

#[cfg(test)]
mod legacy_tests {
    use super::{legacy_redirect as r, with_query};

    #[test]
    fn old_addresses_move_in_every_locale() {
        for l in ["it", "en", "es"] {
            assert_eq!(
                r(&format!("/{l}/me/edit")),
                Some(format!("/{l}/me/profile"))
            );
            assert_eq!(r(&format!("/{l}/me/diary")), Some(format!("/{l}/diary")));
            assert_eq!(r(&format!("/{l}/me/lists")), Some(format!("/{l}/lists")));
            assert_eq!(r(&format!("/{l}/me/import")), Some(format!("/{l}/import")));
            assert_eq!(
                r(&format!("/{l}/me/imports/")),
                Some(format!("/{l}/imports"))
            );
            assert_eq!(
                r(&format!("/{l}/c/abc/serata")),
                Some(format!("/{l}/c/abc/serate"))
            );
            assert_eq!(
                r(&format!("/{l}/c/abc/log")),
                Some(format!("/{l}/log?circle=abc"))
            );
            assert_eq!(
                r(&format!("/{l}/c/abc/notifications")),
                Some(format!("/{l}/notifications"))
            );
            assert_eq!(
                r(&format!("/{l}/c/abc/lists")),
                Some(format!("/{l}/lists?circle=abc"))
            );
            assert_eq!(
                r(&format!("/{l}/c/abc/import")),
                Some(format!("/{l}/import"))
            );
            assert_eq!(
                r(&format!("/{l}/c/abc/l/x1")),
                Some(format!("/{l}/c/abc/log/x1"))
            );
            assert_eq!(
                r(&format!("/{l}/c/abc/l/x1/edit")),
                Some(format!("/{l}/c/abc/log/x1/edit"))
            );
            assert_eq!(
                r(&format!("/{l}/c/abc/p/u1")),
                Some(format!("/{l}/c/abc/people/u1"))
            );
        }
    }

    #[test]
    fn current_and_foreign_addresses_are_untouched() {
        for p in [
            "/it/me",
            "/it/me/circles",
            "/it/me/profile",
            "/it/c/abc",
            "/it/c/abc/serate",
            "/fr/me/edit",
            "/it/c/a b/log",
            "/it/c/../log",
            "/me/edit",
        ] {
            assert_eq!(r(p), None, "{p}");
        }
    }

    #[test]
    fn query_is_kept() {
        assert_eq!(
            with_query("/it/log?circle=abc", Some("media=tmdb:1")),
            "/it/log?circle=abc&media=tmdb:1"
        );
        assert_eq!(with_query("/it/diary", Some("q=x")), "/it/diary?q=x");
        assert_eq!(with_query("/it/diary", Some("")), "/it/diary");
        assert_eq!(with_query("/it/diary", None), "/it/diary");
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_root_goes_to_the_landing_in_the_browser_language() {
        use super::root_redirect as to;
        assert_eq!(to("en-GB,en;q=0.9,it;q=0.8", None), "/en/");
        assert_eq!(to("fr-FR,ES;q=0.7", None), "/es/");
        assert_eq!(to("", None), "/it/");
        assert_eq!(to("de, à", None), "/it/");
        assert_eq!(to("it", Some("utm_source=x")), "/it/?utm_source=x");
        assert_eq!(to("es", Some("app=1")), "/es/home");
        assert_eq!(to("es", Some("app=1&a=b")), "/es/home?a=b");
    }

    use super::shell_path as s;

    #[test]
    fn dynamic_private_routes_map_to_their_shell() {
        assert_eq!(s("/it/c/abc123"), Some("/it/c/[id]".into()));
        assert_eq!(s("/en/c/abc/settings"), Some("/en/c/[id]/settings".into()));
        assert_eq!(s("/es/c/abc/ranking/"), Some("/es/c/[id]/ranking".into()));
        assert_eq!(s("/it/c/abc/log/l1"), Some("/it/c/[id]/log/[logId]".into()));
        assert_eq!(
            s("/it/c/abc/people/u1"),
            Some("/it/c/[id]/people/[userId]".into())
        );
        assert_eq!(s("/it/c/abc/serate"), Some("/it/c/[id]/serate".into()));
        assert_eq!(s("/it/c/abc/members"), Some("/it/c/[id]/members".into()));
        assert_eq!(
            s("/it/c/abc/log/l1/edit"),
            Some("/it/c/[id]/log/[logId]/edit".into())
        );
        assert_eq!(
            s("/it/c/abc/m/local:x1"),
            Some("/it/c/[id]/m/[mediaId]".into())
        );
        assert_eq!(s("/it/join/ABCD"), Some("/it/join/[code]".into()));
        assert_eq!(s("/it/log/l1"), Some("/it/log/[logId]".into()));
        assert_eq!(s("/it/t/local:x1"), Some("/it/t/[mediaId]".into()));
        assert_eq!(s("/it/s/6QLMP4"), Some("/it/s/[code]".into()));
        assert_eq!(s("/it/s/6QLMP4/result"), Some("/it/s/[code]/result".into()));
        assert_eq!(s("/it/lists/l1"), Some("/it/lists/[id]".into()));
        assert_eq!(s("/en/u/abcdefghjkmn"), Some("/en/u/[handle]".into()));
        assert_eq!(s("/it/person/tmdb:9339"), Some("/it/person/[key]".into()));
        assert_eq!(
            s("/en/c/abc/person/anilist:96881"),
            Some("/en/c/[id]/person/[key]".into())
        );
    }

    #[test]
    fn everything_else_is_left_to_the_asset_host() {
        for p in [
            "/",
            "/it",
            "/it/home",
            "/it/privacy",
            "/it/c",
            "/it/c/abc/nope",
            "/fr/c/abc",
            "/it/c/a b",
            "/it/c/../x",
            "/it/c/abc/log",
            "/it/lists",
            "/api/me",
            "/it/c/abc/log/l1/extra",
            "/it/s/X/Res1",
            "/it/person",
            "/it/person/tmdb%3A9339",
            "/it/c/abc/person",
        ] {
            assert_eq!(s(p), None, "{p}");
        }
    }
}
