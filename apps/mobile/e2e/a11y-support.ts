// Shared by the accessibility specs (axe, keyboard, accessibility tree): one sign-in per seeded person, then as many browser
// contexts as the matrix needs (phone / desktop x dark / light) that reuse the session cookie; and the axe runner.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, it } from "./clientb-helpers";

export const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8798";
export type Scheme = "dark" | "light";
export type Size = { name: "phone" | "desktop"; width: number; height: number };
export const PHONE: Size = { name: "phone", width: 390, height: 844 };
export const DESKTOP: Size = { name: "desktop", width: 1280, height: 800 };
export const MATRIX: Array<{ size: Size; scheme: Scheme }> = [
  { size: PHONE, scheme: "dark" },
  { size: PHONE, scheme: "light" },
  { size: DESKTOP, scheme: "dark" },
  { size: DESKTOP, scheme: "light" },
];

let ip = Math.floor(Math.random() * 150) + 30;
const nextIp = () => `10.9.${ip++ % 250}.${Math.floor(Math.random() * 250)}`;

export type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** Signs in through the real page (the API returns the magic link as `devLink` on a local machine) and keeps the session. */
export async function login(browser: Browser, email: string): Promise<State> {
  const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "cf-connecting-ip": nextIp() }, locale: "it-IT" });
  const page = await ctx.newPage();
  await page.goto("/it/sign-in?next=%2Fit%2Fhome");
  await page.getByLabel(it.auth.email).fill(email);
  await page.getByRole("button", { name: it.auth.sendLink }).click();
  await page.getByTestId("dev-link").click();
  await page.waitForURL("**/it/home**");
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

export async function open(browser: Browser, state: State | undefined, size: Size, scheme: Scheme, extra: { offline?: boolean; csp?: boolean } = {}) {
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: state,
    viewport: { width: size.width, height: size.height },
    colorScheme: scheme,
    locale: "it-IT",
    extraHTTPHeaders: { "cf-connecting-ip": nextIp() },
    acceptDownloads: true,
  });
  if (scheme === "light") await ctx.addInitScript(() => localStorage.setItem("pausa-theme", "light"));
  // The mock catalogue's poster paths are made up: do not wait for the internet, fall back to the placeholder at once.
  await ctx.route("https://image.tmdb.org/**", (r) => r.abort());
  await ctx.route("https://s4.anilist.co/**", (r) => r.abort());
  const page = await ctx.newPage();
  return { ctx, page };
}

/** The API as this person (the cookie comes from the stored state). */
export async function apiAs(browser: Browser, state: State) {
  const ctx = await browser.newContext({ baseURL: BASE, storageState: state, extraHTTPHeaders: { "cf-connecting-ip": nextIp() } });
  const call = async <T = any>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, data?: unknown): Promise<{ status: number; json: T }> => {
    const res = await ctx.request.fetch(url, { method, data: data as never, headers: data === undefined ? undefined : { "content-type": "application/json" } });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // 204
    }
    return { status: res.status(), json: json as T };
  };
  return { ctx, call };
}

/** The screen has finished loading: network quiet, no loading bars. */
export async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("progressbar", { name: it.app.loading })).toHaveCount(0, { timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
}

export const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
export type Finding = { screen: string; env: string; id: string; impact: string; help: string; nodes: number; target: string; html: string; why: string };

/** WCAG 2.1 A + AA (axe "best-practice" rules are not part of the conformance claim and are reported separately by the spec that asks for them). */
export async function scan(page: Page, screen: string, env: string, opts: { bestPractice?: boolean } = {}): Promise<Finding[]> {
  // Entrance animations are 220 ms: scanned in the middle of one, the colours are blends (a 4.5:1 accent measured 4.47 at 90% opacity). Wait them out.
  await page.waitForTimeout(350);
  const result = await new AxeBuilder({ page }).withTags(opts.bestPractice ? [...TAGS, "best-practice"] : TAGS).analyze();
  const found = result.violations.map((v) => ({
    screen,
    env,
    id: v.id,
    impact: String(v.impact),
    help: v.help,
    nodes: v.nodes.length,
    target: v.nodes[0]?.target.join(" ") ?? "",
    html: (v.nodes[0]?.html ?? "").slice(0, 160),
    // axe's own explanation for the first node (what exactly failed): e.g. the text it compared, the contrast ratio
    why: (v.nodes[0]?.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 300),
  }));
  const file = process.env.A11Y_REPORT;
  if (file) {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify({ screen, env, violations: found, passes: result.passes.length, incomplete: result.incomplete.length }) + "\n");
  }
  return found;
}

export const fmt = (f: Finding[]) => f.map((x) => `${x.env} | ${x.screen} | ${x.impact} ${x.id} x${x.nodes} | ${x.target} | ${x.html} | ${x.why}`);
