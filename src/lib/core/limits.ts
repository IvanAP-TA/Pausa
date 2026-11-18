import { eq, lt, sql } from "drizzle-orm";
import { rateLimit } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* Anti-spam for things people do inside the app (creating Cerchie, invites, comments...). Fixed windows, counted in D1 so
 * every Worker instance sees the same numbers; sign-in has its own limits in Better Auth (same table, other keys). */

export type Limit = { max: number; windowMs: number };

/** How many times one person may do each thing per window. Generous for real use, tight against scripts. */
export const LIMITS = {
  createCircle: { max: 5, windowMs: 3_600_000 },
  joinCircle: { max: 20, windowMs: 3_600_000 }, // also stops guessing invite codes
  createInvite: { max: 20, windowMs: 3_600_000 },
  createLog: { max: 60, windowMs: 3_600_000 },
  comment: { max: 60, windowMs: 3_600_000 },
  react: { max: 300, windowMs: 3_600_000 },
  createSerata: { max: 20, windowMs: 3_600_000 },
  search: { max: 120, windowMs: 3_600_000 }, // each one may call TMDB
  importRows: { max: 600, windowMs: 3_600_000 }, // one hit per chunk of ~20 titles: room for a history of ~12,000
  report: { max: 20, windowMs: 3_600_000 },
  shareLog: { max: 300, windowMs: 3_600_000 }, // adding imported titles to a group, one by one
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

/**
 * Counts one action. Returns whether it is allowed; a denied action is not counted again until the window rolls over.
 * Key = what + who ("act:comment:<userId>"), so one person's burst never blocks anyone else.
 */
export async function hit(db: AnyDb, name: LimitName, who: string, now = new Date()): Promise<{ allowed: boolean; remaining: number }> {
  const { max, windowMs } = LIMITS[name];
  const key = `act:${name}:${who}`;
  const t = now.getTime();

  // One statement: start a new window if the old one is over, otherwise count up (never past max + 1).
  await db.insert(rateLimit).values({ key, count: 1, lastRequest: t })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${t} - ${rateLimit.lastRequest} >= ${windowMs} then 1 when ${rateLimit.count} > ${max} then ${rateLimit.count} else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${t} - ${rateLimit.lastRequest} >= ${windowMs} then ${t} else ${rateLimit.lastRequest} end`,
      },
    });
  const [row] = await db.select({ count: rateLimit.count }).from(rateLimit).where(eq(rateLimit.key, key));
  const count = row?.count ?? 1;
  return { allowed: count <= max, remaining: Math.max(0, max - count) };
}

/** Drops counters whose window is long over (called by the daily cleanup). */
export async function pruneLimits(db: AnyDb, now = new Date(), olderThanMs = 2 * 86_400_000) {
  await db.delete(rateLimit).where(lt(rateLimit.lastRequest, now.getTime() - olderThanMs));
}
