import "server-only";
import { inArray, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { MediaSummary } from "./data";
import { parseAniListEpisodes } from "./core/episodes";

/* AniList's public GraphQL API (no key needed): anime search, episode counts and where an anime streams. Covers are only
 * ever stored when they come from AniList's own CDN, never from a URL somebody typed (see the import code for the same rule). */

const ENDPOINT = "https://graphql.anilist.co";
const COVER_HOST = "https://s4.anilist.co/";

async function query<T>(q: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: q, variables }),
      next: { revalidate: 3600 },
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null; // AniList down: the rest of the app keeps working
  }
}

type SearchMedia = {
  id: number; idMal: number | null; seasonYear: number | null; startDate?: { year: number | null } | null;
  title: { romaji: string | null; english: string | null; native: string | null }; coverImage?: { large: string | null } | null; episodes: number | null;
};

const SEARCH = `query($search: String) { Page(perPage: 8) { media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
  id idMal seasonYear startDate { year } title { romaji english native } coverImage { large } episodes } } }`;

/** Searches AniList for anime and stores each hit as a media_entity (kind "anime", with its AniList and MAL ids). */
export async function searchAnime(q: string, locale: string): Promise<MediaSummary[]> {
  if (q.trim().length < 2) return [];
  const json = await query<{ data?: { Page?: { media?: SearchMedia[] } } }>(SEARCH, { search: q.trim() });
  const media = json?.data?.Page?.media ?? [];
  if (media.length === 0) return [];

  const rows = media.map((m) => ({
    anilistId: m.id,
    malId: m.idMal,
    original: m.title.romaji ?? m.title.english ?? m.title.native ?? `AniList ${m.id}`,
    localized: m.title.english ?? m.title.romaji ?? m.title.native ?? `AniList ${m.id}`,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    poster: m.coverImage?.large?.startsWith(COVER_HOST) ? m.coverImage.large : null,
    episodes: m.episodes,
  }));

  const db = await getDb();
  await db.insert(s.mediaEntity)
    .values(rows.map((r) => ({ kind: "anime" as const, anilistId: r.anilistId, malId: r.malId, originalTitle: r.original, year: r.year, posterPath: r.poster, episodesTotal: r.episodes })))
    .onConflictDoNothing();
  const found = await db.select({ id: s.mediaEntity.id, anilistId: s.mediaEntity.anilistId }).from(s.mediaEntity).where(inArray(s.mediaEntity.anilistId, rows.map((r) => r.anilistId)));
  const idOf = new Map(found.map((f) => [f.anilistId, f.id]));
  const withId = rows.flatMap((r) => { const id = idOf.get(r.anilistId); return id ? [{ ...r, id }] : []; });
  if (withId.length) {
    await db.insert(s.mediaTitle).values(withId.map((r) => ({ mediaId: r.id, locale, title: r.localized })))
      .onConflictDoUpdate({ target: [s.mediaTitle.mediaId, s.mediaTitle.locale], set: { title: sql`excluded.title` } });
  }
  return withId.map((r) => ({ id: r.id, kind: "anime" as const, title: r.localized, year: r.year, posterPath: r.poster }));
}

/** Episode count of one anime (the total, or what has aired so far while it still runs). */
export async function animeEpisodes(anilistId: number): Promise<number | null> {
  const json = await query(`query($id: Int) { Media(id: $id, type: ANIME) { episodes nextAiringEpisode { episode } } }`, { id: anilistId });
  return parseAniListEpisodes(json);
}

/** Names of the services AniList links to for watching this anime ("Crunchyroll", "Netflix"...). */
export async function animeStreamingSites(anilistId: number): Promise<string[]> {
  const json = await query<{ data?: { Media?: { externalLinks?: { site: string; type: string }[] } } }>(
    `query($id: Int) { Media(id: $id, type: ANIME) { externalLinks { site type } } }`, { id: anilistId });
  return (json?.data?.Media?.externalLinks ?? []).filter((l) => l.type === "STREAMING").map((l) => l.site);
}
