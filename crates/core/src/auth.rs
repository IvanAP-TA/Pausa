//! Sessions, sign-in tokens, cookies. Pure: randomness and time are passed in, so everything here is unit-tested natively.
//!
//! Design (docs/rebuild/PLAN.md §3): opaque 256-bit tokens, only `SHA-256(token)` is stored, no slow hashes (10 ms CPU).

use sha2::{Digest, Sha256};

/// Web and native sessions last 60 days (same as v1) and are renewed at most once a day.
pub const SESSION_TTL_MS: i64 = 60 * 24 * 3_600_000;
pub const SESSION_TOUCH_MS: i64 = 24 * 3_600_000;
/// A sign-in link works once, for 15 minutes.
pub const MAGIC_LINK_TTL_MS: i64 = 15 * 60_000;
/// The one-time code that moves a sign-in from the system browser into the native app.
pub const NATIVE_CODE_TTL_MS: i64 = 3 * 60_000;

/// Name of the session cookie. `__Host-` forbids a Domain and requires `Secure` and `Path=/`, so a sibling subdomain cannot
/// overwrite it. Local development over http has no Secure cookies, so it uses the plain name.
pub fn cookie_name(secure: bool) -> &'static str {
    if secure {
        "__Host-pausa_session"
    } else {
        "pausa_session"
    }
}

const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// Base64url without padding (the tokens are ASCII-safe in cookies, URLs and JSON).
pub fn base64url(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = match chunk {
            [a, b, c] => u32::from(*a) << 16 | u32::from(*b) << 8 | u32::from(*c),
            [a, b] => u32::from(*a) << 16 | u32::from(*b) << 8,
            [a] => u32::from(*a) << 16,
            _ => unreachable!(),
        };
        let chars = chunk.len() + 1;
        for i in 0..chars {
            out.push(B64URL[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

/// A new token from 32 random bytes supplied by the caller.
pub fn token_from_bytes(bytes: &[u8; 32]) -> String {
    base64url(bytes)
}

/// What the database stores for a token: lowercase hex SHA-256.
pub fn hash_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    let mut out = String::with_capacity(64);
    for b in digest {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// RFC 7636 S256 challenge for a Google OAuth code verifier.
pub fn pkce_s256(verifier: &str) -> String {
    base64url(&Sha256::digest(verifier.as_bytes()))
}

/// RFC 4122 version 4 UUID from 16 random bytes supplied by the caller.
pub fn uuid_v4(bytes: &[u8; 16]) -> String {
    let mut b = *bytes;
    b[6] = b[6] & 0x0f | 0x40;
    b[8] = b[8] & 0x3f | 0x80;
    let h: Vec<String> = b.iter().map(|x| format!("{x:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        h[0..4].concat(),
        h[4..6].concat(),
        h[6..8].concat(),
        h[8..10].concat(),
        h[10..16].concat()
    )
}

/// `Set-Cookie` value for a new session.
pub fn session_cookie(token: &str, secure: bool, max_age_s: i64) -> String {
    let flags = if secure { "; Secure" } else { "" };
    format!(
        "{}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age_s}{flags}",
        cookie_name(secure)
    )
}

/// `Set-Cookie` value that removes the session cookie.
pub fn clear_cookie(secure: bool) -> String {
    session_cookie("", secure, 0)
}

/// The session token from a `Cookie` header, if present.
pub fn token_from_cookie_header(header: &str, secure: bool) -> Option<&str> {
    let name = cookie_name(secure);
    header
        .split(';')
        .filter_map(|kv| kv.trim().split_once('='))
        .find(|(k, v)| *k == name && !v.is_empty())
        .map(|(_, v)| v)
}

/// The token from an `Authorization: Bearer <token>` header (native app).
pub fn token_from_bearer(header: &str) -> Option<&str> {
    let t = header.strip_prefix("Bearer ")?.trim();
    (!t.is_empty()).then_some(t)
}

/// Where to go after signing in. Only same-site paths: starts with `/`, not `//`, no backslash (open-redirect guard).
pub fn safe_next(next: Option<&str>, fallback: &str) -> String {
    match next {
        Some(n)
            if n.starts_with('/')
                && !n.starts_with("//")
                && !n.contains('\\')
                && !n.contains('\n')
                && !n.contains('\r') =>
        {
            n.to_string()
        }
        _ => fallback.to_string(),
    }
}

/// Minimal email check: something@something.tld, no spaces, at most 254 bytes. Real validation is the link itself.
pub fn normalize_email(raw: &str) -> Option<String> {
    let e = raw.trim().to_lowercase();
    if e.len() > 254 || e.contains(char::is_whitespace) {
        return None;
    }
    let (local, domain) = e.split_once('@')?;
    let ok = !local.is_empty()
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !domain.contains("..");
    ok.then_some(e)
}

/// A display name for a new account made from an email: the part before the `@`, trimmed to 60 characters.
pub fn name_from_email(email: &str) -> String {
    let local = email.split('@').next().unwrap_or("");
    local.chars().take(60).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_matches_rfc_7636() {
        assert_eq!(
            pkce_s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn base64url_matches_known_vectors() {
        // RFC 4648 test vectors, unpadded, url alphabet.
        assert_eq!(base64url(b""), "");
        assert_eq!(base64url(b"f"), "Zg");
        assert_eq!(base64url(b"fo"), "Zm8");
        assert_eq!(base64url(b"foo"), "Zm9v");
        assert_eq!(base64url(b"foob"), "Zm9vYg");
        assert_eq!(base64url(&[0xfb, 0xff]), "-_8");
    }

    #[test]
    fn tokens_are_43_url_safe_chars() {
        let t = token_from_bytes(&[7u8; 32]);
        assert_eq!(t.len(), 43);
        assert!(t
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn hash_is_sha256_hex() {
        assert_eq!(
            hash_token("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_ne!(hash_token("abc"), hash_token("abd"));
    }

    #[test]
    fn uuid_v4_has_version_and_variant() {
        let u = uuid_v4(&[0xff; 16]);
        assert_eq!(u.len(), 36);
        assert_eq!(&u[14..15], "4");
        assert!(matches!(&u[19..20], "8" | "9" | "a" | "b"));
        assert_eq!(uuid_v4(&[0; 16]), "00000000-0000-4000-8000-000000000000");
    }

    #[test]
    fn cookie_flags() {
        let c = session_cookie("tok", true, 60);
        assert!(c.starts_with("__Host-pausa_session=tok;"));
        assert!(
            c.contains("HttpOnly")
                && c.contains("Secure")
                && c.contains("SameSite=Lax")
                && c.contains("Path=/")
        );
        assert!(!c.contains("Domain"));
        let dev = session_cookie("tok", false, 60);
        assert!(dev.starts_with("pausa_session=tok;") && !dev.contains("Secure"));
        assert!(clear_cookie(true).contains("Max-Age=0"));
    }

    #[test]
    fn reads_token_from_cookie_and_bearer() {
        assert_eq!(
            token_from_cookie_header("a=1; pausa_session=xyz; b=2", false),
            Some("xyz")
        );
        assert_eq!(
            token_from_cookie_header("a=1; pausa_session=xyz", true),
            None
        );
        assert_eq!(
            token_from_cookie_header("__Host-pausa_session=; a=1", true),
            None
        );
        assert_eq!(token_from_bearer("Bearer abc"), Some("abc"));
        assert_eq!(token_from_bearer("Basic abc"), None);
        assert_eq!(token_from_bearer("Bearer "), None);
    }

    #[test]
    fn next_only_allows_same_site_paths() {
        assert_eq!(safe_next(Some("/it/c/1"), "/it"), "/it/c/1");
        for bad in ["//evil.com", "https://evil.com", "/\\evil", "evil", "/a\nb"] {
            assert_eq!(safe_next(Some(bad), "/it"), "/it", "{bad}");
        }
        assert_eq!(safe_next(None, "/it"), "/it");
    }

    #[test]
    fn emails_are_normalised_and_checked() {
        assert_eq!(
            normalize_email("  Giulia@Pausa.TEST "),
            Some("giulia@pausa.test".into())
        );
        for bad in [
            "", "a", "a@b", "@b.it", "a@@b.it", "a b@c.it", "a@.it", "a@b..it", "a@b.",
        ] {
            assert_eq!(normalize_email(bad), None, "{bad}");
        }
        assert_eq!(normalize_email(&format!("{}@x.it", "a".repeat(260))), None);
        assert_eq!(name_from_email("giulia@pausa.test"), "giulia");
    }
}
