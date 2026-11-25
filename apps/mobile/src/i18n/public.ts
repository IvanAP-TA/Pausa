// Registers all three catalogues synchronously, for the SERVER render only (static export): the page is HTML at build time and
// cannot await a dynamic import. Imported by public routes. `process.env.EXPO_SERVER` is inlined by the Expo Babel preset
// (true when rendering for the export, false in the browser bundle), and Metro folds the dead branch away, so the three JSON
// files are NOT in any browser chunk (measured: they were ~100 KB raw in the shared chunk before this guard).
// In the browser a public page gets its strings like the app does, through the on-demand chunk of its locale.
import { i18nFor } from "./index";
import type { Locale } from "./locales";
import { getMessages, registerMessages } from "./messages";

if (process.env.EXPO_SERVER) {
  registerMessages("it", require("@messages/it.json"));
  registerMessages("en", require("@messages/en.json"));
  registerMessages("es", require("@messages/es.json"));
}

/** Strings for build-time code (generateMetadata, JSON-LD) that runs outside React. */
export const publicI18n = (locale: Locale) => {
  const messages = getMessages(locale);
  if (!messages) throw new Error(`publicI18n("${locale}") is only available while rendering on the server`);
  return i18nFor(locale, messages);
};
