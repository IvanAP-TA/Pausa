import { eq } from "drizzle-orm";
import { circle, circleMember, event, list, log, nowWatching, notification, serata, user } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* Early success metrics (master prompt §10), computed from what the database already holds plus the few `event` rows.
 * Reading whole tables is fine at this size; when a table has hundreds of thousands of rows, move these to SQL aggregates. */

const DAY = 86_400_000;
const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ratio = (num: number, den: number) => (den === 0 ? null : num / den);

export type Metrics = {
  generatedAt: Date;
  /** Of people who signed up in the window: share who created or joined a Cerchia within 7 days of signing up. */
  circleWithin7d: { rate: number | null; cohort: number };
  /** Average logs per Cerchia per week, over Cerchie that logged something that week (last 4 full weeks). */
  logsPerActiveCircleWeek: number | null;
  /** Share of Cerchie with at least one group list. */
  circlesUsingLists: { rate: number | null; circles: number };
  /** Seconds from opening a Serata to its result: the median, and the share that finished in under 120 s. */
  serataTime: { medianSeconds: number | null; under120: number | null; finished: number };
  /** Share of finished Serate whose Card or link was shared at least once. */
  serataShared: { cardRate: number | null; inviteRate: number | null; finished: number };
  /** Share of Cerchie (old enough to be measured) with activity in the week that starts 7 / 30 days after creation. */
  retention: { d7: { rate: number | null; eligible: number }; d30: { rate: number | null; eligible: number } };
  /** Share of people (members of a Cerchia) who have ever used "Sto guardando". */
  nowWatchingAdoption: { rate: number | null; people: number };
  totals: { users: number; circles: number; logs: number; serate: number };
};

export async function computeMetrics(db: AnyDb, now = new Date()): Promise<Metrics> {
  const [users, members, circles, logs, serate, lists, events, watching, nwNotices] = await Promise.all([
    db.select({ id: user.id, createdAt: user.createdAt, anon: user.isAnonymous }).from(user),
    db.select({ circleId: circleMember.circleId, userId: circleMember.userId, joinedAt: circleMember.joinedAt }).from(circleMember),
    db.select({ id: circle.id, createdAt: circle.createdAt }).from(circle),
    db.select({ userId: log.userId, createdAt: log.createdAt }).from(log),
    db.select({ id: serata.id, circleId: serata.circleId, status: serata.status, createdAt: serata.createdAt, finishedAt: serata.finishedAt }).from(serata),
    db.select({ circleId: list.circleId }).from(list),
    db.select({ name: event.name, serataId: event.serataId }).from(event),
    db.select({ userId: nowWatching.userId }).from(nowWatching),
    db.select({ actorId: notification.actorId }).from(notification).where(eq(notification.type, "now_watching")),
  ]);

  const real = users.filter((u) => !u.anon);

  // 1. Created or joined a Cerchia within 7 days of signing up (cohort: signed up at least 7 days ago).
  const firstJoin = new Map<string, number>();
  for (const m of members) {
    const t = m.joinedAt.getTime();
    if (!firstJoin.has(m.userId) || t < firstJoin.get(m.userId)!) firstJoin.set(m.userId, t);
  }
  const cohort = real.filter((u) => now.getTime() - u.createdAt.getTime() >= 7 * DAY);
  const joined7 = cohort.filter((u) => { const j = firstJoin.get(u.id); return j !== undefined && j - u.createdAt.getTime() <= 7 * DAY; });

  // 2. Logs per active Cerchia per week, last 4 full weeks. A log belongs to every Cerchia its author is in.
  const circlesOf = new Map<string, string[]>();
  for (const m of members) circlesOf.set(m.userId, [...(circlesOf.get(m.userId) ?? []), m.circleId]);
  const perCircleWeek = new Map<string, number>();
  for (const l of logs) {
    const week = Math.floor((now.getTime() - l.createdAt.getTime()) / (7 * DAY));
    if (week < 0 || week > 3) continue;
    for (const c of circlesOf.get(l.userId) ?? []) perCircleWeek.set(`${c}|${week}`, (perCircleWeek.get(`${c}|${week}`) ?? 0) + 1);
  }
  const weekly = [...perCircleWeek.values()];

  // 3. Circles with a group list.
  const withLists = new Set(lists.flatMap((l) => (l.circleId ? [l.circleId] : [])));

  // 4. Serata time to result.
  const done = serate.filter((s) => s.status === "done" && s.finishedAt);
  const secs = done.map((s) => (s.finishedAt!.getTime() - s.createdAt.getTime()) / 1000);

  // 5. Sharing.
  const sharedCard = new Set(events.filter((e) => e.name === "card_shared").map((e) => e.serataId));
  const sharedInvite = new Set(events.filter((e) => e.name === "invite_shared").map((e) => e.serataId));
  const doneIds = done.map((s) => s.id);

  // 6. Retention: activity (a log by a member, or a Serata) in the 7 days that start N days after the Cerchia was created.
  const membersByCircle = new Map<string, Set<string>>();
  for (const m of members) (membersByCircle.get(m.circleId) ?? membersByCircle.set(m.circleId, new Set()).get(m.circleId)!).add(m.userId);
  const activityOf = (c: { id: string }) => {
    const ms = membersByCircle.get(c.id) ?? new Set();
    return [...logs.filter((l) => ms.has(l.userId)).map((l) => l.createdAt.getTime()), ...serate.filter((s) => s.circleId === c.id).map((s) => s.createdAt.getTime())];
  };
  const retained = (days: number) => {
    const eligible = circles.filter((c) => now.getTime() - c.createdAt.getTime() >= (days + 7) * DAY);
    const kept = eligible.filter((c) => {
      const from = c.createdAt.getTime() + days * DAY;
      return activityOf(c).some((t) => t >= from && t < from + 7 * DAY);
    });
    return { rate: ratio(kept.length, eligible.length), eligible: eligible.length };
  };

  // 7. "Sto guardando" adoption among people who belong to a Cerchia.
  const people = new Set(members.map((m) => m.userId));
  const watchers = new Set([...watching.map((w) => w.userId), ...nwNotices.flatMap((n) => (n.actorId ? [n.actorId] : []))].filter((id) => people.has(id)));

  return {
    generatedAt: now,
    circleWithin7d: { rate: ratio(joined7.length, cohort.length), cohort: cohort.length },
    logsPerActiveCircleWeek: weekly.length ? weekly.reduce((a, b) => a + b, 0) / weekly.length : null,
    circlesUsingLists: { rate: ratio(withLists.size, circles.length), circles: circles.length },
    serataTime: { medianSeconds: median(secs), under120: ratio(secs.filter((s) => s < 120).length, secs.length), finished: done.length },
    serataShared: {
      cardRate: ratio(doneIds.filter((id) => sharedCard.has(id)).length, doneIds.length),
      inviteRate: ratio(doneIds.filter((id) => sharedInvite.has(id)).length, doneIds.length),
      finished: doneIds.length,
    },
    retention: { d7: retained(7), d30: retained(30) },
    nowWatchingAdoption: { rate: ratio(watchers.size, people.size), people: people.size },
    totals: { users: real.length, circles: circles.length, logs: logs.length, serate: serate.length },
  };
}
