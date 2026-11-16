import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { MediaSummary } from "./data";

/* TMDB: free API is non-commercial and requires attribution (see <TmdbAttribution />). */

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

export const tmdbEnabled = () => Boolean(process.env.TMDB_API_TOKEN);

/** Searches TMDB and stores results as canonical media_entity rows (+ localized title). */
export async function searchTmdb(q: string, locale: string): Promise<MediaSummary[]> {
  if (!tmdbEnabled() || q.trim().length < 2) return [];
  const url = new URL("https://api.themoviedb.org/3/search/multi");
  url.searchParams.set("query", q.trim());
  url.searchParams.set("language", LANG[locale] ?? "it-IT");
  url.searchParams.set("include_adult", "false");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` } });
  if (!res.ok) return [];
  const { results } = (await res.json()) as { results: TmdbResult[] };

  const db = await getDb();
  const out: MediaSummary[] = [];
  for (const r of results.filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, 10)) {
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
    if (!row) continue;
    await db.insert(s.mediaTitle).values({ mediaId: row.id, locale, title: localized })
      .onConflictDoUpdate({ target: [s.mediaTitle.mediaId, s.mediaTitle.locale], set: { title: localized } });
    out.push({ id: row.id, kind, title: localized, year, posterPath: r.poster_path ?? null });
  }
  return out;
}
