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
  // Security headers on every response. The Content-Security-Policy is static, not nonce-based: a nonce forces every page into
  // dynamic rendering (no static landing, no cached SEO pages) and cannot be checked on OpenNext/Cloudflare from here. So scripts
  // allow 'unsafe-inline' (Next's bootstrap and the theme script are inline); everything else is locked down (no plugins, no
  // framing, no foreign forms/base, only known hosts). See SICUREZZA.md before tightening it to a nonce.
  async headers() {
    const dev = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://static.cloudflareinsights.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://image.tmdb.org https://*.googleusercontent.com https://s4.anilist.co",
      "font-src 'self'",
      `connect-src 'self' https://cloudflareinsights.com${dev ? " ws: wss:" : ""}`,
      "manifest-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
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
