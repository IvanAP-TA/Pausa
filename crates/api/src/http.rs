//! Shared HTTP helpers: error type, JSON responses, time, randomness, request facts.

use pausa_core::dto::{ApiError, ErrorCode};
use serde::Serialize;
use worker::js_sys::{Function, Reflect, Uint8Array};
use worker::wasm_bindgen::JsCast;
use worker::*;

/// Anything a handler can fail with. Becomes `{"code": ..., "retryAfter": ...}` with the matching status.
#[derive(Debug)]
pub struct Fail {
    pub code: ErrorCode,
    pub status: u16,
    pub retry_after: Option<u32>,
}

pub type R<T> = std::result::Result<T, Fail>;

impl Fail {
    pub fn new(code: ErrorCode, status: u16) -> Self {
        Fail {
            code,
            status,
            retry_after: None,
        }
    }
    pub fn unauthorized() -> Self {
        Self::new(ErrorCode::Unauthorized, 401)
    }
    pub fn not_found() -> Self {
        Self::new(ErrorCode::NotFound, 404)
    }
    pub fn invalid() -> Self {
        Self::new(ErrorCode::Invalid, 400)
    }
    pub fn internal() -> Self {
        Self::new(ErrorCode::Internal, 500)
    }
    pub fn rate_limited(retry_after: u32) -> Self {
        Fail {
            code: ErrorCode::RateLimited,
            status: 429,
            retry_after: Some(retry_after),
        }
    }
}

impl From<worker::Error> for Fail {
    fn from(e: worker::Error) -> Self {
        console_error!("internal error: {e}");
        Fail::internal()
    }
}

impl From<serde_json::Error> for Fail {
    fn from(_: serde_json::Error) -> Self {
        Fail::invalid()
    }
}

/// Turns a handler result into the response, with the error contract applied.
pub fn finish(r: R<Response>) -> Result<Response> {
    match r {
        Ok(res) => Ok(res),
        Err(f) => {
            let mut res = Response::from_json(&ApiError {
                code: f.code,
                retry_after: f.retry_after,
            })?
            .with_status(f.status);
            if let Some(s) = f.retry_after {
                res.headers_mut().set("Retry-After", &s.to_string())?;
            }
            Ok(res)
        }
    }
}

pub fn json<T: Serialize>(value: &T, status: u16) -> R<Response> {
    let mut res = Response::from_json(value)?.with_status(status);
    res.headers_mut().set("Cache-Control", "no-store")?;
    Ok(res)
}

pub fn no_content() -> R<Response> {
    Ok(Response::empty()?.with_status(204))
}

pub fn now_ms() -> i64 {
    Date::now().as_millis() as i64
}

/// Cryptographically secure random bytes from the runtime (`crypto.getRandomValues`).
pub fn random<const N: usize>() -> [u8; N] {
    let arr = Uint8Array::new_with_length(N as u32);
    let global = worker::js_sys::global();
    let crypto = Reflect::get(&global, &"crypto".into()).expect("crypto is available in Workers");
    let f: Function = Reflect::get(&crypto, &"getRandomValues".into())
        .expect("getRandomValues")
        .dyn_into()
        .expect("function");
    f.call1(&crypto, &arr).expect("getRandomValues call");
    let mut out = [0u8; N];
    arr.copy_to(&mut out);
    out
}

pub fn new_id() -> String {
    pausa_core::auth::uuid_v4(&random::<16>())
}

/// The caller's IP as Cloudflare saw it; "local" under `wrangler dev` without the header.
pub fn client_ip(req: &Request) -> String {
    req.headers()
        .get("cf-connecting-ip")
        .ok()
        .flatten()
        .unwrap_or_else(|| "local".into())
}

pub fn is_https(req: &Request) -> bool {
    req.url().map(|u| u.scheme() == "https").unwrap_or(true)
}

/// Local development only: a loopback host. Used so a stray "development" variable can never expose sign-in links in production.
pub fn is_loopback(req: &Request) -> bool {
    req.url()
        .ok()
        .and_then(|u| {
            u.host_str()
                .map(|h| matches!(h, "localhost" | "127.0.0.1" | "[::1]"))
        })
        .unwrap_or(false)
}

/// `scheme://host` of this request, for links in emails and redirects.
pub fn origin(req: &Request) -> String {
    req.url()
        .map(|u| u.origin().ascii_serialization())
        .unwrap_or_default()
}

/// JSON body with a size guard: nothing in the API needs more than 64 KB.
pub async fn body<T: serde::de::DeserializeOwned>(req: &mut Request) -> R<T> {
    let text = req.text().await?;
    if text.len() > 64 * 1024 {
        return Err(Fail::invalid());
    }
    Ok(serde_json::from_str(&text)?)
}

/// CORS is off unless `CORS_ORIGINS` (comma separated) is set, which is only done for local development of the web client
/// (`expo start` serves from another port). In production the client and the API share one origin and none of this runs.
pub fn cors_allowed(env: &Env, origin: Option<&str>) -> Option<String> {
    let origin = origin?;
    let list = env.var("CORS_ORIGINS").ok()?.to_string();
    list.split(',')
        .map(str::trim)
        .any(|o| !o.is_empty() && o == origin)
        .then(|| origin.to_string())
}

/// Headers every Worker answer carries. Redirects and WebSocket upgrades have immutable headers: they are skipped (a failed
/// `set` is the only way to tell, and neither carries a body a browser would sniff or frame).
pub fn with_security(mut res: Response) -> Response {
    let h = res.headers_mut();
    let _ = h.set("X-Content-Type-Options", "nosniff");
    let _ = h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    let _ = h.set("X-Frame-Options", "DENY");
    let _ = h.set("Cross-Origin-Resource-Policy", "same-site");
    let _ = h.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
    );
    res
}

pub fn with_cors(mut res: Response, origin: &str) -> Response {
    let h = res.headers_mut();
    // Redirect responses have immutable headers; they are never fetched cross-origin, so skipping them is fine.
    let _ = h.set("Access-Control-Allow-Origin", origin);
    let _ = h.set("Access-Control-Allow-Credentials", "true");
    let _ = h.append("Vary", "Origin");
    res
}

pub fn preflight(origin: &str) -> Result<Response> {
    let mut res = Response::empty()?.with_status(204);
    let h = res.headers_mut();
    h.set("Access-Control-Allow-Origin", origin)?;
    h.set("Access-Control-Allow-Credentials", "true")?;
    h.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    )?;
    h.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
    )?;
    h.set("Access-Control-Max-Age", "600")?;
    h.append("Vary", "Origin")?;
    Ok(res)
}
