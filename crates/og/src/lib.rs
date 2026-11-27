//! The link preview of a Serata (`/s/:code`), what WhatsApp or Telegram show when the host shares the link: an invitation
//! while the room is open, the chosen title once it is decided. Neither shows who voted what.
//!
//! Drawn here, in pure Rust, so the Worker needs no headless browser and no outside service: the app's two faces (Sofia Sans
//! Extra Condensed for the poster type, Barlow for the body), the Darkroom colours, the pause mark. No posters: decoding
//! JPEGs inside a Worker request would cost more CPU than the free plan gives. 1200x630, the size every preview accepts.

const W: usize = 1200;
const H: usize = 630;
const PAD_X: f32 = 56.0;
const PAD_Y: f32 = 48.0;
/// The text column ends where the panel with the pause mark starts.
const PANEL_X: usize = 840;
const COL_W: f32 = PANEL_X as f32 - 56.0 - PAD_X;

type Rgb = [u8; 3];
// sRGB copies of the dark tokens (`apps/mobile/src/theme`), as legacy's `card-theme.ts`.
const PAPER: Rgb = [0x00, 0x11, 0x13];
const PAPER3: Rgb = [0x06, 0x25, 0x29];
const INK: Rgb = [0xec, 0xe7, 0xde];
const INK2: Rgb = [0xbd, 0xca, 0xcc];
const MUTED: Rgb = [0x8c, 0xa0, 0xa2];
const RULE: Rgb = [0x1d, 0x3b, 0x3e];
const ACCENT: Rgb = [0xfd, 0x7e, 0x49];

pub(crate) struct Text {
    invite_headline: &'static str,
    invite_sub: &'static str,
    invite_cta: &'static str,
    invite_title: &'static str,
    invite_title_done: &'static str,
    invite_description: &'static str,
    mode_bracket: &'static str,
    mode_table: &'static str,
    result_kicker: &'static str,
    result_subtitle: &'static str,
    result_cta: &'static str,
    result_share: &'static str,
}
include!(concat!(env!("OUT_DIR"), "/text.rs"));

fn text(locale: &str) -> &'static Text {
    &TEXT[match locale {
        "en" => 1,
        "es" => 2,
        _ => 0,
    }]
}

/// What the preview shows.
pub enum Card<'a> {
    /// The room is open: who invites, which mode, how many titles.
    Invite {
        host: &'a str,
        bracket: bool,
        count: u32,
    },
    /// The room has decided.
    Result { title: &'a str, year: Option<i64> },
}

/// Title and description for the page's `og:` tags, in the same words as the image.
pub struct Meta {
    pub title: String,
    pub description: String,
}

pub fn meta(card: &Card, locale: &str) -> Meta {
    let t = text(locale);
    match card {
        Card::Invite { .. } => Meta {
            title: t.invite_title.into(),
            description: t.invite_description.into(),
        },
        Card::Result { title, .. } => Meta {
            title: t.invite_title_done.into(),
            description: t.result_share.replace("{title}", title),
        },
    }
}

/// The PNG bytes of the preview.
pub fn render(card: &Card, locale: &str) -> Vec<u8> {
    let t = text(locale);
    let fonts = Fonts::get();
    let mut c = Canvas::new();
    c.fill(PANEL_X, 0, W - PANEL_X, H, PAPER3);
    // The pause mark, large, in the panel: the brand where legacy put the posters.
    let (bw, bh, gap) = (56usize, 220usize, 40usize);
    let bx = PANEL_X + (W - PANEL_X - (bw * 2 + gap)) / 2;
    let by = (H - bh) / 2;
    c.fill(bx, by, bw, bh, ACCENT);
    c.fill(bx + bw + gap, by, bw, bh, ACCENT);

    // Header: the two small bars and the wordmark.
    c.fill(PAD_X as usize, PAD_Y as usize, 9, 28, ACCENT);
    c.fill(PAD_X as usize + 15, PAD_Y as usize, 9, 28, ACCENT);
    c.text(
        &fonts.display_regular,
        40.0,
        PAD_X + 36.0,
        PAD_Y + 28.0,
        INK,
        "PAUSA",
    );

    // Footer, from the bottom up: domain, call to action, a rule above them.
    let domain_base = H as f32 - PAD_Y - 6.0;
    let cta_base = domain_base - 36.0;
    let rule_y = (cta_base - 26.0 - 22.0) as usize;
    c.fill(PAD_X as usize, rule_y, COL_W as usize, 1, RULE);
    let cta = match card {
        Card::Invite { .. } => t.invite_cta,
        Card::Result { .. } => t.result_cta,
    };
    c.text_fit(&fonts.body, 26.0, PAD_X, cta_base, INK, cta);
    c.text(
        &fonts.body,
        20.0,
        PAD_X,
        domain_base,
        MUTED,
        "pausa.gnagno.org",
    );

    let mut top = PAD_Y + 28.0 + 28.0;
    let (headline, sub) = match card {
        Card::Invite {
            host,
            bracket,
            count,
        } => {
            let host = if host.trim().is_empty() {
                "Pausa"
            } else {
                host.trim()
            };
            let mode = if *bracket {
                t.mode_bracket
            } else {
                t.mode_table
            };
            (
                t.invite_headline.replace("{host}", host),
                t.invite_sub
                    .replace("{mode}", mode)
                    .replace("{count}", &count.to_string()),
            )
        }
        Card::Result { title, year } => {
            let kicker_px = 32.0;
            c.text(
                &fonts.display_regular,
                kicker_px,
                PAD_X,
                top + kicker_px * 0.7,
                ACCENT,
                t.result_kicker,
            );
            top += kicker_px * 0.7 + 22.0;
            let sub = match year {
                Some(y) => format!("{y} · {}", t.result_subtitle),
                None => t.result_subtitle.to_string(),
            };
            (title.to_string(), sub)
        }
    };
    let headline = headline.to_uppercase();
    let sub_px = 26.0;
    let sub_lines = wrap(&fonts.body, sub_px, &sub, COL_W);
    let sub_h = sub_lines.len().min(2) as f32 * sub_px * 1.3;
    // The largest size at which the headline fits between the header and the sub line; four lines at most.
    let room = rule_y as f32 - 24.0 - top - 14.0 - sub_h;
    let (px, lines) = [96.0f32, 84.0, 72.0, 62.0, 54.0]
        .iter()
        .map(|&px| (px, wrap(&fonts.display_light, px, &headline, COL_W)))
        .find(|(px, l)| l.len() <= 4 && l.len() as f32 * px * 0.88 <= room)
        .unwrap_or_else(|| {
            let px = 54.0;
            let max = ((room / (px * 0.88)) as usize).clamp(1, 4);
            (
                px,
                clip(
                    &fonts.display_light,
                    px,
                    wrap(&fonts.display_light, px, &headline, COL_W),
                    max,
                    COL_W,
                ),
            )
        });
    let mut base = top + px * 0.72;
    for l in &lines {
        c.text(&fonts.display_light, px, PAD_X, base, INK, l);
        base += px * 0.88;
    }
    base += 14.0 - px * 0.88 + px * 0.16 + sub_px;
    for l in sub_lines.iter().take(2) {
        c.text(&fonts.body, sub_px, PAD_X, base, INK2, l);
        base += sub_px * 1.3;
    }
    c.png()
}

struct Fonts {
    display_light: fontdue::Font,
    display_regular: fontdue::Font,
    body: fontdue::Font,
}

impl Fonts {
    /// Parsed once per Worker isolate: parsing the three faces is the costliest step after the PNG encoding.
    fn get() -> &'static Self {
        static FONTS: std::sync::OnceLock<Fonts> = std::sync::OnceLock::new();
        FONTS.get_or_init(Self::load)
    }

    fn load() -> Self {
        let f = |bytes: &[u8]| {
            fontdue::Font::from_bytes(bytes, fontdue::FontSettings::default())
                .expect("embedded font")
        };
        Self {
            display_light: f(include_bytes!("../fonts/display-200.ttf")),
            display_regular: f(include_bytes!("../fonts/display-400.ttf")),
            body: f(include_bytes!("../fonts/body-400.ttf")),
        }
    }
}

fn width(font: &fontdue::Font, px: f32, s: &str) -> f32 {
    let mut w = 0.0;
    let mut prev = None;
    for ch in s.chars() {
        if let Some(p) = prev {
            w += font.horizontal_kern(p, ch, px).unwrap_or(0.0);
        }
        w += font.metrics(ch, px).advance_width;
        prev = Some(ch);
    }
    w
}

/// Greedy word wrap; a word longer than the line is cut where it no longer fits.
fn wrap(font: &fontdue::Font, px: f32, s: &str, max: f32) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    for word in s.split_whitespace() {
        let candidate = if line.is_empty() {
            word.to_string()
        } else {
            format!("{line} {word}")
        };
        if width(font, px, &candidate) <= max {
            line = candidate;
            continue;
        }
        if !line.is_empty() {
            lines.push(std::mem::take(&mut line));
        }
        let mut rest = word.to_string();
        while width(font, px, &rest) > max {
            let mut cut = String::new();
            for ch in rest.chars() {
                if width(font, px, &format!("{cut}{ch}")) > max && !cut.is_empty() {
                    break;
                }
                cut.push(ch);
            }
            rest = rest[cut.len()..].to_string();
            lines.push(cut);
        }
        line = rest;
    }
    if !line.is_empty() {
        lines.push(line);
    }
    lines
}

/// Keeps `max` lines, the last one ending in an ellipsis.
fn clip(font: &fontdue::Font, px: f32, mut lines: Vec<String>, max: usize, w: f32) -> Vec<String> {
    if lines.len() <= max {
        return lines;
    }
    lines.truncate(max);
    let last = lines.last_mut().expect("max >= 1");
    while !last.is_empty() && width(font, px, &format!("{last}…")) > w {
        last.pop();
    }
    last.push('…');
    lines
}

struct Canvas {
    px: Vec<u8>,
}

impl Canvas {
    fn new() -> Self {
        Self {
            px: PAPER.repeat(W * H),
        }
    }

    fn fill(&mut self, x: usize, y: usize, w: usize, h: usize, c: Rgb) {
        for row in y..(y + h).min(H) {
            for col in x..(x + w).min(W) {
                let i = (row * W + col) * 3;
                self.px[i..i + 3].copy_from_slice(&c);
            }
        }
    }

    fn blend(&mut self, x: i32, y: i32, a: u8, c: Rgb) {
        if a == 0 || x < 0 || y < 0 || x as usize >= W || y as usize >= H {
            return;
        }
        let i = (y as usize * W + x as usize) * 3;
        for (bg, fg) in self.px[i..i + 3].iter_mut().zip(c) {
            *bg = ((*bg as u32 * (255 - a as u32) + fg as u32 * a as u32) / 255) as u8;
        }
    }

    /// One line of text on `baseline`, starting at `x`.
    fn text(&mut self, font: &fontdue::Font, px: f32, x: f32, baseline: f32, c: Rgb, s: &str) {
        let mut pen = x;
        let mut prev = None;
        for ch in s.chars() {
            if let Some(p) = prev {
                pen += font.horizontal_kern(p, ch, px).unwrap_or(0.0);
            }
            let (m, cov) = font.rasterize(ch, px);
            let gx = (pen + m.xmin as f32).round() as i32;
            let gy = (baseline - m.height as f32 - m.ymin as f32).round() as i32;
            for row in 0..m.height {
                for col in 0..m.width {
                    self.blend(
                        gx + col as i32,
                        gy + row as i32,
                        cov[row * m.width + col],
                        c,
                    );
                }
            }
            pen += m.advance_width;
            prev = Some(ch);
        }
    }

    /// One line that must not leave the column: shortened with an ellipsis when it would.
    fn text_fit(&mut self, font: &fontdue::Font, px: f32, x: f32, baseline: f32, c: Rgb, s: &str) {
        let line = clip(font, px, wrap(font, px, s, COL_W), 1, COL_W);
        self.text(
            font,
            px,
            x,
            baseline,
            c,
            line.first().map(String::as_str).unwrap_or(""),
        );
    }

    fn png(&self) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, W as u32, H as u32);
            enc.set_color(png::ColorType::Rgb);
            enc.set_depth(png::BitDepth::Eight);
            enc.set_compression(png::Compression::Fastest);
            let mut w = enc.write_header().expect("png header");
            w.write_image_data(&self.px).expect("png data");
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_png(b: &[u8]) -> bool {
        b.starts_with(b"\x89PNG\r\n\x1a\n")
    }

    #[test]
    fn invite_and_result_render_in_every_locale() {
        for l in ["it", "en", "es", "fr"] {
            let a = render(
                &Card::Invite {
                    host: "Giulia",
                    bracket: true,
                    count: 8,
                },
                l,
            );
            let b = render(
                &Card::Result {
                    title: "Il grande Lebowski",
                    year: Some(1998),
                },
                l,
            );
            assert!(is_png(&a) && is_png(&b), "{l}");
            assert!(
                a.len() < 200_000 && b.len() < 200_000,
                "{l}: {} / {}",
                a.len(),
                b.len()
            );
        }
    }

    #[test]
    fn long_and_odd_text_still_renders() {
        let long = "Una notte al museo: la battaglia dello Smithsonian, edizione estesa del regista con finale alternativo";
        assert!(is_png(&render(
            &Card::Result {
                title: long,
                year: None
            },
            "it"
        )));
        assert!(is_png(&render(
            &Card::Invite {
                host: "Supercalifragilistichespiralidoso-di-nome-e-di-fatto",
                bracket: false,
                count: 2
            },
            "en"
        )));
        assert!(is_png(&render(
            &Card::Invite {
                host: "   ",
                bracket: false,
                count: 3
            },
            "es"
        )));
        assert!(is_png(&render(
            &Card::Invite {
                host: "🎬 Zoë",
                bracket: true,
                count: 4
            },
            "it"
        )));
    }

    #[test]
    fn meta_uses_the_app_words() {
        let m = meta(
            &Card::Invite {
                host: "x",
                bracket: true,
                count: 2,
            },
            "en",
        );
        assert_eq!(m.title, "You have been invited to a Serata");
        let m = meta(
            &Card::Result {
                title: "Heat",
                year: Some(1995),
            },
            "it",
        );
        assert_eq!(m.title, "Ecco cosa guarderemo stasera");
        assert_eq!(m.description, "Stasera: Heat. Deciso su Pausa.");
    }

    #[test]
    fn wrap_keeps_every_line_inside_the_column() {
        let f = Fonts::load();
        for l in wrap(
            &f.display_light,
            96.0,
            "SUPERCALIFRAGILISTICHESPIRALIDOSO E ALTRE PAROLE",
            COL_W,
        ) {
            assert!(width(&f.display_light, 96.0, &l) <= COL_W, "{l}");
        }
    }

    /// Writes the previews to `target/og-*.png` for a look by eye: `cargo test -p pausa-og -- --ignored`.
    #[test]
    #[ignore]
    fn write_samples() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target");
        std::fs::write(
            dir.join("og-invite.png"),
            render(
                &Card::Invite {
                    host: "Giulia",
                    bracket: true,
                    count: 8,
                },
                "it",
            ),
        )
        .unwrap();
        std::fs::write(
            dir.join("og-result.png"),
            render(
                &Card::Result {
                    title: "Il grande Lebowski",
                    year: Some(1998),
                },
                "it",
            ),
        )
        .unwrap();
        let long =
            "Una notte al museo: la battaglia dello Smithsonian, edizione estesa del regista";
        std::fs::write(
            dir.join("og-long.png"),
            render(
                &Card::Result {
                    title: long,
                    year: None,
                },
                "es",
            ),
        )
        .unwrap();
        let start = std::time::Instant::now();
        for _ in 0..10 {
            render(
                &Card::Invite {
                    host: "Giulia",
                    bracket: true,
                    count: 8,
                },
                "en",
            );
        }
        eprintln!("render: {:?} each", start.elapsed() / 10);
    }
}
