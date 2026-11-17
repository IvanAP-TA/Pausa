import { desc, eq, sql } from "drizzle-orm";
import { log, mediaEntity, mediaTitle } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* Individual recommendations: what to watch next, from what this person loved. The candidates come from TMDB's
 * "recommendations" for each loved title (see tmdb.ts); here we only choose the seeds and rank what comes back. */

export type Seed = { mediaId: string; title: string; rating: number; tmdbId: number; kind: "movie" | "tv" | "anime" };
export type Candidate = { id: string; kind: "movie" | "tv" | "anime"; title: string; year: number | null; posterPath: string | null };
export type Ranked = { candidate: Candidate; score: number; because: { mediaId: string; title: string }[] };

export const SEED_MIN_RATING = 8; // 4 stars or more

/**
 * The titles a person loved most, as seeds: latest rating per title (a rewatch can change your mind), best first, newest
 * first among ties, only titles TMDB knows. `limit` keeps the number of TMDB calls small.
 */
export async function topSeeds(db: AnyDb, userId: string, limit = 5, locale = "it"): Promise<{ seeds: Seed[]; logged: Set<string> }> {
  const rows = await db.select({
    mediaId: log.mediaId, rating: log.rating, watchedOn: log.watchedOn, createdAt: log.createdAt,
    title: sql<string>`coalesce((select ${mediaTitle.title} from ${mediaTitle} where ${mediaTitle.mediaId} = ${mediaEntity.id} and ${mediaTitle.locale} = ${locale}), ${mediaEntity.originalTitle})`, tmdbId: mediaEntity.tmdbId, kind: mediaEntity.kind,
  }).from(log).innerJoin(mediaEntity, eq(mediaEntity.id, log.mediaId)).where(eq(log.userId, userId)).orderBy(desc(log.watchedOn), desc(log.createdAt));

  const logged = new Set(rows.map((r) => r.mediaId));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.mediaId)) latest.set(r.mediaId, r); // rows are newest first
  const seeds = [...latest.values()]
    .filter((r) => r.rating !== null && r.rating >= SEED_MIN_RATING && r.tmdbId !== null)
    .map((r) => ({ mediaId: r.mediaId, title: r.title, rating: r.rating as number, tmdbId: r.tmdbId as number, kind: r.kind }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
  return { seeds, logged };
}

/**
 * Merges the candidates of every seed. A candidate scores more the more you loved the titles that point to it, and
 * more when several of them do; earlier in TMDB's list counts a little more. Titles you have logged are never suggested.
 */
export function rankDiscovery(input: { seed: Pick<Seed, "mediaId" | "title" | "rating">; candidates: Candidate[] }[], exclude: Set<string>, limit = 8): Ranked[] {
  const byId = new Map<string, Ranked>();
  for (const { seed, candidates } of input) {
    const weight = (seed.rating - 5) / 5; // 8 -> 0.6, 10 -> 1
    candidates.forEach((c, i) => {
      if (exclude.has(c.id)) return;
      const entry = byId.get(c.id) ?? { candidate: c, score: 0, because: [] };
      entry.score += weight / (1 + i * 0.08);
      entry.because.push({ mediaId: seed.mediaId, title: seed.title });
      byId.set(c.id, entry);
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score || b.because.length - a.because.length || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, limit);
}

