import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { circle, log, mediaEntity, notification, user } from "../../db/schema";
import type { AnyDb } from "./db-types";
import { DIGEST_MAX_ITEMS, digestLines, markDigestSent, pendingDigests } from "./digest";
import { saveSubscription } from "./push";
import { createTestDb, seedUsers } from "./test-db";

const NOW = new Date("2026-12-01T18:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

let db: AnyDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob"]);
  await db.insert(circle).values({ id: "c1", name: "Divano", createdBy: "u-ann" });
  await db.insert(mediaEntity).values({ id: "m1", kind: "movie", originalTitle: "Alpha" });
  await db.insert(log).values({ id: "l1", userId: "u-bob", mediaId: "m1", watchedOn: "2026-11-30" });
});
const notice = (id: string, hoursAgo: number, over: Partial<typeof notification.$inferInsert> = {}) =>
  db.insert(notification).values({ id, userId: "u-ann", type: "log", actorId: "u-bob", circleId: "c1", logId: "l1", createdAt: ago(hoursAgo), ...over });
const optIn = () => db.update(user).set({ emailDigest: true, locale: "it" }).where(eq(user.id, "u-ann"));

describe("pendingDigests", () => {
  it("is empty for people who did not opt in", async () => {
    await notice("n1", 2);
    expect(await pendingDigests(db, NOW)).toEqual([]);
  });

  it("sends nothing when there is nothing new, and skips what is already read", async () => {
    await optIn();
    expect(await pendingDigests(db, NOW)).toEqual([]);
    await notice("n1", 2, { readAt: ago(1) });
    expect(await pendingDigests(db, NOW)).toEqual([]);
  });

  it("collects unread notices, newest first, in the person's language", async () => {
    await optIn();
    await notice("n1", 5);
    await notice("n2", 1, { type: "comment" });
    const [d] = await pendingDigests(db, NOW);
    expect(d).toMatchObject({ userId: "u-ann", email: "ann@test.dev", total: 2, locale: "it" });
    expect(d.items.map((i) => i.type)).toEqual(["comment", "log"]);
    expect(digestLines(d)).toEqual(["Divano: Bob ha commentato Alpha", "Divano: Bob ha visto Alpha"]);
  });

  it("people with push on any device do not get an email", async () => {
    await optIn();
    await notice("n1", 2);
    await saveSubscription(db, { userId: "u-ann", endpoint: "https://push/1", p256dh: "p", auth: "a", locale: "it" });
    expect(await pendingDigests(db, NOW)).toEqual([]);
  });

  it("starts after the last digest, never reaches back more than three days, and caps the list", async () => {
    await optIn();
    await notice("old", 24 * 5); // five days ago: too far back
    await notice("before", 30);
    await markDigestSent(db, ["u-ann"], ago(24));
    await notice("after", 3);
    const [d] = await pendingDigests(db, NOW);
    expect(d.total).toBe(1); // only what came after the last digest

    await markDigestSent(db, ["u-ann"], ago(24 * 10));
    for (let i = 0; i < DIGEST_MAX_ITEMS + 4; i++) await notice(`many${i}`, 1 + i * 0.01);
    const [many] = await pendingDigests(db, NOW);
    expect(many.items).toHaveLength(DIGEST_MAX_ITEMS);
    expect(many.total).toBeGreaterThan(DIGEST_MAX_ITEMS);
  });

  it("marking as sent moves the window forward", async () => {
    await optIn();
    await notice("n1", 2);
    await markDigestSent(db, ["u-ann"], ago(1));
    expect(await pendingDigests(db, NOW)).toEqual([]);
  });
});
