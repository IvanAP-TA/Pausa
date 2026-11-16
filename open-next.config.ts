import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache yet: pages are dynamic (per user / per Cerchia).
export default defineCloudflareConfig({});
