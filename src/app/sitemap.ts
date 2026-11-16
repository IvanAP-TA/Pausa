import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `${siteUrl()}/${l}`]));
  return routing.locales.map((l) => ({
    url: `${siteUrl()}/${l}`,
    changeFrequency: "monthly" as const,
    priority: l === routing.defaultLocale ? 1 : 0.9,
    alternates: { languages },
  }));
}
