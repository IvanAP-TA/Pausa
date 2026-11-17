/**
 * Darkroom colours for the server-rendered images (next/og). Satori reads neither oklch nor CSS variables,
 * so these are the sRGB copies of the tokens in `src/app/tokens.css` (dark block): change them together.
 */
export const CARD = {
  paper: "#090604",
  paper2: "#100c0a",
  paper3: "#1b1613",
  ink: "#e9e4dc",
  ink2: "#c2bdb5",
  muted: "#918b85",
  rule: "#2f2a27",
  accent: "#ec8d38",
  accentInk: "#090604",
} as const;

/** Google family names, also the `name` each font is registered under in ImageResponse. */
export const CARD_FONT = {
  display: "Sofia Sans Extra Condensed",
  body: "Barlow",
} as const;
