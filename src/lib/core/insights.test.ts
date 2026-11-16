import { beforeEach, describe, expect, it } from "vitest";
import { circleMember, circle, log, logWatchedWith, mediaEntity, mediaTitle, nowWatching } from "../../db/schema";
import {
  MIN_COMMON, agreements, latestRatings, loadCircleFacts, recommend, tastePairs, tasteSimilarity, yearInReview,
  yearsWithLogs, type LogFact, type Person,
} from "./insights";
import type { AnyDb } from "./db-types";
import { createTestDb, seedUsers } from "./test-db";

const ann: Person = { id: "ann", name: "Ann" };
const bob: Person = { id: "bob", name: "Bob" };
const cleo: Person = { id: "cleo", name: "Cleo" };
const people = [ann, bob, cleo];

let n = 0;
const f = (userId: string, mediaId: string, rating: number | null, extra: Partial<LogFact> = {}): LogFact => ({
  logId: `l${++n}`, userId, mediaId, title: mediaId.toUpperCase(), kind: "movie", year: 2020, posterPath: null,
  runtimeMin: 100, rating, watchedOn: "2026-03-10", platform: null, watchedWith: [], ...extra,
});

describe("tasteSimilarity", () => {
  const r = (o: Record<string, number>) => new Map(Object.entries(o));

  it("is 100% for identical ratings, once there are enough shared titles", () => {
    expect(tasteSimilarity(r({ a: 8, b: 6, c: 10 }), r({ a: 8, b: 6, c: 10 }))).toEqual({ common: 3, score: 1 });
  });
  it("is 0 for the most opposite ratings possible (1 vs 10)", () => {
    expect(tasteSimilarity(r({ a: 1, b: 1, c: 1 }), r({ a: 10, b: 10, c: 10 })).score).toBe(0);
  });
  it("gives no score below MIN_COMMON shared titles — one shared 5★ is not a match", () => {
    expect(MIN_COMMON).toBe(3);
    expect(tasteSimilarity(r({ a: 10 }), r({ a: 10 }))).toEqual({ common: 1, score: null });
    expect(tasteSimilarity(r({ a: 10, b: 4 }), r({ a: 10, b: 4 }))).toEqual({ common: 2, score: null });
  });
  it("only counts titles both rated", () => {
    expect(tasteSimilarity(r({ a: 8, b: 8, c: 8, x: 1 }), r({ a: 8, b: 8, c: 8, y: 10 })).common).toBe(3);
  });
  it("handles missing people", () => expect(tasteSimilarity(undefined, r({ a: 1 }))).toEqual({ common: 0, score: null }));
});

describe("latestRatings", () => {
  it("a rewatch replaces the earlier rating, and unrated logs don't count", () => {
    const m = latestRatings([f("ann", "x", 4), f("ann", "x", 9), f("ann", "y", null)]);
    expect(m.get("ann")?.get("x")).toBe(9);
    expect(m.get("ann")?.has("y")).toBe(false);
  });
});

describe("tastePairs", () => {
  it("lists known matches first, best on top, then pairs that need more shared titles", () => {
    const facts = [
      ...["a", "b", "c"].flatMap((m) => [f("ann", m, 8), f("bob", m, 8), f("cleo", m, 2)]),
    ];
    const pairs = tastePairs(people, latestRatings(facts));
    expect(pairs[0]).toMatchObject({ a: ann, b: bob, score: 1 });
    expect(pairs.every((p) => p.score !== null)).toBe(true);
    expect(pairs.at(-1)?.score).toBeLessThan(0.5);
  });
});

describe("agreements", () => {
  it("separates what you all liked from what split the room", () => {
    const facts = [
      f("ann", "loved", 9), f("bob", "loved", 8), f("cleo", "loved", 9),
      f("ann", "split", 10), f("bob", "split", 3),
      f("ann", "solo", 10), // one rater: neither agreement nor split
      f("ann", "meh", 5), f("bob", "meh", 5),
    ];
    const { agree, split } = agreements(facts, people);
    expect(agree.map((v) => v.mediaId)).toEqual(["loved"]);
    expect(split.map((v) => v.mediaId)).toEqual(["split"]);
    expect(split[0].ratings.map((r) => r.person.name)).toEqual(["Ann", "Bob"]);
  });
});

describe("yearInReview", () => {
  const facts = [
    f("ann", "dune", 9, { watchedOn: "2026-03-01", platform: "Cinema", runtimeMin: 166, watchedWith: ["bob"] }),
    f("bob", "dune", 7, { watchedOn: "2026-03-01", platform: "Cinema", runtimeMin: 166, watchedWith: ["ann"] }),
    f("ann", "bear", 8, { watchedOn: "2026-03-20", kind: "tv", runtimeMin: 30, platform: "Disney+" }),
    f("cleo", "up", null, { watchedOn: "2026-07-05", runtimeMin: 96 }),
    f("ann", "old", 10, { watchedOn: "2025-12-31" }),
  ];
  const r = yearInReview(facts, people, 2026);

  it("counts only the chosen year", () => {
    expect(r.logs).toBe(4);
    expect(r.titles).toBe(3);
  });
  it("averages stars over rated logs only", () => expect(r.avgRating).toBeCloseTo((9 + 7 + 8) / 3 / 2));
  it("counts hours for films only (series runtime is per episode)", () => expect(r.movieHours).toBe(Math.round((166 + 166 + 96) / 60)));
  it("finds the most active member, busiest month and top platform", () => {
    expect(r.mostActive).toMatchObject({ person: ann, logs: 2 });
    expect(r.busiestMonth).toEqual({ month: 3, logs: 3 });
    expect(r.topPlatform).toEqual({ name: "Cinema", logs: 2 });
  });
  it("prefers a title two people rated as title of the year", () => {
    expect(r.titleOfTheYear).toMatchObject({ mediaId: "dune", raters: 2 });
    expect(r.titleOfTheYear?.stars).toBe(4);
  });
  it("counts a pair watching together once, even if both logged it", () => {
    expect(r.togetherMost).toMatchObject({ a: ann, b: bob, times: 1 });
  });
  it("is empty-safe", () => {
    const e = yearInReview([], people, 2026);
    expect(e).toMatchObject({ logs: 0, avgRating: null, movieHours: null, titleOfTheYear: null, mostActive: null, togetherMost: null });
  });
  it("lists the years that have logs, newest first", () => expect(yearsWithLogs(facts)).toEqual([2026, 2025]));
});

describe("recommend", () => {
  it("suggests what someone loved and others haven't seen, with who loved it", () => {
    const facts = [f("ann", "gem", 10), f("bob", "other", 6)];
    const recs = recommend(facts, [ann, bob]);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ mediaId: "gem" });
    expect(recs[0].unseenBy).toEqual([bob]);
    expect(recs[0].lovedBy).toEqual([{ person: ann, rating: 10 }]);
  });

  it("skips titles everyone has already seen, and titles nobody rated well", () => {
    const facts = [f("ann", "both", 10), f("bob", "both", 10), f("ann", "meh", 4), f("ann", "unrated", null)];
    expect(recommend(facts, [ann, bob])).toEqual([]);
  });

  it("trusts the people whose taste matches yours: Bob loves what Ann loves, Cleo is Ann's opposite", () => {
    // Ann and Bob agree on 3 titles; Ann and Cleo disagree on 3. Both Bob and Cleo rate "target"... Ann hasn't seen it.
    const shared = ["a", "b", "c"].flatMap((m) => [f("ann", m, 9), f("bob", m, 9), f("cleo", m, 1)]);
    const facts = [...shared, f("bob", "target", 9), f("cleo", "target", 2)];
    const recs = recommend(facts, [ann, bob, cleo]);
    const target = recs.find((r) => r.mediaId === "target");
    expect(target).toBeDefined();
    // Ann's prediction leans toward Bob (weight ~1) over Cleo (weight ~0), so it stays well above the 3.5★ bar.
    expect(target!.score).toBeGreaterThan(8);
  });

  it("does not recommend what only someone with the opposite taste loved", () => {
    // Ann rates a,b,c at 9; Bob rates the same three at 1: opposite taste. Bob loves "bobs-pick", Ann hasn't seen it.
    const shared = ["a", "b", "c"].flatMap((m) => [f("ann", m, 9), f("bob", m, 1)]);
    const recs = recommend([...shared, f("bob", "bobs-pick", 10)], [ann, bob]);
    expect(recs.map((r) => r.mediaId)).not.toContain("bobs-pick");
  });

  it("but recommends what an opposite-taste person hated", () => {
    // Same Ann and Bob. Bob gives "bobs-flop" a 1; the mirrored opinion says Ann will probably love it.
    const shared = ["a", "b", "c"].flatMap((m) => [f("ann", m, 9), f("bob", m, 1)]);
    const recs = recommend([...shared, f("bob", "bobs-flop", 1), f("cleo", "bobs-flop", 10)], [ann, bob, cleo]);
    expect(recs.map((r) => r.mediaId)).toContain("bobs-flop");
  });

  it("with no way to compare taste yet, takes the rating at face value", () => {
    const recs = recommend([f("ann", "gem", 9)], [ann, bob]);
    expect(recs[0].score).toBe(9);
  });

  it("doesn't suggest a title to someone who is partway through it", () => {
    const facts = [f("ann", "show", 10), f("bob", "other", 6)];
    expect(recommend(facts, [ann, bob])[0]?.unseenBy).toEqual([bob]);
    expect(recommend(facts, [ann, bob], 6, [{ userId: "bob", mediaId: "show" }])).toEqual([]); // Bob is already watching it
  });

  it("needs at least two people", () => expect(recommend([f("ann", "x", 10)], [ann])).toEqual([]));
});

describe("loadCircleFacts (real SQLite)", () => {
  let db: AnyDb;
  beforeEach(async () => {
    db = await createTestDb();
    await seedUsers(db, ["Ann", "Bob", "Zed"]);
    await db.insert(circle).values({ id: "c1", name: "Divano", createdBy: "u-ann" });
    await db.insert(circleMember).values([
      { circleId: "c1", userId: "u-ann", role: "admin" },
      { circleId: "c1", userId: "u-bob", role: "member" },
    ]);
    await db.insert(mediaEntity).values({ id: "m1", kind: "movie", originalTitle: "Original", year: 2020, runtimeMin: 100, posterPath: "/p.jpg" });
    await db.insert(mediaTitle).values([{ mediaId: "m1", locale: "es", title: "Título" }]);
    await db.insert(log).values([
      { id: "l1", userId: "u-ann", mediaId: "m1", watchedOn: "2026-01-02", rating: 9 },
      { id: "l2", userId: "u-bob", mediaId: "m1", watchedOn: "2026-01-03", rating: 7 },
      { id: "l3", userId: "u-zed", mediaId: "m1", watchedOn: "2026-01-04", rating: 1 }, // not in the Cerchia
    ]);
    await db.insert(logWatchedWith).values({ logId: "l1", userId: "u-bob" });
  });

  it("loads only members' logs, in order, with the localized title and 'watched with'", async () => {
    const { people, facts } = await loadCircleFacts(db, "c1", "es");
    expect(people.map((p) => p.name)).toEqual(["Ann", "Bob"]);
    expect(facts.map((x) => x.logId)).toEqual(["l1", "l2"]);
    expect(facts[0]).toMatchObject({ title: "Título", runtimeMin: 100, posterPath: "/p.jpg", watchedWith: ["u-bob"] });
  });

  it("loads who is partway through what, for members only", async () => {
    await db.insert(nowWatching).values([{ userId: "u-bob", mediaId: "m1", progress: "S1·E2" }, { userId: "u-zed", mediaId: "m1" }]);
    const { watching } = await loadCircleFacts(db, "c1", "it");
    expect(watching).toEqual([{ userId: "u-bob", mediaId: "m1" }]);
  });

  it("falls back to the original title when there is no translation", async () => {
    const { facts } = await loadCircleFacts(db, "c1", "it");
    expect(facts[0].title).toBe("Original");
  });

  it("feeds the pure functions end to end", async () => {
    const { people, facts } = await loadCircleFacts(db, "c1", "it");
    const r = yearInReview(facts, people, 2026);
    expect(r).toMatchObject({ logs: 2, titles: 1 });
    expect(r.togetherMost?.times).toBe(1);
  });
});
