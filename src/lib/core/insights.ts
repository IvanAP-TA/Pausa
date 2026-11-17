/* Circle insights: Year in Review, taste comparison, agreements/splits, and group recommendations.
 * Everything here is computed from the Cerchia's own logs and ratings. No external catalogue, no invented data.
 * Ratings are half-stars: 1..10 (= 0.5..5 stars). Pure functions; `loadCircleFacts` reads the database. */

import { asc, eq, inArray, sql } from "drizzle-orm";
import { circleMember, log, logWatchedWith, mediaEntity, mediaTitle, nowWatching, user } from "../../db/schema";
import { readAll, type AnyDb } from "./db-types";

/* ───────────── Types ───────────── */

export type LogFact = {
  logId: string;
  userId: string;
  mediaId: string;
  title: string;
  kind: "movie" | "tv" | "anime";
  year: number | null;
  posterPath: string | null;
  runtimeMin: number | null;
  rating: number | null; // 1..10 or null
  watchedOn: string; // YYYY-MM-DD
  platform: string | null;
  watchedWith: string[]; // user ids
};
export type Person = { id: string; name: string };
/** Who is currently partway through which title ("now watching"). */
export type Watching = { userId: string; mediaId: string };

/** Pairs need this many titles rated by both before a "similarity" means anything (one shared 5★ is not a match). */
export const MIN_COMMON = 3;
/** Rating scale: 1..10, so two people can differ by at most 9. */
const MAX_DIFF = 9;
/** What a group recommendation must score (7 = 3.5★) to be worth suggesting. */
export const RECOMMEND_MIN = 7;
const NEUTRAL_WEIGHT = 0.5; // for someone we can't compare yet (counted at face value)
const MIRROR = 11; // 1..10 scale: an opposite-taste "9" says the other person would give about a 2

/* ───────────── Ratings per person ───────────── */

/** Latest rating per person per title (a rewatch replaces the earlier rating). `facts` must be in chronological order. */
export function latestRatings(facts: LogFact[]) {
  const out = new Map<string, Map<string, number>>();
  for (const f of facts) {
    if (f.rating === null) continue;
    let m = out.get(f.userId);
    if (!m) out.set(f.userId, (m = new Map()));
    m.set(f.mediaId, f.rating);
  }
  return out;
}

/* ───────────── Taste ───────────── */

export type Similarity = { common: number; score: number | null };

/** 0..1 (1 = identical ratings) on the titles both rated; `score` is null until they share MIN_COMMON titles. */
export function tasteSimilarity(a: Map<string, number> | undefined, b: Map<string, number> | undefined): Similarity {
  if (!a || !b) return { common: 0, score: null };
  let sum = 0;
  let common = 0;
  for (const [mediaId, ra] of a) {
    const rb = b.get(mediaId);
    if (rb === undefined) continue;
    sum += Math.abs(ra - rb);
    common += 1;
  }
  return { common, score: common < MIN_COMMON ? null : 1 - sum / common / MAX_DIFF };
}

export function tastePairs(people: Person[], ratings: Map<string, Map<string, number>>) {
  const pairs: { a: Person; b: Person; common: number; score: number | null }[] = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      pairs.push({ a: people[i], b: people[j], ...tasteSimilarity(ratings.get(people[i].id), ratings.get(people[j].id)) });
    }
  }
  // Known scores first (best match on top), then the pairs that still need more shared titles.
  return pairs.sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || y.common - x.common);
}

/* ───────────── Per-title agreement ───────────── */

export type TitleVerdict = {
  mediaId: string; title: string; posterPath: string | null; kind: LogFact["kind"]; year: number | null;
  avg: number; spread: number; ratings: { person: Person; rating: number }[];
};

function ratingsByTitle(facts: LogFact[], people: Person[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const info = new Map<string, LogFact>();
  const latest = new Map<string, Map<string, number>>(); // mediaId -> userId -> rating
  for (const f of facts) {
    info.set(f.mediaId, f);
    if (f.rating === null) continue;
    let m = latest.get(f.mediaId);
    if (!m) latest.set(f.mediaId, (m = new Map()));
    m.set(f.userId, f.rating);
  }
  const verdicts: TitleVerdict[] = [];
  for (const [mediaId, byUser] of latest) {
    if (byUser.size < 2) continue;
    const f = info.get(mediaId)!;
    const rs = [...byUser].flatMap(([userId, rating]) => (byId.has(userId) ? [{ person: byId.get(userId)!, rating }] : []));
    if (rs.length < 2) continue;
    const values = rs.map((r) => r.rating);
    verdicts.push({
      mediaId, title: f.title, posterPath: f.posterPath, kind: f.kind, year: f.year,
      avg: values.reduce((s, v) => s + v, 0) / values.length,
      spread: Math.max(...values) - Math.min(...values),
      ratings: rs.sort((a, b) => b.rating - a.rating),
    });
  }
  return verdicts;
}

/** Titles you all liked (avg ≥ 4★, within 1★ of each other), and titles that split the room (≥ 2★ apart). */
export function agreements(facts: LogFact[], people: Person[], limit = 3) {
  const all = ratingsByTitle(facts, people);
  return {
    agree: all.filter((v) => v.avg >= 8 && v.spread <= 2).sort((a, b) => b.avg - a.avg || b.ratings.length - a.ratings.length).slice(0, limit),
    split: all.filter((v) => v.spread >= 4).sort((a, b) => b.spread - a.spread || b.ratings.length - a.ratings.length).slice(0, limit),
  };
}

/* ───────────── Year in Review ───────────── */

export function yearsWithLogs(facts: LogFact[]) {
  return [...new Set(facts.map((f) => Number(f.watchedOn.slice(0, 4))))].sort((a, b) => b - a);
}

export type YearReview = ReturnType<typeof yearInReview>;

export function yearInReview(allFacts: LogFact[], people: Person[], year: number) {
  const facts = allFacts.filter((f) => f.watchedOn.startsWith(`${year}-`));
  const byId = new Map(people.map((p) => [p.id, p]));
  const count = <K extends string | number>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };

  const rated = facts.filter((f) => f.rating !== null) as (LogFact & { rating: number })[];
  const avgRating = rated.length ? rated.reduce((s, f) => s + f.rating, 0) / rated.length / 2 : null;

  // Hours only for films: for series and anime the stored runtime is per episode, so hours would be wrong.
  const movieMinutes = facts.filter((f) => f.kind === "movie" && f.runtimeMin !== null).reduce((s, f) => s + (f.runtimeMin ?? 0), 0);

  const [topMember] = count(facts.map((f) => f.userId));
  const [busy] = count(facts.map((f) => Number(f.watchedOn.slice(5, 7))));
  const [platform] = count(facts.flatMap((f) => (f.platform ? [f.platform] : [])));

  // Title of the year: best average, preferring titles at least two people rated.
  const verdicts = ratingsByTitle(facts, people);
  const singles = new Map<string, { f: LogFact; rating: number }>();
  for (const f of rated) singles.set(f.mediaId, { f, rating: f.rating });
  const best = verdicts.length
    ? [...verdicts].sort((a, b) => b.avg - a.avg || b.ratings.length - a.ratings.length)[0]
    : [...singles.values()].sort((a, b) => b.rating - a.rating)[0];
  const titleOfTheYear = !best ? null
    : "ratings" in best
      ? { mediaId: best.mediaId, title: best.title, posterPath: best.posterPath, stars: best.avg / 2, raters: best.ratings.length }
      : { mediaId: best.f.mediaId, title: best.f.title, posterPath: best.f.posterPath, stars: best.rating / 2, raters: 1 };

  // The pair that watched the most together, counting each (title, day, pair) once even if both logged it.
  const seen = new Set<string>();
  const pairCounts: string[] = [];
  for (const f of facts) {
    const group = [...new Set([f.userId, ...f.watchedWith])].filter((id) => byId.has(id)).sort();
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const key = `${f.mediaId}|${f.watchedOn}|${group[i]}|${group[j]}`;
      if (!seen.has(key)) { seen.add(key); pairCounts.push(`${group[i]}|${group[j]}`); }
    }
  }
  const [together] = count(pairCounts);

  return {
    year,
    logs: facts.length,
    titles: new Set(facts.map((f) => f.mediaId)).size,
    byKind: Object.fromEntries(count(facts.map((f) => f.kind))) as Partial<Record<LogFact["kind"], number>>,
    movieHours: movieMinutes > 0 ? Math.round(movieMinutes / 60) : null,
    avgRating,
    mostActive: topMember ? { person: byId.get(topMember[0]) ?? null, logs: topMember[1] } : null,
    busiestMonth: busy ? { month: busy[0], logs: busy[1] } : null,
    topPlatform: platform ? { name: platform[0], logs: platform[1] } : null,
    titleOfTheYear,
    togetherMost: together
      ? { a: byId.get(together[0].split("|")[0])!, b: byId.get(together[0].split("|")[1])!, times: together[1] }
      : null,
  };
}

/* ───────────── Group recommendations ───────────── */

export type Recommendation = {
  mediaId: string; title: string; posterPath: string | null; kind: LogFact["kind"]; year: number | null;
  score: number; // predicted 1..10 for the people who haven't seen it
  unseenBy: Person[];
  lovedBy: { person: Person; rating: number }[];
};

/**
 * "Worth watching together": titles someone in the Cerchia rated well that others haven't logged yet.
 * Each person who hasn't seen a title gets a predicted rating from the people who did:
 *   - similar taste (score > 0.5): their rating counts as is, weighted by how similar;
 *   - opposite taste (score < 0.5): their rating counts mirrored (11 - rating), weighted by how opposite;
 *   - not comparable yet (fewer than MIN_COMMON shared titles): face value, with a small neutral weight.
 * The group score is the mean prediction over the people who haven't seen it.
 * Someone who is partway through a title ("now watching") counts as having started it: it isn't suggested to them.
 */
export function recommend(facts: LogFact[], people: Person[], limit = 6, watching: Watching[] = []): Recommendation[] {
  if (people.length < 2) return [];
  const ratings = latestRatings(facts);
  const seenBy = new Map<string, Set<string>>();
  const info = new Map<string, LogFact>();
  for (const f of facts) {
    info.set(f.mediaId, f);
    let s = seenBy.get(f.mediaId);
    if (!s) seenBy.set(f.mediaId, (s = new Set()));
    s.add(f.userId);
  }

  const inProgress = new Set(watching.map((w) => `${w.userId}|${w.mediaId}`));
  const recs: Recommendation[] = [];
  for (const [mediaId, seen] of seenBy) {
    const unseenBy = people.filter((p) => !seen.has(p.id) && !inProgress.has(`${p.id}|${mediaId}`));
    if (unseenBy.length === 0) continue;
    const raters = people.flatMap((p) => {
      const r = ratings.get(p.id)?.get(mediaId);
      return r === undefined ? [] : [{ person: p, rating: r }];
    });
    if (!raters.some((r) => r.rating >= RECOMMEND_MIN)) continue;

    const predictions = unseenBy.map((u) => {
      let num = 0;
      let den = 0;
      for (const r of raters) {
        const { score } = tasteSimilarity(ratings.get(u.id), ratings.get(r.person.id));
        const signed = score === null ? null : 2 * score - 1; // -1 (opposite) .. 1 (identical)
        const w = signed === null ? NEUTRAL_WEIGHT : Math.abs(signed);
        const value = signed !== null && signed < 0 ? MIRROR - r.rating : r.rating;
        num += w * value;
        den += w;
      }
      return den > 0 ? num / den : raters.reduce((s, r) => s + r.rating, 0) / raters.length;
    });
    const score = predictions.reduce((s, v) => s + v, 0) / predictions.length;
    if (score < RECOMMEND_MIN) continue;

    const f = info.get(mediaId)!;
    recs.push({
      mediaId, title: f.title, posterPath: f.posterPath, kind: f.kind, year: f.year, score, unseenBy,
      lovedBy: raters.filter((r) => r.rating >= RECOMMEND_MIN).sort((a, b) => b.rating - a.rating),
    });
  }
  return recs.sort((a, b) => b.score - a.score || b.unseenBy.length - a.unseenBy.length || a.title.localeCompare(b.title)).slice(0, limit);
}

/* ───────────── Loading ───────────── */

/** Everything the insights need, in chronological order. Members are the Cerchia's current members. */
export async function loadCircleFacts(db: AnyDb, circleId: string, locale: string) {

  const memberIds = db.select({ id: circleMember.userId }).from(circleMember).where(eq(circleMember.circleId, circleId));
  const title = sql<string>`coalesce((select ${mediaTitle.title} from ${mediaTitle} where ${mediaTitle.mediaId} = ${mediaEntity.id} and ${mediaTitle.locale} = ${locale}), ${mediaEntity.originalTitle})`;

  // One D1 batch for the four reads: one round trip instead of four.
  const [people, rows, withRows, watching] = await readAll(db, [
    db.select({ id: user.id, name: user.name }).from(circleMember)
      .innerJoin(user, eq(user.id, circleMember.userId))
      .where(eq(circleMember.circleId, circleId)).orderBy(asc(circleMember.joinedAt)),
    db.select({
    logId: log.id, userId: log.userId, mediaId: log.mediaId, rating: log.rating, watchedOn: log.watchedOn, platform: log.platform,
    title, kind: mediaEntity.kind, year: mediaEntity.year, posterPath: mediaEntity.posterPath, runtimeMin: mediaEntity.runtimeMin,
  }).from(log).innerJoin(mediaEntity, eq(mediaEntity.id, log.mediaId))
    .where(inArray(log.userId, memberIds))
    .orderBy(asc(log.watchedOn), asc(log.createdAt)),
    // Subquery instead of a bound id list: D1 limits a query to 100 bound variables.
    db.select({ logId: logWatchedWith.logId, userId: logWatchedWith.userId }).from(logWatchedWith)
      .where(inArray(logWatchedWith.logId, db.select({ id: log.id }).from(log).where(inArray(log.userId, memberIds)))),
    db.select({ userId: nowWatching.userId, mediaId: nowWatching.mediaId }).from(nowWatching)
      .where(inArray(nowWatching.userId, memberIds)),
  ]);
  const withByLog = new Map<string, string[]>();
  for (const w of withRows) withByLog.set(w.logId, [...(withByLog.get(w.logId) ?? []), w.userId]);

  const facts: LogFact[] = rows.map((r) => ({ ...r, watchedWith: withByLog.get(r.logId) ?? [] }));
  return { people: people as Person[], facts, watching: watching as Watching[] };
}

