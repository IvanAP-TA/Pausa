import { beforeEach, describe, expect, it } from "vitest";
import { log, mediaEntity } from "../../db/schema";
import type { AnyDb } from "./db-types";
import { rankDiscovery, topSeeds, type Candidate } from "./discovery";
import { createTestDb, seedUsers } from "./test-db";

const cand = (id: string, title = id): Candidate => ({ id, kind: "movie", title, year: 2020, posterPath: null });

describe("rankDiscovery", () => {
  it("scores by how much you loved the seed, and rewards titles several seeds point to", () => {
    const ranked = rankDiscovery([
      { seed: { mediaId: "s1", title: "Loved", rating: 10 }, candidates: [cand("a"), cand("b"), cand("c")] },
      { seed: { mediaId: "s2", title: "Liked", rating: 8 }, candidates: [cand("c"), cand("d")] },
    ], new Set());
    expect(ranked.map((r) => r.candidate.id)).toEqual(["c", "a", "b", "d"]);
    expect(ranked.find((r) => r.candidate.id === "c")!.because.map((b) => b.title)).toEqual(["Loved", "Liked"]);
  });

  it("never suggests what is excluded, and respects the limit", () => {
    const ranked = rankDiscovery([{ seed: { mediaId: "s", title: "S", rating: 9 }, candidates: [cand("a"), cand("b"), cand("c")] }], new Set(["a"]), 1);
    expect(ranked.map((r) => r.candidate.id)).toEqual(["b"]);
  });

  it("is empty with no seeds", () => {
    expect(rankDiscovery([], new Set())).toEqual([]);
  });
});

describe("topSeeds", () => {
  let db: AnyDb;
  beforeEach(async () => {
    db = await createTestDb();
    await seedUsers(db, ["Ann"]);
    await db.insert(mediaEntity).values([
      { id: "m1", kind: "movie", originalTitle: "One", tmdbId: 1 }, { id: "m2", kind: "tv", originalTitle: "Two", tmdbId: 2 },
      { id: "m3", kind: "anime", originalTitle: "Three" }, // no TMDB id: cannot seed
      { id: "m4", kind: "movie", originalTitle: "Four", tmdbId: 4 }, { id: "m5", kind: "movie", originalTitle: "Five", tmdbId: 5 },
    ]);
  });

  it("picks the best-loved titles TMDB knows, using the latest rating per title", async () => {
    await db.insert(log).values([
      { id: "l1", userId: "u-ann", mediaId: "m1", watchedOn: "2024-01-01", rating: 10 },
      { id: "l1b", userId: "u-ann", mediaId: "m1", watchedOn: "2025-01-01", rating: 4 }, // changed her mind
      { id: "l2", userId: "u-ann", mediaId: "m2", watchedOn: "2025-02-01", rating: 9 },
      { id: "l3", userId: "u-ann", mediaId: "m3", watchedOn: "2025-03-01", rating: 10 },
      { id: "l4", userId: "u-ann", mediaId: "m4", watchedOn: "2025-04-01", rating: 7 }, // below the bar
      { id: "l5", userId: "u-ann", mediaId: "m5", watchedOn: "2025-05-01", rating: null },
    ]);
    const { seeds, logged } = await topSeeds(db, "u-ann");
    expect(seeds.map((s) => s.mediaId)).toEqual(["m2"]);
    expect([...logged].sort()).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });

  it("caps the number of seeds, best first", async () => {
    await db.insert(log).values([
      { id: "a", userId: "u-ann", mediaId: "m1", watchedOn: "2025-01-01", rating: 8 },
      { id: "b", userId: "u-ann", mediaId: "m2", watchedOn: "2025-01-02", rating: 10 },
      { id: "c", userId: "u-ann", mediaId: "m4", watchedOn: "2025-01-03", rating: 9 },
    ]);
    expect((await topSeeds(db, "u-ann", 2)).seeds.map((s) => s.mediaId)).toEqual(["m2", "m4"]);
  });
});
