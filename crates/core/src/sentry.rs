//! A tiny Sentry reporter, no SDK (port of v1 `lib/core/sentry.ts`): the envelope Sentry's HTTP API accepts, built here so it is
//! unit-tested; the Worker only sends it. Used only when the `SENTRY_DSN` secret is set, so the project has no monitoring
//! dependency and whoever deploys decides whether to turn it on (Sentry's free plan is enough at this size).
//! Never sends query strings (they can carry invite codes or tokens), cookies, headers or bodies.

#[derive(Debug, PartialEq, Eq)]
pub struct Dsn {
    pub key: String,
    pub host: String,
    pub project_id: String,
    pub protocol: String,
}

/// `https://<key>@o123.ingest.sentry.io/456` → its parts; `None` for anything else.
pub fn parse_dsn(dsn: &str) -> Option<Dsn> {
    let (protocol, rest) = dsn.trim().split_once("://")?;
    if protocol != "https" && protocol != "http" {
        return None;
    }
    let (key, rest) = rest.split_once('@')?;
    let (host, path) = rest.split_once('/')?;
    let project_id = path.trim_end_matches('/').rsplit('/').next()?.to_string();
    let key = key.split(':').next()?.to_string();
    let ok = |s: &str| {
        !s.is_empty()
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b':'))
    };
    (ok(&key)
        && ok(host)
        && !project_id.is_empty()
        && project_id.bytes().all(|b| b.is_ascii_digit()))
    .then(|| Dsn {
        key,
        host: host.to_string(),
        project_id,
        protocol: protocol.to_string(),
    })
}

/// Where to POST and the `X-Sentry-Auth` header.
pub fn endpoint(dsn: &Dsn) -> (String, String) {
    (
        format!(
            "{}://{}/api/{}/envelope/",
            dsn.protocol, dsn.host, dsn.project_id
        ),
        format!(
            "Sentry sentry_version=7, sentry_key={}, sentry_client=pausa-worker/1",
            dsn.key
        ),
    )
}

fn esc(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

/// The envelope body: header line, item header, event. `path` loses its query; `message` is cut to 500 characters.
pub fn envelope(
    event_id: &str,
    now_ms: i64,
    message: &str,
    method: &str,
    path: &str,
    release: Option<&str>,
) -> String {
    let path = path.split('?').next().unwrap_or("");
    let message: String = message.chars().take(500).collect();
    let ts = now_ms as f64 / 1000.0;
    let release = release
        .map(|r| format!(",\"release\":{}", esc(r)))
        .unwrap_or_default();
    let event = format!(
        "{{\"event_id\":{id},\"timestamp\":{ts},\"platform\":\"other\",\"level\":\"error\",\"environment\":\"production\"{release},\
         \"logger\":\"worker\",\"exception\":{{\"values\":[{{\"type\":\"WorkerError\",\"value\":{msg}}}]}},\
         \"request\":{{\"url\":{url},\"method\":{method}}},\"tags\":{{\"route\":{url}}}}}",
        id = esc(event_id),
        msg = esc(&message),
        url = esc(path),
        method = esc(method),
    );
    format!(
        "{{\"event_id\":{}}}\n{{\"type\":\"event\"}}\n{event}",
        esc(event_id)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dsns_are_parsed_or_refused() {
        let d = parse_dsn("https://abc123@o42.ingest.sentry.io/7890").unwrap();
        assert_eq!(
            d,
            Dsn {
                key: "abc123".into(),
                host: "o42.ingest.sentry.io".into(),
                project_id: "7890".into(),
                protocol: "https".into()
            }
        );
        assert_eq!(
            endpoint(&d).0,
            "https://o42.ingest.sentry.io/api/7890/envelope/"
        );
        assert!(endpoint(&d).1.contains("sentry_key=abc123"));
        for bad in [
            "",
            "nope",
            "ftp://a@b/1",
            "https://o42.ingest.sentry.io/7890",
            "https://k@host/notanumber",
            "https://k@/1",
        ] {
            assert_eq!(parse_dsn(bad), None, "{bad}");
        }
    }

    #[test]
    fn the_envelope_is_three_json_lines_without_the_query() {
        let body = envelope(
            "e1",
            1_795_785_974_284,
            "D1_ERROR: \"no such table\"",
            "GET",
            "/api/invites/SECRET?code=abc",
            Some("abc123"),
        );
        let lines: Vec<serde_json::Value> = body
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0]["event_id"], "e1");
        assert_eq!(lines[1]["type"], "event");
        assert_eq!(lines[2]["request"]["url"], "/api/invites/SECRET");
        assert_eq!(
            lines[2]["exception"]["values"][0]["value"],
            "D1_ERROR: \"no such table\""
        );
        assert_eq!(lines[2]["release"], "abc123");
        assert!(!body.contains("code=abc"));
        let long = envelope("e2", 0, &"x".repeat(2000), "POST", "/", None);
        let ev: serde_json::Value = serde_json::from_str(long.lines().nth(2).unwrap()).unwrap();
        assert_eq!(
            ev["exception"]["values"][0]["value"]
                .as_str()
                .unwrap()
                .len(),
            500
        );
        assert!(ev.get("release").is_none());
    }
}
