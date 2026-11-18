import { and, eq } from "drizzle-orm";
import { circleMember, log, logShare } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* Who reads a log: the author moves it between "every Cerchia I am in" and "only me", and publishes a private one in single
 * Cerchie. Every function checks ownership itself: the caller only passes who is acting. */

export type SharingError = "forbidden" | "not_found" | "not_member";
type Result = { ok: true } | { error: SharingError };

async function own(db: AnyDb, logId: string, actorId: string): Promise<{ scope: "circles" | "private" } | { error: SharingError }> {
  const [row] = await db.select({ userId: log.userId, scope: log.scope }).from(log).where(eq(log.id, logId));
  if (!row) return { error: "not_found" };
  if (row.userId !== actorId) return { error: "forbidden" };
  return { scope: row.scope };
}

/** Publishes one of the author's logs in a Cerchia they belong to. A log already open to every Cerchia needs nothing. */
export async function shareLog(db: AnyDb, input: { logId: string; circleId: string; actorId: string; at?: Date }): Promise<Result> {
  const mine = await own(db, input.logId, input.actorId);
  if ("error" in mine) return mine;
  const [member] = await db.select({ userId: circleMember.userId }).from(circleMember)
    .where(and(eq(circleMember.circleId, input.circleId), eq(circleMember.userId, input.actorId)));
  if (!member) return { error: "not_member" };
  if (mine.scope === "circles") return { ok: true };
  await db.insert(logShare).values({ logId: input.logId, circleId: input.circleId, ...(input.at ? { createdAt: input.at } : {}) }).onConflictDoNothing();
  return { ok: true };
}

export async function unshareLog(db: AnyDb, input: { logId: string; circleId: string; actorId: string }): Promise<Result> {
  const mine = await own(db, input.logId, input.actorId);
  if ("error" in mine) return mine;
  await db.delete(logShare).where(and(eq(logShare.logId, input.logId), eq(logShare.circleId, input.circleId)));
  return { ok: true };
}

/** "private": out of every Cerchia (shares are dropped too). "circles": back in all of the author's Cerchie. */
export async function setLogScope(db: AnyDb, input: { logId: string; actorId: string; scope: "circles" | "private" }): Promise<Result> {
  const mine = await own(db, input.logId, input.actorId);
  if ("error" in mine) return mine;
  await db.update(log).set({ scope: input.scope }).where(eq(log.id, input.logId));
  await db.delete(logShare).where(eq(logShare.logId, input.logId));
  return { ok: true };
}
