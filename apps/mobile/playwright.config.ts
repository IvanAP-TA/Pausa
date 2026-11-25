import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the STATIC export (dist/), served the way the asset host will serve it (scripts/serve-dist.mjs).
// Public-page tests need nothing else. The app-flow tests need the API (wrangler dev --local on :8798, see README.md in this
// folder) and are skipped, loudly, when it is not running.
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // Service workers are BLOCKED by default: a worker that answers requests would hide them from page.route() and make every spec depend on
  // cache state. e2e/pwa.spec.ts (and the CSP spec for the worker) switch them on with test.use({ serviceWorkers: "allow" }).
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices["Pixel 7"], trace: "off", serviceWorkers: "block" },
  webServer: {
    command: `node scripts/serve-dist.mjs ${port}`,
    url: `http://127.0.0.1:${port}/it`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
