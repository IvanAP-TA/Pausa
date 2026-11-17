import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mediaEntity, nowWatching } from "../../db/schema";
import type { AnyDb } from "./db-types";
import { formatProgress, nextEpisode, nextSeason, parseLegacy, setWatching, toPosition } from "./progress";
import { createTestDb, seedUsers } from "./test-db";

let db: AnyDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann"]);
  await db.insert(mediaEntity).values([{ id: "m1", kind: "tv", originalTitle: "Show" }, { id: "m2", kind: "anime", originalTitle: "Anime" }]);
});
const row = async () => (await db.select().from(nowWatching).where(eq(nowWatching.userId, "u-ann")))[0];

describe("toPosition", () => {
  it("accepts whole numbers in range and rejects the rest", () => {
    expect(toPosition("3", 99)).toBe(3);
    expect(toPosition(" 12 ", 9999)).toBe(12);
    for (const bad of ["", "0", "-1", "1.5", "abc", "100", null, undefined, 4]) expect(toPosition(bad, 99)).toBeNull();
  });
});

describe("formatProgress", () => {
  it("formats season and episode, falling back to the legacy label", () => {
    expect(formatProgress({ season: 3, episode: 4 })).toBe("S3·E4");
    expect(formatProgress({ season: null, episode: 12 })).toBe("E12");
    expect(formatProgress({ season: 2, episode: null })).toBe("S2");
    expect(formatProgress({ season: null, episode: null, progress: " S1·E2 " })).toBe("S1·E2");
    expect(formatProgress({ season: null, episode: null })).toBeNull();
  });
});

describe("watching", () => {
  it("setWatching reports whether the title changed, and a new position replaces the old label", async () => {
    expect(await setWatching(db, { userId: "u-ann", mediaId: "m1", season: 1, episode: 3 })).toEqual({ titleChanged: true });
    expect(await setWatching(db, { userId: "u-ann", mediaId: "m1", season: 1, episode: 4 })).toEqual({ titleChanged: false });
    expect(await setWatching(db, { userId: "u-ann", mediaId: "m2", season: null, episode: 1 })).toEqual({ titleChanged: true });
    expect(await row()).toMatchObject({ mediaId: "m2", season: null, episode: 1, progress: null });
  });

  it("nextEpisode adds one and keeps the season; nothing watching gives null", async () => {
    expect(await nextEpisode(db, "u-ann")).toBeNull();
    await setWatching(db, { userId: "u-ann", mediaId: "m1", season: 2, episode: 9 });
    expect(await nextEpisode(db, "u-ann")).toEqual({ season: 2, episode: 10 });
    expect(await row()).toMatchObject({ season: 2, episode: 10 });
  });

  it("continues from a legacy label, or starts at episode 1 when it has no numbers", async () => {
    await db.insert(nowWatching).values({ userId: "u-ann", mediaId: "m1", progress: "S1·E2" });
    expect(await nextEpisode(db, "u-ann")).toEqual({ season: 1, episode: 3 });
    expect((await row()).progress).toBeNull();
    await db.update(nowWatching).set({ season: null, episode: null, progress: "quasi finita" });
    expect(await nextEpisode(db, "u-ann")).toEqual({ season: null, episode: 1 });
  });

  it("parseLegacy reads common labels", () => {
    expect(parseLegacy("S3·E4")).toEqual({ season: 3, episode: 4 });
    expect(parseLegacy("s02e11")).toEqual({ season: 2, episode: 11 });
    expect(parseLegacy("E12")).toEqual({ season: null, episode: 12 });
    expect(parseLegacy("ep 7")).toEqual({ season: null, episode: 7 });
    expect(parseLegacy("quasi finita")).toBeNull();
    expect(parseLegacy(null)).toBeNull();
  });

  it("nextSeason moves to episode 1 of the following season", async () => {
    await setWatching(db, { userId: "u-ann", mediaId: "m1", season: 2, episode: 8 });
    expect(await nextSeason(db, "u-ann")).toEqual({ season: 3, episode: 1 });
    await setWatching(db, { userId: "u-ann", mediaId: "m2", season: null, episode: 24 });
    expect(await nextSeason(db, "u-ann")).toEqual({ season: 2, episode: 1 });
  });
});
