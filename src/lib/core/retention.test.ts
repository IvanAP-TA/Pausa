import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { invite, log, mediaEntity, serata } from "../../db/schema";
import { createCircleWithInvite, redeemInvite } from "./circles";
import type { AnyDb } from "./db-types";
import { memoriesFor, onboardingFor } from "./retention";
import { createTestDb, seedUsers } from "./test-db";

let db: AnyDb;
let circleId: string;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob", "Cleo"]);
  circleId = (await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann" })).id;
  await db.insert(mediaEntity).values([
    { id: "m1", kind: "movie", originalTitle: "Alpha" }, { id: "m2", kind: "movie", originalTitle: "Beta" }, { id: "m3", kind: "tv", originalTitle: "Gamma" },
  ]);
});

const today = new Date("2026-11-17T09:00:00Z");

describe("memories", () => {
  it("finds logs from earlier years near this calendar day, closest first", async () => {
    await db.insert(log).values([
      { id: "exact", userId: "u-ann", mediaId: "m1", watchedOn: "2025-11-17", rating: 9, review: "wow" },
      { id: "near", userId: "u-ann", mediaId: "m2", watchedOn: "2024-11-15" },
      { id: "far", userId: "u-ann", mediaId: "m3", watchedOn: "2025-11-25" }, // outside the window
      { id: "thisyear", userId: "u-ann", mediaId: "m3", watchedOn: "2026-11-16" }, // not a memory yet
    ]);
    const m = await memoriesFor(db, circleId, today);
    expect(m.map((x) => x.logId)).toEqual(["exact", "near"]);
    expect(m[0]).toMatchObject({ yearsAgo: 1, title: "Alpha", review: "wow", author: { name: "Ann" } });
    expect(m[1].yearsAgo).toBe(2);
  });

  it("only shows people of this Cerchia, and respects the limit", async () => {
    await db.insert(log).values([
      { id: "ann", userId: "u-ann", mediaId: "m1", watchedOn: "2025-11-17" },
      { id: "cleo", userId: "u-cleo", mediaId: "m2", watchedOn: "2025-11-17" }, // not a member
      { id: "a2", userId: "u-ann", mediaId: "m2", watchedOn: "2024-11-17" },
      { id: "a3", userId: "u-ann", mediaId: "m3", watchedOn: "2023-11-17" },
      { id: "a4", userId: "u-ann", mediaId: "m3", watchedOn: "2022-11-17" },
    ]);
    const m = await memoriesFor(db, circleId, today, { limit: 3 });
    expect(m.map((x) => x.logId)).toEqual(["ann", "a2", "a3"]);
  });

  it("wraps around the new year and handles 29 February", async () => {
    await db.insert(log).values([
      { id: "dec", userId: "u-ann", mediaId: "m1", watchedOn: "2025-12-31" },
      { id: "leap", userId: "u-ann", mediaId: "m2", watchedOn: "2024-02-29" },
    ]);
    expect((await memoriesFor(db, circleId, new Date("2027-01-01T10:00:00Z"))).map((x) => x.logId)).toEqual(["dec"]);
    expect((await memoriesFor(db, circleId, new Date("2027-03-01T10:00:00Z"))).map((x) => x.logId)).toEqual(["leap"]);
  });

  it("uses the localized title when there is one", async () => {
    await db.insert(log).values({ id: "l", userId: "u-ann", mediaId: "m1", watchedOn: "2025-11-17" });
    await db.insert((await import("../../db/schema")).mediaTitle).values({ mediaId: "m1", locale: "en", title: "Alpha EN" });
    expect((await memoriesFor(db, circleId, today, { locale: "en" }))[0].title).toBe("Alpha EN");
    expect((await memoriesFor(db, circleId, today, { locale: "es" }))[0].title).toBe("Alpha");
  });
});

describe("onboarding", () => {
  it("starts empty and ticks off as the Cerchia comes alive", async () => {
    expect(await onboardingFor(db, circleId, "u-ann")).toEqual({ hasLog: false, hasCompany: false, hasSerata: false, done: false });
    await db.insert(log).values({ id: "l", userId: "u-ann", mediaId: "m1", watchedOn: "2026-11-01" });
    const [inv] = await db.select().from(invite).where(eq(invite.circleId, circleId));
    await redeemInvite(db, "u-bob", inv.code);
    expect(await onboardingFor(db, circleId, "u-ann")).toMatchObject({ hasLog: true, hasCompany: true, hasSerata: false, done: false });
    await db.insert(serata).values({ id: "s1", code: "ABC123", circleId, hostId: "u-ann", mode: "table", status: "lobby" });
    expect((await onboardingFor(db, circleId, "u-ann")).hasSerata).toBe(false); // only a finished Serata counts
    await db.update(serata).set({ status: "done" }).where(eq(serata.id, "s1"));
    expect((await onboardingFor(db, circleId, "u-ann")).done).toBe(true);
    expect((await onboardingFor(db, circleId, "u-bob")).hasLog).toBe(false); // log step is personal
  });
});
