/* The Cerchia's ranking: every title anyone logged, with each member's rating and the group's average.
 * Pure functions over the Cerchia's own logs (`loadCircleFacts`). A rating is half-stars 1..10; the average is on the same
 * scale. Someone who watched a title twice counts once, with their latest rating (like everywhere else). */

import { latestRatings, type LogFact, type Person } from "./insights";

export type RankSort = "avg" | "votes" | "year" | "recent" | "title";
export const RANK_SORTS: RankSort[] = ["avg", "votes", "year", "recent", "title"];
export const PAGE_SIZE = 40;

export type RankFilters = {
  q?: string;
  kind?: "movie" | "tv" | "anime";
  /** Release year, inclusive. */
  yearFrom?: number;
  yearTo?: number;
  /** At least this many people rated it. */
  minVotes?: number;
  /** Only titles every member has watched. */
  everyone?: boolean;
  /** Only titles this person watched. */
  by?: string;
  sort?: RankSort;
};

export type RankedTitle = {
  mediaId: string; title: string; kind: LogFact["kind"]; year: number | null; posterPath: string | null;
  avg: number | null; // half-stars, null when nobody rated it
  votes: number;
  ratings: Map<string, number>; // userId -> latest rating
  watchedBy: Set<string>;
  lastWatched: string;
};

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function rankTitles(facts: LogFact[], people: Person[], f: RankFilters = {}): RankedTitle[] {
  const byTitle = new Map<string, RankedTitle>();
  for (const x of facts) {
    let t = byTitle.get(x.mediaId);
    if (!t) byTitle.set(x.mediaId, (t = { mediaId: x.mediaId, title: x.title, kind: x.kind, year: x.year, posterPath: x.posterPath, avg: null, votes: 0, ratings: new Map(), watchedBy: new Set(), lastWatched: x.watchedOn }));
    t.watchedBy.add(x.userId);
    if (x.watchedOn > t.lastWatched) t.lastWatched = x.watchedOn;
  }
  for (const [userId, rated] of latestRatings(facts)) for (const [mediaId, r] of rated) byTitle.get(mediaId)?.ratings.set(userId, r);
  for (const t of byTitle.values()) {
    t.votes = t.ratings.size;
    t.avg = t.votes ? [...t.ratings.values()].reduce((a, b) => a + b, 0) / t.votes : null;
  }

  const q = f.q ? fold(f.q.trim()) : "";
  const ids = people.map((p) => p.id);
  const out = [...byTitle.values()].filter((t) =>
    (!q || fold(t.title).includes(q)) &&
    (!f.kind || t.kind === f.kind) &&
    (f.yearFrom === undefined || (t.year !== null && t.year >= f.yearFrom)) &&
    (f.yearTo === undefined || (t.year !== null && t.year <= f.yearTo)) &&
    t.votes >= (f.minVotes ?? 1) &&
    (!f.everyone || ids.every((id) => t.watchedBy.has(id))) &&
    (!f.by || t.watchedBy.has(f.by)));

  const byTitleName = (a: RankedTitle, b: RankedTitle) => a.title.localeCompare(b.title);
  const sort = f.sort ?? "avg";
  out.sort((a, b) => {
    if (sort === "votes") return b.votes - a.votes || (b.avg ?? 0) - (a.avg ?? 0) || byTitleName(a, b);
    if (sort === "year") return (b.year ?? 0) - (a.year ?? 0) || byTitleName(a, b);
    if (sort === "recent") return b.lastWatched.localeCompare(a.lastWatched) || byTitleName(a, b);
    if (sort === "title") return byTitleName(a, b);
    return (b.avg ?? -1) - (a.avg ?? -1) || b.votes - a.votes || byTitleName(a, b);
  });
  return out;
}

/** Years the filter menus can offer: the oldest and newest release year among the titles. */
export function yearSpan(facts: LogFact[]): { min: number; max: number } | null {
  const ys = facts.map((f) => f.year).filter((y): y is number => y !== null);
  return ys.length ? { min: Math.min(...ys), max: Math.max(...ys) } : null;
}
