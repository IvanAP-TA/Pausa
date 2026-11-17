import { and, asc, count, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { circle, circleMember, invite, inviteUse } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* ───────────── Invites ───────────── */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function newInviteCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const EXPIRY_CHOICES = { "1d": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, never: null } as const;
export type ExpiryChoice = keyof typeof EXPIRY_CHOICES;
/** A new Cerchia starts with a 14-day invite: a link left in a group chat shouldn't be a door that never closes. */
export const DEFAULT_INVITE_MS = 14 * 86_400_000;
export const MAX_USES_CHOICES = [1, 5, 10, 25] as const;

export type InviteRow = typeof invite.$inferSelect;
export type InviteState = "active" | "expired" | "exhausted" | "revoked";

/** Pure: why an invite can or can't be used right now. Revoked wins, then expired, then used up. */
export function inviteState(inv: Pick<InviteRow, "expiresAt" | "maxUses" | "uses" | "revokedAt">, now: Date): InviteState {
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt && inv.expiresAt.getTime() <= now.getTime()) return "expired";
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return "exhausted";
  return "active";
}

export async function createInvite(
  db: AnyDb,
  input: { circleId: string; createdBy: string; expiresInMs: number | null; maxUses: number | null; now?: Date },
) {
  const now = input.now ?? new Date();
  const row = {
    id: crypto.randomUUID(),
    circleId: input.circleId,
    code: newInviteCode(),
    createdBy: input.createdBy,
    expiresAt: input.expiresInMs === null ? null : new Date(now.getTime() + input.expiresInMs),
    maxUses: input.maxUses,
    uses: 0,
    revokedAt: null,
    createdAt: now,
  };
  await db.insert(invite).values(row);
  return row;
}

export async function listInvites(db: AnyDb, circleId: string, now = new Date()) {
  const rows = await db.select().from(invite).where(eq(invite.circleId, circleId)).orderBy(desc(invite.createdAt));
  return rows.map((r) => ({ ...r, state: inviteState(r, now) }));
}

/** The newest invite that still works, if any. Used where an invite is offered automatically (after a Serata). */
export async function getActiveInvite(db: AnyDb, circleId: string, now = new Date()) {
  const rows = await listInvites(db, circleId, now);
  return rows.find((r) => r.state === "active") ?? null;
}

async function memberRole(db: AnyDb, circleId: string, userId: string) {
  const [row] = await db.select({ role: circleMember.role }).from(circleMember)
    .where(and(eq(circleMember.circleId, circleId), eq(circleMember.userId, userId)));
  return row?.role ?? null;
}

export type CircleError = "forbidden" | "last_admin" | "not_member";

export async function revokeInvite(db: AnyDb, input: { inviteId: string; circleId: string; actorId: string; now?: Date }) {
  if ((await memberRole(db, input.circleId, input.actorId)) !== "admin") return { error: "forbidden" as const };
  await db.update(invite).set({ revokedAt: input.now ?? new Date() })
    .where(and(eq(invite.id, input.inviteId), eq(invite.circleId, input.circleId), isNull(invite.revokedAt)));
  return { ok: true as const };
}

export type RedeemResult = { circleId: string; already: boolean } | { error: "not_found" | Exclude<InviteState, "active"> };

/**
 * Joins `userId` to the Cerchia behind `code`. The use is reserved with one conditional UPDATE, so two people
 * redeeming the last use of a limited invite can't both get in. Someone already in the Cerchia is let through
 * without spending a use, even if the invite has since expired.
 */
export async function redeemInvite(db: AnyDb, userId: string, rawCode: string, now = new Date()): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();
  const [inv] = await db.select().from(invite).where(eq(invite.code, code));
  if (!inv) return { error: "not_found" };
  if (await memberRole(db, inv.circleId, userId)) return { circleId: inv.circleId, already: true };

  const state = inviteState(inv, now);
  if (state !== "active") return { error: state };

  const reserved = await db.update(invite).set({ uses: sql`${invite.uses} + 1` })
    .where(and(
      eq(invite.id, inv.id),
      isNull(invite.revokedAt),
      or(isNull(invite.maxUses), lt(invite.uses, invite.maxUses)),
      or(isNull(invite.expiresAt), gt(invite.expiresAt, now)),
    ))
    .returning({ id: invite.id });
  if (reserved.length === 0) return { error: "exhausted" };

  await db.insert(circleMember).values({ circleId: inv.circleId, userId, role: "member" }).onConflictDoNothing();
  await db.insert(inviteUse).values({ inviteId: inv.id, userId }).onConflictDoNothing();
  return { circleId: inv.circleId, already: false };
}

/* ───────────── Circles and roles ───────────── */

/** For the join page: what this code is, without spending it. */
export async function peekInvite(db: AnyDb, rawCode: string, now = new Date()) {
  const [row] = await db.select({ inv: invite, circleName: circle.name }).from(invite)
    .innerJoin(circle, eq(circle.id, invite.circleId)).where(eq(invite.code, rawCode.trim().toUpperCase()));
  return row ? { circleId: row.inv.circleId, circleName: row.circleName, state: inviteState(row.inv, now) } : null;
}

/** Creates a Cerchia with its creator as admin and a first 14-day invite. */
export async function createCircleWithInvite(db: AnyDb, input: { name: string; createdBy: string; now?: Date }) {
  const id = crypto.randomUUID();
  await db.insert(circle).values({ id, name: input.name, createdBy: input.createdBy });
  await db.insert(circleMember).values({ circleId: id, userId: input.createdBy, role: "admin" });
  const first = await createInvite(db, { circleId: id, createdBy: input.createdBy, expiresInMs: DEFAULT_INVITE_MS, maxUses: null, now: input.now });
  return { id, invite: first };
}

async function adminCount(db: AnyDb, circleId: string) {
  const [row] = await db.select({ n: count() }).from(circleMember)
    .where(and(eq(circleMember.circleId, circleId), eq(circleMember.role, "admin")));
  return row?.n ?? 0;
}

/** Admin-only. The last admin can't be demoted: a Cerchia always keeps someone who can manage it. */
export async function setMemberRole(db: AnyDb, input: { circleId: string; actorId: string; targetId: string; role: "admin" | "member" }) {
  if ((await memberRole(db, input.circleId, input.actorId)) !== "admin") return { error: "forbidden" as const };
  const current = await memberRole(db, input.circleId, input.targetId);
  if (!current) return { error: "not_member" as const };
  if (current === "admin" && input.role === "member" && (await adminCount(db, input.circleId)) <= 1) {
    return { error: "last_admin" as const };
  }
  await db.update(circleMember).set({ role: input.role })
    .where(and(eq(circleMember.circleId, input.circleId), eq(circleMember.userId, input.targetId)));
  return { ok: true as const };
}

/** Admin removes someone else. (To leave yourself, use leaveCircle.) */
export async function removeMember(db: AnyDb, input: { circleId: string; actorId: string; targetId: string }) {
  if (input.actorId === input.targetId) return leaveCircle(db, { circleId: input.circleId, userId: input.actorId });
  if ((await memberRole(db, input.circleId, input.actorId)) !== "admin") return { error: "forbidden" as const };
  if (!(await memberRole(db, input.circleId, input.targetId))) return { error: "not_member" as const };
  await db.delete(circleMember).where(and(eq(circleMember.circleId, input.circleId), eq(circleMember.userId, input.targetId)));
  return { ok: true as const };
}

/**
 * Leaving. The last admin can't leave while others remain (promote someone first). The last member leaving
 * closes the Cerchia: with nobody in it, it can't be reached anyway.
 */
export async function leaveCircle(db: AnyDb, input: { circleId: string; userId: string }) {
  const role = await memberRole(db, input.circleId, input.userId);
  if (!role) return { error: "not_member" as const };
  const [{ n: members }] = await db.select({ n: count() }).from(circleMember).where(eq(circleMember.circleId, input.circleId));
  if (members <= 1) {
    await db.delete(circle).where(eq(circle.id, input.circleId)); // members + invites cascade
    return { ok: true as const, closed: true };
  }
  if (role === "admin" && (await adminCount(db, input.circleId)) <= 1) return { error: "last_admin" as const };
  await db.delete(circleMember).where(and(eq(circleMember.circleId, input.circleId), eq(circleMember.userId, input.userId)));
  return { ok: true as const, closed: false };
}

export async function listMembersWithRole(db: AnyDb, circleId: string) {
  return db.select({ userId: circleMember.userId, role: circleMember.role }).from(circleMember)
    .where(eq(circleMember.circleId, circleId)).orderBy(asc(circleMember.joinedAt));
}

/**
 * An admin closes the Cerchia for everyone. Members, invites and group lists go with it (ON DELETE CASCADE); each person's own
 * logs stay theirs (a log belongs to its author, not to a Cerchia); Serate keep their result but lose the Cerchia link.
 */
export async function deleteCircle(db: AnyDb, input: { circleId: string; actorId: string }) {
  const role = await memberRole(db, input.circleId, input.actorId);
  if (role !== "admin") return { error: "forbidden" as const };
  await db.delete(circle).where(eq(circle.id, input.circleId));
  return { ok: true as const };
}

/** How many different people joined Pausa through invites this person created (themselves excluded). */
export async function peopleBrought(db: AnyDb, userId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(distinct ${inviteUse.userId})` }).from(inviteUse)
    .innerJoin(invite, eq(invite.id, inviteUse.inviteId))
    .where(and(eq(invite.createdBy, userId), sql`${inviteUse.userId} <> ${userId}`));
  return row?.n ?? 0;
}

/** Three friends brought in makes someone a Fondatore: a badge, nothing more (Pausa has no paid tier to unlock). */
export const FOUNDER_AT = 3;
