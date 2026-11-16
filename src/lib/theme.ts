/** Theme preference: "system" follows the phone; "light" (paper) and "dark" (night) pin it. Stored in a cookie
 * so the server renders the right theme on the first byte (no flash). */
export const THEME_COOKIE = "pausa-theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | undefined | null): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "system";
}
