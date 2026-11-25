//! Web Push (the installed web app): a VAPID-signed push (RFC 8292) with NO payload. A push without a body needs no encryption; the
//! service worker wakes up, asks `/api/notifications` what is new and shows it. The signature is ECDSA P-256 / SHA-256 made with
//! WebCrypto from `VAPID_PRIVATE_JWK` (a secret, a JWK with `d`); `VAPID_PUBLIC_KEY` (the 65-byte uncompressed point, base64url)
//! and `VAPID_SUBJECT` (`mailto:` or `https:` contact for the push service) are plain variables. Without them Web Push is off.

use crate::http::{finish, json, now_ms, Fail, R};
use pausa_core::auth::base64url;
use serde_json::json;
use worker::js_sys::{Array, Object, Reflect, Uint8Array};
use worker::wasm_bindgen::{JsCast, JsValue};
use worker::wasm_bindgen_futures::JsFuture;
use worker::*;

const JWT_TTL_MS: i64 = 12 * 3_600_000;

#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    Sent,
    /// The push service says the subscription is gone (404/410): forget the device.
    Gone,
    /// Not configured, or a transient failure: leave the device alone.
    Skipped,
}

/// `https://fcm.googleapis.com/fcm/send/abc` -> `https://fcm.googleapis.com` (the JWT audience).
///
/// `allow_loopback` (the `VAPID_DEV_LOOPBACK` variable, local tests only) also accepts `http://127.0.0.1` and `http://localhost`.
pub fn audience(endpoint: &str, allow_loopback: bool) -> Option<String> {
    let (scheme, rest) = match (
        endpoint.strip_prefix("https://"),
        endpoint.strip_prefix("http://"),
    ) {
        (Some(r), _) => ("https", r),
        (None, Some(r))
            if allow_loopback
                && matches!(r.split(['/', ':']).next(), Some("127.0.0.1" | "localhost")) =>
        {
            ("http", r)
        }
        _ => return None,
    };
    let host = rest.split('/').next().filter(|h| !h.is_empty())?;
    Some(format!("{scheme}://{host}"))
}

/// The unsigned part of the JWT: `base64url(header).base64url(claims)`.
pub fn signing_input(aud: &str, subject: &str, exp_s: i64) -> String {
    let header = base64url(br#"{"typ":"JWT","alg":"ES256"}"#);
    let claims = base64url(
        json!({ "aud": aud, "exp": exp_s, "sub": subject })
            .to_string()
            .as_bytes(),
    );
    format!("{header}.{claims}")
}

async fn sign(env: &Env, input: &str) -> Result<Vec<u8>> {
    let jwk_text = env.secret("VAPID_PRIVATE_JWK")?.to_string();
    let jwk = worker::js_sys::JSON::parse(&jwk_text)
        .map_err(|_| Error::RustError("VAPID_PRIVATE_JWK is not JSON".into()))?;
    let global = worker::js_sys::global();
    let crypto = Reflect::get(&global, &"crypto".into())?;
    let subtle = Reflect::get(&crypto, &"subtle".into())?;
    let call = |name: &str, args: &[JsValue]| -> Result<JsFuture> {
        let f: worker::js_sys::Function = Reflect::get(&subtle, &name.into())?.dyn_into()?;
        let a = Array::new();
        for v in args {
            a.push(v);
        }
        let p = f.apply(&subtle, &a)?;
        Ok(JsFuture::from(worker::js_sys::Promise::from(p)))
    };
    let alg = Object::new();
    Reflect::set(&alg, &"name".into(), &"ECDSA".into())?;
    Reflect::set(&alg, &"namedCurve".into(), &"P-256".into())?;
    let usages = Array::new();
    usages.push(&"sign".into());
    let key = call(
        "importKey",
        &["jwk".into(), jwk, alg.into(), false.into(), usages.into()],
    )?
    .await?;
    let sig_alg = Object::new();
    Reflect::set(&sig_alg, &"name".into(), &"ECDSA".into())?;
    let hash = Object::new();
    Reflect::set(&hash, &"name".into(), &"SHA-256".into())?;
    Reflect::set(&sig_alg, &"hash".into(), &hash)?;
    let data = Uint8Array::from(input.as_bytes());
    let sig = call("sign", &[sig_alg.into(), key, data.into()])?.await?;
    // WebCrypto returns the raw r||s (64 bytes), which is exactly what a JWS ES256 signature is.
    Ok(Uint8Array::new(&sig).to_vec())
}

/// Sends one empty push. Never errors outward: the notification itself is already stored and shown in the app.
pub async fn send(env: &Env, endpoint: &str) -> Outcome {
    let (Ok(public), Ok(subject)) = (
        env.var("VAPID_PUBLIC_KEY").map(|v| v.to_string()),
        env.var("VAPID_SUBJECT").map(|v| v.to_string()),
    ) else {
        return Outcome::Skipped;
    };
    let Some(aud) = audience(endpoint, env.var("VAPID_DEV_LOOPBACK").is_ok()) else {
        return Outcome::Gone; // not an https endpoint: it was never valid
    };
    let input = signing_input(&aud, &subject, (now_ms() + JWT_TTL_MS) / 1000);
    let sig = match sign(env, &input).await {
        Ok(s) if s.len() == 64 => s,
        Ok(_) | Err(_) => {
            console_error!("web push: could not sign the VAPID token");
            return Outcome::Skipped;
        }
    };
    let jwt = format!("{input}.{}", base64url(&sig));
    let headers = Headers::new();
    let set = |k: &str, v: &str| headers.set(k, v).is_ok();
    if !(set("Authorization", &format!("vapid t={jwt}, k={public}"))
        && set("TTL", "3600")
        && set("Urgency", "normal"))
    {
        return Outcome::Skipped;
    }
    let mut init = RequestInit::new();
    init.with_method(Method::Post).with_headers(headers);
    let Ok(req) = Request::new_with_init(endpoint, &init) else {
        return Outcome::Gone;
    };
    match Fetch::Request(req).send().await {
        Ok(res) => match res.status_code() {
            200..=299 => Outcome::Sent,
            404 | 410 => Outcome::Gone,
            c => {
                console_error!("web push service answered {c}");
                Outcome::Skipped
            }
        },
        Err(e) => {
            console_error!("web push failed: {e}");
            Outcome::Skipped
        }
    }
}

/// `GET /api/push/key`: the public key the browser needs to subscribe (`applicationServerKey`). 404 when Web Push is off.
pub async fn public_key(_req: Request, env: Env) -> Result<Response> {
    let r: R<Response> = match env.var("VAPID_PUBLIC_KEY") {
        Ok(k) if env.secret("VAPID_PRIVATE_JWK").is_ok() => {
            json(&json!({ "publicKey": k.to_string() }), 200)
        }
        _ => Err(Fail::not_found()),
    };
    finish(r)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_audience_is_the_push_service_origin() {
        assert_eq!(
            audience("https://fcm.googleapis.com/fcm/send/abc", false).as_deref(),
            Some("https://fcm.googleapis.com")
        );
        assert_eq!(
            audience(
                "https://updates.push.services.mozilla.com:443/wpush/v2/x",
                false
            )
            .as_deref(),
            Some("https://updates.push.services.mozilla.com:443")
        );
        assert_eq!(audience("http://insecure/x", false), None);
        assert_eq!(audience("https:///x", false), None);
        assert_eq!(audience("http://127.0.0.1:9911/wp/1", false), None);
        assert_eq!(
            audience("http://127.0.0.1:9911/wp/1", true).as_deref(),
            Some("http://127.0.0.1:9911")
        );
        assert_eq!(audience("http://evil.example/x", true), None);
    }

    #[test]
    fn the_signing_input_is_two_base64url_parts() {
        let s = signing_input("https://push.example", "mailto:a@b.it", 1_700_000_000);
        let parts: Vec<&str> = s.split('.').collect();
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0], "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9");
        assert!(!s.contains('=') && !s.contains('+') && !s.contains('/'));
    }
}
