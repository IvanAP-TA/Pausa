import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { circles, circleMembers, invites } from "@/db/schema";
import { newId } from "@/lib/id";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function validateInvite(
  inv: { expiresAt: Date | null; maxUses: number | null; uses: number },
  nowMs: number,
): { ok: boolean } {
  if (inv.expiresAt && inv.expiresAt.getTime() < nowMs) return { ok: false };
  if (inv.maxUses != null && inv.uses >= inv.maxUses) return { ok: false };
  return { ok: true };
}

export async function createCircle(db: Db, userId: string, name: string) {
  const circle = { id: newId(), name, createdBy: userId, createdAt: new Date() };
  await db.insert(circles).values(circle);
  await db.insert(circleMembers).values({
    circleId: circle.id, userId, role: "admin", joinedAt: new Date(),
  });
  return circle;
}

export async function createInvite(
  db: Db,
  circleId: string,
  userId: string,
  opts?: { expiresAt?: Date; maxUses?: number },
) {
  const invite = {
    id: newId(),
    circleId,
    code: generateInviteCode(),
    createdBy: userId,
    expiresAt: opts?.expiresAt ?? null,
    maxUses: opts?.maxUses ?? null,
    uses: 0,
  };
  await db.insert(invites).values(invite);
  return invite;
}

export async function joinByCode(db: Db, userId: string, code: string, nowMs: number) {
  const inv = await db.select().from(invites).where(eq(invites.code, code)).get();
  if (!inv) return { error: "NOT_FOUND" as const };
  if (!validateInvite(inv, nowMs).ok) return { error: "INVALID" as const };

  const already = await db
    .select()
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, inv.circleId), eq(circleMembers.userId, userId)))
    .get();

  if (!already) {
    await db.insert(circleMembers).values({
      circleId: inv.circleId, userId, role: "member", joinedAt: new Date(),
    });
    await db.update(invites).set({ uses: inv.uses + 1 }).where(eq(invites.id, inv.id));
  }
  return { circleId: inv.circleId };
}

export async function listMembers(db: Db, circleId: string) {
  return db.select().from(circleMembers).where(eq(circleMembers.circleId, circleId)).all();
}

export async function listCirclesForUser(db: Db, userId: string) {
  const rows = await db
    .select({ circle: circles })
    .from(circleMembers)
    .innerJoin(circles, eq(circles.id, circleMembers.circleId))
    .where(eq(circleMembers.userId, userId))
    .all();
  return rows.map((r) => r.circle);
}

export async function setRole(
  db: Db,
  circleId: string,
  actorId: string,
  targetId: string,
  role: "admin" | "member",
) {
  const actor = await db
    .select()
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, actorId)))
    .get();
  if (!actor || actor.role !== "admin") return { error: "FORBIDDEN" as const };
  await db
    .update(circleMembers)
    .set({ role })
    .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, targetId)));
  return { ok: true as const };
}
