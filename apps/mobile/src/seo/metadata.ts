import type { GenerateMetadataFunction } from "expo-server";
import { OG_LOCALE, isLocale, type Locale } from "@/i18n/locales";
import { DEFAULT_LOCALE, LOCALES, SITE_URL, publicUrl } from "./site";

/** Colour of the status bar / address bar (INVENTORY 1.1: fixed petrol, also in light theme). */
export const THEME_COLOR = "#001113";

/**
 * The share image of every public page: the pause mark, 512x512 (there is no per-page social card yet, so a `summary` card with the
 * brand mark; INVENTORY 1.7 item 15/26). Absolute, because crawlers do not resolve relative image URLs.
 */
export const SHARE_IMAGE = { url: `${SITE_URL}/icons/icon-512.png`, width: 512, height: 512, alt: "Pausa", type: "image/png" } as const;

type Metadata = NonNullable<Awaited<ReturnType<GenerateMetadataFunction>>>;

type PageMeta = {
  locale: Locale;
  /** Path under /{locale}: "", "/guide", "/privacy". */
  sub: string;
  /** Full title as it must appear (the caller applies the "· Pausa" suffix, the landing does not). */
  title: string;
  description: string;
  type?: "website" | "article";
  publishedTime?: string;
};

/**
 * Everything INVENTORY 1.7 asks of an indexable page, as expo-router `generateMetadata` output: title, description,
 * canonical (absolute, self-referencing), hreflang it/en/es + x-default (the Italian page), Open Graph, Twitter, robots.
 */
export function pageMetadata({ locale, sub, title, description, type = "website", publishedTime }: PageMeta): Metadata {
  const url = publicUrl(locale, sub);
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: url,
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, publicUrl(l, sub)])), "x-default": publicUrl(DEFAULT_LOCALE, sub) },
    },
    openGraph: {
      type,
      title,
      description,
      url,
      siteName: "Pausa",
      locale: OG_LOCALE[locale],
      images: [SHARE_IMAGE],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: { card: "summary", title, description, images: [{ url: SHARE_IMAGE.url, alt: SHARE_IMAGE.alt }] },
    other: { "theme-color": THEME_COLOR },
    icons: { icon: "/favicon.ico" },
  };
}

/** Private screens: never indexed (INVENTORY 1.7 item 33). */
export const privateMetadata = (title: string): Metadata => ({
  title,
  robots: { index: false, follow: false },
  other: { "theme-color": THEME_COLOR },
});

export const absolute = (path: string) => `${SITE_URL}${path}`;

/**
 * The locale of a statically rendered page, from the route params. The exporter also renders each dynamic route once with the
 * template itself (`{locale: "[locale]"}`); that page is never linked or indexed, so it gets this neutral metadata.
 */
export const localeFrom = (params: Record<string, string | string[]>): Locale | null => (isLocale(params.locale) ? params.locale : null);
export const templateMetadata: Metadata = { title: "Pausa", robots: { index: false, follow: false } };
