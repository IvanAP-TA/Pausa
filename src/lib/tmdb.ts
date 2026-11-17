import "server-only";
import { inArray, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { MediaSummary } from "./data";
import { getAvailability, parseRegionProviders, parseWatchProviders, storeAvailability, type Provider } from "./core/streaming";

/* TMDB: free API is non-commercial and requires attribution (see <TmdbAttribution />). Streaming data is by JustWatch. */

const LANG: Record<string, string> = { it: "it-IT", en: "en-US", es: "es-ES" };
const ANIMATION = 16;
const MIN_VOTES = 500; // recommendations with fewer votes are too obscure to suggest

type TmdbResult = {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string; name?: string;
  original_title?: string; original_name?: string;
  release_date?: string; first_air_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  origin_country?: string[];
  original_language?: string;
  vote_count?: number;
};

type Db = Awaited<ReturnType<typeof getDb>>;

export const tmdbEnabled = () => Boolean(process.env.TMDB_API_TOKEN);

async function tmdbGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Recommendations, providers and details change slowly: let the platform cache them for a day.
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` }, next: { revalidate: 86_400 } });
  return res.ok ? ((await res.json()) as unknown) : null;
}

function toMedia(r: TmdbResult) {
  const isAnime = r.media_type === "tv" && r.genre_ids?.includes(ANIMATION) && r.original_language === "ja";
  const kind = (r.media_type === "movie" ? "movie" : isAnime ? "anime" : "tv") as "movie" | "tv" | "anime";
  const date = r.release_date || r.first_air_date;
  const original = r.original_title ?? r.original_name ?? r.title ?? r.name ?? "";
  return { kind, tmdbId: r.id, originalTitle: original, localized: r.title ?? r.name ?? original, year: date ? Number(date.slice(0, 4)) : null, posterPath: r.poster_path ?? null };
}

/**
 * Stores TMDB results as canonical media_entity rows (+ localized titles) in a handful of queries, not three per title:
 * D1 allows about 50 queries per request and 100 bound values per statement, so rows go in chunks. Returns them in order.
 */
async function upsertTmdbResults(db: Db, results: TmdbResult[], locale: string): Promise<MediaSummary[]> {
  const rows = [...new Map(results.map(toMedia).map((m) => [m.kind + ":" + m.tmdbId, m])).values()];
  if (rows.length === 0) return [];
  for (let i = 0; i < rows.length; i += 12) {
    await db.insert(s.mediaEntity)
      .values(rows.slice(i, i + 12).map((m) => ({ kind: m.kind, tmdbId: m.tmdbId, originalTitle: m.originalTitle, year: m.year, posterPath: m.posterPath })))
      .onConflictDoNothing();
  }
  const ids = await db.select({ id: s.mediaEntity.id, kind: s.mediaEntity.kind, tmdbId: s.mediaEntity.tmdbId }).from(s.mediaEntity)
    .where(inArray(s.mediaEntity.tmdbId, rows.map((m) => m.tmdbId)));
  const idOf = new Map(ids.map((r) => [r.kind + ":" + r.tmdbId, r.id]));
  const found = rows.flatMap((m) => { const id = idOf.get(m.kind + ":" + m.tmdbId); return id ? [{ ...m, id }] : []; });
  for (let i = 0; i < found.length; i += 25) {
    await db.insert(s.mediaTitle)
      .values(found.slice(i, i + 25).map((m) => ({ mediaId: m.id, locale, title: m.localized })))
      .onConflictDoUpdate({ target: [s.mediaTitle.mediaId, s.mediaTitle.locale], set: { title: sql`excluded.title` } });
  }
  return found.map((m) => ({ id: m.id, kind: m.kind, title: m.localized, year: m.year, posterPath: m.posterPath }));
}

/** Searches TMDB and stores results as canonical media_entity rows (+ localized title). */
export async function searchTmdb(q: string, locale: string): Promise<MediaSummary[]> {
  if (!tmdbEnabled() || q.trim().length < 2) return [];
  const json = (await tmdbGet("/search/multi", { query: q.trim(), language: LANG[locale] ?? "it-IT", include_adult: "false" })) as { results?: TmdbResult[] } | null;
  return upsertTmdbResults(await getDb(), (json?.results ?? []).filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, 10), locale);
}

/* ───────────── Streaming availability ───────────── */

/** The services a country offers, for the settings page. Empty without a token. */
export async function regionProviders(country: string, locale: string): Promise<Provider[]> {
  if (!tmdbEnabled()) return [];
  const json = await tmdbGet("/watch/providers/movie", { watch_region: country, language: LANG[locale] ?? "it-IT" });
  return parseRegionProviders(json, country);
}

/**
 * Makes sure availability is known for these titles in a country: looks up the ones never checked or older than a week
 * (at most `max` per call, to stay inside Workers subrequest limits), and returns what is known now.
 * Titles without a TMDB id (AniList imports) are recorded as "nowhere", so they are not asked again.
 */
export async function ensureAvailability(mediaIds: string[], country: string, max = 10) {
  const db = await getDb();
  const { known, stale } = await getAvailability(db, mediaIds, country);
  if (!tmdbEnabled() || stale.length === 0) return known;
  const rows = await db.select({ id: s.mediaEntity.id, tmdbId: s.mediaEntity.tmdbId, kind: s.mediaEntity.kind })
    .from(s.mediaEntity).where(inArray(s.mediaEntity.id, stale.slice(0, max)));
  await Promise.all(rows.map(async (m) => {
    const type = m.kind === "movie" ? "movie" : "tv";
    const providers = m.tmdbId ? parseWatchProviders(await tmdbGet(`/${type}/${m.tmdbId}/watch/providers`), country) : [];
    await storeAvailability(db, { mediaId: m.id, country, providers });
    known.set(m.id, providers);
  }));
  return known;
}

/* ───────────── Discovery ───────────── */

/** TMDB's own "people who liked this also liked" for one title, stored as media_entity rows. */
export async function similarTitles(tmdbId: number, kind: "movie" | "tv" | "anime", locale: string): Promise<MediaSummary[]> {
  if (!tmdbEnabled()) return [];
  const type = kind === "movie" ? "movie" : "tv";
  const json = (await tmdbGet(`/${type}/${tmdbId}/recommendations`, { language: LANG[locale] ?? "it-IT" })) as { results?: TmdbResult[] } | null;
  // Only titles people actually know and that have a poster: TMDB also recommends obscure TV movies and shorts.
  const known = (json?.results ?? []).filter((r) => r.poster_path && (r.vote_count ?? 0) >= MIN_VOTES).slice(0, 12);
  return upsertTmdbResults(await getDb(), known.map((r) => ({ ...r, media_type: type })), locale);
}
