import { and, eq, inArray } from "drizzle-orm";
import { circle, circleMember, notificationOff, user } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* Who gets told what. Three layers, all default-on: the Cerchia's admin can switch "live watching" off for everybody, each
 * person can mute a Cerchia or hide its live watching, and each person can switch a whole kind of notice off. */

export const NOTIFICATION_TYPES = ["log", "comment", "reaction", "now_watching", "serata_invite", "circle_join"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const isNotificationType = (v: unknown): v is NotificationType => (NOTIFICATION_TYPES as readonly unknown[]).includes(v);

/** Preset covers for a Cerchia (an emoji on a colour). Fixed list: nothing to upload, host or moderate. */
export const COVERS = ["popcorn", "clapper", "moon", "sofa", "star", "ghost", "rocket", "heart"] as const;
export type Cover = (typeof COVERS)[number];
export const COVER_GLYPH: Record<Cover, string> = { popcorn: "🍿", clapper: "🎬", moon: "🌙", sofa: "🛋️", star: "⭐", ghost: "👻", rocket: "🚀", heart: "❤️" };
export const isCover = (v: unknown): v is Cover => (COVERS as readonly unknown[]).includes(v);

export type CircleSettings = { liveWatching: boolean; description: string | null; cover: Cover | null; muted: boolean; hideWatching: boolean; role: "admin" | "member" };

export async function getCircleSettings(db: AnyDb, circleId: string, userId: string): Promise<CircleSettings | null> {
  const [row] = await db.select({
    liveWatching: circle.liveWatching, description: circle.description, cover: circle.cover,
    muted: circleMember.muted, hideWatching: circleMember.hideWatching, role: circleMember.role,
  }).from(circle).innerJoin(circleMember, and(eq(circleMember.circleId, circle.id), eq(circleMember.userId, userId))).where(eq(circle.id, circleId));
  return row ? { ...row, cover: isCover(row.cover) ? row.cover : null } : null;
}

async function isAdmin(db: AnyDb, circleId: string, userId: string) {
  const [m] = await db.select({ role: circleMember.role }).from(circleMember).where(and(eq(circleMember.circleId, circleId), eq(circleMember.userId, userId)));
  return m?.role === "admin";
}

/** Admin only: "X is watching episode N" for the whole Cerchia. */
export async function setLiveWatching(db: AnyDb, input: { circleId: string; actorId: string; enabled: boolean }): Promise<{ ok: true } | { error: "forbidden" }> {
  if (!(await isAdmin(db, input.circleId, input.actorId))) return { error: "forbidden" };
  await db.update(circle).set({ liveWatching: input.enabled }).where(eq(circle.id, input.circleId));
  return { ok: true };
}

/** Admin only: description (up to 280 characters) and one of the preset covers. */
export async function setCircleProfile(db: AnyDb, input: { circleId: string; actorId: string; description: string | null; cover: string | null }): Promise<{ ok: true } | { error: "forbidden" | "invalid" }> {
  if (!(await isAdmin(db, input.circleId, input.actorId))) return { error: "forbidden" };
  if (input.cover !== null && !isCover(input.cover)) return { error: "invalid" };
  const description = input.description?.trim() ? input.description.trim().slice(0, 280) : null;
  await db.update(circle).set({ description, cover: input.cover }).where(eq(circle.id, input.circleId));
  return { ok: true };
}

/** Personal switches for one Cerchia. */
export async function setMemberPrefs(db: AnyDb, input: { circleId: string; userId: string; muted: boolean; hideWatching: boolean }): Promise<{ ok: true } | { error: "not_member" }> {
  const done = await db.update(circleMember).set({ muted: input.muted, hideWatching: input.hideWatching })
    .where(and(eq(circleMember.circleId, input.circleId), eq(circleMember.userId, input.userId))).returning({ u: circleMember.userId });
  return done.length ? { ok: true } : { error: "not_member" };
}

export async function getDisabledTypes(db: AnyDb, userId: string): Promise<Set<NotificationType>> {
  const rows = await db.select({ type: notificationOff.type }).from(notificationOff).where(eq(notificationOff.userId, userId));
  return new Set(rows.map((r) => r.type).filter(isNotificationType));
}

/** Replaces the person's set of switched-off types in one go (what a settings form submits). */
export async function setDisabledTypes(db: AnyDb, userId: string, off: NotificationType[]) {
  await db.delete(notificationOff).where(eq(notificationOff.userId, userId));
  const unique = [...new Set(off.filter(isNotificationType))];
  if (unique.length) await db.insert(notificationOff).values(unique.map((type) => ({ userId, type })));
}

export async function setEmailDigest(db: AnyDb, userId: string, enabled: boolean, locale?: string) {
  // The digest is written in the language the person had selected when they turned it on.
  await db.update(user).set({ emailDigest: enabled, ...(enabled && locale && ["it", "en", "es"].includes(locale) ? { locale } : {}) }).where(eq(user.id, userId));
}

/**
 * Of the people who would be told, those who actually should be: not muting this Cerchia, not having switched this kind of
 * notice off, and (for live watching) neither the Cerchia nor the person has it hidden. With no `circleId` only the per-type
 * switch applies (e.g. a reaction on a log carries no Cerchia).
 */
export async function filterRecipients(db: AnyDb, userIds: string[], input: { type: NotificationType; circleId?: string | null }): Promise<string[]> {
  if (userIds.length === 0) return [];
  let allowed = userIds;

  if (input.circleId) {
    const [c] = await db.select({ live: circle.liveWatching }).from(circle).where(eq(circle.id, input.circleId));
    if (input.type === "now_watching" && c && !c.live) return [];
    const members = await db.select({ userId: circleMember.userId, muted: circleMember.muted, hideWatching: circleMember.hideWatching })
      .from(circleMember).where(and(eq(circleMember.circleId, input.circleId), inArray(circleMember.userId, allowed)));
    const byId = new Map(members.map((m) => [m.userId, m]));
    allowed = allowed.filter((id) => {
      const m = byId.get(id);
      if (!m) return true; // not a member of this Cerchia (e.g. the author of a log commented from another one): the type switch decides
      return !m.muted && !(input.type === "now_watching" && m.hideWatching);
    });
  }
  if (allowed.length === 0) return [];

  const off = await db.select({ userId: notificationOff.userId }).from(notificationOff)
    .where(and(inArray(notificationOff.userId, allowed), eq(notificationOff.type, input.type)));
  const offSet = new Set(off.map((o) => o.userId));
  return allowed.filter((id) => !offSet.has(id));
}
