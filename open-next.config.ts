import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// The public pages (landing, guides, privacy, terms, sitemap) are prerendered at build time and served from Workers static
// assets: no rendering per request, so no CPU spent on them (the 1102 errors came from rendering them on every visit).
// No revalidation: they change with a deploy. Every signed-in page stays dynamic (per user, per Cerchia).
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
