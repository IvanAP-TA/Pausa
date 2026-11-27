//! Rate limits for sensitive actions. v1 numbers (`src/lib/core/limits.ts`, Better Auth) kept; counters live in D1 and only the
//! actions below touch them (BUDGET.md rule 6: every counter write costs a D1 written row).

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rule {
    pub max: i64,
    pub window_ms: i64,
}

const HOUR: i64 = 3_600_000;

pub const CREATE_CIRCLE: Rule = Rule {
    max: 5,
    window_ms: HOUR,
};
pub const JOIN_CIRCLE: Rule = Rule {
    max: 20,
    window_ms: HOUR,
}; // also stops guessing invite codes
pub const CREATE_INVITE: Rule = Rule {
    max: 20,
    window_ms: HOUR,
};
pub const REPORT: Rule = Rule {
    max: 20,
    window_ms: HOUR,
};
pub const REVIEW_LOGIN: Rule = Rule {
    max: 10,
    window_ms: HOUR,
};
/// Sign-in links: per IP (v1: 5 per 10 minutes) and, new, per email so one inbox cannot be flooded from many IPs.
pub const MAGIC_LINK_IP: Rule = Rule {
    max: 5,
    window_ms: 10 * 60_000,
};
pub const MAGIC_LINK_EMAIL: Rule = Rule {
    max: 3,
    window_ms: 10 * 60_000,
};
pub const GUEST_SIGN_IN: Rule = Rule {
    max: 10,
    window_ms: HOUR,
};
pub const CREATE_LOG: Rule = Rule {
    max: 60,
    window_ms: HOUR,
};
pub const COMMENT: Rule = Rule {
    max: 60,
    window_ms: HOUR,
};
/// Catalogue lookups that really go to TMDB/AniList (cache hits are free): v1 allowed 300 searches an hour.
pub const CATALOG: Rule = Rule {
    max: 300,
    window_ms: HOUR,
};
pub const CREATE_SERATA: Rule = Rule {
    max: 20,
    window_ms: HOUR,
};
/// One hit per chunk of rows (retries included), like v1: 600 an hour.
pub const IMPORT_ROWS: Rule = Rule {
    max: 600,
    window_ms: HOUR,
};
pub const IMPORT_START: Rule = Rule {
    max: 30,
    window_ms: HOUR,
};
/// Swapping a one-time code for a native session: per IP.
pub const NATIVE_EXCHANGE: Rule = Rule {
    max: 20,
    window_ms: HOUR,
};
/// Anonymous reads of `/join/<code>` (v1 had none): per IP.
pub const JOIN_PREVIEW: Rule = Rule {
    max: 60,
    window_ms: HOUR,
};

/// Joining the global board or changing the public name: per person (a name is read by strangers; no flood of renames).
pub const BOARD_JOIN: Rule = Rule {
    max: 10,
    window_ms: HOUR,
};
/// Anonymous reads of a public profile page: per IP.
pub const PUBLIC_PROFILE: Rule = Rule {
    max: 120,
    window_ms: HOUR,
};

/// Result of one more hit on a counter.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hit {
    pub allowed: bool,
    /// What is stored: counts up to `max + 1` and stops there, so a refused hit is told apart from the last allowed one.
    pub count: i64,
    pub window_start: i64,
    /// Seconds until the window ends, for `Retry-After`; 0 when allowed.
    pub retry_after_s: u32,
}

/// The same single statement `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count, window_start` runs in D1 (see
/// `crates/api/src/limit.rs`, one query per check and atomic). This is its reference, so the rule is unit-tested natively.
/// Fixed window: the first hit opens a window; an old window starts over; `allowed` is `count <= max`.
pub fn hit(stored: Option<(i64, i64)>, rule: Rule, now: i64) -> Hit {
    let (count, start) = match stored {
        Some((count, start)) if now - start < rule.window_ms => {
            (if count > rule.max { count } else { count + 1 }, start)
        }
        _ => (1, now),
    };
    let allowed = count <= rule.max;
    let retry_after_s = if allowed {
        0
    } else {
        ((start + rule.window_ms - now).max(0).saturating_add(999) / 1000) as u32
    };
    Hit {
        allowed,
        count,
        window_start: start,
        retry_after_s,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_max_then_refuses_then_resets() {
        let rule = Rule {
            max: 2,
            window_ms: 1000,
        };
        let a = hit(None, rule, 0);
        assert_eq!((a.allowed, a.count), (true, 1));
        let b = hit(Some((a.count, a.window_start)), rule, 100);
        assert_eq!((b.allowed, b.count), (true, 2));
        let c = hit(Some((b.count, b.window_start)), rule, 200);
        assert!(!c.allowed);
        assert_eq!(c.count, 3, "stops at max + 1");
        assert_eq!(c.retry_after_s, 1);
        let c2 = hit(Some((c.count, c.window_start)), rule, 300);
        assert_eq!((c2.allowed, c2.count), (false, 3), "does not grow further");
        let d = hit(Some((c2.count, c2.window_start)), rule, 1000);
        assert_eq!((d.allowed, d.count, d.window_start), (true, 1, 1000));
    }

    #[test]
    fn v1_numbers_are_kept() {
        assert_eq!(
            CREATE_CIRCLE,
            Rule {
                max: 5,
                window_ms: 3_600_000
            }
        );
        assert_eq!(JOIN_CIRCLE.max, 20);
        assert_eq!(
            MAGIC_LINK_IP,
            Rule {
                max: 5,
                window_ms: 600_000
            }
        );
    }
}
