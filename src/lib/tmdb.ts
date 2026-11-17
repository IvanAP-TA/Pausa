import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { MediaSummary } from "./data";
import { getAvailability, parseRegionProviders, parseWatchProviders, storeAvailability, type Provider } from "./core/streaming";

/* TMDB: free API is non-commercial and requires attribution (see <TmdbAttribution />). Streaming data is by JustWatch. */

const LANG: Record<string, string> = { it: "it-IT", en: "en-US", es: "es-ES" };
const ANIMATION = 16;

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
};

type Db = Awaited<ReturnType<typeof getDb>>;

export const tmdbEnabled = () => Boolean(process.env.TMDB_API_TOKEN);

async function tmdbGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` } });
  return res.ok ? ((await res.json()) as unknown) : null;
}

/** Stores one TMDB result as a canonical media_entity (+ localized title) and returns it. */
async function upsertTmdbResult(db: Db, r: TmdbResult, locale: string): Promise<MediaSummary | null> {
  const isAnime = r.media_type === "tv" && r.genre_ids?.includes(ANIMATION) && r.original_language === "ja";
  const kind = r.media_type === "movie" ? "movie" : isAnime ? "anime" : "tv";
  const date = r.release_date || r.first_air_date;
  const year = date ? Number(date.slice(0, 4)) : null;
  const original = r.original_title ?? r.original_name ?? r.title ?? r.name ?? "";
  const localized = r.title ?? r.name ?? original;

  await db.insert(s.mediaEntity)
    .values({ kind, tmdbId: r.id, originalTitle: original, year, posterPath: r.poster_path ?? null })
    .onConflictDoNothing();
  const [row] = await db.select({ id: s.mediaEntity.id }).from(s.mediaEntity)
    .where(and(eq(s.mediaEntity.kind, kind), eq(s.mediaEntity.tmdbId, r.id)));
  if (!row) return null;
  await db.insert(s.mediaTitle).values({ mediaId: row.id, locale, title: localized })
    .onConflictDoUpdate({ target: [s.mediaTitle.mediaId, s.mediaTitle.locale], set: { title: localized } });
  return { id: row.id, kind, title: localized, year, posterPath: r.poster_path ?? null };
}

/** Searches TMDB and stores results as canonical media_entity rows (+ localized title). */
export async function searchTmdb(q: string, locale: string): Promise<MediaSummary[]> {
  if (!tmdbEnabled() || q.trim().length < 2) return [];
  const json = (await tmdbGet("/search/multi", { query: q.trim(), language: LANG[locale] ?? "it-IT", include_adult: "false" })) as { results?: TmdbResult[] } | null;
  const db = await getDb();
  const out: MediaSummary[] = [];
  for (const r of (json?.results ?? []).filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, 10)) {
    const m = await upsertTmdbResult(db, r, locale);
    if (m) out.push(m);
  }
  return out;
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
  const db = await getDb();
  const out: MediaSummary[] = [];
  for (const r of (json?.results ?? []).slice(0, 12)) {
    const m = await upsertTmdbResult(db, { ...r, media_type: type }, locale);
    if (m) out.push(m);
  }
  return out;
}
