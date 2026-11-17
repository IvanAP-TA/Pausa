import { and, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { circleMember, log, mediaEntity, mediaTitle, serata, user } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* What brings a Cerchia back: "a year ago" memories and the first-steps checklist. */

/** "MM-DD" for `base` shifted by `delta` days, computed on a fixed leap year so 29 Feb always exists. */
function monthDay(base: Date, delta: number) {
  const d = new Date(Date.UTC(2024, base.getUTCMonth(), base.getUTCDate() + delta));
  return d.toISOString().slice(5, 10);
}

export type Memory = {
  logId: string; mediaId: string; title: string; posterPath: string | null; kind: "movie" | "tv" | "anime";
  watchedOn: string; yearsAgo: number; rating: number | null; review: string | null; author: { id: string; name: string; image: string | null };
};

/**
 * Logs by members of this Cerchia watched on this calendar day (give or take `windowDays`) in earlier years.
 * Closest to today first, then the most recent year. Reviews are included: that is the point of a memory.
 */
export async function memoriesFor(db: AnyDb, circleId: string, today: Date, opts: { locale?: string; windowDays?: number; limit?: number } = {}): Promise<Memory[]> {
  const { locale = "it", windowDays = 3, limit = 3 } = opts;
  const days = Array.from({ length: windowDays * 2 + 1 }, (_, i) => monthDay(today, i - windowDays));
  const thisYear = today.getUTCFullYear();
  const title = sql<string>`coalesce((select ${mediaTitle.title} from ${mediaTitle} where ${mediaTitle.mediaId} = ${mediaEntity.id} and ${mediaTitle.locale} = ${locale}), ${mediaEntity.originalTitle})`;

  const rows = await db
    .select({
      logId: log.id, mediaId: mediaEntity.id, title, posterPath: mediaEntity.posterPath, kind: mediaEntity.kind,
      watchedOn: log.watchedOn, rating: log.rating, review: log.review,
      author: { id: user.id, name: user.name, image: user.image },
    })
    .from(log)
    .innerJoin(circleMember, and(eq(circleMember.userId, log.userId), eq(circleMember.circleId, circleId)))
    .innerJoin(user, eq(user.id, log.userId))
    .innerJoin(mediaEntity, eq(mediaEntity.id, log.mediaId))
    .where(and(inArray(sql<string>`substr(${log.watchedOn}, 6, 5)`, days), lt(sql<number>`cast(substr(${log.watchedOn}, 1, 4) as integer)`, thisYear)))
    .orderBy(desc(log.watchedOn))
    .limit(60);

  const distance = (md: string) => Math.abs(days.indexOf(md) - windowDays);
  return rows
    .map((r) => ({ ...r, yearsAgo: thisYear - Number(r.watchedOn.slice(0, 4)) }))
    .sort((a, b) => distance(a.watchedOn.slice(5)) - distance(b.watchedOn.slice(5)) || a.yearsAgo - b.yearsAgo)
    .slice(0, limit);
}

export type Onboarding = { hasLog: boolean; hasCompany: boolean; hasSerata: boolean; done: boolean };

/** Three first steps: log something, have someone else in the Cerchia, run a Serata. The checklist disappears when all are done. */
export async function onboardingFor(db: AnyDb, circleId: string, userId: string): Promise<Onboarding> {
  const [[mine], [members], [serate]] = await Promise.all([
    db.select({ n: count() }).from(log).where(eq(log.userId, userId)),
    db.select({ n: count() }).from(circleMember).where(eq(circleMember.circleId, circleId)),
    db.select({ n: count() }).from(serata).where(and(eq(serata.circleId, circleId), eq(serata.status, "done"))),
  ]);
  const hasLog = mine.n > 0;
  const hasCompany = members.n > 1;
  const hasSerata = serate.n > 0;
  return { hasLog, hasCompany, hasSerata, done: hasLog && hasCompany && hasSerata };
}
