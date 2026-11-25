//! Cerchie: invites and who may do what. Ported from `src/lib/core/circles.ts` plus the owner role v1 lacked.

use crate::dto::Role;

/// 32 symbols without `0 O 1 I`: 8 characters = 40 bits.
pub const INVITE_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
pub const INVITE_CODE_LEN: usize = 8;
/// Default life of the invite made with a Cerchia: 14 days.
pub const DEFAULT_INVITE_MS: i64 = 14 * 86_400_000;
/// A Cerchia has at most this many members (notification fan-out writes one row per person: see BUDGET.md §3).
pub const MAX_MEMBERS: u32 = 30;

pub const EXPIRY_CHOICES: [(&str, Option<i64>); 4] = [
    ("1d", Some(86_400_000)),
    ("7d", Some(7 * 86_400_000)),
    ("30d", Some(30 * 86_400_000)),
    ("never", None),
];
pub const MAX_USES_CHOICES: [i64; 4] = [1, 5, 10, 25];

/// An invite code from 8 random bytes. 32 symbols and a mask of 5 bits means no modulo bias.
pub fn invite_code(bytes: &[u8; INVITE_CODE_LEN]) -> String {
    bytes
        .iter()
        .map(|b| INVITE_ALPHABET[(b & 31) as usize] as char)
        .collect()
}

/// Codes people type: trimmed and upper case; only characters of the alphabet, 4..=16 long (the form allows 4..=16).
pub fn normalize_code(raw: &str) -> Option<String> {
    let c = raw.trim().to_uppercase();
    let ok = (4..=16).contains(&c.len()) && c.bytes().all(|b| INVITE_ALPHABET.contains(&b));
    ok.then_some(c)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InviteState {
    Active,
    Revoked,
    Expired,
    Exhausted,
}

/// Precedence: revoked, expired, exhausted, active. Expired exactly at `expires_at`.
pub fn invite_state(
    revoked_at: Option<i64>,
    expires_at: Option<i64>,
    uses: i64,
    max_uses: Option<i64>,
    now: i64,
) -> InviteState {
    if revoked_at.is_some() {
        InviteState::Revoked
    } else if expires_at.is_some_and(|e| e <= now) {
        InviteState::Expired
    } else if max_uses.is_some_and(|m| uses >= m) {
        InviteState::Exhausted
    } else {
        InviteState::Active
    }
}

/// Trimmed name, 1..=60 characters.
pub fn clean_name(raw: &str) -> Option<String> {
    let n = raw.trim();
    let len = n.chars().count();
    ((1..=60).contains(&len)).then(|| n.to_string())
}

/// Description of a Cerchia: at most 280 characters. `Some(None)` = empty (clears it), `None` = too long.
pub fn clean_description(raw: &str) -> Option<Option<String>> {
    let d = raw.trim();
    match d.chars().count() {
        0 => Some(None),
        1..=280 => Some(Some(d.to_string())),
        _ => None,
    }
}

/// A cover is one of the preset keys (no uploads: nothing to host, nothing to moderate): 1..=32 of `a-z 0-9 -`.
pub fn valid_cover(c: &str) -> bool {
    (1..=32).contains(&c.len())
        && c.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Denied {
    /// The target is the owner, or you are not allowed to touch someone of that rank.
    Rank,
    NotManager,
    NotOwner,
    SelfAction,
}

/// May `actor` change `target`'s role to `new`? Only the owner promotes and demotes; the owner role itself moves only by
/// [`transfer_ownership`], so this refuses to make or unmake an owner.
pub fn can_set_role(actor: Role, target: Role, new: Role) -> Result<(), Denied> {
    if !actor.is_owner() {
        return Err(Denied::NotOwner);
    }
    if target == Role::Owner || new == Role::Owner {
        return Err(Denied::Rank);
    }
    Ok(())
}

/// May `actor` remove `target` from the Cerchia? Admins remove members, only the owner removes admins, nobody removes the owner
/// (they transfer or delete instead).
pub fn can_remove(actor: Role, target: Role, same_person: bool) -> Result<(), Denied> {
    if same_person {
        return Err(Denied::SelfAction);
    }
    if !actor.can_manage() {
        return Err(Denied::NotManager);
    }
    match (actor, target) {
        (_, Role::Owner) => Err(Denied::Rank),
        (Role::Admin, Role::Admin) => Err(Denied::Rank),
        _ => Ok(()),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LeaveOutcome {
    /// Just leaves.
    Leave,
    /// The owner is the only member: leaving deletes the Cerchia.
    DeleteCircle,
    /// The owner must transfer first.
    MustTransfer,
}

pub fn leave_outcome(role: Role, members: u32) -> LeaveOutcome {
    match (role, members) {
        (Role::Owner, 1) => LeaveOutcome::DeleteCircle,
        (Role::Owner, _) => LeaveOutcome::MustTransfer,
        _ => LeaveOutcome::Leave,
    }
}

/// Who inherits a Cerchia when its owner's account is deleted: the longest-standing admin, else the longest-standing member.
/// `members` are `(user_id, role, joined_at)`; the departing owner is excluded by the caller. `None` = nobody left.
pub fn next_owner<'a>(members: &'a [(&'a str, Role, i64)]) -> Option<&'a str> {
    let by_seniority = |role: Role| {
        members
            .iter()
            .filter(|m| m.1 == role)
            .min_by_key(|m| m.2)
            .map(|m| m.0)
    };
    by_seniority(Role::Admin).or_else(|| by_seniority(Role::Member))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invite_codes_use_the_32_symbol_alphabet() {
        let code = invite_code(&[0, 1, 2, 3, 30, 31, 32, 255]);
        assert_eq!(code.len(), 8);
        assert!(code.bytes().all(|b| INVITE_ALPHABET.contains(&b)));
        assert_eq!(invite_code(&[0; 8]), "AAAAAAAA");
        assert!(!INVITE_ALPHABET.iter().any(|b| b"0O1I".contains(b)));
    }

    #[test]
    fn typed_codes_are_normalised() {
        assert_eq!(normalize_code(" abcd2345 "), Some("ABCD2345".into()));
        assert_eq!(normalize_code("abc"), None);
        assert_eq!(normalize_code("ABCD1234"), None); // 1 is not in the alphabet
        assert_eq!(normalize_code(&"A".repeat(17)), None);
    }

    #[test]
    fn invite_state_precedence() {
        let now = 1000;
        assert_eq!(invite_state(None, None, 0, None, now), InviteState::Active);
        assert_eq!(
            invite_state(Some(1), Some(1), 9, Some(1), now),
            InviteState::Revoked
        );
        assert_eq!(
            invite_state(None, Some(now), 0, None, now),
            InviteState::Expired
        );
        assert_eq!(
            invite_state(None, Some(now + 1), 0, None, now),
            InviteState::Active
        );
        assert_eq!(
            invite_state(None, Some(1), 5, Some(5), now),
            InviteState::Expired
        );
        assert_eq!(
            invite_state(None, None, 5, Some(5), now),
            InviteState::Exhausted
        );
        assert_eq!(
            invite_state(None, None, 4, Some(5), now),
            InviteState::Active
        );
    }

    #[test]
    fn descriptions_and_covers() {
        assert_eq!(clean_description("  hi "), Some(Some("hi".into())));
        assert_eq!(clean_description("   "), Some(None));
        assert_eq!(clean_description(&"x".repeat(281)), None);
        assert!(valid_cover("sala-cinema") && valid_cover("a1"));
        assert!(
            !valid_cover("")
                && !valid_cover("A")
                && !valid_cover("a b")
                && !valid_cover("../x")
                && !valid_cover(&"a".repeat(33))
        );
    }

    #[test]
    fn names_are_trimmed_and_bounded() {
        assert_eq!(clean_name("  Divano "), Some("Divano".into()));
        assert_eq!(clean_name("   "), None);
        assert_eq!(
            clean_name(&"é".repeat(60)).map(|s| s.chars().count()),
            Some(60)
        );
        assert_eq!(clean_name(&"é".repeat(61)), None);
    }

    #[test]
    fn only_the_owner_changes_roles_and_never_makes_an_owner() {
        assert_eq!(can_set_role(Role::Owner, Role::Member, Role::Admin), Ok(()));
        assert_eq!(can_set_role(Role::Owner, Role::Admin, Role::Member), Ok(()));
        assert_eq!(
            can_set_role(Role::Admin, Role::Member, Role::Admin),
            Err(Denied::NotOwner)
        );
        assert_eq!(
            can_set_role(Role::Owner, Role::Member, Role::Owner),
            Err(Denied::Rank)
        );
        assert_eq!(
            can_set_role(Role::Owner, Role::Owner, Role::Member),
            Err(Denied::Rank)
        );
    }

    #[test]
    fn removal_respects_rank() {
        assert_eq!(can_remove(Role::Admin, Role::Member, false), Ok(()));
        assert_eq!(can_remove(Role::Owner, Role::Admin, false), Ok(()));
        assert_eq!(
            can_remove(Role::Admin, Role::Admin, false),
            Err(Denied::Rank)
        );
        assert_eq!(
            can_remove(Role::Admin, Role::Owner, false),
            Err(Denied::Rank),
            "an admin can no longer remove the creator"
        );
        assert_eq!(
            can_remove(Role::Member, Role::Member, false),
            Err(Denied::NotManager)
        );
        assert_eq!(
            can_remove(Role::Owner, Role::Owner, true),
            Err(Denied::SelfAction)
        );
    }

    #[test]
    fn leaving() {
        assert_eq!(leave_outcome(Role::Member, 5), LeaveOutcome::Leave);
        assert_eq!(leave_outcome(Role::Admin, 2), LeaveOutcome::Leave);
        assert_eq!(leave_outcome(Role::Owner, 3), LeaveOutcome::MustTransfer);
        assert_eq!(leave_outcome(Role::Owner, 1), LeaveOutcome::DeleteCircle);
    }

    #[test]
    fn a_circle_never_ends_up_without_an_owner() {
        let m = [
            ("m1", Role::Member, 10),
            ("a2", Role::Admin, 30),
            ("a1", Role::Admin, 20),
            ("m0", Role::Member, 1),
        ];
        assert_eq!(next_owner(&m), Some("a1"), "longest-standing admin first");
        assert_eq!(
            next_owner(&[("m1", Role::Member, 10), ("m0", Role::Member, 1)]),
            Some("m0")
        );
        assert_eq!(next_owner(&[]), None);
    }
}
