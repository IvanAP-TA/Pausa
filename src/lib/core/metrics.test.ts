import { beforeEach, describe, expect, it } from "vitest";
import { circle, circleMember, event, list, log, mediaEntity, nowWatching, serata, user } from "../../db/schema";
import type { AnyDb } from "./db-types";
import { computeMetrics } from "./metrics";
import { createTestDb } from "./test-db";

const NOW = new Date("2026-12-01T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

let db: AnyDb;
beforeEach(async () => {
  db = await createTestDb();
  await db.insert(mediaEntity).values({ id: "m1", kind: "movie", originalTitle: "Alpha" });
});

const person = (id: string, daysAgo: number, anon = false) => db.insert(user).values({ id, name: id, email: `${id}@t.dev`, isAnonymous: anon, createdAt: ago(daysAgo) });
const makeCircle = (id: string, daysAgo: number, by: string) => db.insert(circle).values({ id, name: id, createdBy: by, createdAt: ago(daysAgo) });
const join = (circleId: string, userId: string, daysAgo: number) => db.insert(circleMember).values({ circleId, userId, joinedAt: ago(daysAgo) });
const logAt = (id: string, userId: string, daysAgo: number) => db.insert(log).values({ id, userId, mediaId: "m1", watchedOn: "2026-11-01", createdAt: ago(daysAgo) });

describe("computeMetrics", () => {
  it("is all null (not zero, not NaN) on an empty database", async () => {
    const m = await computeMetrics(db, NOW);
    expect(m.circleWithin7d).toEqual({ rate: null, cohort: 0 });
    expect(m.logsPerActiveCircleWeek).toBeNull();
    expect(m.serataTime.medianSeconds).toBeNull();
    expect(m.retention.d7.rate).toBeNull();
    expect(m.totals).toEqual({ users: 0, circles: 0, logs: 0, serate: 0 });
  });

  it("counts who created or joined a Cerchia within 7 days of signing up, ignoring guests and newcomers", async () => {
    await person("a", 30); await person("b", 30); await person("c", 30); await person("g", 30, true); await person("new", 2);
    await makeCircle("c1", 29, "a");
    await join("c1", "a", 29.9); // joined right away
    await join("c1", "b", 10);   // joined 20 days after signing up: too late
    const m = await computeMetrics(db, NOW);
    expect(m.circleWithin7d).toEqual({ rate: 1 / 3, cohort: 3 }); // a, b, c; the guest and the 2-day-old are out
  });

  it("averages logs per active Cerchia per week over the last four weeks", async () => {
    await person("a", 60); await person("b", 60);
    await makeCircle("c1", 50, "a"); await join("c1", "a", 50); await join("c1", "b", 50);
    await logAt("l1", "a", 1); await logAt("l2", "b", 2); await logAt("l3", "a", 3); // week 0: 3 logs
    await logAt("l4", "a", 9);                                                          // week 1: 1 log
    await logAt("old", "a", 40);                                                        // outside the window
    expect((await computeMetrics(db, NOW)).logsPerActiveCircleWeek).toBe(2); // (3 + 1) / 2 active weeks
  });

  it("measures Serata time to result, and sharing", async () => {
    await person("a", 40); await makeCircle("c1", 40, "a"); await join("c1", "a", 40);
    const base = { circleId: "c1", hostId: "a", mode: "bracket" as const, status: "done" as const };
    await db.insert(serata).values([
      { id: "s1", code: "AAAAAA", ...base, createdAt: ago(5), finishedAt: new Date(ago(5).getTime() + 90_000) },
      { id: "s2", code: "BBBBBB", ...base, createdAt: ago(4), finishedAt: new Date(ago(4).getTime() + 150_000) },
      { id: "s3", code: "CCCCCC", ...base, status: "lobby" as const, createdAt: ago(3) }, // never finished: not counted
    ]);
    await db.insert(event).values([
      { name: "card_shared", userId: "a", serataId: "s1" }, { name: "card_shared", userId: "a", serataId: "s1" }, // twice still counts once
      { name: "invite_shared", userId: "a", serataId: "s2" },
    ]);
    const m = await computeMetrics(db, NOW);
    expect(m.serataTime).toEqual({ medianSeconds: 120, under120: 0.5, finished: 2 });
    expect(m.serataShared).toEqual({ cardRate: 0.5, inviteRate: 0.5, finished: 2 });
  });

  it("counts Cerchie with lists and people who used 'Sto guardando'", async () => {
    await person("a", 20); await person("b", 20);
    await makeCircle("c1", 20, "a"); await makeCircle("c2", 20, "b");
    await join("c1", "a", 20); await join("c2", "b", 20);
    await db.insert(list).values({ id: "g", circleId: "c1", ownerId: "a", name: "Group" });
    await db.insert(list).values({ id: "p", circleId: null, ownerId: "b", name: "Personal" }); // personal lists do not count
    await db.insert(nowWatching).values({ userId: "a", mediaId: "m1" });
    const m = await computeMetrics(db, NOW);
    expect(m.circlesUsingLists).toEqual({ rate: 0.5, circles: 2 });
    expect(m.nowWatchingAdoption).toEqual({ rate: 0.5, people: 2 });
  });

  it("measures retention only for Cerchie old enough, by activity in the week after day 7 / day 30", async () => {
    await person("a", 100); await person("b", 100);
    await makeCircle("old", 60, "a"); await join("old", "a", 60);
    await makeCircle("quiet", 60, "b"); await join("quiet", "b", 60);
    await makeCircle("young", 5, "a"); await join("young", "a", 5); // too young for either
    await logAt("x1", "a", 60 - 8);  // old: activity on day 8 -> retained at 7
    await logAt("x2", "a", 60 - 31); // old: activity on day 31 -> retained at 30
    const m = await computeMetrics(db, NOW);
    expect(m.retention.d7).toEqual({ rate: 0.5, eligible: 2 });
    expect(m.retention.d30).toEqual({ rate: 0.5, eligible: 2 });
  });
});
