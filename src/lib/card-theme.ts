/**
 * Darkroom colours for the server-rendered images (next/og). Satori reads neither oklch nor CSS variables,
 * so these are the sRGB copies of the tokens in `src/app/tokens.css` (dark block): change them together.
 */
export const CARD = {
  paper: "#001113",
  paper2: "#011a1d",
  paper3: "#062529",
  ink: "#ece7de",
  ink2: "#bdcacc",
  muted: "#8ca0a2",
  rule: "#1d3b3e",
  accent: "#fd7e49",
  accentInk: "#001113",
} as const;

/** Google family names, also the `name` each font is registered under in ImageResponse. */
export const CARD_FONT = {
  display: "Sofia Sans Extra Condensed",
  body: "Barlow",
} as const;
