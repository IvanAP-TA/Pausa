import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { circleMember, invite, log, logShare, mediaEntity } from "../../db/schema";
import { createCircleWithInvite, redeemInvite } from "./circles";
import type { AnyDb } from "./db-types";
import { importRows } from "./import";
import { setLogScope, shareLog, unshareLog } from "./sharing";
import { createTestDb, seedUsers } from "./test-db";
import { visibleIn } from "./visibility";

let db: AnyDb;
let divano: string;
let cinema: string;

/** The ids of the logs a Cerchia shows: the same join and rule the feed uses. */
const shownIn = async (circleId: string) =>
  (await db.select({ id: log.id }).from(log)
    .innerJoin(circleMember, and(eq(circleMember.userId, log.userId), eq(circleMember.circleId, circleId)))
    .where(visibleIn(circleId))).map((r) => r.id).sort();

beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob"]);
  divano = (await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann" })).id;
  cinema = (await createCircleWithInvite(db, { name: "Cinema", createdBy: "u-ann" })).id;
  const [inv] = await db.select().from(invite).where(eq(invite.circleId, divano));
  await redeemInvite(db, "u-bob", inv.code);
  await db.insert(mediaEntity).values([{ id: "m1", kind: "movie", originalTitle: "Alpha" }, { id: "m2", kind: "movie", originalTitle: "Beta" }]);
  await db.insert(log).values([
    { id: "open", userId: "u-ann", mediaId: "m1", watchedOn: "2026-01-01" },
    { id: "mine", userId: "u-ann", mediaId: "m2", watchedOn: "2026-01-02", scope: "private" },
  ]);
});

describe("who reads a log", () => {
  it("an open log shows in every Cerchia of its author, a private one in none", async () => {
    expect(await shownIn(divano)).toEqual(["open"]);
    expect(await shownIn(cinema)).toEqual(["open"]);
  });

  it("a private log shows only in the Cerchia it was shared with, until it is taken back", async () => {
    expect(await shareLog(db, { logId: "mine", circleId: divano, actorId: "u-ann" })).toEqual({ ok: true });
    expect(await shownIn(divano)).toEqual(["mine", "open"]);
    expect(await shownIn(cinema)).toEqual(["open"]);
    // Sharing twice changes nothing.
    await shareLog(db, { logId: "mine", circleId: divano, actorId: "u-ann" });
    expect(await db.select().from(logShare)).toHaveLength(1);
    await unshareLog(db, { logId: "mine", circleId: divano, actorId: "u-ann" });
    expect(await shownIn(divano)).toEqual(["open"]);
  });

  it("only the author shares, and only with a Cerchia they are in", async () => {
    expect(await shareLog(db, { logId: "mine", circleId: divano, actorId: "u-bob" })).toEqual({ error: "forbidden" });
    expect(await shareLog(db, { logId: "nope", circleId: divano, actorId: "u-ann" })).toEqual({ error: "not_found" });
    await db.insert(log).values({ id: "bobs", userId: "u-bob", mediaId: "m1", watchedOn: "2026-01-03", scope: "private" });
    expect(await shareLog(db, { logId: "bobs", circleId: cinema, actorId: "u-bob" })).toEqual({ error: "not_member" });
    expect(await setLogScope(db, { logId: "open", actorId: "u-bob", scope: "private" })).toEqual({ error: "forbidden" });
  });

  it("making a log private takes it out of every Cerchia; opening it again drops the single shares", async () => {
    await setLogScope(db, { logId: "open", actorId: "u-ann", scope: "private" });
    expect(await shownIn(divano)).toEqual([]);
    await shareLog(db, { logId: "mine", circleId: divano, actorId: "u-ann" });
    await setLogScope(db, { logId: "mine", actorId: "u-ann", scope: "circles" });
    expect(await shownIn(cinema)).toEqual(["mine"]);
    expect(await db.select().from(logShare)).toHaveLength(0);
  });

  it("imported history is private", async () => {
    await importRows(db, "u-bob", [{ source: "letterboxd", kind: "movie", title: "Gamma", year: 2001, watchedOn: "2020-05-05", rating: 8, review: null, rewatch: false, letterboxdUri: null, anilistId: null, malId: null, imdbId: null, tmdbId: null }], { includeReviews: true, includeUndated: false, today: "2026-01-10" });
    const [row] = await db.select({ scope: log.scope }).from(log).where(eq(log.userId, "u-bob"));
    expect(row.scope).toBe("private");
    expect(await shownIn(divano)).toEqual(["open"]);
  });
});
