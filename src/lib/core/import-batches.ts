/* The runs of the import screen (import_batch), and undoing where one of them landed.
 *
 * An import is private by nature; when the person picked a Cerchia as its destination, each viewing was also shared with
 * that Cerchia and each list was created as a group list. "Taking an import out of a Cerchia" reverses exactly that and
 * nothing else: the shares this run made are dropped and the lists it created become personal. The viewings stay in the
 * person's own space, and anything shared by hand, or by another import, is left alone. */

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
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
