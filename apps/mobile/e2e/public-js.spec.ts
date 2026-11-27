// JavaScript ENABLED: a public page downloads one small script, /public.js, and never the app (no React, no Expo Router). The app
// shell, in the same browser, does load its bundle: so this cannot pass by accident. Then what /public.js adds, one by one: the
// saved theme, the move to /home for someone signed in, the Google button, parallax. (With JavaScript OFF: landing-nojs.spec.ts.)
import { expect, test } from "@playwright/test";
import { API, person, signIn } from "./clientb-helpers";

const PUBLIC = ["/", "/it", "/en", "/es", "/it/guide", "/it/guide/choose-a-movie-with-friends", "/en/privacy", "/es/terms", "/it/slow-down", "/it/does-not-exist"];

const LANDINGS = ["/it", "/en", "/es"];

for (const url of PUBLIC)
  test(`${url} downloads only /public.js (and Lenis on the landing) and never starts the app`, async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (r) => r.resourceType() === "script" && scripts.push(new URL(r.url()).pathname));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: "networkidle" });
    expect(scripts).toEqual(LANDINGS.includes(url) ? ["/public.js", "/lenis.js"] : ["/public.js"]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (globalThis as { __EXPO_ROUTER_HYDRATE__?: boolean }).__EXPO_ROUTER_HYDRATE__)).toBeUndefined();
    // nothing saved: the static dark default, untouched
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBeNull();
  });

test("control: the app shell does download JavaScript and starts (so the checks above can fail)", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
  await page.goto("/it/sign-in", { waitUntil: "networkidle" });
  expect(scripts.length).toBeGreaterThan(3);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
});

const paper = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-paper").trim());

test("the theme saved in the app is on every public page from the first paint; the landing's toggle saves a new one", async ({ page }) => {
  await page.goto("/it/sign-in", { waitUntil: "networkidle" });
  const dark = await paper(page);
  await page.evaluate(() => localStorage.setItem("pausa-theme", "light"));
  // what the browser paints first: the attribute is already there when the body starts
  for (const url of ["/it/privacy", "/en/guide", "/it/nope", "/es"]) {
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), url).toBe("light");
    expect(await paper(page), url).not.toBe(dark);
  }
  await expect(page.locator(".lp-theme")).toBeChecked();
  await page.locator("label.lp-theme-btn").click();
  expect(await paper(page)).toBe(dark);
  expect(await page.evaluate(() => localStorage.getItem("pausa-theme"))).toBe("dark");
  await page.goto("/it/terms");
  expect(await paper(page)).toBe(dark);
});

test("the Google button in the hero shows only when Google sign-in is on, and starts it with /home as the way back", async ({ page }) => {
  const google = page.locator("[data-google]");
  await page.route("**/api/auth/google/status", (r) => r.fulfill({ json: { enabled: false } }));
  await page.goto("/it", { waitUntil: "networkidle" });
  await expect(google).toBeHidden();
  await page.route("**/api/auth/google/status", (r) => r.fulfill({ json: { enabled: true } }));
  await page.goto("/en", { waitUntil: "networkidle" });
  await expect(google).toBeVisible();
  await expect(google).toHaveText("Continue with Google");
  const href = new URL((await google.getAttribute("href"))!, "http://x");
  expect(href.pathname).toBe("/api/auth/google/start");
  expect(href.searchParams.get("next")).toBe("/en/home");
});

test("smooth scrolling (Lenis) and parallax: the hero plate drifts and the hero text fades as the page scrolls; reduced motion keeps all of it still", async ({ browser }) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion });
    const page = await ctx.newPage();
    await page.goto(`${test.info().project.use.baseURL ?? ""}/it`, { waitUntil: "networkidle" });
    const style = () => page.evaluate(() => ({
      plate: (document.querySelector("[data-speed]") as HTMLElement).style.transform,
      text: (document.querySelector('[data-scrub="leave"]') as HTMLElement).style.opacity,
    }));
    const before = await style();
    const lenis = () => page.evaluate(() => document.documentElement.classList.contains("lenis"));
    if (reducedMotion === "no-preference") await expect.poll(lenis).toBe(true);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(1200);
    const after = await style();
    if (reducedMotion === "reduce") {
      expect(after).toEqual({ plate: "", text: "" });
      expect(await lenis()).toBe(false); // no smooth scrolling either: Lenis is not even downloaded
    } else {
      expect(after.plate).not.toBe(before.plate);
      expect(Number(after.text)).toBeLessThan(1);
    }
    await ctx.close();
  }
});

test.describe("signed in", () => {
  let apiUp = false;
  test.beforeAll(async () => {
    apiUp = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
  });
  test("someone signed in who opens the landing goes on to /home; a visitor without a session stays", async ({ browser, page }) => {
    test.skip(!apiUp, `API not running on ${API}: this test did NOT run.`);
    await page.goto("/es", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/es$/);
    const p = await person(browser, "landinghome");
    await signIn(p.page, p.email, "/it/home");
    await p.page.goto("/es");
    await p.page.waitForURL(/\/es\/home$/);
    await p.ctx.close();
  });
});
