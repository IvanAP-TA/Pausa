# Design: Pausa

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.
Supersedes `design/DESIGN_PLAN.md` §8 (Gloock + Instrument Sans, "Sottotitoli"). Chosen on 17 Nov 2026 from `design/directions-v3.html`.

## System
- Genre: atmospheric
- Shape of the first page: app screen (the diary of a Cerchia). The landing at `/[locale]` is a page with a Poster hero.
- Theme: Darkroom (Hallmark catalog), colourway film since 18 Nov 2026 (the owner first picked velvet, wine and gold, then this one; it replaces warm black and amber): the teal and orange of a graded film. The ground is petrol (`oklch(16% 0.03 205)`, steps at 20% and 24.5%), the rules and the muted text carry the same hue, the signal is a coral orange (`oklch(73% 0.17 42)`). Where this file says "amber" it means that signal. sRGB copies for server images live in `src/lib/card-theme.ts` and `src/lib/theme.ts`: change them together. Light mode is a cream white paper (`oklch(97.5% 0.022 92)`), warm ink and the same amber signal burnt down to an orange that reads on cream (`oklch(54% 0.155 45)`, 5:1 on the paper and under cream text). Until 18 Nov 2026 the light signal was red; it was changed so the pause mark has one colour and red means only error or destruction.
- Axes: dark/display-condensed/chromatic-teal-and-orange · posture: restrained
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
- App type sizes: `text-display` runs from 3.75rem on a phone to 4.5rem in a wide column (raised from 3rem on 18 Nov 2026, so a page head carries the screen); `text-title` / `text-section` 2rem, `text-lead` 1.2rem, body 1rem. Public pages add `text-hero`, `text-poster`, `text-figure` (fluid).

## Surfaces
- Depth is lightness: `bg-paper` ground, `bg-paper-2` well (`.well`), `bg-paper-3` raised or hover. No shadow, no blur, no glass, no gradient, with one exception: the safelight.
- The safelight: one soft amber light falling on the top of every app screen (`.projector::before`, a radial gradient of the accent at `--safelight`, 14% dark and 7% light, behind everything). It is the darkroom's lamp; nothing else glows. The rail is transparent from 64rem so the light is not cut.
- The house curtain: in that same top area, vertical folds (`--curtain`, 30% dark, 5% light) fade out before the content; the light falls on the house curtain.
- A frame of film: `.reel`, two rows of sprocket holes, only on the "watching now" strip of the diary. Not on cards elsewhere.
- Error and destruction: `--color-error`, a cold pink (`oklch(70% 0.18 2)` dark, `oklch(46% 0.17 8)` light), kept far from the amber so a destructive control never reads as the primary one.
- People and titles with no artwork take one of eight deep dyes (`--color-tint-1` to `8`, 36% lightness, chroma about 0.07), so two people are told apart by colour; they stay darker and duller than any poster.
- Radius 0 everywhere. The one round thing is an avatar.
- Rows are parted by full-width 1px hairlines (`.plate` for one, `.rows` for a list). A list is rows on the ground, not a stack of boxes; never a box inside a box.
- `.grained` adds the speck grain to a well that carries no picture; two a screen at most.
- Posters are prints: square, no frame, no shadow, their own colours, never a thumbnail where they lead (104px or wider in a diary row).
- Amber is scarce (under 5% of a screen): the one primary control, the current selection (today's figure in the diary is one), a rating, my own reaction, a count badge. In the ranking the stars inside the people's tags are `muted`, so the amber stays on the first place, the meters and my own vote. Never a band, a wash, a head or body text.

## Controls
- Primary: `.btn .btn-primary`, amber fill, `accent-ink` text, display capitals 400, square, 44px (`.btn-lg` 52px on public pages, `.btn-sm` 36px inside a row).
- Secondary: `.btn`, 1px ink outline, same height. Quiet: `.btn .btn-quiet`, 1px rule outline.
- Text link: `.link`, ink with a muted underline that turns amber on hover.
- Fields: `.field` (input, select, textarea), 1px muted edge on the ground, square, 44px; the label above it in `.field-label`.
- Tag: `.tag`, a 1px rule cell. Meter: `.meter > span` (scaleX). Skeleton: `.skeleton`.
- Focus: 2px amber outline, instant, on everything interactive (global `:focus-visible`).
- Icons: `lucide-react`, `strokeWidth={1.6}`, 16 to 24px, `aria-hidden`. No hand-drawn SVG icons (the Google mark, the pause mark and the countdown ring are the exceptions).
- Phone tab bar: `1fr auto 1fr`, the + in the middle track, on the centre line of the screen, two tabs on each side (five things in all). The ranking is a row at the top of the diary on a phone and a rail entry from 64rem.
- Current tab: it lights a 2px amber stretch of the hairline it sits against, the top edge of the bar on a phone, the right edge of the rail from 64rem.
- Theme: `ThemeToggle` (diary header, landing nav) flips dark and light; the select in the Cerchia page also offers Auto.

## Signature
Added on 18 Nov 2026 to give the app screens the identity the landing already had. All of it is the system's own vocabulary; no new colour, face or surface.
- The pause mark (two amber bars, `PauseMark` in `src/components/brand.tsx`) is the one drawn mark. With the name it makes the wordmark (`Wordmark`): at the top of the rail from 64rem, on the mast that opens every page of a Cerchia on a phone (drawn by the Cerchia layout), on the account page, on sign-in and on the no-Cerchia home. Alone it marks an empty state: `.empty` on the well that says nothing is there yet (notifications, lists, ranking, a year with no log), and the empty diary. Never as a bullet, a divider or a loader.
- The diary is cut into days. A day opens with `.day`: a 1px ink rule (the only ink rule in the app; every other rule is `rule`), the day of the month as a 4.5rem figure, the weekday (or today, yesterday) and the month beside it in the body face. It is an `h2`, so a screen reads Cerchia, day, title.
- A chapter of a page opens the same way: `.chapter`, thin capitals at `text-chapter` (2.5rem) under a 1px ink rule. It is for the top-level sections of a page (members, settings, a year, comments, my lists). A head inside a well stays `.title`. The ink rule belongs to `.day` and `.chapter` only; every other rule is `rule`.
- In the ranking the position is a 4.5rem figure, the size of a day of the diary; the first is amber.
- On the diary the name of the Cerchia has the full width of the sheet; the tools sit at the far end of the mast.

## Motion
- App screens: quiet motion, asked for by the owner on 18 Nov 2026 (they were still before). All of it is CSS on `transform` and `opacity`, with the tokens `--ease-out`, `--dur-micro` 120ms, `--dur-short` 220ms, `--dur-long` 420ms; nothing moves because the page scrolled. Never `transition-all`, never an animated width, height, top or left.
  - A page arrives in one 220ms fade (`arrive`, on the `main` of a screen).
  - The first eight rows of a list rise one after the other, 45ms apart (`.stagger` on the diary, the ranking, members, notifications, past Serate, taste pairs); the rest are simply there.
  - The ink rule of a day and of a chapter is drawn from the left once (`draw`, 420ms); a meter fills the same way.
  - The current tab's amber stretch grows in (`mark-x` on a phone, `mark-y` on the rail, 220ms).
  - A panel that opens (filters, manage a list) drops 6px from its summary (`unfold`, 220ms). The pause mark of an empty state stands up once (`stand`).
  - Press: a button scales to 0.97. Hover, with a real pointer only: a poster inside a link scales to 1.03 inside its frame.
  - Reduced motion: the global rule in `base.css` ends every animation at once, so everything is at rest and nothing stays hidden.
- Landing: scroll-linked motion through Lenis (`src/components/landing/smooth-scroll.tsx`), asked for by the owner: smooth scroll, a progress line under the nav (`data-progress`), parallax (`data-speed`, `data-speed-x`), the hero text leaving (`data-scrub="leave"`), a closing head arriving (`data-scrub="arrive"`), sections rising once (`data-reveal`). All of it is off under reduced motion.

## Copy rules the gates enforce
- No middle-dot chains (`A · B · C`): use commas, line breaks or columns. No arrow glued to a link label. No em or en dash in copy. No eyebrow above a heading. No emoji as an icon (an emoji a person picked as a reaction or an avatar is content and stays).

## Exports
`src/app/tokens.css` in this project (Tailwind v4 `@theme static`). `src/lib/card-theme.ts` holds sRGB copies for images rendered on the server.
