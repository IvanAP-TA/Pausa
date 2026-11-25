// JavaScript ENABLED, and still nothing is downloaded or run on a public page: not a script request, not an inline script
// (other than JSON-LD, which is data). The app shell, in the same browser, does load JavaScript: so this cannot pass by accident.
import { expect, test } from "@playwright/test";

const PUBLIC = ["/", "/it", "/en", "/es", "/it/guide", "/it/guide/choose-a-movie-with-friends", "/en/privacy", "/es/terms", "/it/does-not-exist"];

for (const url of PUBLIC)
  test(`${url} downloads no script and runs none`, async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: "networkidle" });
    expect(scripts).toEqual([]);
    expect(errors).toEqual([]);
    // React never started: no root-level hydration marker, and the theme variable is still the static dark default.
    expect(await page.evaluate(() => (globalThis as { __EXPO_ROUTER_HYDRATE__?: boolean }).__EXPO_ROUTER_HYDRATE__)).toBeUndefined();
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBeNull();
  });

test("control: the app shell does download JavaScript and starts (so the checks above can fail)", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
  await page.goto("/it/sign-in", { waitUntil: "networkidle" });
  expect(scripts.length).toBeGreaterThan(3);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
});
