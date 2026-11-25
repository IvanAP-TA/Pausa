import type { Locale } from "./locales";

/** Web: one chunk per locale, fetched on demand (Metro splits each `import()`). */
export const loaders: Record<Locale, () => Promise<{ default: unknown }>> = {
  it: () => import("@messages/it.json"),
  en: () => import("@messages/en.json"),
  es: () => import("@messages/es.json"),
};
