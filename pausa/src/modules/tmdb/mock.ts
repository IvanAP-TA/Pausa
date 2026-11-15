import type { TmdbMovie } from "./mapper";
import type { TmdbSearchResult } from "./client";

export type MediaType = "movie" | "tv" | "anime";

export interface MockEntry extends TmdbMovie {
  type: MediaType;
}

// Catalogo mock (titoli reali, nessuna chiamata di rete). Poster path TMDB veri.
export const MOCK_CATALOG: MockEntry[] = [
  // Film
  { type: "movie", id: 27205, title: "Inception", release_date: "2010-07-15", poster_path: "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg", overview: "Un ladro che ruba segreti dal subconscio.", imdb_id: "tt1375666" },
  { type: "movie", id: 157336, title: "Interstellar", release_date: "2014-11-05", poster_path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", overview: "Esploratori attraversano un wormhole.", imdb_id: "tt0816692" },
  { type: "movie", id: 155, title: "The Dark Knight", release_date: "2008-07-16", poster_path: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", overview: "Batman contro il Joker.", imdb_id: "tt0468569" },
  { type: "movie", id: 680, title: "Pulp Fiction", release_date: "1994-09-10", poster_path: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg", overview: "Storie intrecciate di criminali a Los Angeles.", imdb_id: "tt0110912" },
  { type: "movie", id: 550, title: "Fight Club", release_date: "1999-10-15", poster_path: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", overview: "Un impiegato insonne fonda un fight club.", imdb_id: "tt0137523" },
  { type: "movie", id: 603, title: "The Matrix", release_date: "1999-03-30", poster_path: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", overview: "La realtà è una simulazione.", imdb_id: "tt0133093" },
  { type: "movie", id: 278, title: "The Shawshank Redemption", release_date: "1994-09-23", poster_path: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg", overview: "Amicizia e speranza in un carcere.", imdb_id: "tt0111161" },
  { type: "movie", id: 807, title: "Se7en", release_date: "1995-09-22", poster_path: "/6yoghtyTpznpBik8EngEmJskVUO.jpg", overview: "Due detective sulle tracce di un serial killer.", imdb_id: "tt0114369" },
  { type: "movie", id: 129, title: "La città incantata", release_date: "2001-07-20", poster_path: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg", overview: "Una bambina nel mondo degli spiriti.", imdb_id: "tt0245429" },
  // Serie TV
  { type: "tv", id: 1396, title: "Breaking Bad", release_date: "2008-01-20", poster_path: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", overview: "Un prof di chimica diventa produttore di meth." },
  { type: "tv", id: 1398, title: "The Sopranos", release_date: "1999-01-10", poster_path: "/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg", overview: "Un boss mafioso in terapia." },
  { type: "tv", id: 87108, title: "Chernobyl", release_date: "2019-05-06", poster_path: "/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg", overview: "Il disastro nucleare del 1986." },
  // Anime
  { type: "anime", id: 1429, title: "Attack on Titan", release_date: "2013-04-07", poster_path: "/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg", overview: "L'umanità contro i Giganti." },
  { type: "anime", id: 31911, title: "Fullmetal Alchemist: Brotherhood", release_date: "2009-04-05", poster_path: "/5ZFUEOULaVml7pQuXxhpR2SmVUw.jpg", overview: "Due fratelli alchimisti." },
  { type: "anime", id: 13916, title: "Death Note", release_date: "2006-10-04", poster_path: "/g8hHbsRmHYoCxUIBey7NfWNNfh5.jpg", overview: "Un quaderno che uccide." },
];

export function mockSearch(q: string, type?: MediaType): (TmdbSearchResult & { type: MediaType })[] {
  const needle = q.trim().toLowerCase();
  return MOCK_CATALOG.filter(
    (m) => m.title.toLowerCase().includes(needle) && (!type || m.type === type),
  ).map((m) => ({ id: m.id, title: m.title, release_date: m.release_date, poster_path: m.poster_path, type: m.type }));
}

export function mockMovie(tmdbId: number): MockEntry {
  const found = MOCK_CATALOG.find((m) => m.id === tmdbId);
  if (!found) throw new Error(`Mock media ${tmdbId} not found`);
  return found;
}
