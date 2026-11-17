import "server-only";
import {
  ANILIST_BY_ID_QUERY, ANILIST_BY_MAL_QUERY, aniMediaFields, type AniMedia, type ImportRow,
} from "@/lib/core/import-parsers";
import { tmdbEnabled } from "@/lib/tmdb";

/* Everything that decorates an imported row (cover, TMDB id, localized titles) comes from here, from TMDB and AniList,
 * never from the browser: members see each other's titles, so the browser mustn't be able to choose what they load. */

const LANG: Record<string, string> = { it: "it-IT", en: "en-US", es: "es-ES" };
const uniq = <T>(xs: T[]) => [...new Set(xs)];

/** Runs `fn` over `items` with at most `limit` in flight. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/* ───────────── Films and series → TMDB ───────────── */

type TmdbHit = {
  id: number; title?: string; name?: string; original_title?: string; original_name?: string;
  release_date?: string; first_air_date?: string; poster_path?: string | null;
};

const headers = () => ({ Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` });
const safePoster = (p: string | null | undefined) => (p && /^\/[\w-]+\.(jpg|png)$/.test(p) ? p : null);
const yearOf = (h: TmdbHit) => Number((h.release_date || h.first_air_date || "").slice(0, 4)) || null;

async function tmdbJson<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(6000) });
  return res.ok ? ((await res.json()) as T) : null;
}

/**
 * Finds each film or series on TMDB, in this order of trust: its TMDB id (Trakt), its IMDb id (IMDb, Trakt), then title and
 * year. A title match needs the year within one year of the source's (when there is one): a wrong cover is worse than none.
 * Without a TMDB token, rows pass through unchanged. Names are TMDB's, never the browser's.
 */
export async function enrichMovies(rows: ImportRow[], locale: string): Promise<ImportRow[]> {
  if (!tmdbEnabled()) return rows;
  const language = LANG[locale] ?? "it-IT";
  return pool(rows, 5, async (r) => {
    try {
      const type = r.kind === "tv" ? "tv" : "movie";
      let hit: TmdbHit | null = null;
      if (r.tmdbId) {
        hit = await tmdbJson<TmdbHit>(`/${type}/${r.tmdbId}`, { language });
      } else if (r.imdbId) {
        const found = await tmdbJson<{ movie_results?: TmdbHit[]; tv_results?: TmdbHit[] }>(`/find/${r.imdbId}`, { external_source: "imdb_id", language });
        hit = (type === "tv" ? found?.tv_results : found?.movie_results)?.[0] ?? null;
      }
      if (!hit) {
        const results = (await tmdbJson<{ results?: TmdbHit[] }>(`/search/${type}`, {
          query: r.title, language, include_adult: "false", ...(r.year ? { [type === "tv" ? "first_air_date_year" : "year"]: String(r.year) } : {}),
        }))?.results;
        hit = (results ?? []).find((h) => { const y = yearOf(h); return !r.year || !y || Math.abs(y - r.year) <= 1; }) ?? null;
      }
      if (!hit) return r;
      const localized = hit.title ?? hit.name;
      return {
        ...r, tmdbId: hit.id, originalTitle: hit.original_title ?? hit.original_name ?? r.title, year: r.year ?? yearOf(hit),
        posterPath: safePoster(hit.poster_path), titles: localized ? { [locale]: localized } : undefined,
      };
    } catch {
      return r; // a slow or failing lookup must not block the import: the title just gets no cover
    }
  });
}

/* ───────────── Anime → AniList ───────────── */

async function anilist(query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  return (await res.json()) as { data?: { Page?: { media?: AniMedia[] } } };
}

/** Fills titles, year and cover for anime rows, looked up by AniList id or (for MAL imports) MAL id. */
export async function enrichAnime(rows: ImportRow[]): Promise<ImportRow[]> {
  const byAnilist = new Map<number, AniMedia>();
  const byMal = new Map<number, AniMedia>();
  try {
    const aids = uniq(rows.flatMap((r) => (r.anilistId ? [r.anilistId] : [])));
    const mids = uniq(rows.flatMap((r) => (!r.anilistId && r.malId ? [r.malId] : [])));
    const [a, m] = await Promise.all([
      aids.length ? anilist(ANILIST_BY_ID_QUERY, { ids: aids }) : null,
      mids.length ? anilist(ANILIST_BY_MAL_QUERY, { ids: mids }) : null,
    ]);
    for (const x of a?.data?.Page?.media ?? []) byAnilist.set(x.id, x);
    for (const x of m?.data?.Page?.media ?? []) if (x.idMal) byMal.set(x.idMal, x);
  } catch {
    return rows; // AniList unreachable: import without covers; a later import fills them in
  }
  return rows.map((r) => {
    const media = (r.anilistId && byAnilist.get(r.anilistId)) || (r.malId && byMal.get(r.malId)) || null;
    if (!media) return r;
    const f = aniMediaFields(media);
    return { ...r, ...f, posterPath: f.posterPath && f.posterPath.startsWith("https://s4.anilist.co/") ? f.posterPath : null };
  });
}
