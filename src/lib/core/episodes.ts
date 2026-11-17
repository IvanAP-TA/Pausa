import { eq } from "drizzle-orm";
import { mediaEntity, mediaSeason } from "../../db/schema";
import type { AnyDb } from "./db-types";
export const MAX_SEASON = 99;
export const MAX_EPISODE = 9999; // long-running anime

export type Position = { season: number | null; episode: number | null };

/* Episode counts: how many seasons a series has and how many episodes each one has (TMDB), or the total for an anime without
 * seasons (AniList). They bound the inputs, and make "+1 episode" roll over to the next season by itself. Everything here
 * works with or without the counts: an unknown title simply has no limits. */

export const DETAILS_TTL_MS = 30 * 86_400_000;

export type EpisodeInfo = { seasons: Map<number, number>; total: number | null; checkedAt: Date | null };

/** TMDB's `GET /tv/{id}`: its `seasons` array, without season 0 (specials) and without seasons that have no episodes yet. */
export function parseTmdbSeasons(json: unknown): { season: number; episodes: number }[] {
  const list = (json as { seasons?: { season_number?: number; episode_count?: number }[] } | null)?.seasons ?? [];
  return list
    .filter((s) => Number.isInteger(s.season_number) && (s.season_number as number) >= 1 && (s.season_number as number) <= MAX_SEASON && Number.isInteger(s.episode_count) && (s.episode_count as number) > 0)
    .map((s) => ({ season: s.season_number as number, episodes: Math.min(s.episode_count as number, MAX_EPISODE) }))
    .sort((a, b) => a.season - b.season);
}

/** AniList's `Media { episodes nextAiringEpisode { episode } }`: the total when finished, else what has aired so far. */
export function parseAniListEpisodes(json: unknown): number | null {
  const m = (json as { data?: { Media?: { episodes?: number | null; nextAiringEpisode?: { episode?: number } | null } } } | null)?.data?.Media;
  if (!m) return null;
  if (typeof m.episodes === "number" && m.episodes > 0) return Math.min(m.episodes, MAX_EPISODE);
  const next = m.nextAiringEpisode?.episode;
  return typeof next === "number" && next > 1 ? next - 1 : null; // still airing, total unknown: what has aired
}

export async function getEpisodeInfo(db: AnyDb, mediaId: string): Promise<EpisodeInfo> {
  const [[m], rows] = await Promise.all([
    db.select({ total: mediaEntity.episodesTotal, checkedAt: mediaEntity.detailsCheckedAt }).from(mediaEntity).where(eq(mediaEntity.id, mediaId)),
    db.select({ season: mediaSeason.season, episodes: mediaSeason.episodes }).from(mediaSeason).where(eq(mediaSeason.mediaId, mediaId)),
  ]);
  return { seasons: new Map(rows.map((r) => [r.season, r.episodes])), total: m?.total ?? null, checkedAt: m?.checkedAt ?? null };
}

export const isStale = (info: Pick<EpisodeInfo, "checkedAt">, now = new Date()) => !info.checkedAt || now.getTime() - info.checkedAt.getTime() > DETAILS_TTL_MS;

export async function storeEpisodeInfo(db: AnyDb, input: { mediaId: string; seasons: { season: number; episodes: number }[]; total?: number | null; now?: Date }) {
  await db.delete(mediaSeason).where(eq(mediaSeason.mediaId, input.mediaId));
  if (input.seasons.length) await db.insert(mediaSeason).values(input.seasons.map((s) => ({ mediaId: input.mediaId, season: s.season, episodes: s.episodes })));
  await db.update(mediaEntity).set({ episodesTotal: input.total ?? null, detailsCheckedAt: input.now ?? new Date() }).where(eq(mediaEntity.id, input.mediaId));
}

/** The highest episode that exists for this season (or for the whole title when it has no seasons), if we know. */
export function maxEpisode(info: EpisodeInfo, season: number | null): number | null {
  if (season !== null && info.seasons.has(season)) return info.seasons.get(season)!;
  if (info.seasons.size === 0) return info.total;
  return null;
}

export function lastSeason(info: EpisodeInfo): number | null {
  return info.seasons.size ? Math.max(...info.seasons.keys()) : null;
}

/** Keeps a position inside what exists; unknown titles are left alone. */
export function clampPosition(info: EpisodeInfo, pos: Position): Position {
  let { season, episode } = pos;
  const last = lastSeason(info);
  if (season !== null && last !== null && season > last) season = last;
  const max = maxEpisode(info, season);
  if (episode !== null && max !== null && episode > max) episode = max;
  return { season, episode };
}

/**
 * One episode forward. At the end of a season the next one starts at episode 1, if the title has more seasons; at the very end
 * the position stays put (there is nothing after it). Without counts it simply adds one.
 */
export function advance(info: EpisodeInfo, pos: Position): Position {
  const episode = (pos.episode ?? 0) + 1;
  const season = pos.season;
  const max = maxEpisode(info, season);
  if (max !== null && episode > max) {
    const last = lastSeason(info);
    if (season !== null && last !== null && season < last) {
      const next = [...info.seasons.keys()].filter((s) => s > season).sort((a, b) => a - b)[0];
      return { season: next, episode: 1 };
    }
    return { season, episode: pos.episode ?? max };
  }
  return { season, episode: Math.min(episode, MAX_EPISODE) };
}

/** What the forms need to build their inputs. */
export type EpisodeLimits = { seasons: { season: number; episodes: number }[]; total: number | null };
export const limitsOf = (info: EpisodeInfo): EpisodeLimits => ({ seasons: [...info.seasons].map(([season, episodes]) => ({ season, episodes })).sort((a, b) => a.season - b.season), total: info.total });
