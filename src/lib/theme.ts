/** Theme preference: "dark" (the default, with no cookie), "light" (fibre paper), or "system" to follow the phone.
 * Stored in a cookie so the server renders the right theme on the first byte (no flash). */
export const THEME_COOKIE = "pausa-theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | undefined | null): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "dark";
}

/** Browser-bar colours (sRGB copies of --color-paper in tokens.css: a meta tag cannot read a CSS variable). */
export const THEME_COLOR = { dark: "#090604", light: "#fbf5e6" } as const;
