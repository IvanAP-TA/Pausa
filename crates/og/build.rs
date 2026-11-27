//! Copies the few strings the preview needs out of `packages/messages/{it,en,es}.json`, so the image and the page speak the
//! same words as the app and a translation fix lands in both. Generated into `$OUT_DIR/text.rs`.

use std::{env, fs, path::PathBuf};

const LOCALES: [&str; 3] = ["it", "en", "es"];
const KEYS: [(&str, &str); 12] = [
    ("invite_headline", "serata.invite.headline"),
    ("invite_sub", "serata.invite.sub"),
    ("invite_cta", "serata.invite.cta"),
    ("invite_title", "serata.invite.title"),
    ("invite_title_done", "serata.invite.titleDone"),
    ("invite_description", "serata.invite.description"),
    ("mode_bracket", "serata.mode.bracket"),
    ("mode_table", "serata.mode.table"),
    ("result_kicker", "serata.result.kicker"),
    ("result_subtitle", "serata.result.subtitle"),
    ("result_cta", "serata.result.ctaButton"),
    ("result_share", "serata.result.shareText"),
];

fn main() {
    let dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../../packages/messages");
    let mut out = String::from("pub(crate) static TEXT: [Text; 3] = [\n");
    for l in LOCALES {
        let path = dir.join(format!("{l}.json"));
        println!("cargo:rerun-if-changed={}", path.display());
        let json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        out.push_str("    Text {\n");
        for (field, key) in KEYS {
            let v = key
                .split('.')
                .try_fold(&json, |j, k| j.get(k))
                .and_then(|v| v.as_str())
                .unwrap_or_else(|| panic!("{l}.json has no string at {key}"));
            out.push_str(&format!("        {field}: {v:?},\n"));
        }
        out.push_str("    },\n");
    }
    out.push_str("];\n");
    fs::write(
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("text.rs"),
        out,
    )
    .unwrap();
}
