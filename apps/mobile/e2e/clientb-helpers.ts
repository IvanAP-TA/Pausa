// Shared by the Serata / Lists / Import specs: one browser context per person, each with its own client IP (the API rate-limits by IP;
// in production Cloudflare sets cf-connecting-ip, here the tests do), signing in through the real sign-in page (the API hands back the
// magic link as `devLink` on a local machine without a mail key).
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
export const it = JSON.parse(readFileSync(path.join(root, "packages/messages/it.json"), "utf8"));
export const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8798";
export const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 4173}`;
export const run = Date.now().toString(36);

let ipCounter = Math.floor(Math.random() * 200) + 20;

export type Person = { ctx: BrowserContext; page: Page; email: string; name: string };

export async function person(browser: Browser, name: string, opts: { width?: number; height?: number; colorScheme?: "dark" | "light"; locale?: string } = {}): Promise<Person> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: opts.width ?? 390, height: opts.height ?? 844 },
    colorScheme: opts.colorScheme ?? "dark",
    locale: opts.locale ?? "it-IT",
    extraHTTPHeaders: { "cf-connecting-ip": `10.6.${ipCounter++ % 250}.${Math.floor(Math.random() * 250)}` },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  // The catalogue's poster paths are made up: do not wait for the internet, fall back to the placeholder at once.
  if (opts.colorScheme === "light") await ctx.addInitScript(() => localStorage.setItem("pausa-theme", "light"));
  await ctx.route("https://image.tmdb.org/**", (r) => r.abort());
  const page = await ctx.newPage();
  return { ctx, page, email: `${name}-${run}@pausa.test`, name: `${name}-${run}` };
}

export async function signIn(page: Page, email: string, next = "/it/home") {
  await page.goto(`/it/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel(it.auth.email).fill(email);
  await page.getByRole("button", { name: it.auth.sendLink }).click();
  await page.getByTestId("dev-link").click();
  await page.waitForURL(`**${next.split("?")[0]}**`);
}

/** Calls the API as this person (the context keeps the session cookie). */
export async function api<T = unknown>(p: Person, method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH", url: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await p.ctx.request.fetch(url, { method, data: body, headers: { "content-type": "application/json" } });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no body (204)
  }
  return { status: res.status(), json: json as T };
}

export const circleOf = async (p: Person, name: string) => {
  const r = await api<{ id: string; inviteCode: string }>(p, "POST", "/api/circles", { name });
  expect(r.status).toBe(201);
  return r.json;
};
