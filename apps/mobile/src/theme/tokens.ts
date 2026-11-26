// Design tokens of "Pellicola" (petrol ground, coral signal), ported from design/tokens.css and the v1 base.css (removed).
// Colours are kept in OKLCH, character for character as in the CSS, and converted to sRGB at load time (oklch.ts).
// tokens.css is the source of truth (DESIGN.md says its own token block lags): change both together.
import { oklchToCss } from "./oklch";

export const colorNames = [
  "paper", "paper2", "paper3", "ink", "ink2", "muted", "rule",
  "accent", "accentHover", "accentDeep", "accentInk", "focus",
  "error", "success", "scrim", "onTint",
  "tint1", "tint2", "tint3", "tint4", "tint5", "tint6", "tint7", "tint8",
] as const;
export type ColorName = (typeof colorNames)[number];
export type Palette = Record<ColorName, string>;
export type Scheme = "dark" | "light";

/** OKLCH sources. Dark is the default (tokens.css `@theme`), light is `:root[data-theme="light"]`. */
export const oklchSource: Record<Scheme, Record<ColorName, string>> = {
  dark: {
    error: "oklch(70% 0.18 2)",
    success: "oklch(76% 0.13 150)",
    paper: "oklch(16% 0.03 205)",
    paper2: "oklch(20% 0.033 205)",
    paper3: "oklch(24.5% 0.036 205)",
    ink: "oklch(93% 0.014 85)",
    ink2: "oklch(83% 0.014 205)",
    muted: "oklch(69% 0.022 205)",
    rule: "oklch(33% 0.036 205)",
    accent: "oklch(73% 0.17 42)",
    accentDeep: "oklch(52% 0.13 40)",
    accentInk: "oklch(16% 0.03 205)",
    focus: "oklch(73% 0.17 42)",
    scrim: "oklch(16% 0.03 205 / 0.62)",
    accentHover: "oklch(78% 0.15 45)",
    tint1: "oklch(36% 0.06 200)",
    tint2: "oklch(36% 0.075 155)",
    tint3: "oklch(36% 0.075 250)",
    tint4: "oklch(36% 0.075 20)",
    tint5: "oklch(36% 0.075 120)",
    tint6: "oklch(36% 0.07 225)",
    tint7: "oklch(36% 0.06 175)",
    tint8: "oklch(36% 0.075 345)",
    onTint: "oklch(94% 0.012 78)",
  },
  light: {
    // Not overridden in tokens.css for light: the tints and on-tint stay as in dark.
    tint1: "oklch(36% 0.06 200)",
    tint2: "oklch(36% 0.075 155)",
    tint3: "oklch(36% 0.075 250)",
    tint4: "oklch(36% 0.075 20)",
    tint5: "oklch(36% 0.075 120)",
    tint6: "oklch(36% 0.07 225)",
    tint7: "oklch(36% 0.06 175)",
    tint8: "oklch(36% 0.075 345)",
    onTint: "oklch(94% 0.012 78)",
    paper: "oklch(97.5% 0.022 92)",
    paper2: "oklch(94.5% 0.026 90)",
    paper3: "oklch(91% 0.03 88)",
    ink: "oklch(21% 0.035 205)",
    ink2: "oklch(34% 0.04 205)",
    muted: "oklch(46% 0.04 205)",
    rule: "oklch(83% 0.03 185)",
    accent: "oklch(54% 0.165 40)",
    accentHover: "oklch(48% 0.15 40)",
    accentDeep: "oklch(44% 0.135 40)",
    accentInk: "oklch(98% 0.02 92)",
    focus: "oklch(54% 0.165 40)",
    error: "oklch(47% 0.19 2)",
    success: "oklch(42% 0.11 150)",
    scrim: "oklch(97.5% 0.022 92 / 0.7)",
  },
};

function convert(src: Record<ColorName, string>): Palette {
  const out = {} as Palette;
  for (const name of colorNames) out[name] = oklchToCss(src[name]);
  return out;
}

/** Real sRGB values (`rgb()` / `rgba()`), used on native and by the CSS variables on web. */
export const palettes: Record<Scheme, Palette> = { dark: convert(oklchSource.dark), light: convert(oklchSource.light) };

/** Spacing scale (`--space-*`), in dp. */
export const space = { "3xs": 2, "2xs": 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 40, "2xl": 64, "3xl": 96 } as const;

/** Minimum touch target (`--control`, and the 44pt rule). */
export const control = 44;
/** Hairline thickness (`--rule-hair`). */
export const hair = 1;

/** Radius is 0 everywhere; the one round thing is an avatar. */
export const radius = { none: 0, avatar: 9999 } as const;

/** Type scale from tokens.css (`--text-*`), rem converted at 16. Phones: display at its small end. */
export const fontSize = {
  xs: 12, sm: 14, md: 16, lg: 19.2, xl: 23, "2xl": 27.6, "3xl": 33.2,
  displayS: 33.2, display: 60, section: 32, chapter: 40, title: 32, lead: 19.2,
} as const;

/** Font families, one per weight (Android needs a family name per weight; the web @font-face rules use the same names). */
export const fonts = {
  display200: "SofiaSansExtraCondensed_200",
  display400: "SofiaSansExtraCondensed_400",
  body300: "Barlow_300",
  body400: "Barlow_400",
  body600: "Barlow_600",
} as const;
export const fallbackSans = "ui-sans-serif, system-ui, sans-serif";

/** Motion (`--dur-*`, `--ease-out`). */
export const motion = { micro: 120, short: 220, long: 420, easeOut: [0.16, 1, 0.3, 1] as const };

/** Breakpoints in dp: tokens.css uses 40rem and 60rem for the gutter, 64rem for the rail. */
export const breakpoints = { phone: 640, tablet: 960, rail: 1024, aside: 1280 } as const;

/** Layout (`--container`, `--gutter`). */
export const layout = { container: 1440, gutter: { phone: 16, tablet: 24, wide: 64 } } as const;

/** CSS custom-property name for a colour token on web (`paper2` -> `--c-paper2`). */
export const cssVar = (name: ColorName) => `--c-${name}`;
/** Value used in styles on web: the colour follows `data-theme` without any re-render. */
export const cssRef = (name: ColorName) => `var(${cssVar(name)})`;
