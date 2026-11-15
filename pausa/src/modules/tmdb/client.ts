import type { TmdbMovie } from "./mapper";

const BASE = "https://api.themoviedb.org/3";

export async function tmdbGet<T>(
  apiKey: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json() as Promise<T>;
}

export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
}

export async function searchMovies(apiKey: string, q: string): Promise<TmdbSearchResult[]> {
  const data = await tmdbGet<{ results: TmdbSearchResult[] }>(apiKey, "/search/movie", { query: q });
  return data.results;
}

export async function fetchMovie(apiKey: string, tmdbId: number): Promise<TmdbMovie> {
  return tmdbGet<TmdbMovie>(apiKey, `/movie/${tmdbId}`);
}
