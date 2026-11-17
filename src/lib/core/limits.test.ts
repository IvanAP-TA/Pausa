import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { circle, circleMember, rateLimit, serata, serataParticipant, session, user, verification } from "../../db/schema";
import { runCleanup } from "./cleanup";
import type { AnyDb } from "./db-types";
import { LIMITS, hit, pruneLimits } from "./limits";
import { createTestDb, seedUsers } from "./test-db";

const T0 = new Date("2026-12-01T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

let db: AnyDb;
beforeEach(async () => { db = await createTestDb(); await seedUsers(db, ["Ann", "Bob"]); });

describe("hit (per-person limits)", () => {
  it("allows up to the maximum, then refuses until the window rolls over", async () => {
    const { max, windowMs } = LIMITS.createCircle;
    for (let i = 1; i <= max; i++) expect((await hit(db, "createCircle", "u-ann", at(i))).allowed).toBe(true);
    const over = await hit(db, "createCircle", "u-ann", at(max + 1));
    expect(over).toEqual({ allowed: false, remaining: 0 });
    expect((await hit(db, "createCircle", "u-ann", at(max + 2))).allowed).toBe(false); // still refused, not counted forever
    expect((await hit(db, "createCircle", "u-ann", at(windowMs + 10))).allowed).toBe(true); // new window
  });

  it("counts people and actions separately", async () => {
    const { max } = LIMITS.createCircle;
    for (let i = 0; i <= max; i++) await hit(db, "createCircle", "u-ann", at(i));
    expect((await hit(db, "createCircle", "u-bob", at(5))).allowed).toBe(true);
    expect((await hit(db, "comment", "u-ann", at(5))).allowed).toBe(true);
  });

  it("reports what is left", async () => {
    const first = await hit(db, "createInvite", "u-ann", at(1));
    expect(first.remaining).toBe(LIMITS.createInvite.max - 1);
  });

  it("keeps its rows small and prunes old windows", async () => {
    await hit(db, "comment", "u-ann", at(0));
    await pruneLimits(db, at(3 * 86_400_000));
    expect(await db.select().from(rateLimit)).toHaveLength(0);
  });
});

describe("runCleanup", () => {
  it("removes old guests who belong to no Cerchia, keeps members, recent guests and real people", async () => {
    const old = new Date(T0.getTime() - 40 * 86_400_000);
    await db.insert(user).values([
      { id: "g-old", name: "Guest", email: "g1@t.dev", isAnonymous: true, createdAt: old },
      { id: "g-member", name: "Guest", email: "g2@t.dev", isAnonymous: true, createdAt: old },
      { id: "g-new", name: "Guest", email: "g3@t.dev", isAnonymous: true, createdAt: at(-86_400_000) },
    ]);
    await db.insert(circle).values({ id: "c1", name: "C", createdBy: "u-ann" });
    await db.insert(circleMember).values({ circleId: "c1", userId: "g-member" });
    const report = await runCleanup(db, T0);
    expect(report.guests).toBe(1);
    const left = (await db.select({ id: user.id }).from(user)).map((u) => u.id).sort();
    expect(left).toEqual(["g-member", "g-new", "u-ann", "u-bob"]);
  });

  it("takes a deleted guest's Serata seat with it but keeps the Serata", async () => {
    const old = new Date(T0.getTime() - 60 * 86_400_000);
    await db.insert(user).values({ id: "g-old", name: "Guest", email: "g@t.dev", isAnonymous: true, createdAt: old });
    await db.insert(serata).values({ id: "s1", code: "ABCDEF", hostId: "u-ann", mode: "table", status: "done" });
    await db.insert(serataParticipant).values({ serataId: "s1", userId: "g-old", name: "Guest", isGuest: true });
    await runCleanup(db, T0);
    expect(await db.select().from(serataParticipant)).toHaveLength(0);
    expect(await db.select().from(serata).where(eq(serata.id, "s1"))).toHaveLength(1);
  });

  it("removes expired sessions and sign-in links, keeps live ones", async () => {
    await db.insert(session).values([
      { id: "s-old", token: "t1", userId: "u-ann", expiresAt: at(-1000) },
      { id: "s-live", token: "t2", userId: "u-ann", expiresAt: at(86_400_000) },
    ]);
    await db.insert(verification).values([
      { id: "v-old", identifier: "x", value: "y", expiresAt: at(-1000) },
      { id: "v-live", identifier: "x2", value: "y", expiresAt: at(1000) },
    ]);
    const report = await runCleanup(db, T0);
    expect(report).toMatchObject({ sessions: 1, verifications: 1 });
    expect((await db.select().from(session))[0].id).toBe("s-live");
    expect((await db.select().from(verification))[0].id).toBe("v-live");
  });
});
