import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { log, mediaEntity, mediaTitle, notification } from "../../db/schema";
import { importRows, type ImportOptions } from "./import";
import type { ImportRow } from "./import-parsers";
import type { AnyDb } from "./db-types";
import { createTestDb, seedUsers } from "./test-db";

let db: AnyDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob"]);
});

const opts = (o: Partial<ImportOptions> = {}): ImportOptions => ({ includeReviews: true, includeUndated: false, today: "2026-11-16", ...o });
const film = (title: string, o: Partial<ImportRow> = {}): ImportRow => ({
  source: "letterboxd", kind: "movie", title, year: 2020, rating: 8, watchedOn: "2024-05-01", rewatch: false, review: null,
  letterboxdUri: `https://boxd.it/${title.replace(/\W/g, "").toLowerCase()}`, ...o,
});
const anime = (title: string, o: Partial<ImportRow> = {}): ImportRow => ({
  source: "anilist", kind: "anime", title, year: 2015, rating: 9, watchedOn: "2023-01-10", rewatch: false, review: null, ...o,
});
const logsOf = (userId: string) => db.select().from(log).where(eq(log.userId, userId));
const allMedia = () => db.select().from(mediaEntity);

describe("importRows", () => {
  it("adds titles and viewings, dated by when they were watched", async () => {
    const r = await importRows(db, "u-ann", [film("Past Lives", { rating: 9, review: "Quiet." }), film("Aftersun", { watchedOn: "2022-08-10" })], opts());
    expect(r).toMatchObject({ imported: 2, alreadyHad: 0, newTitles: 2 });
    const logs = await logsOf("u-ann");
    expect(logs).toHaveLength(2);
    const pl = logs.find((l) => l.watchedOn === "2024-05-01")!;
    expect(pl).toMatchObject({ rating: 9, review: "Quiet.", isRewatch: false });
    expect(pl.createdAt.toISOString()).toBe("2024-05-01T12:00:00.000Z"); // dated by the viewing, so it doesn't land at the top of the feed
  });

  it("is idempotent: a second run adds nothing", async () => {
    const rows = [film("Past Lives"), film("Aftersun", { watchedOn: "2022-08-10" })];
    await importRows(db, "u-ann", rows, opts());
    const again = await importRows(db, "u-ann", rows, opts());
    expect(again).toMatchObject({ imported: 0, alreadyHad: 2, newTitles: 0 });
    expect(await logsOf("u-ann")).toHaveLength(2);
    expect(await allMedia()).toHaveLength(2);
  });

  it("keeps each person's history separate but shares the titles", async () => {
    await importRows(db, "u-ann", [film("Past Lives")], opts());
    const r = await importRows(db, "u-bob", [film("Past Lives")], opts());
    expect(r).toMatchObject({ imported: 1, newTitles: 0 });
    expect(await allMedia()).toHaveLength(1);
    expect(await logsOf("u-bob")).toHaveLength(1);
  });

  it("keeps two viewings of the same film on different dates (a rewatch), but not twice the same day", async () => {
    const r = await importRows(db, "u-ann", [
      film("Past Lives", { watchedOn: "2024-01-04" }), film("Past Lives", { watchedOn: "2024-03-02", rewatch: true }), film("Past Lives", { watchedOn: "2024-03-02", rewatch: true }),
    ], opts());
    expect(r).toMatchObject({ imported: 2, alreadyHad: 1, newTitles: 1 });
    expect((await logsOf("u-ann")).filter((l) => l.isRewatch)).toHaveLength(1);
  });

  it("creates no notifications", async () => {
    await importRows(db, "u-ann", [film("Past Lives")], opts());
    expect(await db.select().from(notification)).toHaveLength(0);
  });

  it("skips undated rows by default, or dates them today when asked", async () => {
    const undated = film("Perfect Days", { watchedOn: null });
    expect(await importRows(db, "u-ann", [undated], opts())).toMatchObject({ imported: 0, undatedSkipped: 1 });
    expect(await importRows(db, "u-ann", [undated], opts({ includeUndated: true }))).toMatchObject({ imported: 1, undatedSkipped: 0 });
    expect((await logsOf("u-ann"))[0].watchedOn).toBe("2026-11-16");
  });

  it("leaves reviews out when asked", async () => {
    await importRows(db, "u-ann", [film("Past Lives", { review: "Private thoughts." })], opts({ includeReviews: false }));
    expect((await logsOf("u-ann"))[0].review).toBeNull();
  });

  it("drops rows without a title", async () => {
    expect(await importRows(db, "u-ann", [film("  ")], opts())).toMatchObject({ imported: 0, invalid: 1 });
  });
});

describe("recognising titles the app already has", () => {
  it("matches by title and year, so imported films join the same title other people logged", async () => {
    await db.insert(mediaEntity).values({ id: "m-pl", kind: "movie", originalTitle: "Past Lives", year: 2023, tmdbId: 666277 });
    const r = await importRows(db, "u-ann", [film("past lives", { year: 2023 })], opts());
    expect(r.newTitles).toBe(0);
    expect((await logsOf("u-ann"))[0].mediaId).toBe("m-pl");
    const [m] = await db.select().from(mediaEntity).where(eq(mediaEntity.id, "m-pl"));
    expect(m.letterboxdUri).toBe("https://boxd.it/pastlives"); // remembered, so next time it's matched by id
  });

  it("matches a localized title (stored under another original title)", async () => {
    await db.insert(mediaEntity).values({ id: "m-sa", kind: "movie", originalTitle: "千と千尋の神隠し", year: 2001 });
    await db.insert(mediaTitle).values({ mediaId: "m-sa", locale: "en", title: "Spirited Away" });
    const r = await importRows(db, "u-ann", [film("Spirited Away", { year: 2001 })], opts());
    expect(r.newTitles).toBe(0);
    expect((await logsOf("u-ann"))[0].mediaId).toBe("m-sa");
  });

  it("does not confuse a different film with the same title and a distant year, or a different kind", async () => {
    await db.insert(mediaEntity).values({ id: "m-old", kind: "movie", originalTitle: "Dune", year: 1984 });
    const r = await importRows(db, "u-ann", [film("Dune", { year: 2021 }), anime("Dune", { year: 2021 })], opts());
    expect(r.newTitles).toBe(2);
  });

  it("allows a year off by one (release dates differ by country)", async () => {
    await db.insert(mediaEntity).values({ id: "m-x", kind: "movie", originalTitle: "Oldboy", year: 2003 });
    expect((await importRows(db, "u-ann", [film("Oldboy", { year: 2004 })], opts())).newTitles).toBe(0);
  });

  it("recognises an anime by its AniList or MAL id", async () => {
    const aot = anime("Shingeki no Kyojin", { anilistId: 16498, malId: 16498, posterPath: "https://s4.anilist.co/c.jpg", titles: { en: "Attack on Titan" } });
    await importRows(db, "u-ann", [aot], opts());
    // Later, Bob imports the same anime from MAL, which only knows the MAL id and a different title.
    const fromMal = anime("Attack on Titan", { source: "mal", malId: 16498, year: null });
    const r = await importRows(db, "u-bob", [fromMal], opts());
    expect(r.newTitles).toBe(0);
    expect(await allMedia()).toHaveLength(1);
    expect((await allMedia())[0].posterPath).toBe("https://s4.anilist.co/c.jpg");
  });

  it("fills gaps on a known title (a cover, a year) without overwriting", async () => {
    await db.insert(mediaEntity).values({ id: "m-1", kind: "anime", anilistId: 1, originalTitle: "Cowboy Bebop", year: null, posterPath: null, runtimeMin: 24 });
    await importRows(db, "u-ann", [anime("Cowboy Bebop", { anilistId: 1, year: 1998, posterPath: "https://s4.anilist.co/1.jpg", runtimeMin: 99 })], opts());
    const [m] = await db.select().from(mediaEntity).where(eq(mediaEntity.id, "m-1"));
    expect(m).toMatchObject({ year: 1998, posterPath: "https://s4.anilist.co/1.jpg", runtimeMin: 24 });
  });

  it("stores localized titles from the source", async () => {
    await importRows(db, "u-ann", [anime("Shingeki no Kyojin", { anilistId: 7, titles: { it: "L'attacco dei Giganti", en: "Attack on Titan" } })], opts());
    const t = await db.select().from(mediaTitle);
    expect(t.map((x) => `${x.locale}:${x.title}`).sort()).toEqual(["en:Attack on Titan", "it:L'attacco dei Giganti"]);
  });
});

describe("enrichment", () => {
  it("is asked only about titles the app doesn't know, and its result is used", async () => {
    await db.insert(mediaEntity).values({ id: "m-known", kind: "movie", originalTitle: "Aftersun", year: 2022 });
    const asked: string[] = [];
    const enrich: ImportOptions["enrich"] = async (rows) => {
      asked.push(...rows.map((r) => r.title));
      return rows.map((r) => ({ ...r, tmdbId: 999, posterPath: "/p.jpg", originalTitle: "Original Name", titles: { en: r.title } }));
    };
    const r = await importRows(db, "u-ann", [film("Aftersun", { year: 2022 }), film("Perfect Days", { year: 2023 })], opts({ enrich }));
    expect(asked).toEqual(["Perfect Days"]);
    expect(r.newTitles).toBe(1);
    const [pd] = await db.select().from(mediaEntity).where(eq(mediaEntity.tmdbId, 999));
    expect(pd).toMatchObject({ originalTitle: "Original Name", posterPath: "/p.jpg", letterboxdUri: "https://boxd.it/perfectdays" });
  });

  it("reuses a title the app already knows by the id enrichment discovered", async () => {
    await db.insert(mediaEntity).values({ id: "m-tmdb", kind: "movie", originalTitle: "千と千尋の神隠し", year: 2001, tmdbId: 129 });
    const enrich: ImportOptions["enrich"] = async (rows) => rows.map((r) => ({ ...r, tmdbId: 129 }));
    const r = await importRows(db, "u-ann", [film("Totally Different Title", { year: 2001 })], opts({ enrich }));
    expect(r.newTitles).toBe(0);
    expect((await logsOf("u-ann"))[0].mediaId).toBe("m-tmdb");
  });

  it("matches by the localized titles enrichment discovered (MAL knows only the romaji title)", async () => {
    await db.insert(mediaEntity).values({ id: "m-aot", kind: "anime", originalTitle: "進撃の巨人", year: 2013 });
    await db.insert(mediaTitle).values({ mediaId: "m-aot", locale: "en", title: "Attack on Titan" });
    const enrich: ImportOptions["enrich"] = async (rows) => rows.map((r) => ({ ...r, anilistId: 16498, year: 2013, originalTitle: "Shingeki no Kyojin", titles: { en: "Attack on Titan" } }));
    const r = await importRows(db, "u-ann", [anime("Shingeki no Kyojin", { source: "mal", malId: 16498, year: null })], opts({ enrich }));
    expect(r.newTitles).toBe(0);
    expect(await allMedia()).toHaveLength(1);
    const [m] = await allMedia();
    expect(m).toMatchObject({ id: "m-aot", malId: 16498, anilistId: 16498 }); // remembered for next time
  });

  it("two rows of the same new title create it once", async () => {
    const r = await importRows(db, "u-ann", [film("Heat", { watchedOn: "2020-01-01" }), film("Heat", { watchedOn: "2021-01-01", rewatch: true })], opts());
    expect(r).toMatchObject({ imported: 2, newTitles: 1 });
  });
});

describe("D1 limits", () => {
  // Production D1 rejects a statement with more than 100 bound variables, and caps the queries one request may make.
  it("a worst-case chunk (30 new films with localized titles and enrichment) stays under both", async () => {
    const seen: { sql: string; n: number }[] = [];
    const limited = await createTestDb((sql, params) => seen.push({ sql, n: params.length }));
    await seedUsers(limited, ["Cy"]);
    seen.length = 0;
    const rows = Array.from({ length: 30 }, (_, i) => film(`Worst case ${i}`, {
      year: 2000 + (i % 20), review: "r", titles: { it: `a${i}`, en: `b${i}`, es: `c${i}` }, originalTitle: `Original ${i}`,
    }));
    const enrich: ImportOptions["enrich"] = async (rs) => rs.map((r, i) => ({ ...r, tmdbId: 5000 + i, posterPath: "/p.jpg", runtimeMin: 100 }));
    await importRows(limited, "u-cy", rows, opts({ enrich }));
    expect(seen.length).toBeGreaterThan(10); // the logger really recorded the chunk (otherwise the checks below prove nothing)
    expect(Math.max(...seen.map((q) => q.n))).toBeLessThanOrEqual(100);
    expect(seen.length).toBeLessThanOrEqual(45); // the free plan allows 50 queries/subrequests per request; TMDB lookups share that budget
    // Re-importing the same chunk (everything known) is cheaper still.
    seen.length = 0;
    await importRows(limited, "u-cy", rows, opts({ enrich }));
    expect(Math.max(...seen.map((q) => q.n))).toBeLessThanOrEqual(100);
  });
});

describe("a full-size chunk", () => {
  it("handles 30 new titles (the largest chunk the server accepts) and finds them again", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => film(`Film number ${i}`, { year: 1990 + i, watchedOn: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`, titles: { it: `Film n. ${i}`, en: `Film number ${i}`, es: `Película ${i}` } }));
    const first = await importRows(db, "u-ann", rows, opts());
    expect(first).toMatchObject({ imported: 30, newTitles: 30 });
    expect(await importRows(db, "u-ann", rows, opts())).toMatchObject({ imported: 0, alreadyHad: 30, newTitles: 0 });
    expect(await db.select().from(mediaTitle)).toHaveLength(90);
    expect(await db.select().from(log).where(and(eq(log.userId, "u-ann")))).toHaveLength(30);
  });
});
