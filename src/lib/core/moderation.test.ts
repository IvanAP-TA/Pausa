import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { circle, circleMember, comment, invite, list, log, mediaEntity, report, serata } from "../../db/schema";
import { createCircleWithInvite, deleteCircle, redeemInvite } from "./circles";
import type { AnyDb } from "./db-types";
import { createReport, openReports, resolveReport } from "./moderation";
import { createTestDb, seedUsers } from "./test-db";

let db: AnyDb;
let circleId: string;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob", "Cleo"]);
  circleId = (await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann" })).id;
  const [inv] = await db.select().from(invite).where(eq(invite.circleId, circleId));
  await redeemInvite(db, "u-bob", inv.code);
  await db.insert(mediaEntity).values({ id: "m1", kind: "movie", originalTitle: "Alpha" });
  await db.insert(log).values({ id: "l1", userId: "u-ann", mediaId: "m1", watchedOn: "2026-01-01", review: "Bella" });
  await db.insert(comment).values({ id: "c1", logId: "l1", userId: "u-bob", body: "buy cheap watches" });
});

describe("reports", () => {
  it("a member flags a comment; the snapshot and the shared Cerchia are recorded", async () => {
    expect(await createReport(db, { reporterId: "u-ann", kind: "comment", targetId: "c1", reason: "spam" })).toEqual({ ok: true });
    const [r] = await openReports(db);
    expect(r).toMatchObject({ kind: "comment", reason: "spam", excerpt: "buy cheap watches", reporter: "Ann", circleName: "Divano" });
  });

  it("cannot flag your own content, content you cannot see, or something that does not exist", async () => {
    expect(await createReport(db, { reporterId: "u-bob", kind: "comment", targetId: "c1", reason: "spam" })).toEqual({ error: "own" });
    expect(await createReport(db, { reporterId: "u-cleo", kind: "comment", targetId: "c1", reason: "spam" })).toEqual({ error: "not_found" }); // Cleo is in no Cerchia
    expect(await createReport(db, { reporterId: "u-ann", kind: "log", targetId: "nope", reason: "other" })).toEqual({ error: "not_found" });
  });

  it("reporting the same thing twice is one report", async () => {
    await createReport(db, { reporterId: "u-ann", kind: "comment", targetId: "c1", reason: "spam" });
    await createReport(db, { reporterId: "u-ann", kind: "comment", targetId: "c1", reason: "abuse" });
    expect(await openReports(db)).toHaveLength(1);
  });

  it("dismissing keeps the content; removing deletes it and closes every report on it", async () => {
    await createReport(db, { reporterId: "u-ann", kind: "comment", targetId: "c1", reason: "spam" });
    const [r] = await openReports(db);
    expect(await resolveReport(db, { reportId: r.id, action: "dismiss" })).toEqual({ ok: true });
    expect(await db.select().from(comment)).toHaveLength(1);
    expect(await openReports(db)).toHaveLength(0);
    expect(await resolveReport(db, { reportId: r.id, action: "dismiss" })).toEqual({ error: "not_found" }); // already closed

    await db.delete(report);
    await db.insert(circleMember).values({ circleId, userId: "u-cleo" });
    await createReport(db, { reporterId: "u-ann", kind: "comment", targetId: "c1", reason: "abuse" });
    await createReport(db, { reporterId: "u-cleo", kind: "comment", targetId: "c1", reason: "abuse" });
    const [first] = await openReports(db);
    await resolveReport(db, { reportId: first.id, action: "remove" });
    expect(await db.select().from(comment)).toHaveLength(0);
    expect(await openReports(db)).toHaveLength(0); // the second report on the same comment closed too
  });

  it("removing a reported log takes its comments with it", async () => {
    await createReport(db, { reporterId: "u-bob", kind: "log", targetId: "l1", reason: "privacy" });
    const [r] = await openReports(db);
    await resolveReport(db, { reportId: r.id, action: "remove" });
    expect(await db.select().from(log)).toHaveLength(0);
    expect(await db.select().from(comment)).toHaveLength(0);
  });
});

describe("deleteCircle", () => {
  it("only an admin closes it; people's logs survive, Serate keep their result", async () => {
    await db.insert(list).values({ id: "g", circleId, ownerId: "u-ann", name: "Top" });
    await db.insert(serata).values({ id: "s1", code: "ABCDEF", circleId, hostId: "u-ann", mode: "table", status: "done" });
    expect(await deleteCircle(db, { circleId, actorId: "u-bob" })).toEqual({ error: "forbidden" });
    expect(await deleteCircle(db, { circleId, actorId: "u-cleo" })).toEqual({ error: "forbidden" });
    expect(await deleteCircle(db, { circleId, actorId: "u-ann" })).toEqual({ ok: true });
    expect(await db.select().from(circle)).toHaveLength(0);
    expect(await db.select().from(circleMember)).toHaveLength(0);
    expect(await db.select().from(list)).toHaveLength(0);
    expect(await db.select().from(log)).toHaveLength(1);
    expect((await db.select().from(serata))[0].circleId).toBeNull();
  });
});
