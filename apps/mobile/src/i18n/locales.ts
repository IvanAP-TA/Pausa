export const LOCALES = ["it", "en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "it";
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** `og:locale` values (INVENTORY 1.2). */
export const OG_LOCALE: Record<Locale, string> = { it: "it_IT", en: "en_US", es: "es_ES" };
