import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ApiFailure, ERROR_KEYS, errorMessage, failureFromBody, isErrorCode, NETWORK_KEY } from "../src/api/errors";
import { createClient } from "../src/api/client";
import { endpoints } from "../src/api/endpoints";
import { formatMessage } from "../src/i18n/format";
import { lookup } from "../src/i18n/messages";
import type { MessageKey } from "../src/i18n/messages";

const root = path.resolve(__dirname, "../../..");
const LOCALES = ["it", "en", "es"] as const;
const cat = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(path.join(root, "packages/messages", `${l}.json`), "utf8"))]));

// The contract, read from the generated file (not re-declared): `export type ErrorCode = "a" | "b" | ...;`
const generated = readFileSync(path.join(root, "packages/api-types/src/ErrorCode.ts"), "utf8");
const serverCodes = [...generated.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);

describe("error mapping", () => {
  it("reads a sensible set of codes from the generated type", () => {
    expect(serverCodes.length).toBeGreaterThanOrEqual(12);
    expect(serverCodes).toContain("rate_limited");
  });

  it("maps every server ErrorCode, and nothing else", () => {
    expect(Object.keys(ERROR_KEYS).sort()).toEqual([...serverCodes].sort());
  });

  it.each(LOCALES)("every code has a sentence in %s", (l) => {
    const t = (key: MessageKey, values: Record<string, string | number> = {}) => formatMessage(lookup(cat[l], key) as string, l, values);
    for (const code of serverCodes) {
      const key = ERROR_KEYS[code as keyof typeof ERROR_KEYS];
      expect(lookup(cat[l], key), `${l}:${key}`).toBeTypeOf("string");
      const msg = errorMessage(t, new ApiFailure(code as never, 400, code === "rate_limited" ? 7 : null));
      expect(msg.length).toBeGreaterThan(3);
      expect(msg).not.toMatch(/[{}]/);
    }
    expect(errorMessage(t, new ApiFailure("network", 0))).toBe(t(NETWORK_KEY));
  });

  it("different codes give different sentences (no two fall through to the same text)", () => {
    const t = (key: MessageKey, values: Record<string, string | number> = {}) => formatMessage(lookup(cat.it, key) as string, "it", values);
    const texts = serverCodes.map((c) => errorMessage(t, new ApiFailure(c as never, 400, 5)));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("rate_limited speaks the wait in seconds, and degrades without one", () => {
    const t = (key: MessageKey, values: Record<string, string | number> = {}) => formatMessage(lookup(cat.it, key) as string, "it", values);
    expect(errorMessage(t, new ApiFailure("rate_limited", 429, 1))).toContain("1 secondo");
    expect(errorMessage(t, new ApiFailure("rate_limited", 429, 30))).toContain("30 secondi");
    expect(errorMessage(t, new ApiFailure("rate_limited", 429, null))).not.toMatch(/\d/);
  });

  it("a non-API error is shown as the generic one, never as raw text", () => {
    const t = (key: MessageKey) => formatMessage(lookup(cat.it, key) as string, "it");
    expect(errorMessage(t, new Error("boom: secret details"))).toBe(t(ERROR_KEYS.internal));
  });
});

describe("failureFromBody", () => {
  it("reads {code, retryAfter}", () => {
    const f = failureFromBody(429, { code: "rate_limited", retryAfter: 12 });
    expect([f.code, f.status, f.retryAfter]).toEqual(["rate_limited", 429, 12]);
  });
  it("falls back to the Retry-After header", () => {
    expect(failureFromBody(429, { code: "rate_limited", retryAfter: null }, "9").retryAfter).toBe(9);
  });
  it("an unknown or missing code becomes internal", () => {
    expect(failureFromBody(502, { code: "totally_new" }).code).toBe("internal");
    expect(failureFromBody(502, null).code).toBe("internal");
    expect(failureFromBody(502, "<html>bad gateway</html>").code).toBe("internal");
  });
  it("isErrorCode rejects prototype keys", () => {
    expect(isErrorCode("constructor")).toBe(false);
    expect(isErrorCode("forbidden")).toBe(true);
  });
});

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra call");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("client", () => {
  it("sends the cookie on web (credentials) and a Bearer token on native", async () => {
    const web = fakeFetch([json({ ok: true })]);
    await createClient({ baseUrl: "", fetch: web.fn, credentials: "include" }).json("GET", "/api/me");
    expect(web.calls[0].init.credentials).toBe("include");
    expect((web.calls[0].init.headers as Record<string, string>).authorization).toBeUndefined();

    const native = fakeFetch([json({ ok: true })]);
    await createClient({ baseUrl: "http://x", fetch: native.fn, credentials: "omit", getToken: async () => "tok123" }).json("GET", "/api/me");
    expect(native.calls[0].url).toBe("http://x/api/me");
    expect((native.calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tok123");
  });

  it("turns an error body into an ApiFailure with the code", async () => {
    const f = fakeFetch([json({ code: "circle_full", retryAfter: null }, 409)]);
    const c = createClient({ baseUrl: "", fetch: f.fn });
    await expect(c.json("POST", "/api/circles/join", { body: { code: "X" } })).rejects.toMatchObject({ code: "circle_full", status: 409 });
  });

  it("a network failure is ApiFailure(network)", async () => {
    const f = fakeFetch([new TypeError("Failed to fetch")]);
    await expect(createClient({ baseUrl: "", fetch: f.fn }).json("GET", "/api/me")).rejects.toMatchObject({ code: "network" });
  });

  it("an aborted request stays an AbortError (it is not an error to show)", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const f = fakeFetch([abort]);
    await expect(createClient({ baseUrl: "", fetch: f.fn }).json("GET", "/api/me")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("calls onUnauthorized for a 401, except on sign-in calls", async () => {
    const onUnauthorized = vi.fn();
    const f = fakeFetch([json({ code: "unauthorized", retryAfter: null }, 401), json({ code: "unauthorized", retryAfter: null }, 401)]);
    const c = createClient({ baseUrl: "", fetch: f.fn, onUnauthorized });
    await expect(c.json("GET", "/api/me")).rejects.toBeInstanceOf(ApiFailure);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(c.json("POST", "/api/auth/magic-link", { auth: false })).rejects.toBeInstanceOf(ApiFailure);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("204 answers resolve with nothing", async () => {
    const f = fakeFetch([new Response(null, { status: 204 })]);
    await expect(createClient({ baseUrl: "", fetch: f.fn }).none("POST", "/api/auth/logout")).resolves.toBeUndefined();
  });
});

describe("endpoints", () => {
  it("encodes ids and uses the documented verbs and bodies", async () => {
    const f = fakeFetch([new Response(null, { status: 204 }), new Response(null, { status: 204 }), json({ id: "i", code: "ABCD2345", expiresAt: null, maxUses: null, uses: 0 }, 201)]);
    const api = endpoints(createClient({ baseUrl: "", fetch: f.fn }));
    await api.setRole("c/1", "u 2", "admin");
    await api.deleteCircle("c1", "Divano");
    await api.createInvite("c1", { expiry: "7d", maxUses: null });
    expect(f.calls[0].url).toBe("/api/circles/c%2F1/members/u%202/role");
    expect(f.calls[0].init.method).toBe("PUT");
    expect(f.calls[0].init.body).toBe('{"role":"admin"}');
    expect(f.calls[1].init.method).toBe("DELETE");
    expect(f.calls[1].init.body).toBe('{"name":"Divano"}');
    expect(f.calls[2].init.body).toBe('{"expiry":"7d","maxUses":null}');
  });
});
