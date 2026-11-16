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

/* ───────────── Films → TMDB ───────────── */

type TmdbHit = { id: number; title?: string; original_title?: string; release_date?: string; poster_path?: string | null };

/**
 * Finds each film on TMDB by title and year. A match needs the release year within one year of the Letterboxd year
 * (when there is one): a wrong cover is worse than none. Without a TMDB token, rows pass through unchanged.
 */
export async function enrichMovies(rows: ImportRow[], locale: string): Promise<ImportRow[]> {
  if (!tmdbEnabled()) return rows;
  return pool(rows, 5, async (r) => {
    try {
      const url = new URL("https://api.themoviedb.org/3/search/movie");
      url.searchParams.set("query", r.title);
      if (r.year) url.searchParams.set("year", String(r.year));
      url.searchParams.set("language", LANG[locale] ?? "it-IT");
      url.searchParams.set("include_adult", "false");
      const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return r;
      const { results } = (await res.json()) as { results?: TmdbHit[] };
      const hit = (results ?? []).find((h) => !r.year || !h.release_date || Math.abs(Number(h.release_date.slice(0, 4)) - r.year) <= 1);
      if (!hit) return r;
      return {
        ...r, tmdbId: hit.id, originalTitle: hit.original_title ?? r.title,
        posterPath: hit.poster_path && /^\/[\w-]+\.(jpg|png)$/.test(hit.poster_path) ? hit.poster_path : null,
        titles: hit.title ? { [locale]: hit.title } : undefined,
      };
    } catch {
      return r; // a slow or failing lookup must not block the import: the film just gets no cover
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
