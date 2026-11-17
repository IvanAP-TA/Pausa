import { and, asc, eq } from "drizzle-orm";
import { circle, circleMember, comment, list, listItem, log, logWatchedWith } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* Edit/delete of what people write. Every function checks ownership itself: the caller only passes who is acting. */

export type ContentError = "forbidden" | "not_found";

/** Only the author edits a log; "visto con" is replaced wholesale and limited to members of the Cerchia the log is edited from. */
export async function updateLog(
  db: AnyDb,
  input: { logId: string; actorId: string; circleId: string; watchedOn: string; rating: number | null; review: string | null; platform: string | null; containsSpoilers: boolean; watchedWith: string[] },
): Promise<{ ok: true } | { error: ContentError }> {
  const [row] = await db.select({ userId: log.userId }).from(log).where(eq(log.id, input.logId));
  if (!row) return { error: "not_found" };
  if (row.userId !== input.actorId) return { error: "forbidden" };
  const members = await db.select({ userId: circleMember.userId }).from(circleMember).where(eq(circleMember.circleId, input.circleId));
  const ids = new Set(members.map((m) => m.userId));
  const withIds = [...new Set(input.watchedWith)].filter((id) => id !== input.actorId && ids.has(id));
  await db.update(log).set({
    watchedOn: input.watchedOn, rating: input.rating, review: input.review, platform: input.platform, containsSpoilers: input.containsSpoilers,
  }).where(eq(log.id, input.logId));
  await db.delete(logWatchedWith).where(eq(logWatchedWith.logId, input.logId));
  if (withIds.length) await db.insert(logWatchedWith).values(withIds.map((userId) => ({ logId: input.logId, userId })));
  return { ok: true };
}

/** Comments, reactions and notices about the log go with it (ON DELETE CASCADE). */
export async function deleteLog(db: AnyDb, input: { logId: string; actorId: string }): Promise<{ ok: true } | { error: ContentError }> {
  const [row] = await db.select({ userId: log.userId }).from(log).where(eq(log.id, input.logId));
  if (!row) return { error: "not_found" };
  if (row.userId !== input.actorId) return { error: "forbidden" };
  await db.delete(log).where(eq(log.id, input.logId));
  return { ok: true };
}

export async function updateComment(db: AnyDb, input: { commentId: string; actorId: string; body: string; isSpoiler: boolean }): Promise<{ ok: true; logId: string } | { error: ContentError }> {
  const [row] = await db.select({ userId: comment.userId, logId: comment.logId }).from(comment).where(eq(comment.id, input.commentId));
  if (!row) return { error: "not_found" };
  if (row.userId !== input.actorId) return { error: "forbidden" };
  await db.update(comment).set({ body: input.body, isSpoiler: input.isSpoiler }).where(eq(comment.id, input.commentId));
  return { ok: true, logId: row.logId };
}

/** The author of a comment deletes it; so does the author of the log it sits under (their thread). */
export async function deleteComment(db: AnyDb, input: { commentId: string; actorId: string }): Promise<{ ok: true; logId: string } | { error: ContentError }> {
  const [row] = await db.select({ userId: comment.userId, logId: comment.logId, logAuthor: log.userId })
    .from(comment).innerJoin(log, eq(log.id, comment.logId)).where(eq(comment.id, input.commentId));
  if (!row) return { error: "not_found" };
  if (row.userId !== input.actorId && row.logAuthor !== input.actorId) return { error: "forbidden" };
  await db.delete(comment).where(eq(comment.id, input.commentId));
  return { ok: true, logId: row.logId };
}

/* ───────────── Cerchia profile ───────────── */

export async function renameCircle(db: AnyDb, input: { circleId: string; actorId: string; name: string }): Promise<{ ok: true } | { error: "forbidden" }> {
  const [me] = await db.select({ role: circleMember.role }).from(circleMember)
    .where(and(eq(circleMember.circleId, input.circleId), eq(circleMember.userId, input.actorId)));
  if (me?.role !== "admin") return { error: "forbidden" };
  await db.update(circle).set({ name: input.name }).where(eq(circle.id, input.circleId));
  return { ok: true };
}

/* ───────────── Lists ───────────── */

/** A group list is editable by any member of its Cerchia; a personal list only by its owner. */
async function canEditList(db: AnyDb, listId: string, actorId: string) {
  const [l] = await db.select({ circleId: list.circleId, ownerId: list.ownerId }).from(list).where(eq(list.id, listId));
  if (!l) return false;
  if (l.circleId) {
    const [m] = await db.select({ u: circleMember.userId }).from(circleMember).where(and(eq(circleMember.circleId, l.circleId), eq(circleMember.userId, actorId)));
    return Boolean(m);
  }
  return l.ownerId === actorId;
}

export async function removeListItem(db: AnyDb, input: { listId: string; mediaId: string; actorId: string }): Promise<{ ok: true } | { error: "forbidden" }> {
  if (!(await canEditList(db, input.listId, input.actorId))) return { error: "forbidden" };
  await db.delete(listItem).where(and(eq(listItem.listId, input.listId), eq(listItem.mediaId, input.mediaId)));
  await compactPositions(db, input.listId);
  return { ok: true };
}

/** Moves an item one step up or down and rewrites positions 0..n-1, so duplicated or gapped positions heal themselves. */
export async function moveListItem(db: AnyDb, input: { listId: string; mediaId: string; actorId: string; direction: "up" | "down" }): Promise<{ ok: true } | { error: "forbidden" }> {
  if (!(await canEditList(db, input.listId, input.actorId))) return { error: "forbidden" };
  const order = await itemOrder(db, input.listId);
  const from = order.indexOf(input.mediaId);
  const to = input.direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= order.length) return { ok: true };
  [order[from], order[to]] = [order[to], order[from]];
  await writePositions(db, input.listId, order);
  return { ok: true };
}

async function itemOrder(db: AnyDb, listId: string) {
  const rows = await db.select({ mediaId: listItem.mediaId }).from(listItem).where(eq(listItem.listId, listId)).orderBy(asc(listItem.position), asc(listItem.addedAt));
  return rows.map((r) => r.mediaId);
}

async function compactPositions(db: AnyDb, listId: string) {
  await writePositions(db, listId, await itemOrder(db, listId));
}

async function writePositions(db: AnyDb, listId: string, order: string[]) {
  for (const [position, mediaId] of order.entries()) {
    await db.update(listItem).set({ position }).where(and(eq(listItem.listId, listId), eq(listItem.mediaId, mediaId)));
  }
}

/** The owner deletes their list; any admin of the Cerchia may delete a group list. */
export async function deleteList(db: AnyDb, input: { listId: string; actorId: string }): Promise<{ ok: true } | { error: ContentError }> {
  const [l] = await db.select({ circleId: list.circleId, ownerId: list.ownerId }).from(list).where(eq(list.id, input.listId));
  if (!l) return { error: "not_found" };
  let allowed = l.ownerId === input.actorId;
  if (!allowed && l.circleId) {
    const [m] = await db.select({ role: circleMember.role }).from(circleMember).where(and(eq(circleMember.circleId, l.circleId), eq(circleMember.userId, input.actorId)));
    allowed = m?.role === "admin";
  }
  if (!allowed) return { error: "forbidden" };
  await db.delete(list).where(eq(list.id, input.listId));
  return { ok: true };
}

export async function renameList(db: AnyDb, input: { listId: string; actorId: string; name: string }): Promise<{ ok: true } | { error: "forbidden" }> {
  if (!(await canEditList(db, input.listId, input.actorId))) return { error: "forbidden" };
  await db.update(list).set({ name: input.name }).where(eq(list.id, input.listId));
  return { ok: true };
}
