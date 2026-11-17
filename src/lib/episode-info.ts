import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { animeEpisodes } from "./anilist";
import { getEpisodeInfo, isStale, limitsOf, parseTmdbSeasons, storeEpisodeInfo, type EpisodeLimits } from "./core/episodes";
import { tmdbEnabled, tmdbGet } from "./tmdb";

/**
 * Episode counts for a title, looked up once a month and kept: TMDB for series (seasons and their episodes), AniList for
 * anime AniList knows (a total). Returns null for films, and an empty set of limits when nothing is known: the forms then
 * simply accept any number, as before.
 */
export async function ensureEpisodeLimits(mediaId: string): Promise<EpisodeLimits | null> {
  const db = await getDb();
  const [m] = await db.select({ kind: s.mediaEntity.kind, tmdbId: s.mediaEntity.tmdbId, anilistId: s.mediaEntity.anilistId }).from(s.mediaEntity).where(eq(s.mediaEntity.id, mediaId));
  if (!m || m.kind === "movie") return null;

  let info = await getEpisodeInfo(db, mediaId);
  if (isStale(info)) {
    if (m.tmdbId && tmdbEnabled()) {
      const seasons = parseTmdbSeasons(await tmdbGet(`/tv/${m.tmdbId}`));
      await storeEpisodeInfo(db, { mediaId, seasons });
    } else if (m.anilistId) {
      await storeEpisodeInfo(db, { mediaId, seasons: [], total: await animeEpisodes(m.anilistId) });
    } else {
      return limitsOf(info);
    }
    info = await getEpisodeInfo(db, mediaId);
  }
  return limitsOf(info);
}
