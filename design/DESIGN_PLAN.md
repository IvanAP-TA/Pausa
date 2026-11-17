# Pausa — Design Plan v0.1

Status: exploration. Three directions to compare, one to pick.
Prototype: [`directions.html`](directions.html). Open it in a browser and switch direction (A/B/C) and language (IT/EN/ES).

---

## 1. Brief (from MASTER_PROMPT v2.2)

- **Audience**: small groups of friends (4–12 people) who already argue about films in a group chat. Mobile first; they often arrive from a WhatsApp or Instagram link inside an in-app browser.
- **Use case**: two jobs. (1) Log what you watched and see what your Cerchia watched. (2) Decide tonight's title in under 120 seconds (the Serata).
- **Tone**: *Midnight Screening Room*: nocturnal, intimate, premium, slightly warm. It should feel like *our* room, not a generic tool.
- **Languages**: Italian (default), English, Spanish, from day one.

## 2. Palette and contrast (shared by all directions)

The palette is fixed by the spec. What changes between directions is the neutral temperature and how the accents are used.

| Token | Value | Role | Contrast on paper `#0F1115` |
| --- | --- | --- | --- |
| `--mandarin` | `#FF6B35` | Attention: primary CTA, active state, rating, focus | **6.5 : 1** ✓ as text |
| `--forest` | `#2D6A4F` | Surface: "visto con" chips, Cerchia identity, Card background | 2.9 : 1 ✗ **never as text** |
| `--forest-deep` | `#1B4332` | Large surfaces (Card 9:16, "velvet" panels) | — |
| `--forest-text` | `#7CC4A0` | Forest as text/icon when needed | ≈ 9 : 1 ✓ |
| `--ink` | `#F3F4F6` | Primary text | ≈ 17 : 1 ✓ |
| `--muted` | `#A3A9B5` | Secondary text | ≈ 7.9 : 1 ✓ |

Two rules that follow from these numbers:

1. **Text on a mandarin button is dark ink, not white.** White on `#FF6B35` is 2.8 : 1 and fails WCAG AA. Dark ink on mandarin is about 6.5 : 1.
2. **Forest is a surface, never a text colour.** Light text on forest is about 6.4 : 1 ✓.

Mandarin stays under ~5% of any screen. It is the projector light, not the wallpaper.

> Note: the spec asks for "light glassmorphism". I'd limit blur to one place (the bottom tab bar over scrolling posters). Glass everywhere reads as template.

## 3. The three directions

All three share content, palette and information architecture. They differ in typography, shape language and the one signature gesture.

### A · Sala (the auditorium)
- **Idea**: velvet seats, torn tickets, one beam of projector light.
- **Type**: Fraunces (roman, display) + Geist (body).
- **Shape**: soft radius (14px). Log cards have ticket-stub notches.
- **Signature**: a single warm mandarin bloom at the top of the screen, as if the projector were behind you. The Card 9:16 is a forest-velvet ticket.
- **Risk**: the most "premium" and intimate, but serif titles get long in Spanish and Italian ("Anatomía de una caída"). They need careful sizing.

### B · Cabina (the projection booth)
- **Idea**: the person behind the glass who runs the show. Precise, technical, quiet.
- **Type**: Geist 600 with tight tracking (display) + Geist (body) + Geist Mono for timecodes, dates and counts.
- **Shape**: near-square (4px), hairline rules, no shadows.
- **Signature**: mono timecodes (`23:41 · S3E4`), tally-light dots for "Sto guardando", a film-leader countdown ring on the Serata.
- **Risk**: closest to a "tool". It needs the posters to carry the warmth.

### C · Locandina (the lobby one-sheet)
- **Idea**: the foyer, its posters and the letterboard marquee.
- **Type**: Big Shoulders Display (condensed, uppercase) + Geist (body).
- **Shape**: square corners, full-bleed posters, strong vertical rhythm.
- **Signature**: the Serata matchup shown as a letterboard marquee. The Card 9:16 is a real one-sheet: poster full-bleed with a condensed title.
- **Risk**: the loudest of the three. It's the most shareable Card, but the diary can feel shouty over time.

## 4. Screens in the prototype

1. **Cerchia feed**: "Sto guardando" strip, log card (poster, half-star rating, review, "visto con", reactions), spoiler-hidden comment, bottom tabs.
2. **Serata · Bracket**: one head-to-head, round counter, participants including a guest, timer.
3. **Card 9:16**: the result, ready to share.

Posters are placeholders, labelled "poster TMDB". Real artwork comes from the TMDB API once we have a key, with the attribution TMDB requires.

## 5. i18n (IT / EN / ES)

- **Routing**: `/it`, `/en`, `/es` prefixes (with Next.js, `next-intl`). Italian is the default. First visit detects the language from `Accept-Language`, and the user can override it in their profile.
- **Messages**: ICU format, so plurals and gender work ("1 voto / 2 voti", "Sofi sta guardando").
- **Titles**: titles use the localized title from TMDB (`language=it-IT|en-US|es-ES`), with the original title as a fallback. The prototype shows this: *La città incantata* / *Spirited Away* / *El viaje de Chihiro*.
- **Dates and numbers**: `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`. No hand-written formats.
- **Mixed-language Cerchie**: the UI follows each viewer's language. User content (reviews, list names) is never translated.
- **Layout**: Spanish and Italian run about 20–30% longer than English. Every label is tested in Spanish first. No fixed-width buttons.
- **Share Card**: the Card is rendered in the language of the person who shares it.

## 6. Decision (15 Nov 2026)

**Locked: A · Sala for the whole app + C · Locandina for the 9:16 Card.**

- **Why Sala**: the diary is where people spend time, and Sala is the most intimate and "ours". It matches the Midnight Screening Room mood most closely.
- **Why the Locandina Card**: the Card is the only thing that leaves the Cerchia (*private inside, viral outside*). A full-bleed poster with a condensed title is the most recognisable when it shows up in an Instagram story or a WhatsApp chat.
- **Fonts (2+1)**: Fraunces (display) + Geist (body/UI) + Big Shoulders Display, used **only** for the Card title. There is no mono face: timers and counts use Geist with tabular numbers.
- **Card language**: the Card is rendered in the language of the person sharing it. It uses the localized title, so a long one like *Anatomía de una caída* needs a smaller title size past ~18 characters.
- **Tokens**: [`tokens.css`](tokens.css).
- **Prototype**: the "★" option in [`directions.html`](directions.html) shows the locked combination. A, B and C stay there for reference.

## 7. Next step

1. Mirror `tokens.css` into Tailwind v4 `@theme` once the Next.js app exists.
2. Build the core components: poster (with TMDB attribution), half-star rating, log card with ticket notch, "visto con" chip, reactions, spoiler block, tab bar, button with all 8 states, and the Share Card renderer (9:16 export as an image).
3. Start the Phase 1 scaffold on top of them.

## 8. Decision v2 (16 Nov 2026) — supersedes §6

The Sala direction (Fraunces + Geist, warm charcoal, mandarin glow) read as "generated". New system, from [`directions-v2.html`](directions-v2.html):

- **Light (default): "Sottotitoli su carta" (D).** Paper, ink, tomato red, bottle green. Gloock (titles) + Instrument Sans (text).
- **Dark: "Sottotitoli" (B).** Night blue, subtitle yellow, same fonts. Follows the phone; users can pin Auto / Chiaro / Scuro (cookie, no flash).
- **Gesture:** reviews read like subtitles (centred, accent colour). No glow, no ticket notches; thin rules and pill buttons.
- **Share Card 9:16:** poster on top, printed caption below. Always the paper look, in both themes, because it's what leaves the app.
- The spec's Mandarin + Forest palette is replaced by tomato + bottle green (light) and yellow + night blue (dark).
- Tokens: [`tokens.css`](tokens.css) (mirror of `src/app/globals.css`).

## 9. Decision v3 (17 Nov 2026), supersedes §8

Full redesign with the Hallmark skill. Three themes were dealt and compared on the real diary in [`directions-v3.html`](directions-v3.html): Midnight, Darkroom, Lumen.

- **Locked: Darkroom.** Warm print-black ground, fibre-white ink, hairline Sofia Sans Extra Condensed capitals over Barlow, zero radius, one amber signal. Posters keep their own colours and sit on the ground as prints.
- **Dark by default.** With no cookie the app opens dark. Light is Darkroom's "fibre paper" colourway (red signal on paper); "Auto" follows the phone.
- **Lists are rows under hairlines,** not stacks of cards. The diary reads as a contact sheet.
- **Share Card 9:16:** follows the theme, always the dark print, in both modes.
- The locked system lives in [`../DESIGN.md`](../DESIGN.md); tokens in `src/app/tokens.css`.
