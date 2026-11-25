// Helpers for the diary / social / profile / statistics specs: people with their own browser context and client IP, the
// sign-in flow through the real page, and a few calls straight to the API to set a scene up (what is under test is the screens).
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
export const it = JSON.parse(readFileSync(path.join(root, "packages/messages/it.json"), "utf8"));
export const en = JSON.parse(readFileSync(path.join(root, "packages/messages/en.json"), "utf8"));
export const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8798";
export const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 4173}`;
export const run = Date.now().toString(36);

let ip = Math.floor(Math.random() * 200) + 20;

export type Person = { ctx: BrowserContext; page: Page; email: string; name: string };

/** Every person gets their own context and a distinct client IP (Cloudflare sets cf-connecting-ip in production; here we set it). */
export async function person(browser: Browser, name: string, opts: { width?: number; scheme?: "dark" | "light" } = {}): Promise<Person> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: opts.width ?? 390, height: 844 },
    locale: "it-IT",
    colorScheme: opts.scheme ?? "dark",
    extraHTTPHeaders: { "cf-connecting-ip": `10.8.${ip++ % 250}.${Math.floor(Math.random() * 250)}` },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  return { ctx, page, email: `${name}-${run}@pausa.test`, name: `${name}-${run}` };
}

export async function signIn(p: Person, next = "/it/home") {
  await p.page.goto(`/it/sign-in?next=${encodeURIComponent(next)}`);
  await p.page.getByLabel(it.auth.email).fill(p.email);
  await p.page.getByRole("button", { name: it.auth.sendLink }).click();
  await p.page.getByTestId("dev-link").click();
  await p.page.waitForURL(`**${next}`);
}

type Json = Record<string, unknown>;
export async function api<T = Json>(p: Person, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, data?: unknown): Promise<{ status: number; json: T }> {
  const res = await p.ctx.request.fetch(url, { method, data: data as never, headers: data === undefined ? undefined : { "content-type": "application/json" } });
  let json = {} as T;
  try {
    json = (await res.json()) as T;
  } catch {
    // 204
  }
  return { status: res.status(), json };
}

/** Two people in one Cerchia, as the screens need them. Returns the Cerchia id. */
export async function circleWith(owner: Person, others: Person[], name: string): Promise<string> {
  const made = await api<{ id: string; inviteCode: string }>(owner, "POST", "/api/circles", { name });
  for (const o of others) await api(o, "POST", "/api/circles/join", { code: made.json.inviteCode });
  return made.json.id;
}

export const meId = async (p: Person) => (await api<{ id: string }>(p, "GET", "/api/me")).json.id;

export const logApi = (p: Person, body: Json) => api<{ id: string; mediaId: string }>(p, "POST", "/api/logs", { watchedOn: "2026-11-01", locale: "it", ...body });
