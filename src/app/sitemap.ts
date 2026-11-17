import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: (locale: string) => number) => {
    const languages = Object.fromEntries(routing.locales.map((l) => [l, `${siteUrl()}/${l}${path}`]));
    return routing.locales.map((l) => ({ url: `${siteUrl()}/${l}${path}`, changeFrequency: "monthly" as const, priority: priority(l), alternates: { languages } }));
  };
  return [
    ...page("", (l) => (l === routing.defaultLocale ? 1 : 0.9)),
    ...page("/privacy", () => 0.3),
    ...page("/terms", () => 0.3),
  ];
}
