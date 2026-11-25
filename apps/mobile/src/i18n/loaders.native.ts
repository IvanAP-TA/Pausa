import type { Locale } from "./locales";

/**
 * Android / iOS: the bundle ships on the device, so there is nothing to fetch; a plain `require` (evaluated only when the
 * language is first used, Hermes loads modules lazily). Dynamic `import()` of JSON through Metro's dev server did not resolve in Expo Go.
 */
export const loaders: Record<Locale, () => Promise<{ default: unknown }>> = {
  it: async () => ({ default: require("@messages/it.json") }),
  en: async () => ({ default: require("@messages/en.json") }),
  es: async () => ({ default: require("@messages/es.json") }),
};
