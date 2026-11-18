/* The runs of the import screen (import_batch), and undoing where one of them landed.
 *
 * An import is private by nature; when the person picked a Cerchia as its destination, each viewing was also shared with
 * that Cerchia and each list was created as a group list. "Taking an import out of a Cerchia" reverses exactly that and
 * nothing else: the shares this run made are dropped and the lists it created become personal. The viewings stay in the
 * person's own space, and anything shared by hand, or by another import, is left alone. */

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { circle, circleMember, importBatch, list, log, logShare } from "../../db/schema";
import type { AnyDb } from "./db-types";
import type { ImportSource } from "./import-parsers";

export type BatchError = "not_found" | "not_member";

/** Opens a run. With a Cerchia as destination, the person must belong to it. */
export async function createImportBatch(db: AnyDb, input: { userId: string; source: ImportSource; circleId: string | null }): Promise<{ id: string } | { error: BatchError }> {
  if (input.circleId) {
    const [member] = await db.select({ userId: circleMember.userId }).from(circleMember)
      .where(and(eq(circleMember.circleId, input.circleId), eq(circleMember.userId, input.userId)));
    if (!member) return { error: "not_member" };
  }
  const id = crypto.randomUUID();
  await db.insert(importBatch).values({ id, userId: input.userId, source: input.source, circleId: input.circleId });
  return { id };
}

/** The run, only for the person who started it, and its destination only while they still belong to that Cerchia. */
export async function getImportBatch(db: AnyDb, userId: string, batchId: string) {
  const [row] = await db
    .select({ id: importBatch.id, source: importBatch.source, circleId: importBatch.circleId, member: circleMember.userId })
    .from(importBatch)
    .leftJoin(circleMember, and(eq(circleMember.circleId, importBatch.circleId), eq(circleMember.userId, importBatch.userId)))
    .where(and(eq(importBatch.id, batchId), eq(importBatch.userId, userId)));
  if (!row) return null;
  return { id: row.id, source: row.source, circleId: row.circleId && row.member ? row.circleId : null, left: Boolean(row.circleId && !row.member) };
}

export type ImportBatchSummary = {
  id: string; source: ImportSource; createdAt: Date;
  circle: { id: string; name: string } | null;
  logs: number; // viewings this run added to the person's space
  inCircle: number; // viewings this run put in its Cerchia that are still there
  listsInCircle: number; // group lists this run created that are still group lists
};

/** The person's runs, newest first; runs that brought nothing in (stopped at once, or everything was already there) are left out. */
export async function listImportBatches(db: AnyDb, userId: string, limit = 50): Promise<ImportBatchSummary[]> {
  const rows = await db
    .select({
      id: importBatch.id, source: importBatch.source, createdAt: importBatch.createdAt,
      circleId: circle.id, circleName: circle.name,
      logs: sql<number>`(select count(*) from ${log} where ${log.importBatchId} = ${importBatch.id})`,
      inCircle: sql<number>`(select count(*) from ${logShare} where ${logShare.importBatchId} = ${importBatch.id})`,
      listsInCircle: sql<number>`(select count(*) from ${list} where ${list.importBatchId} = ${importBatch.id} and ${list.circleId} is not null)`,
    })
    .from(importBatch)
    .leftJoin(circle, eq(circle.id, importBatch.circleId))
    .where(eq(importBatch.userId, userId))
    .orderBy(desc(importBatch.createdAt), desc(importBatch.id))
    .limit(limit);
  return rows
    .filter((r) => r.logs + r.inCircle + r.listsInCircle > 0)
    .map((r) => ({
      id: r.id, source: r.source, createdAt: r.createdAt,
      circle: r.circleId && r.circleName ? { id: r.circleId, name: r.circleName } : null,
      logs: r.logs, inCircle: r.inCircle, listsInCircle: r.listsInCircle,
    }));
}

/**
 * Takes a run out of the Cerchia it went to: its shares are dropped, the group lists it created become personal lists.
 * Works on what the run itself did (rows carrying its id), so it is safe to call twice and never touches anything else.
 */
export async function removeImportFromCircle(db: AnyDb, input: { userId: string; batchId: string }): Promise<{ removed: number; lists: number } | { error: BatchError }> {
  const [batch] = await db.select({ id: importBatch.id }).from(importBatch)
    .where(and(eq(importBatch.id, input.batchId), eq(importBatch.userId, input.userId)));
  if (!batch) return { error: "not_found" };

  const [{ n: removed }] = await db.select({ n: sql<number>`count(*)` }).from(logShare).where(eq(logShare.importBatchId, batch.id));
  const groupLists = and(eq(list.importBatchId, batch.id), eq(list.ownerId, input.userId), isNotNull(list.circleId));
  const [{ n: lists }] = await db.select({ n: sql<number>`count(*)` }).from(list).where(groupLists);

  await db.delete(logShare).where(eq(logShare.importBatchId, batch.id));
  await db.update(list).set({ circleId: null }).where(groupLists);
  return { removed, lists };
}

/**
 * Deletes the viewings one run added, for good (their comments and reactions go with them). Only logs carrying the run's
 * id and written by its owner: viewings the person already had, or logged by hand, are not touched. Lists stay.
 */
export async function deleteImportLogs(db: AnyDb, input: { userId: string; batchId: string }): Promise<{ deleted: number } | { error: BatchError }> {
  const [batch] = await db.select({ id: importBatch.id }).from(importBatch)
    .where(and(eq(importBatch.id, input.batchId), eq(importBatch.userId, input.userId)));
  if (!batch) return { error: "not_found" };
  const mine = and(eq(log.importBatchId, batch.id), eq(log.userId, input.userId));
  const [{ n: deleted }] = await db.select({ n: sql<number>`count(*)` }).from(log).where(mine);
  await db.delete(log).where(mine);
  return { deleted };
}

/* ───────────── Before runs were tracked ─────────────
 * Older imports left no mark on their logs, and the oldest ones are open to every Cerchia. What still gives them away is
 * that they were all written on the same day: a day (UTC) on which the person added BULK_MIN or more viewings without a
 * run is offered as one block, to hide from the Cerchie or delete together. */

export const BULK_MIN = 10;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = sql<string>`date(${log.createdAt} / 1000, 'unixepoch')`;
const shownSomewhere = sql`(${log.scope} = 'circles' or exists (select 1 from ${logShare} where ${logShare.logId} = ${log.id}))`;
const untracked = (userId: string, day: string) => and(eq(log.userId, userId), isNull(log.importBatchId), sql`${dayOf} = ${day}`);

export type BulkDay = { day: string; logs: number; inCircles: number };

/** The person's bulk days, newest first. `inCircles`: how many of those viewings a Cerchia can still see. */
export async function listBulkDays(db: AnyDb, userId: string): Promise<BulkDay[]> {
  const rows = await db
    .select({ day: dayOf, logs: sql<number>`count(*)`, inCircles: sql<number>`coalesce(sum(case when ${shownSomewhere} then 1 else 0 end), 0)` })
    .from(log)
    .where(and(eq(log.userId, userId), isNull(log.importBatchId)))
    .groupBy(dayOf)
    .having(sql`count(*) >= ${BULK_MIN}`)
    .orderBy(desc(dayOf));
  return rows.map((r) => ({ day: r.day, logs: Number(r.logs), inCircles: Number(r.inCircles) }));
}

async function bulkDay(db: AnyDb, userId: string, day: string) {
  if (!DAY.test(day)) return null;
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(log).where(untracked(userId, day));
  return n >= BULK_MIN ? n : null; // a day with a few hand-written logs is not a block: use the single buttons
}

/** Takes a bulk day out of every Cerchia: its viewings become private and their shares are dropped. Nothing is deleted. */
export async function hideBulkDay(db: AnyDb, input: { userId: string; day: string }): Promise<{ removed: number } | { error: BatchError }> {
  if ((await bulkDay(db, input.userId, input.day)) === null) return { error: "not_found" };
  const these = untracked(input.userId, input.day);
  const [{ n: removed }] = await db.select({ n: sql<number>`count(*)` }).from(log).where(and(these, shownSomewhere));
  await db.delete(logShare).where(inArray(logShare.logId, db.select({ id: log.id }).from(log).where(these)));
  await db.update(log).set({ scope: "private" }).where(these);
  return { removed };
}

/** Deletes every viewing of a bulk day, for good. */
export async function deleteBulkDay(db: AnyDb, input: { userId: string; day: string }): Promise<{ deleted: number } | { error: BatchError }> {
  const deleted = await bulkDay(db, input.userId, input.day);
  if (deleted === null) return { error: "not_found" };
  await db.delete(log).where(untracked(input.userId, input.day));
  return { deleted };
}
