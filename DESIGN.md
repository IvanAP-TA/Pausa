# Design: Pausa

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.
Supersedes `design/DESIGN_PLAN.md` §8 (Gloock + Instrument Sans, "Sottotitoli"). Chosen on 17 Nov 2026 from `design/directions-v3.html`.

## System
- Genre: atmospheric
- Shape of the first page: app screen (the diary of a Cerchia). The landing at `/[locale]` is a page with a Poster hero.
- Theme: Darkroom (Hallmark catalog), colourway amber. Light mode is a cream white paper (`oklch(97.5% 0.022 92)`), warm ink, the red signal of Darkroom's paper colourway.
- Axes: dark/display-condensed/chromatic-amber · posture: restrained
- Default mode: dark with no cookie. `data-theme` on `<html>` is always one of `dark`, `light`, `system` (`src/lib/theme.ts`).

## Tokens
`src/app/tokens.css` is the source of truth. The roles (dark values):
```css
:root {
  --color-paper: oklch(12.5% 0.008 55);  --color-paper-2: oklch(16% 0.009 55);  --color-paper-3: oklch(20.5% 0.01 55);
  --color-ink: oklch(92% 0.012 78);  --color-ink-2: oklch(80% 0.012 75);  --color-muted: oklch(64% 0.012 65);  --color-rule: oklch(29% 0.01 55);
  --color-accent: oklch(73% 0.15 58);  --color-accent-ink: oklch(12.5% 0.008 55);  --color-focus: oklch(73% 0.15 58);
  --font-display: "Sofia Sans Extra Condensed", sans-serif;  --font-body: "Barlow", sans-serif;  --font-outlier: var(--font-body);
  --radius-card: 0;  --radius-pill: 0;  --rule-hair: 1px;  --shadow-card: none;
}
```
The spacing scale, the type scale, the easings and the durations are the scaffold's and live in `tokens.css`.
Older token names (`on-accent`, `second`, `second-deep`, `on-second`, `on-second-muted`, `second-text`, `accent-hover`, `card-*`) are aliases; new code uses the roles above.

## Type
- Display: Sofia Sans Extra Condensed, capitals. 200 on page heads and figures (`.display`, `.figure`, `h1`, `h2`), 400 on item titles and controls (`.title`, `h3`, `.btn`). Line-height 1.0 or more. Never above 400.
- Body: Barlow 400; 300 only at lead size (`.subtitle`, a review); 600 for a name or a strong word.
- Labels, captions, meta, table heads, nav: Barlow a step smaller (`text-sm`), sentence case, untracked, `text-muted` or `text-ink-2`. No mono. No tracked capitals under 16px.
- App type sizes are fixed: `text-display` 3rem, `text-title` / `text-section` 2rem, `text-lead` 1.2rem, body 1rem. Public pages add `text-hero`, `text-poster`, `text-figure` (fluid).

## Surfaces
- Depth is lightness: `bg-paper` ground, `bg-paper-2` well (`.well`), `bg-paper-3` raised or hover. No shadow, no glow, no blur, no glass, no gradient.
- Radius 0 everywhere. The one round thing is an avatar.
- Rows are parted by full-width 1px hairlines (`.plate` for one, `.rows` for a list). A list is rows on the ground, not a stack of boxes; never a box inside a box.
- `.grained` adds the speck grain to a well that carries no picture; two a screen at most.
- Posters are prints: square, no frame, no shadow, their own colours, never a thumbnail where they lead (104px or wider in a diary row).
- Amber is scarce (under 5% of a screen): the one primary control, the current selection, a rating, my own reaction, a count badge. Never a band, a wash, a head or body text.

## Controls
- Primary: `.btn .btn-primary`, amber fill, `accent-ink` text, display capitals 400, square, 44px (`.btn-lg` 52px on public pages, `.btn-sm` 36px inside a row).
- Secondary: `.btn`, 1px ink outline, same height. Quiet: `.btn .btn-quiet`, 1px rule outline.
- Text link: `.link`, ink with a muted underline that turns amber on hover.
- Fields: `.field` (input, select, textarea), 1px muted edge on the ground, square, 44px; the label above it in `.field-label`.
- Tag: `.tag`, a 1px rule cell. Meter: `.meter > span` (scaleX). Skeleton: `.skeleton`.
- Focus: 2px amber outline, instant, on everything interactive (global `:focus-visible`).
- Icons: `lucide-react`, `strokeWidth={1.6}`, 16 to 24px, `aria-hidden`. No hand-drawn SVG icons (the Google mark, the pause mark and the countdown ring are the exceptions).
- Phone tab bar: `1fr auto 1fr`, the + in the middle track, on the centre line of the screen.
- Theme: `ThemeToggle` (diary header, landing nav) flips dark and light; the select in the Cerchia page also offers Auto.

## Motion
- App screens: still. Colour and border transitions at 120 to 220ms; `transform` and `opacity` only. Never `transition-all`, never an animated width, height, top or left.
- Landing: scroll-linked motion through Lenis (`src/components/landing/smooth-scroll.tsx`), asked for by the owner: smooth scroll, a progress line under the nav (`data-progress`), parallax (`data-speed`, `data-speed-x`), the hero text leaving (`data-scrub="leave"`), a closing head arriving (`data-scrub="arrive"`), sections rising once (`data-reveal`). All of it is off under reduced motion.

## Copy rules the gates enforce
- No middle-dot chains (`A · B · C`): use commas, line breaks or columns. No arrow glued to a link label. No em or en dash in copy. No eyebrow above a heading. No emoji as an icon (an emoji a person picked as a reaction or an avatar is content and stays).

## Exports
`src/app/tokens.css` in this project (Tailwind v4 `@theme static`). `src/lib/card-theme.ts` holds sRGB copies for images rendered on the server.
