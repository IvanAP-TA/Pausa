import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Only the public landing pages are for search engines; everything behind a Cerchia, a Serata or a sign-in is private. */
export default function robots(): MetadataRoute.Robots {
  return {
    // /api/og/ stays open: the guides' social images live there, and X's crawler follows robots.txt.
    rules: [{ userAgent: "*", allow: ["/", "/api/og/"], disallow: ["/api/", "/*/c/", "/*/s/", "/*/join/", "/*/sign-in", "/*/home", "/*/me", "/*/account", "/*/review"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
