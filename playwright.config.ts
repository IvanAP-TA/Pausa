import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the dev server with the seeded local database (`npm run db:reset:local` first).
 * They share one database, so they run one at a time. `npm run e2e` starts the server itself if none is running.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", locale: "it-IT" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/it",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
