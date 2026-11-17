import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { circle, circleMember, comment, log, mediaEntity, report, user } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* Reports: any member can flag a comment or a log; the operators (ADMIN_EMAILS) look at the open ones and either dismiss
 * the report or remove the content. Nothing is hidden automatically: a report is a request for a human to look. */

export type ReportReason = "spam" | "abuse" | "privacy" | "other";
export const REPORT_REASONS: ReportReason[] = ["spam", "abuse", "privacy", "other"];

const clip = (s: string | null | undefined, n = 280) => (s && s.length > n ? s.slice(0, n - 1) + "…" : (s ?? null));

/** The Cerchie two people both belong to. A reporter may only flag content from someone they share a Cerchia with. */
async function sharedCircle(db: AnyDb, a: string, b: string) {
  const mine = await db.select({ id: circleMember.circleId }).from(circleMember).where(eq(circleMember.userId, a));
  if (mine.length === 0) return null;
  const [hit] = await db.select({ id: circleMember.circleId }).from(circleMember)
    .where(and(eq(circleMember.userId, b), inArray(circleMember.circleId, mine.map((m) => m.id)))).limit(1);
  return hit?.id ?? null;
}

export async function createReport(
  db: AnyDb,
  input: { reporterId: string; kind: "comment" | "log"; targetId: string; reason: ReportReason; note?: string | null },
): Promise<{ ok: true } | { error: "not_found" | "own" }> {
  let authorId: string | undefined;
  let excerpt: string | null = null;
  if (input.kind === "comment") {
    const [c] = await db.select({ userId: comment.userId, body: comment.body, logAuthor: log.userId })
      .from(comment).innerJoin(log, eq(log.id, comment.logId)).where(eq(comment.id, input.targetId));
    // The reporter must be able to see the thread: they share a Cerchia with the log's author.
    if (c && (c.logAuthor === input.reporterId || (await sharedCircle(db, input.reporterId, c.logAuthor)))) { authorId = c.userId; excerpt = c.body; }
  } else {
    const [l] = await db.select({ userId: log.userId, review: log.review, title: mediaEntity.originalTitle })
      .from(log).innerJoin(mediaEntity, eq(mediaEntity.id, log.mediaId)).where(eq(log.id, input.targetId));
    if (l && (l.userId === input.reporterId || (await sharedCircle(db, input.reporterId, l.userId)))) { authorId = l.userId; excerpt = l.review ? `${l.title}: ${l.review}` : l.title; }
  }
  if (!authorId) return { error: "not_found" };
  if (authorId === input.reporterId) return { error: "own" };

  const circleId = await sharedCircle(db, input.reporterId, authorId);
  await db.insert(report).values({
    reporterId: input.reporterId, kind: input.kind, targetId: input.targetId, circleId, reason: input.reason,
    note: clip(input.note, 500), excerpt: clip(excerpt),
  }).onConflictDoNothing(); // the same person reporting the same thing twice is one report
  return { ok: true };
}

export async function openReports(db: AnyDb) {
  const rows = await db.select({
    id: report.id, kind: report.kind, targetId: report.targetId, reason: report.reason, note: report.note, excerpt: report.excerpt,
    createdAt: report.createdAt, reporter: user.name, circleName: circle.name,
  }).from(report).leftJoin(user, eq(user.id, report.reporterId)).leftJoin(circle, eq(circle.id, report.circleId))
    .where(isNull(report.resolvedAt)).orderBy(asc(report.createdAt));
  return rows;
}

export async function recentlyResolved(db: AnyDb, limit = 20) {
  return db.select({ id: report.id, kind: report.kind, excerpt: report.excerpt, resolution: report.resolution, resolvedAt: report.resolvedAt })
    .from(report).where(inArray(report.resolution, ["dismissed", "removed"])).orderBy(desc(report.resolvedAt)).limit(limit);
}

/** Dismiss keeps the content; remove deletes it (a log takes its comments and reactions with it). Every open report on the same item closes together. */
export async function resolveReport(db: AnyDb, input: { reportId: string; action: "dismiss" | "remove"; now?: Date }): Promise<{ ok: true } | { error: "not_found" }> {
  const [r] = await db.select().from(report).where(eq(report.id, input.reportId));
  if (!r || r.resolvedAt) return { error: "not_found" };
  if (input.action === "remove") {
    if (r.kind === "comment") await db.delete(comment).where(eq(comment.id, r.targetId));
    else await db.delete(log).where(eq(log.id, r.targetId));
  }
  await db.update(report).set({ resolvedAt: input.now ?? new Date(), resolution: input.action === "remove" ? "removed" : "dismissed" })
    .where(and(eq(report.kind, r.kind), eq(report.targetId, r.targetId), isNull(report.resolvedAt)));
  return { ok: true };
}
