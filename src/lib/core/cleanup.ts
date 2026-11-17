import { and, eq, lt, notInArray } from "drizzle-orm";
import { circleMember, session, user, verification } from "../../db/schema";
import type { AnyDb } from "./db-types";
import { pruneLimits } from "./limits";

/* Daily housekeeping, run by the Worker's cron trigger (worker.ts). Nothing here touches a real person's content:
 * it removes guests who never became members, and rows that are already expired. */

const DAY = 86_400_000;

export const GUEST_RETENTION_DAYS = 30;

export type CleanupReport = { guests: number; sessions: number; verifications: number };

/**
 * - Guests (anonymous accounts) older than 30 days that belong to no Cerchia. Their Serata seats and votes go with them
 *   (ON DELETE CASCADE); the Serata results and Cards stay. A guest who joined a Cerchia is a member and is kept.
 * - Sessions and sign-in links past their expiry.
 * - Rate-limit counters whose window ended long ago.
 */
export async function runCleanup(db: AnyDb, now = new Date()): Promise<CleanupReport> {
  const cutoff = new Date(now.getTime() - GUEST_RETENTION_DAYS * DAY);

  const members = db.select({ id: circleMember.userId }).from(circleMember);
  const guests = await db.delete(user)
    .where(and(eq(user.isAnonymous, true), lt(user.createdAt, cutoff), notInArray(user.id, members)))
    .returning({ id: user.id });

  const sessions = await db.delete(session).where(lt(session.expiresAt, now)).returning({ id: session.id });
  const verifications = await db.delete(verification).where(lt(verification.expiresAt, now)).returning({ id: verification.id });
  await pruneLimits(db, now);

  return { guests: guests.length, sessions: sessions.length, verifications: verifications.length };
}
