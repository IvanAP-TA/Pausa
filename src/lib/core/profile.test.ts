import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { circle, circleMember, log, logShare, mediaEntity } from "../../db/schema";
import type { AnyDb } from "./db-types";
import { MAX_FAVORITES, addFavorite, confirms, getProfile, removeFavorite, removeMyLogsFromCircle, saveProfile } from "./profile";
import { createTestDb, seedUsers } from "./test-db";

let db: AnyDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob"]);
  await db.insert(mediaEntity).values(Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, kind: "movie" as const, originalTitle: `Film ${i}`, year: 2000 + i })));
});

describe("profile", () => {
  it("saves name, bio and only known genres, at most five", async () => {
    await saveProfile(db, { userId: "u-ann", name: "  Anna ", bio: "Horror di notte.", genres: ["horror", "nope", "drama", "horror", "comedy", "scifi", "crime", "war"] });
    const p = await getProfile(db, "u-ann");
    expect(p?.name).toBe("Anna");
    expect(p?.bio).toBe("Horror di notte.");
    expect(p?.favoriteGenres).toEqual(["horror", "drama", "comedy", "scifi", "crime"]);
  });

  it("an empty bio is stored as none, and the picture is kept unless given", async () => {
    await saveProfile(db, { userId: "u-ann", name: "Ann", bio: "x", genres: [], image: "emoji:🍿" });
    await saveProfile(db, { userId: "u-ann", name: "Ann", bio: "   ", genres: [] });
    const p = await getProfile(db, "u-ann");
    expect(p?.bio).toBeNull();
    expect(p?.image).toBe("emoji:🍿");
  });

  it("keeps favourites in order, without duplicates, up to the limit", async () => {
    for (let i = 0; i < MAX_FAVORITES; i++) expect(await addFavorite(db, "u-ann", `m${i}`)).toEqual({ ok: true });
    expect(await addFavorite(db, "u-ann", "m0")).toEqual({ ok: true }); // already there
    expect(await addFavorite(db, "u-ann", "m6")).toEqual({ error: "full" });
    await removeFavorite(db, "u-ann", "m1");
    expect(await addFavorite(db, "u-ann", "m6")).toEqual({ ok: true });
    const p = await getProfile(db, "u-ann");
    expect(p?.favorites.map((f) => f.id)).toEqual(["m0", "m2", "m3", "m4", "m6"]);
  });
});

describe("confirms (the PAUSA word)", () => {
  it("accepts the word, whatever the case and spaces, and nothing else", () => {
    expect(confirms("PAUSA")).toBe(true);
    expect(confirms(" pausa ")).toBe(true);
    expect(confirms("PAUS")).toBe(false);
    expect(confirms("")).toBe(false);
    expect(confirms(null)).toBe(false);
  });
});

describe("removeMyLogsFromCircle", () => {
  beforeEach(async () => {
    await db.insert(circle).values([{ id: "c1", name: "Uno", createdBy: "u-ann" }, { id: "c2", name: "Due", createdBy: "u-ann" }]);
    await db.insert(circleMember).values([
      { circleId: "c1", userId: "u-ann" }, { circleId: "c2", userId: "u-ann" }, { circleId: "c1", userId: "u-bob" },
    ]);
    await db.insert(log).values([
      { id: "open", userId: "u-ann", mediaId: "m0", watchedOn: "2026-01-01", scope: "circles", createdAt: new Date(1000) },
      { id: "sharedHere", userId: "u-ann", mediaId: "m1", watchedOn: "2026-01-02", scope: "private" },
      { id: "sharedThere", userId: "u-ann", mediaId: "m2", watchedOn: "2026-01-03", scope: "private" },
      { id: "bobs", userId: "u-bob", mediaId: "m3", watchedOn: "2026-01-04", scope: "circles" },
    ]);
    await db.insert(logShare).values([{ logId: "sharedHere", circleId: "c1" }, { logId: "sharedThere", circleId: "c2" }]);
  });

  it("takes my viewings out of that Cerchia only, keeps them in my space and in my other Cerchie", async () => {
    expect(await removeMyLogsFromCircle(db, { userId: "u-ann", circleId: "c1" })).toEqual({ removed: 2 });

    const logs = await db.select({ id: log.id, scope: log.scope }).from(log);
    expect(logs).toHaveLength(4); // nothing deleted
    expect(logs.find((l) => l.id === "open")?.scope).toBe("private");
    expect(logs.find((l) => l.id === "bobs")?.scope).toBe("circles"); // someone else's: untouched

    const shares = await db.select().from(logShare);
    // The open one is now shared with c2 only, at its original moment; the one shared here is gone; the other stays.
    const openShare = shares.filter((s) => s.logId === "open");
    expect(openShare.map((s) => s.circleId)).toEqual(["c2"]);
    expect(openShare[0]?.createdAt.getTime()).toBe(1000);
    expect(await db.select().from(logShare).where(and(eq(logShare.circleId, "c1")))).toHaveLength(0);
    expect(shares.some((s) => s.logId === "sharedThere" && s.circleId === "c2")).toBe(true);
  });

  it("does nothing in a Cerchia I am not in (and leaves my viewings as they are)", async () => {
    expect(await removeMyLogsFromCircle(db, { userId: "u-bob", circleId: "c2" })).toEqual({ removed: 0 });
    const [bobs] = await db.select({ scope: log.scope }).from(log).where(eq(log.id, "bobs"));
    expect(bobs?.scope).toBe("circles");
  });
});
