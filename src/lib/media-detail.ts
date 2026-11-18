import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { animeDetails } from "./anilist";
import { parseAniListDetails, parseTmdbDetails, trimOverview, type CastMember, type Details } from "./core/details";
import { tmdbEnabled, tmdbGet } from "./tmdb";

const LANG: Record<string, string> = { it: "it-IT", en: "en-US", es: "es-ES" };
const RETRY_EMPTY_MS = 7 * 86_400_000; // a title no catalogue knew is asked again after a week

export type MediaDetail = { overview: string | null; genres: string[]; cast: CastMember[]; source: "tmdb" | "anilist" | "user" | "none" };

/**
 * What a title is about, in the reader's language: read from the cache, or looked up once (TMDB for films and series,
 * AniList for anime only it knows) and kept. A synopsis a member wrote is never overwritten by an empty answer.
 * Never throws: a catalogue that is down just means "nothing known for now".
 */
export async function ensureMediaDetail(mediaId: string, locale: string): Promise<MediaDetail> {
  const db = await getDb();
  const [cached] = await db.select().from(s.mediaDetail).where(and(eq(s.mediaDetail.mediaId, mediaId), eq(s.mediaDetail.locale, locale)));
  const fresh = cached && (cached.source === "tmdb" || cached.source === "anilist" || Date.now() - cached.fetchedAt.getTime() < RETRY_EMPTY_MS);
  if (cached && fresh) return { overview: cached.overview, genres: cached.genres, cast: cached.cast, source: cached.source };

  const [m] = await db.select({ kind: s.mediaEntity.kind, tmdbId: s.mediaEntity.tmdbId, anilistId: s.mediaEntity.anilistId })
    .from(s.mediaEntity).where(eq(s.mediaEntity.id, mediaId));
  if (!m) return { overview: null, genres: [], cast: [], source: "none" };

  let found: Details | null = null;
  let source: MediaDetail["source"] = "none";
  try {
    if (m.tmdbId && tmdbEnabled()) {
      const type = m.kind === "movie" ? "movie" : "tv";
      const json = await tmdbGet(`/${type}/${m.tmdbId}`, { language: LANG[locale] ?? "it-IT", append_to_response: "credits" });
      if (json) { found = parseTmdbDetails(json); source = "tmdb"; }
    } else if (m.anilistId) {
      const json = await animeDetails(m.anilistId);
      if (json) { found = parseAniListDetails(json); source = "anilist"; }
    }
  } catch (e) {
    console.error("[media-detail] lookup failed", e);
  }

  // A member's own synopsis stays when the catalogue has none.
  const keepUser = cached?.source === "user" && !found?.overview;
  const detail: MediaDetail = {
    overview: keepUser ? cached!.overview : found?.overview ?? null,
    genres: found?.genres ?? [],
    cast: found?.cast ?? [],
    source: keepUser ? "user" : found ? source : "none",
  };
  await db.insert(s.mediaDetail)
    .values({ mediaId, locale, ...detail, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: [s.mediaDetail.mediaId, s.mediaDetail.locale], set: { overview: detail.overview, genres: detail.genres, cast: detail.cast, source: detail.source, fetchedAt: new Date() } });
  if (found?.runtimeMin) {
    await db.update(s.mediaEntity).set({ runtimeMin: found.runtimeMin }).where(and(eq(s.mediaEntity.id, mediaId), isNull(s.mediaEntity.runtimeMin)));
  }
  return detail;
}

/** A member writes what a title is about, for a title no catalogue described. Never replaces a catalogue's synopsis. */
export async function saveUserOverview(mediaId: string, locale: string, raw: string) {
  const overview = trimOverview(raw);
  if (!overview) return;
  const db = await getDb();
  await db.insert(s.mediaDetail)
    .values({ mediaId, locale, overview, source: "user", fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [s.mediaDetail.mediaId, s.mediaDetail.locale],
      set: { overview, source: "user", fetchedAt: new Date() },
      setWhere: sql`${s.mediaDetail.overview} is null or ${s.mediaDetail.source} in ('user', 'none')`,
    });
}
