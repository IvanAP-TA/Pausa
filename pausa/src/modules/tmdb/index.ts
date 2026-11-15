import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { mediaEntities } from "@/db/schema";
import { newId } from "@/lib/id";
import { mapTmdbMovie } from "./mapper";
import { fetchMovie, searchMovies as searchMoviesReal, type TmdbSearchResult } from "./client";
import { mockSearch, mockMovie, type MediaType } from "./mock";

export type { TmdbSearchResult } from "./client";
export type { MediaType } from "./mock";

function isMock(apiKey: string): boolean {
  return !apiKey || apiKey === "mock";
}

export async function searchMovies(apiKey: string, q: string): Promise<TmdbSearchResult[]> {
  if (isMock(apiKey)) return mockSearch(q);
  return searchMoviesReal(apiKey, q);
}

// Unified search across movie / tv / anime (Fase 3).
export async function searchMedia(
  apiKey: string,
  q: string,
  type?: MediaType,
): Promise<(TmdbSearchResult & { type: MediaType })[]> {
  if (isMock(apiKey)) return mockSearch(q, type);
  // Real API would call /search/multi; mock-only for now.
  const movies = await searchMoviesReal(apiKey, q);
  return movies.map((m) => ({ ...m, type: "movie" as const }));
}

export async function getOrCacheMovie(db: Db, apiKey: string, tmdbId: number) {
  const existing = await db
    .select()
    .from(mediaEntities)
    .where(eq(mediaEntities.tmdbId, tmdbId))
    .get();
  if (existing) return existing;

  if (isMock(apiKey)) {
    const raw = mockMovie(tmdbId);
    const mapped = mapTmdbMovie(raw);
    const row = { id: newId(), ...mapped, type: raw.type, cachedAt: new Date() };
    return db.insert(mediaEntities).values(row).returning().get();
  }

  const raw = await fetchMovie(apiKey, tmdbId);
  const mapped = mapTmdbMovie(raw);
  const row = { id: newId(), ...mapped, cachedAt: new Date() };
  return db.insert(mediaEntities).values(row).returning().get();
}
