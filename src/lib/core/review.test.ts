import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { circleMember, log, user } from "../../db/schema";
import type { AnyDb } from "./db-types";
import { REVIEW_CIRCLE_ID, ensureReviewAccount } from "./review";
import { createTestDb } from "./test-db";

let db: AnyDb;
beforeEach(async () => { db = await createTestDb(); });

describe("ensureReviewAccount", () => {
  it("builds the reviewer, a demo Cerchia they administer, and some ratings", async () => {
    const r = await ensureReviewAccount(db, "review@example.test");
    expect(r).toEqual({ userId: "u-review", circleId: REVIEW_CIRCLE_ID });
    const [me] = await db.select().from(user).where(eq(user.id, "u-review"));
    expect(me?.email).toBe("review@example.test");
    const members = await db.select().from(circleMember).where(eq(circleMember.circleId, REVIEW_CIRCLE_ID));
    expect(members).toHaveLength(3);
    expect(members.find((m) => m.userId === "u-review")?.role).toBe("admin");
    expect((await db.select().from(log)).length).toBe(9);
  });

  it("can run on every sign-in without duplicating anything", async () => {
    await ensureReviewAccount(db, "review@example.test");
    await ensureReviewAccount(db, "review@example.test");
    expect((await db.select().from(log)).length).toBe(9);
    expect((await db.select().from(circleMember)).length).toBe(3);
  });
});
