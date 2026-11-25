//! Text of push notifications and of the daily email digest, and reading Expo's answer. Same tone as the app ("tu", direct).
//! No I/O here: the Worker (`crates/api/src/push.rs`) gathers the rows and sends.

use crate::dto::Locale;

/// What a notification row needs to be said in words.
pub struct Note<'a> {
    pub kind: &'a str,
    pub actor: &'a str,
    pub title: Option<&'a str>,
    pub circle: Option<&'a str>,
}

fn clip(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

/// One line for the lock screen or the digest: `(heading, body)`. Unknown kinds give a neutral line, never an empty one.
pub fn message(locale: Locale, n: &Note) -> (String, String) {
    let actor = if n.actor.trim().is_empty() {
        match locale {
            Locale::It => "Qualcuno",
            Locale::En => "Someone",
            Locale::Es => "Alguien",
        }
    } else {
        n.actor
    };
    let title = clip(n.title.unwrap_or(""), 60);
    let circle = clip(n.circle.unwrap_or("Pausa"), 40);
    let body = match (locale, n.kind) {
        (Locale::It, "log") => format!("{actor} ha visto {title}"),
        (Locale::It, "comment") => format!("{actor} ha commentato {title}"),
        (Locale::It, "reaction") => format!("{actor} ha reagito a {title}"),
        (Locale::It, "now_watching") => format!("{actor} sta guardando {title}"),
        (Locale::It, "serata_invite") => format!("{actor} ti invita a una Serata"),
        (Locale::It, "circle_join") => format!("{actor} è entrato nel gruppo"),
        (Locale::It, "mention") => format!("{actor} ti ha nominato su {title}"),
        (Locale::En, "log") => format!("{actor} watched {title}"),
        (Locale::En, "comment") => format!("{actor} commented on {title}"),
        (Locale::En, "reaction") => format!("{actor} reacted to {title}"),
        (Locale::En, "now_watching") => format!("{actor} is watching {title}"),
        (Locale::En, "serata_invite") => format!("{actor} invites you to a Serata"),
        (Locale::En, "circle_join") => format!("{actor} joined the group"),
        (Locale::En, "mention") => format!("{actor} mentioned you on {title}"),
        (Locale::Es, "log") => format!("{actor} ha visto {title}"),
        (Locale::Es, "comment") => format!("{actor} ha comentado {title}"),
        (Locale::Es, "reaction") => format!("{actor} ha reaccionado a {title}"),
        (Locale::Es, "now_watching") => format!("{actor} está viendo {title}"),
        (Locale::Es, "serata_invite") => format!("{actor} te invita a una Serata"),
        (Locale::Es, "circle_join") => format!("{actor} se ha unido al grupo"),
        (Locale::Es, "mention") => format!("{actor} te ha mencionado en {title}"),
        (Locale::It, _) => format!("{actor}: novità in {circle}"),
        (Locale::En, _) => format!("{actor}: news in {circle}"),
        (Locale::Es, _) => format!("{actor}: novedades en {circle}"),
    };
    (circle, body.trim().to_string())
}

/// Subject and plain-text body of the daily digest. `lines` are the already worded notifications (at most 20 are listed, the rest
/// is counted); `unread` is the total.
pub fn digest(locale: Locale, unread: usize, lines: &[String], open_url: &str) -> (String, String) {
    let listed: Vec<&String> = lines.iter().take(20).collect();
    let more = unread.saturating_sub(listed.len());
    let list = listed
        .iter()
        .map(|l| format!("• {l}"))
        .collect::<Vec<_>>()
        .join("\n");
    match locale {
        Locale::It => (
            if unread == 1 {
                "1 novità su Pausa".into()
            } else {
                format!("{unread} novità su Pausa")
            },
            format!(
                "Da quando sei passato l'ultima volta:\n\n{list}{}\n\nApri Pausa: {open_url}\n\nPer non ricevere più questa email spegni il riepilogo nelle impostazioni.",
                if more > 0 { format!("\n… e altre {more}") } else { String::new() }
            ),
        ),
        Locale::En => (
            if unread == 1 {
                "1 update on Pausa".into()
            } else {
                format!("{unread} updates on Pausa")
            },
            format!(
                "Since you last stopped by:\n\n{list}{}\n\nOpen Pausa: {open_url}\n\nTo stop these emails, turn the digest off in settings.",
                if more > 0 { format!("\n… and {more} more") } else { String::new() }
            ),
        ),
        Locale::Es => (
            if unread == 1 {
                "1 novedad en Pausa".into()
            } else {
                format!("{unread} novedades en Pausa")
            },
            format!(
                "Desde la última vez que pasaste:\n\n{list}{}\n\nAbre Pausa: {open_url}\n\nPara dejar de recibir este correo, apaga el resumen en los ajustes.",
                if more > 0 { format!("\n… y {more} más") } else { String::new() }
            ),
        ),
    }
}

/// True for the shapes a device may register: an Expo token, or an https Web Push endpoint.
pub fn valid_endpoint(kind: &str, endpoint: &str) -> bool {
    match kind {
        "expo" => {
            (endpoint.starts_with("ExponentPushToken[") || endpoint.starts_with("ExpoPushToken["))
                && endpoint.ends_with(']')
                && endpoint.len() <= 200
        }
        "webpush" => endpoint.starts_with("https://") && endpoint.len() <= 600,
        _ => false,
    }
}

/// From Expo's `data` array (one ticket per message, same order): the indexes whose device is gone and must be forgotten.
pub fn dead_devices(tickets: &serde_json::Value) -> Vec<usize> {
    tickets
        .as_array()
        .map(|a| {
            a.iter()
                .enumerate()
                .filter(|(_, t)| {
                    t["status"] == "error" && t["details"]["error"] == "DeviceNotRegistered"
                })
                .map(|(i, _)| i)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn note<'a>(kind: &'a str, actor: &'a str) -> Note<'a> {
        Note {
            kind,
            actor,
            title: Some("Matrix"),
            circle: Some("Divano"),
        }
    }

    #[test]
    fn every_kind_in_every_language_has_words() {
        for loc in [Locale::It, Locale::En, Locale::Es] {
            for kind in [
                "log",
                "comment",
                "reaction",
                "now_watching",
                "serata_invite",
                "circle_join",
                "mention",
                "something_new",
            ] {
                let (head, body) = message(loc, &note(kind, "Giulia"));
                assert_eq!(head, "Divano");
                assert!(body.contains("Giulia"), "{kind}: {body}");
                assert!(!body.contains("{"));
            }
        }
    }

    #[test]
    fn titles_are_cut_and_a_missing_actor_is_neutral() {
        let long = "x".repeat(200);
        let n = Note {
            kind: "log",
            actor: "",
            title: Some(&long),
            circle: None,
        };
        let (head, body) = message(Locale::It, &n);
        assert_eq!(head, "Pausa");
        assert!(body.starts_with("Qualcuno ha visto "));
        assert!(body.chars().count() < 90);
        assert!(body.ends_with('…'));
    }

    #[test]
    fn digest_lists_twenty_and_counts_the_rest() {
        let lines: Vec<String> = (0..25).map(|i| format!("riga {i}")).collect();
        let (subject, text) = digest(Locale::It, 25, &lines, "https://x/it/home");
        assert_eq!(subject, "25 novità su Pausa");
        assert!(text.contains("• riga 19") && !text.contains("riga 20"));
        assert!(text.contains("altre 5"));
        assert!(text.contains("https://x/it/home"));
        let (one, _) = digest(Locale::En, 1, &lines[..1], "u");
        assert_eq!(one, "1 update on Pausa");
    }

    #[test]
    fn endpoints_are_checked_by_kind() {
        assert!(valid_endpoint("expo", "ExponentPushToken[abc123]"));
        assert!(!valid_endpoint("expo", "https://evil.example/x"));
        assert!(!valid_endpoint("expo", "ExponentPushToken[abc"));
        assert!(valid_endpoint(
            "webpush",
            "https://fcm.googleapis.com/fcm/send/abc"
        ));
        assert!(!valid_endpoint("webpush", "http://insecure"));
        assert!(!valid_endpoint("sms", "123"));
    }

    #[test]
    fn only_unregistered_devices_are_dropped() {
        let t = json!([
            {"status": "ok", "id": "1"},
            {"status": "error", "details": {"error": "DeviceNotRegistered"}},
            {"status": "error", "details": {"error": "MessageRateExceeded"}},
        ]);
        assert_eq!(dead_devices(&t), vec![1]);
        assert!(dead_devices(&json!(null)).is_empty());
    }
}
