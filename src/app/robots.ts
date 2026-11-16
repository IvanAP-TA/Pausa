import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Only the public landing pages are for search engines; everything behind a Cerchia, a Serata or a sign-in is private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/*/c/", "/*/s/", "/*/join/", "/*/sign-in"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
