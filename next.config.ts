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
  // Baseline security headers on every response. (A Content-Security-Policy is deliberately not set yet: the theme bootstrap and
  // Next's own inline scripts need nonces; add one together with a nonce middleware if the threat model calls for it.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" }],
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);

// Exposes Cloudflare bindings (D1 as `DB`) to `next dev` via wrangler's local platform proxy.
initOpenNextCloudflareForDev();
