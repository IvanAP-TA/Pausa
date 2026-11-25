//! Lists: watchlist, ordinary lists, rankings. Rules from `lib/actions.ts` / `lib/core/content.ts`, plus what v1 lacked
//! (note and priority per title, reordering as one operation, duplication).

pub const MAX_NAME: usize = 80;
pub const MAX_DESCRIPTION: usize = 280;
pub const MAX_NOTE: usize = 280;
pub const MAX_ITEMS: usize = 200;
/// Watchlist priority: 0 = none, 1 = soon, 2 = next, 3 = tonight.
pub const MAX_PRIORITY: i64 = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Watchlist,
    List,
    Ranking,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Watchlist => "watchlist",
            Kind::List => "list",
            Kind::Ranking => "ranking",
        }
    }
    /// An unknown value becomes an ordinary list (v1 behaviour); `None` input too.
    pub fn parse_lenient(s: Option<&str>) -> Kind {
        match s {
            Some("watchlist") => Kind::Watchlist,
            Some("ranking") => Kind::Ranking,
            _ => Kind::List,
        }
    }
}

pub fn clean_name(raw: &str) -> Option<String> {
    let n = raw.trim();
    (1..=MAX_NAME)
        .contains(&n.chars().count())
        .then(|| n.to_string())
}

/// `Some(None)` = empty (clears it), `None` = too long.
pub fn clean_description(raw: &str) -> Option<Option<String>> {
    let d = raw.trim();
    match d.chars().count() {
        0 => Some(None),
        1..=MAX_DESCRIPTION => Some(Some(d.to_string())),
        _ => None,
    }
}

pub fn clean_note(raw: &str) -> Option<Option<String>> {
    clean_description(raw)
}

/// Who may do what with a list. A personal list belongs to its owner alone; a group list can be edited by every member of its
/// Cerchia and deleted by its owner or by a manager (owner/admin) of the Cerchia.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Access {
    pub can_edit: bool,
    pub can_delete: bool,
}

pub fn access(
    circle_id: Option<&str>,
    owner_id: &str,
    viewer: &str,
    viewer_is_member: bool,
    viewer_can_manage: bool,
) -> Option<Access> {
    match circle_id {
        None => (owner_id == viewer).then_some(Access {
            can_edit: true,
            can_delete: true,
        }),
        Some(_) if !viewer_is_member => None,
        Some(_) => Some(Access {
            can_edit: true,
            can_delete: owner_id == viewer || viewer_can_manage,
        }),
    }
}

/// A reorder must name exactly the titles the list holds, each once. Returns the positions to write, in the order given.
pub fn valid_order(current: &[String], wanted: &[String]) -> bool {
    if current.len() != wanted.len() {
        return false;
    }
    let mut a: Vec<&String> = current.iter().collect();
    let mut b: Vec<&String> = wanted.iter().collect();
    a.sort();
    b.sort();
    a == b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_are_lenient() {
        assert_eq!(Kind::parse_lenient(Some("watchlist")), Kind::Watchlist);
        assert_eq!(Kind::parse_lenient(Some("ranking")), Kind::Ranking);
        assert_eq!(Kind::parse_lenient(Some("weird")), Kind::List);
        assert_eq!(Kind::parse_lenient(None), Kind::List);
        assert_eq!(Kind::Watchlist.as_str(), "watchlist");
    }

    #[test]
    fn text_is_cleaned() {
        assert_eq!(clean_name("  Da vedere  "), Some("Da vedere".into()));
        assert_eq!(clean_name(""), None);
        assert_eq!(clean_name(&"x".repeat(81)), None);
        assert_eq!(clean_description("   "), Some(None));
        assert_eq!(clean_description(&"x".repeat(281)), None);
        assert_eq!(clean_note("per sabato"), Some(Some("per sabato".into())));
    }

    #[test]
    fn personal_lists_are_private_group_lists_are_shared() {
        assert_eq!(
            access(None, "me", "me", false, false),
            Some(Access {
                can_edit: true,
                can_delete: true
            })
        );
        assert_eq!(
            access(None, "me", "you", true, true),
            None,
            "somebody else's personal list does not exist"
        );
        assert_eq!(
            access(Some("c"), "me", "you", false, false),
            None,
            "outsiders see nothing"
        );
        assert_eq!(
            access(Some("c"), "me", "you", true, false),
            Some(Access {
                can_edit: true,
                can_delete: false
            })
        );
        assert_eq!(
            access(Some("c"), "me", "you", true, true),
            Some(Access {
                can_edit: true,
                can_delete: true
            }),
            "a manager may delete"
        );
        assert_eq!(
            access(Some("c"), "me", "me", true, false),
            Some(Access {
                can_edit: true,
                can_delete: true
            }),
            "the owner may delete"
        );
    }

    #[test]
    fn reorder_must_be_a_permutation() {
        let v = |x: &[&str]| x.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(valid_order(&v(&["a", "b", "c"]), &v(&["c", "a", "b"])));
        assert!(!valid_order(&v(&["a", "b", "c"]), &v(&["a", "b"])));
        assert!(!valid_order(&v(&["a", "b", "c"]), &v(&["a", "b", "b"])));
        assert!(!valid_order(&v(&["a", "b", "c"]), &v(&["a", "b", "x"])));
        assert!(valid_order(&[], &[]));
    }
}
