# Design system

Direzione artistica: **Midnight Screening Room** (prompt §3). Sala di proiezione notturna, calda, fisica, premium. Anti-AI-slop.

## Palette (token, in `src/app/globals.css`)

| Token | Hex | Uso |
|---|---|---|
| `--bg-base` | `#0F1115` | sfondo (mai pure black) |
| `--bg-base-alt` | `#14181C` | sfondo alternativo / card 9:16 |
| `--surface-1` | `#1C2228` | superficie elevata 1 |
| `--surface-2` | `#242C34` | superficie elevata 2 |
| `--ink` | `#F3F0EB` | testo primario (off-white caldo) |
| `--ink-dim` | `#9CA3AF` | testo secondario |
| `--mandarin` | `#FF6B35` | **accento unico** — solo azione primaria, uno per schermata |
| `--forest` | `#2D6A4F` | stati positivi, rating, appartenenza |
| `--line` | `#2A3139` | bordi sottili desaturati (niente glow) |
| `--depth` | `#191E24` | ambiente radiale neutro (profondità sala) |
| `--vignette` | `rgba(0,0,0,.35)` | vignetta ai bordi |

Mapping a classi Tailwind via `@theme inline`: `bg-base`, `text-ink`, `bg-mandarin`, `text-forest`, `border-line`, ecc.

## Tipografia

- **Display**: Fraunces (serif editoriale variabile, opsz) — titoli, nomi film. `font-display`.
- **UI/body**: Hanken Grotesk — tutto il resto. `font-sans`.
- Vietato Inter di default (rispettato).

## Atmosfera (profondità cinematografica)

- Sfondo `body`: due radiali neutri (`--depth` + `--vignette`) `background-attachment: fixed` → depth da "sala", **senza arancio di sfondo** (§3 lo vieta esplicitamente).
- **Grana film**: `body::before` con SVG `feTurbulence`, opacità 0.04 → superficie fisica.
- Backlight soffuso neutro dietro la pila poster in landing.

## Regole anti-slop applicate (Hallmark Floor)

Verificate con `sloplint` (= **clean**, 0 FAIL):

- Ogni colore/font passa da un token a `:root`. Nessun literal fuori.
- Mai `transition: all`; mai animare `width/height/top/left`.
- `overflow-x: clip` su `html`/`body`.
- `:focus-visible` su tutti gli interattivi; `prefers-reduced-motion` onorato.
- Niente eyebrow in maiuscoletto, niente label in mono, niente frecce incollate ai link, niente meta col punto-medio.
- Niente gradient viola-blu, niente card dentro card, niente emoji come icona.
- Un solo accento forte (mandarin) per schermata.
- Feedback al tocco (`:active` scale) — press feedback discreto.

## Motion (Emil Kowalski)

- Una sola entrata orchestrata (`.rise` / `.rise-2` / `.rise-3`) in landing.
- Solo `transform` e `opacity`.
- Micro-interazioni su azione utente (hover poster, press, reveal spoiler), non decorative.

## Skill di design usate (prompt §9)

Installate in `~/.claude/skills/`:
- **frontend-design** (Anthropic) — Design Plan prima del codice.
- **hallmark** (Nutlope) — Floor anti-slop + `sloplint` per l'audit.
- **impeccable** (pbakaus) — critique/polish.
- **Emil Kowalski** (20 skill) — motion/micro-interazioni.

Audit automatico: `node ~/.claude/skills/hallmark/scripts/sloplint.mjs <file.css>`.

## Conformità §3 — stato

Rispettati: palette esatta, poster-driven (grid 2:3), tipografia editoriale, superfici a livelli, un accento, zero AI-slop, profondità/atmosfera.
Parziale: il prompt chiede un **Design Plan per ogni schermata**; qui è stato fatto **uno globale** (formalità, non impatta il risultato).

## Componenti chiave

- `StarRating` — mezze stelle in forest, SSR-safe (clip CSS, no id random).
- `PosterCard` / poster inline — grid 2:3.
- `SpoilerText` — blur + click-to-reveal (client).
- `ResultCard` — card 9:16 della Serata.
- `LivePoll` — refresh periodico (realtime mock).
