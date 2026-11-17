# Pausa — Poster-forward cinematic redesign (design spec)

Date: 2026-11-17
Status: approved for planning
Supersedes nothing — this is a visual/UX pass on top of the existing
"Sottotitoli su carta / Sottotitoli" system (`design/DESIGN_PLAN.md` §8).

## 1. Goal

The current UI has good bones (editorial paper + night-blue cinema,
Gloock serif, tomato/yellow accent) but the **feed — the screen people
live in — reads flat**: tiny posters, cards that barely separate from
the background, dead grey reactions, no focal points. Make the app feel
beautiful and cinematic without throwing away the identity.

Approved decisions (from brainstorming):
- **Direction:** poster-forward cinematic. Posters become the heroes;
  cards gain real material; the accent creates focus. Keep the serif and
  the paper/cinema identity.
- **Default theme:** dark-first. The app opens dark (night blue + yellow)
  unless the user has pinned a theme. "Auto" stays available.
- **Scope:** feed/diary, log card + reactions, landing, serata + ranking.

## 2. Non-goals

- **No new palette or typography.** Same tokens, same fonts (Gloock +
  Instrument Sans).
- **No feed grouping of repeated titles.** Collapsing multiple people's
  logs of the same film would destroy the per-log review/reactions
  semantics. The repetition visible today is a seed artifact. Left out of
  scope (revisit later if real usage shows a need).
- **No data-layer / query changes.** This is a presentation pass. Server
  components keep their current data shape. (The one exception is theme
  default resolution, which is cookie/CSS only.)
- No copy/i18n rewrites beyond any new `aria-label` that a new control
  needs; reuse existing message keys.

## 3. Principles (apply everywhere)

1. **Posters carry the warmth.** Every poster gets a 1px ring + soft
   shadow so it lifts off a dark surface; consistent corner radius.
2. **One focal point per card.** Title (serif) and rating (accent) are the
   anchors; author/meta recede.
3. **The accent is the projector light** — used on active state, rating,
   "mine" reactions, CTAs. Still sparing (<~5% of a screen).
4. **Elevation, not just borders.** On dark, cards read via a lighter
   surface + soft shadow, not only a hairline.
5. **Motion is feedback, never decoration.** Reduced-motion must fully
   neutralise it (globals.css already does via the `prefers-reduced-motion`
   block — keep new motion inside that guarantee).

## 4. Theme: dark-first

Files: `src/app/globals.css`, `src/app/[locale]/layout.tsx`,
`src/lib/theme.ts` (read-only check).

- Make the **dark values the base `:root`** in `globals.css`. Light
  becomes an opt-in: `:root[data-theme="light"]` and, for the "Auto"
  (system) case, `@media (prefers-color-scheme: light)` scoped so an
  explicit `data-theme="dark"` still wins.
- **No cookie → dark.** In `layout.tsx`, a `system` theme currently
  renders no `data-theme` and lets the media query decide. Change the
  default so that, with no explicit pick, the page is dark. "Auto"
  (explicitly chosen) continues to follow the phone. "Light"/"Dark"
  explicit stay fixed. No white flash (resolution stays server-side from
  the cookie).
- `viewport.themeColor`: default to the dark page colour (`#0D1220`); keep
  a light entry for the light case.
- Verify the share Card (`--color-card-*`) is unaffected — it must stay
  paper in both themes.

Acceptance: fresh browser (no cookie) opens dark; pinning Light/Dark/Auto
in Account still works; no flash on reload; share Card still paper.

## 5. Poster component (`src/components/poster.tsx`)

- Add ring + soft shadow and keep the single source of truth for poster
  styling (card, now-watching, serata, ranking, memories all use it).
- Add a `size="hero"` (uses `w500`) for large contexts; keep `sm/md/lg`.
- Improve the no-artwork fallback: readable title + a small kind glyph,
  tints unchanged (no saturated slop).
- Keep `loading="lazy"` and the TMDB attribution contract untouched.

Acceptance: posters visibly lift off a dark surface; fallback is legible
at `sm` through `hero`; no layout shift (aspect ratio preserved).

## 6. Log card (`src/components/log-card.tsx`) — the core win

- **Bigger poster** (~96–104px column, up from 72px) with the new lift.
- **Hierarchy:** author row small/quiet (avatar + name + "watched" +
  relative time) → **title** (serif, current size or slightly larger) →
  meta line → **stars** rendered larger and in the accent.
- **Review as pull-quote:** keep the centred-subtitle gesture but give it
  editorial weight — an accent left-rule or quotation treatment — so it
  reads as emotion, not a grey line. Spoiler path (`Spoiler`) unchanged in
  behaviour.
- **Card material:** lighter surface + hairline + soft shadow on dark;
  subtle lift on hover/focus-within (pointer devices only).
- **Badge** for rewatch vs first-time (reuse existing `rewatched`/
  `watched` copy; present it as a small tag).
- Keep the grid responsive and the "visto con" green chips.

Acceptance: at 420px width a card has one clear focal point; the review
reads as a quote; card lifts on hover; keyboard focus still visible.

## 7. Reactions (`src/components/reactions.tsx`)

- "Mine" = filled accent pill (bg accent, text on-accent) instead of just
  an outline; count prominent and tabular.
- Larger, livelier tap targets (keep ≥40px); unused reactions stay quiet
  until row hover/focus (current behaviour) but with clearer affordance.
- **Pop micro-animation** on toggle (scale), gated by reduced-motion.
- Preserve the optimistic `useOptimistic` logic and `toggleReaction`
  server action exactly.

Acceptance: toggling is obviously responsive; "mine" is unmistakable;
reduced-motion removes the pop; counts stay correct under rapid toggles.

## 8. Feed shell (`src/app/[locale]/c/[circleId]/page.tsx`)

- **"In onda" (now-watching):** promote from a text row to horizontally
  scrollable cards with poster + a pulsing live dot; keep the owner's
  controls (next episode/season, stop). Non-owner keeps the pulse dot.
- **Header ambience:** use the existing `.projector` hook to add a soft
  cinematic glow/vignette behind the circle name on dark. No heavy
  glassmorphism.
- Keep the onboarding/memories `Extras` (Suspense) and pagination as-is;
  restyle only to match (memories cards reuse the new poster/card look).

Acceptance: the now-watching strip feels alive and scrolls on narrow
screens; the header no longer reads as a cold list top; pagination,
filters, and empty/filtered states still work.

## 9. Tab bar (`src/components/tab-bar.tsx`)

- Dark glass bar; active tab icon/label in accent; the `+` FAB gets a
  soft glow/shadow and press feedback. Desktop rail unchanged in
  structure.

Acceptance: active tab is obvious; FAB reads as the primary action;
safe-area padding preserved on phones.

## 10. Serata + Ranking

- Serata (`.../serata` and `src/components/serata/*` as applicable): apply
  the poster treatment to the rosa grid, add a soft glow to the primary
  CTA, polish the countdown ring. No logic changes.
- Ranking (`.../ranking/page.tsx`): show posters next to ranks with accent
  bars for the standings. No query changes.

Acceptance: both screens match the new material; no behaviour change.

## 11. Landing (`src/components/landing/*`)

- Dark-first hero; mock cards (`mock-ui.tsx`) adopt the new card/poster
  look so the landing previews the real product; keep structure, sections,
  i18n, JSON-LD, sticky CTA, reveal-on-scroll, smooth scroll.

Acceptance: landing opens dark, mocks look like the shipped app, all
existing sections and the reveal animations still work.

## 12. Motion (use the `animate` skill when implementing)

- Reaction pop, card hover lift, now-watching live pulse, feed stagger
  reveal. All composite-only properties (transform/opacity) and all behind
  the existing `prefers-reduced-motion` guard.

## 13. Phasing (each phase ends with a screenshot check, light + dark)

- **F1 — Foundations (max wow on the home screen):** §4 theme dark-first,
  §5 Poster, §6 Log card, §7 Reactions.
- **F2 — Feed surround:** §8 feed shell (ambience + In onda), §9 tab bar.
- **F3 — Serata + Ranking:** §10.
- **F4 — Landing:** §11.

## 14. Verification

For each phase: `npm run dev` already running; re-run the screenshot
script (`_shot.mjs`, light + dark, logged in as `giulia@pausa.test`,
circle `c-divano`) and eyeball the result. Before finishing: `npm run
lint` and `npx tsc --noEmit` clean. Spot-check reduced-motion and keyboard
focus. No console errors in the dev overlay.

## 15. Open risks

- Dark-first CSS refactor must not regress the explicit theme overrides or
  the share Card — test all four states (no-cookie, Auto, Light, Dark).
- Bigger posters pull more `w342/w500` images; keep `loading="lazy"` and
  watch feed weight.
