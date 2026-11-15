export interface TmdbMovie {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  imdb_id?: string | null;
}

export interface NewMediaEntity {
  tmdbId: number;
  imdbId: string | null;
  anilistId: null;
  type: "movie";
  title: string;
  year: number | null;
  posterPath: string | null;
  overview: string | null;
}

export function mapTmdbMovie(raw: TmdbMovie): NewMediaEntity {
  const parsed = raw.release_date ? Number(raw.release_date.slice(0, 4)) : null;
  const year = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  return {
    tmdbId: raw.id,
    imdbId: raw.imdb_id ?? null,
    anilistId: null,
    type: "movie",
    title: raw.title,
    year,
    posterPath: raw.poster_path ?? null,
    overview: raw.overview ?? null,
  };
}
