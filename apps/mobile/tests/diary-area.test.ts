import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { NotificationDto } from "@pausa/api-types";
import { parse, type Node } from "../src/i18n/format";
import { lookup, registeredAreas } from "../src/i18n/messages";
import "../src/features/diary/diary.messages";
import "../src/features/people/people.messages";
import "../src/features/stats/stats.messages";
import "../src/features/lists/lists.messages";
import { createClient } from "../src/api/client";
import { dedupeCandidates, isYmd, msToYmd, num, ymdToMs } from "../src/features/diary/dates";
import { noticeHref } from "../src/features/diary/notice-href";
import { starsText } from "../src/ui/stars-text";

// The endpoint modules bind themselves to the app client at import; the tests bind them to a fake fetch instead.
vi.mock("@/api", () => ({ client: {} }));
const { diaryEndpoints, query } = await import("../src/api/diary");
const { peopleEndpoints, GENRES, AVATARS, COUNTRIES, NOTIFICATION_TYPES } = await import("../src/api/people");
const { statsEndpoints } = await import("../src/api/stats");

const root = path.resolve(__dirname, "../../..");
const src = path.resolve(__dirname, "../src");
const LOCALES = ["it", "en", "es"] as const;
const base = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(path.join(root, "packages/messages", `${l}.json`), "utf8"))]));
const MINE = ["diary", "people", "stats"];
const areas = new Map(registeredAreas());

function flat(o: unknown, prefix = ""): Array<[string, string]> {
  if (typeof o === "string") return [[prefix, o]];
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k));
  throw new Error(`Non-string leaf at ${prefix}`);
}
const walk = (nodes: Node[], visit: (n: Node) => void) => {
  for (const n of nodes) {
    visit(n);
    if (n.t === "tag") walk(n.children, visit);
    if (n.t === "plural" || n.t === "select") for (const o of Object.values(n.options)) walk(o, visit);
  }
};
const args = (msg: string) => {
  const names = new Set<string>();
  walk(parse(msg), (n) => (n.t === "arg" || n.t === "plural" || n.t === "select") && names.add(n.name));
  return [...names].sort();
};

describe("message areas of the diary / people / stats screens", () => {
  it("all three areas are registered", () => {
    for (const a of MINE) expect(areas.has(a), a).toBe(true);
  });

  for (const area of MINE) {
    const byLocale = () => areas.get(area) as Record<(typeof LOCALES)[number], unknown>;

    it(`${area}: it, en and es have exactly the same keys`, () => {
      const keys = (l: (typeof LOCALES)[number]) => flat(byLocale()[l]).map(([k]) => k).sort();
      expect(keys("en")).toEqual(keys("it"));
      expect(keys("es")).toEqual(keys("it"));
      expect(keys("it").length).toBeGreaterThan(0);
    });

    it(`${area}: every message is valid ICU, uses the same placeholders in all languages, and plurals have one and other`, () => {
      const it = new Map(flat(byLocale().it));
      for (const l of LOCALES) {
        for (const [key, msg] of flat(byLocale()[l])) {
          expect(() => parse(msg), `${l} ${key}`).not.toThrow();
          expect(args(msg), `${l} ${key} placeholders`).toEqual(args(it.get(key)!));
          walk(parse(msg), (n) => {
            if (n.t === "plural") {
              expect(Object.keys(n.options), `${l} ${key} plural`).toEqual(expect.arrayContaining(["other"]));
              expect(Object.keys(n.options), `${l} ${key} plural needs one`).toContain("one");
            }
          });
        }
      }
    });

    it(`${area}: no key shadows the base catalogue`, () => {
      for (const [key] of flat(byLocale().it)) expect(lookup(base.it, key), key).toBeUndefined();
    });
  }
});

/** Every literal key a screen asks for must exist in the base catalogue or in an area, in all three languages (typos surface here, not in a user's face). */
describe("keys used by the screens exist", () => {
  const files: string[] = [];
  const collect = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) collect(p);
      else if (/\.(tsx?|ts)$/.test(f) && !f.endsWith(".messages.ts")) files.push(p);
    }
  };
  for (const d of ["features/diary", "features/people", "features/stats"]) collect(path.join(src, d));
  for (const f of ["ui/Stars.tsx", "ui/Chip.tsx", "ui/Sheet.tsx", "ui/Toggle.tsx", "ui/Avatar.tsx", "features/Shell.tsx", "features/Bell.tsx", "features/current-circle.tsx"]) files.push(path.join(src, f));

  const find = (l: string, key: string) => lookup(base[l], key) ?? [...areas.values()].map((a) => lookup((a as Record<string, unknown>)[l], key)).find((v) => v !== undefined);

  it("scans a meaningful amount of code", () => expect(files.length).toBeGreaterThan(15));

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const keys = [...text.matchAll(/\b(?:t|rich)\(\s*"([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)"/g)].map((m) => m[1]);
    if (!keys.length) continue;
    it(`${path.relative(src, file)}: ${keys.length} keys resolve in it, en, es`, () => {
      for (const key of new Set(keys)) for (const l of LOCALES) expect(typeof find(l, key), `${l} ${key}`).toBe("string");
    });
  }
});

describe("lists the server accepts", () => {
  const core = readFileSync(path.join(root, "crates/core/src/profile.rs"), "utf8");
  const listOf = (name: string) => [...(new RegExp(`${name}[^=]*=\\s*\\[([^\\]]*)\\]`, "s").exec(core)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  it("genres, avatars, countries and notification types are the Rust lists, in order", () => {
    expect([...GENRES]).toEqual(listOf("pub const GENRES"));
    expect([...AVATARS]).toEqual(listOf("pub const AVATARS"));
    expect([...COUNTRIES]).toEqual(listOf("pub const COUNTRIES"));
    expect([...NOTIFICATION_TYPES]).toEqual(listOf("pub const NOTIFICATION_TYPES"));
  });
  it("every genre, notification type and the avatars have a translation", () => {
    for (const l of LOCALES) {
      for (const g of GENRES) expect(lookup(base[l], `profile.genres.${g}`), `${l} ${g}`).toBeTypeOf("string");
      for (const n of NOTIFICATION_TYPES) expect(lookup((areas.get("people") as Record<string, unknown>)[l], `people.settings.types.${n}`), `${l} ${n}`).toBeTypeOf("string");
    }
    expect(AVATARS).toHaveLength(24);
  });
});

describe("request building", () => {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const client = createClient({
    baseUrl: "",
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ method: String(init.method), url: String(url), body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  const diary = diaryEndpoints(client);
  const people = peopleEndpoints(client);
  const stats = statsEndpoints(client);
  const last = () => calls[calls.length - 1];

  it("query() drops empty values and escapes", () => {
    expect(query({ a: 1, b: undefined, c: "", d: null, e: false, f: true, g: "x y&z" })).toBe("?a=1&f=1&g=x%20y%26z");
    expect(query({})).toBe("");
  });

  it("the feed sends its filters and the keyset cursor untouched", async () => {
    await diary.feed("c 1", { person: "u1", kind: "tv", year: 2008, platform: "Net flix", minRating: 8, before: "1700.abc", locale: "it" });
    expect(last().url).toBe("/api/circles/c%201/feed?person=u1&kind=tv&year=2008&platform=Net%20flix&minRating=8&before=1700.abc&locale=it");
    await diary.feed("c1", { locale: "en" });
    expect(last().url).toBe("/api/circles/c1/feed?locale=en");
  });

  it("writing a log, sharing, reacting, commenting and reporting hit the documented routes with the documented bodies", async () => {
    await diary.createLog({ mediaKey: "tmdb:tv:1396", watchedOn: "2026-11-01", rating: 9, circles: ["c1"], season: 2, episode: 3 });
    expect(last()).toMatchObject({ method: "POST", url: "/api/logs", body: { mediaKey: "tmdb:tv:1396", season: 2, episode: 3, circles: ["c1"] } });
    await diary.updateLog("l1", { watchedOn: "2026-11-01" });
    expect(last()).toMatchObject({ method: "PUT", url: "/api/logs/l1" });
    await diary.setShares("l1", ["a", "b"]);
    expect(last()).toMatchObject({ method: "PUT", url: "/api/logs/l1/shares", body: { circles: ["a", "b"] } });
    await diary.react("c1", "l1", "🍿");
    expect(last()).toMatchObject({ method: "POST", url: "/api/circles/c1/logs/l1/reactions", body: { emoji: "🍿" } });
    await diary.addComment("c1", "l1", { body: "ciao", parentId: "p" });
    expect(last()).toMatchObject({ method: "POST", url: "/api/circles/c1/logs/l1/comments", body: { body: "ciao", parentId: "p" } });
    await diary.editComment("k1", { body: "x", isSpoiler: true });
    expect(last()).toMatchObject({ method: "PATCH", url: "/api/comments/k1" });
    await diary.report({ kind: "comment", targetId: "k1", reason: "spam" });
    expect(last()).toMatchObject({ method: "POST", url: "/api/reports", body: { kind: "comment", targetId: "k1", reason: "spam" } });
    await diary.withdraw("c1", "PAUSA");
    expect(last()).toMatchObject({ method: "POST", url: "/api/circles/c1/withdraw", body: { confirm: "PAUSA" } });
  });

  it("thread reveal, diary paging, notifications and progress", async () => {
    await diary.thread("c1", "l1", { reveal: true, locale: "it" });
    expect(last().url).toBe("/api/circles/c1/logs/l1?reveal=1&locale=it");
    await diary.thread("c1", "l1", { locale: "it" });
    expect(last().url).toBe("/api/circles/c1/logs/l1?locale=it");
    await diary.diary({ before: "9.z", locale: "es" });
    expect(last().url).toBe("/api/me/diary?before=9.z&locale=es");
    await diary.notifications({ circle: "c1", before: null, locale: "it" });
    expect(last().url).toBe("/api/notifications?circle=c1&locale=it");
    await diary.markRead();
    expect(last()).toMatchObject({ url: "/api/notifications/read", body: {} });
    await diary.markRead("c1");
    expect(last().body).toEqual({ circleId: "c1" });
    await diary.advance("m1");
    expect(last()).toMatchObject({ url: "/api/media/m1/progress/advance", body: {} });
    await diary.advance("m1", true);
    expect(last().body).toEqual({ season: true });
    await diary.clearProgress("m1");
    expect(last()).toMatchObject({ method: "DELETE", url: "/api/media/m1/progress" });
  });

  it("ranking, insights, recommendations, profile and settings", async () => {
    await stats.ranking("c1", { sort: "votes", everyone: true, minVotes: 0, q: "mat rix", page: 1, locale: "it" });
    expect(last().url).toBe("/api/circles/c1/ranking?sort=votes&everyone=1&minVotes=0&q=mat%20rix&page=1&locale=it");
    await stats.insights("c1", { year: 2026, locale: "it" });
    expect(last().url).toBe("/api/circles/c1/insights?year=2026&locale=it");
    await stats.recommendations("c1", { limit: 5, locale: "en" });
    expect(last().url).toBe("/api/circles/c1/recommendations?limit=5&locale=en");
    await people.saveProfile({ name: "Ann", bio: "", genres: ["horror"], avatar: "🍿" });
    expect(last()).toMatchObject({ method: "PUT", url: "/api/me/profile", body: { name: "Ann", genres: ["horror"], avatar: "🍿" } });
    await people.saveSettings({ locale: "", country: "IT", emailDigest: true, notifyOff: ["reaction"] });
    expect(last()).toMatchObject({ method: "PUT", url: "/api/me/settings" });
    await people.circleMe("c1", { muted: true });
    expect(last()).toMatchObject({ method: "PUT", url: "/api/circles/c1/me", body: { muted: true } });
    await people.removeFavorite("m 1");
    expect(last()).toMatchObject({ method: "DELETE", url: "/api/me/favorites/m%201" });
  });
});

describe("small pure helpers", () => {
  it("a day is read and written in local time, never through UTC", () => {
    expect(msToYmd(ymdToMs("2026-03-29"))).toBe("2026-03-29"); // the night the clocks change in Europe
    expect(msToYmd(ymdToMs("2026-01-01"))).toBe("2026-01-01");
  });
  it("isYmd refuses impossible days", () => {
    expect(isYmd("2026-02-28")).toBe(true);
    expect(isYmd("2026-02-30")).toBe(false);
    expect(isYmd("2026-13-01")).toBe(false);
    expect(isYmd("26-1-1")).toBe(false);
    expect(isYmd("")).toBe(false);
  });
  it("a title that is both in Pausa and in the catalogue is listed once, as the local one", () => {
    const c = (key: string, title: string, year: number | null, kind = "tv") => ({ key, kind, title, year });
    const out = dedupeCandidates([c("local:1", "Breaking Bad", 2008), c("tmdb:tv:1396", "Breaking Bad", 2008), c("tmdb:movie:5", "Breaking Bad", 2008, "movie"), c("tmdb:tv:7", "Breaking Bad", 2013)]);
    expect(out.map((x) => x.key)).toEqual(["local:1", "tmdb:movie:5", "tmdb:tv:7"]); // a film or a remake of the same name is not the same title
    expect(dedupeCandidates([c("tmdb:tv:1", "Amélie", 2001), c("local:2", "Amelie", 2001)]).map((x) => x.key)).toEqual(["local:2"]); // accents do not split it
    expect(dedupeCandidates([c("tmdb:tv:1", "X", null), c("tmdb:tv:1", "X", null)])).toHaveLength(1);
  });
  it("bigint-typed numbers arrive as numbers", () => {
    expect(num(5 as unknown as bigint)).toBe(5);
    expect(num(null)).toBeNull();
  });
  it("half stars read as the person's number", () => {
    expect(starsText(7, "it")).toBe("3,5");
    expect(starsText(7, "en")).toBe("3.5");
    expect(starsText(10, "it")).toBe("5");
    expect(starsText(1, "es")).toBe("0,5");
  });
  it("a notification opens what it is about", () => {
    const href = (p = "") => `/it${p}`;
    const n = (o: Partial<NotificationDto>): NotificationDto => ({ id: "n", type: "log", actor: null, circleId: "c1", circleName: "C", logId: "l1", media: null, serataCode: null, read: false, createdAt: 0, ...o });
    expect(noticeHref(n({}), href)).toBe("/it/c/c1/log/l1");
    expect(noticeHref(n({ type: "comment" }), href)).toBe("/it/c/c1/log/l1");
    expect(noticeHref(n({ type: "serata_invite", serataCode: "ABC123" }), href)).toBe("/it/s/ABC123");
    expect(noticeHref(n({ type: "serata_invite", serataCode: null }), href)).toBe("/it/c/c1");
    expect(noticeHref(n({ type: "circle_join", logId: null }), href)).toBe("/it/c/c1");
    expect(noticeHref(n({ type: "now_watching", logId: null, media: { id: "m1", kind: "tv", title: "X", year: null, posterPath: null } }), href)).toBe("/it/t/m1");
    expect(noticeHref(n({ type: "log", circleId: null, logId: null }), href)).toBe("/it/home");
  });
});
