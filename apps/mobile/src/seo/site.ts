// Facts about the site that BOTH the app (metadata, JSON-LD) and the Node scripts (postexport, budget, tests) need.
// Plain data, no imports and no TypeScript-only syntax beyond annotations, so `node` can import it as-is (type stripping).

export const SITE_URL = "https://pausa.gnagno.org";
export const LOCALES: string[] = ["it", "en", "es"];
export const DEFAULT_LOCALE = "it";

/** Guide slugs shared by all languages. Only one for now; the other seven arrive with the content work (T8). */
export const GUIDE_SLUGS: string[] = ["choose-a-movie-with-friends"];

/** Date the legal texts and guides were last revised (kept from the old app, INVENTORY 1.5). */
export const CONTENT_UPDATED = "2026-11-17";

/** Pages under /{locale}, in sitemap order (INVENTORY 1.5): landing, guide index, guides, privacy, terms. */
export const PUBLIC_SUBPATHS: string[] = ["", "/guide", ...GUIDE_SLUGS.map((s) => `/guide/${s}`), "/privacy", "/terms"];

/**
 * Paths that never get JavaScript removed: the app shell. Everything else that is exported is a public page. Patterns are
 * relative to a locale: `c` means /{locale}/c/...
 */
export const PRIVATE_SEGMENTS: string[] = ["c", "join", "sign-in", "home", "account", "auth"];

/** `robots.txt` rules for crawlers. The AI-crawler group and the private prefixes follow INVENTORY 1.4. */
export const BLOCKED_AGENTS: string[] = ["GPTBot", "ClaudeBot", "CCBot"];

export const publicUrl = (locale: string, sub = "") => `${SITE_URL}/${locale}${sub}`;
