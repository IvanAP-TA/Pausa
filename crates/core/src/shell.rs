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
        ["join", _] => "join/[code]".to_string(),
        ["log", _] => "log/[logId]".to_string(),
        ["t", _] => "t/[mediaId]".to_string(),
        ["s", _] => "s/[code]".to_string(),
        ["s", _, sub] if sub.bytes().all(|b| b.is_ascii_lowercase()) => format!("s/[code]/{sub}"),
        ["lists", _] => "lists/[id]".to_string(),
        _ => return None,
    };
    Some(format!("/{locale}/{tail}"))
}

#[cfg(test)]
mod tests {
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
        assert_eq!(s("/it/c/abc/log/l1/edit"), Some("/it/c/[id]/log/[logId]/edit".into()));
        assert_eq!(s("/it/c/abc/m/local:x1"), Some("/it/c/[id]/m/[mediaId]".into()));
        assert_eq!(s("/it/join/ABCD"), Some("/it/join/[code]".into()));
        assert_eq!(s("/it/log/l1"), Some("/it/log/[logId]".into()));
        assert_eq!(s("/it/t/local:x1"), Some("/it/t/[mediaId]".into()));
        assert_eq!(s("/it/s/6QLMP4"), Some("/it/s/[code]".into()));
        assert_eq!(s("/it/s/6QLMP4/result"), Some("/it/s/[code]/result".into()));
        assert_eq!(s("/it/lists/l1"), Some("/it/lists/[id]".into()));
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
        ] {
            assert_eq!(s(p), None, "{p}");
        }
    }
}
