import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { circle, circleMember, invite } from "../../db/schema";
import {
  DEFAULT_INVITE_MS, createCircleWithInvite, createInvite, getActiveInvite, inviteState, leaveCircle,
  FOUNDER_AT, listMembersWithRole, peopleBrought, redeemInvite, removeMember, revokeInvite, setMemberRole,
} from "./circles";
import type { AnyDb } from "./db-types";
import { createTestDb, seedUsers } from "./test-db";

const T0 = new Date("2026-11-16T10:00:00Z");
const DAY = 86_400_000;
const at = (ms: number) => new Date(T0.getTime() + ms);

let db: AnyDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob", "Cleo", "Dan"]);
});

describe("inviteState (pure)", () => {
  const base = { expiresAt: null, maxUses: null, uses: 0, revokedAt: null };
  it("active by default", () => expect(inviteState(base, T0)).toBe("active"));
  it("expired exactly at the deadline", () => {
    expect(inviteState({ ...base, expiresAt: at(1000) }, at(999))).toBe("active");
    expect(inviteState({ ...base, expiresAt: at(1000) }, at(1000))).toBe("expired");
  });
  it("exhausted when uses reach the limit", () => expect(inviteState({ ...base, maxUses: 2, uses: 2 }, T0)).toBe("exhausted"));
  it("revoked beats everything", () => expect(inviteState({ ...base, expiresAt: at(-1), revokedAt: T0 }, T0)).toBe("revoked"));
});

describe("creating a Cerchia", () => {
  it("makes the creator admin and issues a 14-day invite", async () => {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    expect(await listMembersWithRole(db, c.id)).toEqual([{ userId: "u-ann", role: "admin" }]);
    expect(c.invite.expiresAt?.getTime()).toBe(T0.getTime() + DEFAULT_INVITE_MS);
    expect(c.invite.maxUses).toBeNull();
  });
});

describe("redeeming an invite", () => {
  it("joins a member and counts the use", async () => {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    const res = await redeemInvite(db, "u-bob", c.invite.code.toLowerCase(), at(DAY));
    expect(res).toEqual({ circleId: c.id, already: false });
    const [row] = await db.select().from(invite).where(eq(invite.id, c.invite.id));
    expect(row.uses).toBe(1);
  });

  it("lets a member in again without spending a use, even after expiry", async () => {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    await redeemInvite(db, "u-bob", c.invite.code, at(DAY));
    const again = await redeemInvite(db, "u-bob", c.invite.code, at(30 * DAY));
    expect(again).toEqual({ circleId: c.id, already: true });
    const [row] = await db.select().from(invite).where(eq(invite.id, c.invite.id));
    expect(row.uses).toBe(1);
  });

  it("rejects unknown, expired, revoked and used-up invites", async () => {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    expect(await redeemInvite(db, "u-bob", "NOPE1234", T0)).toEqual({ error: "not_found" });
    expect(await redeemInvite(db, "u-bob", c.invite.code, at(15 * DAY))).toEqual({ error: "expired" });

    const limited = await createInvite(db, { circleId: c.id, createdBy: "u-ann", expiresInMs: null, maxUses: 1, now: T0 });
    expect(await redeemInvite(db, "u-bob", limited.code, T0)).toMatchObject({ already: false });
    expect(await redeemInvite(db, "u-cleo", limited.code, T0)).toEqual({ error: "exhausted" });

    const toRevoke = await createInvite(db, { circleId: c.id, createdBy: "u-ann", expiresInMs: null, maxUses: null, now: T0 });
    await revokeInvite(db, { inviteId: toRevoke.id, circleId: c.id, actorId: "u-ann", now: T0 });
    expect(await redeemInvite(db, "u-dan", toRevoke.code, T0)).toEqual({ error: "revoked" });
  });

  it("never lets two people spend the last use of a limited invite", async () => {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    const one = await createInvite(db, { circleId: c.id, createdBy: "u-ann", expiresInMs: null, maxUses: 1, now: T0 });
    const results = await Promise.all([redeemInvite(db, "u-bob", one.code, T0), redeemInvite(db, "u-cleo", one.code, T0)]);
    expect(results.filter((r) => "circleId" in r)).toHaveLength(1);
    expect((await listMembersWithRole(db, c.id)).length).toBe(2); // Ann + one of them
  });

  it("only admins can revoke", async () => {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    await redeemInvite(db, "u-bob", c.invite.code, T0);
    expect(await revokeInvite(db, { inviteId: c.invite.id, circleId: c.id, actorId: "u-bob" })).toEqual({ error: "forbidden" });
    expect(await getActiveInvite(db, c.id, T0)).not.toBeNull();
  });

  it("getActiveInvite returns the newest working invite", async () => {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    const newer = await createInvite(db, { circleId: c.id, createdBy: "u-ann", expiresInMs: 7 * DAY, maxUses: null, now: at(1000) });
    expect((await getActiveInvite(db, c.id, at(2000)))?.id).toBe(newer.id);
    expect(await getActiveInvite(db, c.id, at(20 * DAY))).toBeNull();
  });
});

describe("roles", () => {
  async function circleOf(...names: string[]) {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    for (const n of names) await redeemInvite(db, `u-${n}`, c.invite.code, T0);
    return c;
  }

  it("an admin can promote a member; a member cannot", async () => {
    const c = await circleOf("bob", "cleo");
    expect(await setMemberRole(db, { circleId: c.id, actorId: "u-bob", targetId: "u-cleo", role: "admin" })).toEqual({ error: "forbidden" });
    expect(await setMemberRole(db, { circleId: c.id, actorId: "u-ann", targetId: "u-bob", role: "admin" })).toEqual({ ok: true });
    expect((await listMembersWithRole(db, c.id)).find((m) => m.userId === "u-bob")?.role).toBe("admin");
  });

  it("the last admin cannot be demoted or leave while others remain", async () => {
    const c = await circleOf("bob");
    expect(await setMemberRole(db, { circleId: c.id, actorId: "u-ann", targetId: "u-ann", role: "member" })).toEqual({ error: "last_admin" });
    expect(await leaveCircle(db, { circleId: c.id, userId: "u-ann" })).toEqual({ error: "last_admin" });
    await setMemberRole(db, { circleId: c.id, actorId: "u-ann", targetId: "u-bob", role: "admin" });
    expect(await leaveCircle(db, { circleId: c.id, userId: "u-ann" })).toEqual({ ok: true, closed: false });
  });

  it("an admin can remove a member; a member cannot remove anyone", async () => {
    const c = await circleOf("bob", "cleo");
    expect(await removeMember(db, { circleId: c.id, actorId: "u-bob", targetId: "u-cleo" })).toEqual({ error: "forbidden" });
    expect(await removeMember(db, { circleId: c.id, actorId: "u-ann", targetId: "u-cleo" })).toEqual({ ok: true });
    expect((await listMembersWithRole(db, c.id)).map((m) => m.userId)).toEqual(["u-ann", "u-bob"]);
  });

  it("the last member leaving closes the Cerchia and its invites", async () => {
    const c = await createCircleWithInvite(db, { name: "Solo", createdBy: "u-ann", now: T0 });
    expect(await leaveCircle(db, { circleId: c.id, userId: "u-ann" })).toEqual({ ok: true, closed: true });
    expect(await db.select().from(circle).where(eq(circle.id, c.id))).toHaveLength(0);
    expect(await db.select().from(invite).where(eq(invite.circleId, c.id))).toHaveLength(0);
    expect(await db.select().from(circleMember).where(eq(circleMember.circleId, c.id))).toHaveLength(0);
  });
});

describe("peopleBrought", () => {
  it("counts the different people who joined through invites you created, not yourself, not people already in", async () => {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    expect(await peopleBrought(db, "u-ann")).toBe(0);
    await redeemInvite(db, "u-bob", c.invite.code, T0);
    await redeemInvite(db, "u-cleo", c.invite.code, T0);
    await redeemInvite(db, "u-bob", c.invite.code, T0); // same person again: still one
    await redeemInvite(db, "u-ann", c.invite.code, T0); // the creator opening her own link
    expect(await peopleBrought(db, "u-ann")).toBe(2);
    expect(await peopleBrought(db, "u-bob")).toBe(0);
    expect(FOUNDER_AT).toBe(3);
  });

  it("credits whoever created the invite, even if another admin shares the link", async () => {
    const c = await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann", now: T0 });
    await redeemInvite(db, "u-bob", c.invite.code, T0);
    await setMemberRole(db, { circleId: c.id, actorId: "u-ann", targetId: "u-bob", role: "admin" });
    const second = await createInvite(db, { circleId: c.id, createdBy: "u-bob", expiresInMs: null, maxUses: null, now: T0 });
    await redeemInvite(db, "u-dan", second.code, T0);
    expect(await peopleBrought(db, "u-bob")).toBe(1);
    expect(await peopleBrought(db, "u-ann")).toBe(1);
  });
});
