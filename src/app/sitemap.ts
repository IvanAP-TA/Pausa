import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";
import { GUIDE_SLUGS, GUIDES_UPDATED } from "@/lib/guides";
import { LEGAL_UPDATED } from "@/lib/legal";

/** Every public page in the three languages, each with its alternates (x-default = Italian) and its last change. */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, lastModified: string) => {
    const languages = {
      ...Object.fromEntries(routing.locales.map((l) => [l, `${siteUrl()}/${l}${path}`])),
      "x-default": `${siteUrl()}/${routing.defaultLocale}${path}`,
    };
    return routing.locales.map((l) => ({ url: `${siteUrl()}/${l}${path}`, lastModified, alternates: { languages } }));
  };
  return [
    ...page("", GUIDES_UPDATED),
    ...page("/guide", GUIDES_UPDATED),
    ...GUIDE_SLUGS.flatMap((slug) => page("/guide/" + slug, GUIDES_UPDATED)),
    ...page("/privacy", LEGAL_UPDATED),
    ...page("/terms", LEGAL_UPDATED),
  ];
}
