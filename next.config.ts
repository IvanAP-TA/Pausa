import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Cache Components is off for now: every page here is per-user and per-Cerchia,
// and OpenNext on Cloudflare is the deploy target. Revisit once the app is stable.
const nextConfig: NextConfig = {
  // Dev only: lets 127.0.0.1 load dev assets, so a second "person" can be tested with its own cookies.
  // DEV_ORIGINS (set by `npm run dev:lan`) adds this computer's LAN address, so a phone on the same Wi-Fi can load dev assets.
  allowedDevOrigins: ["127.0.0.1", ...(process.env.DEV_ORIGINS ? process.env.DEV_ORIGINS.split(",") : [])],
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" }],
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);

// Exposes Cloudflare bindings (D1 as `DB`) to `next dev` via wrangler's local platform proxy.
initOpenNextCloudflareForDev();
