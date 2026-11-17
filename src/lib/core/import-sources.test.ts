import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { log, mediaEntity } from "../../db/schema";
import { importRows } from "./import";
import { imdbRows, jikanRows, traktRows, type ImportRow } from "./import-parsers";
import type { AnyDb } from "./db-types";
import { createTestDb, seedUsers } from "./test-db";

describe("IMDb ratings.csv", () => {
  const csv = [
    "Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors",
    "tt0816692,10,2025-03-01,Interstellar,Interstellar,https://x,Movie,8.7,169,2014,Sci-Fi,1,2014-11-05,Nolan",
    "tt0903747,9,2024-06-10,Breaking Bad,Breaking Bad,https://x,TV Series,9.5,49,2008,Crime,1,2008-01-20,",
    "tt2085059,8,2024-07-01,Black Mirror,Black Mirror,https://x,TV Mini Series,8.7,60,2011,Sci-Fi,1,2011-12-04,",
    "tt1234567,7,2024-08-01,Some Episode,Some Episode,https://x,TV Episode,7.0,45,2015,Drama,1,2015-01-01,",
    "tt7654321,6,2024-08-02,A Game,A Game,https://x,Video Game,7.0,0,2015,Action,1,2015-01-01,",
    "tt0816692,10,2025-03-01,Interstellar,Interstellar,https://x,Movie,8.7,169,2014,Sci-Fi,1,2014-11-05,Nolan",
    "tt0000001,,not-a-date,Unrated,Unrated,https://x,Movie,5.0,10,2000,Short,1,2000-01-01,",
  ].join("\n");

  it("maps films and series, skips episodes and games, drops duplicates, handles gaps", () => {
    const { rows, skipped, undated } = imdbRows(csv);
    expect(rows.map((r) => [r.title, r.kind, r.rating, r.watchedOn, r.imdbId])).toEqual([
      ["Interstellar", "movie", 10, "2025-03-01", "tt0816692"],
      ["Breaking Bad", "tv", 9, "2024-06-10", "tt0903747"],
      ["Black Mirror", "tv", 8, "2024-07-01", "tt2085059"],
      ["Unrated", "movie", null, null, "tt0000001"],
    ]);
    expect(skipped).toEqual({ episodes: 1, other: 1 });
    expect(undated).toBe(1);
  });

  it("ignores rows without a valid IMDb id or title", () => {
    expect(imdbRows("Const,Your Rating,Date Rated,Title,Title Type,Year\nnope,5,2024-01-01,X,Movie,2000\ntt1,5,2024-01-01,,Movie,2000").rows).toEqual([]);
  });
});

describe("Trakt export", () => {
  const files = {
    watchedMovies: JSON.stringify([
      { plays: 2, last_watched_at: "2025-05-05T20:00:00.000Z", movie: { title: "Dune", year: 2021, ids: { imdb: "tt1160419", tmdb: 438631 } } },
      { plays: 1, last_watched_at: "2024-01-02T20:00:00.000Z", movie: { title: "Perfect Days", year: 2023, ids: { tmdb: 976893 } } },
    ]),
    watchedShows: JSON.stringify([{ plays: 20, last_watched_at: "2023-09-09T10:00:00Z", show: { title: "Severance", year: 2022, ids: { imdb: "tt11280740", tmdb: 95396 } } }]),
    ratingsMovies: JSON.stringify([
      { rated_at: "2025-05-06T00:00:00Z", rating: 9, movie: { title: "Dune", year: 2021, ids: { tmdb: 438631 } } },
      { rated_at: "2022-02-02T00:00:00Z", rating: 7, movie: { title: "Never Watched", year: 2010, ids: { tmdb: 1 } } },
    ]),
    ratingsShows: JSON.stringify([{ rated_at: "2023-09-10T00:00:00Z", rating: 10, show: { title: "Severance", year: 2022, ids: { tmdb: 95396 } } }]),
  };

  it("one row per title, dated by the last watch, rated from the ratings files", () => {
    const { rows, undated } = traktRows(files);
    const by = (t: string) => rows.find((r) => r.title === t)!;
    expect(by("Dune")).toMatchObject({ kind: "movie", watchedOn: "2025-05-05", rating: 9, rewatch: true, tmdbId: 438631, imdbId: "tt1160419" });
    expect(by("Perfect Days")).toMatchObject({ watchedOn: "2024-01-02", rating: null, rewatch: false });
    expect(by("Severance")).toMatchObject({ kind: "tv", watchedOn: "2023-09-09", rating: 10 });
    expect(by("Never Watched")).toMatchObject({ rating: 7, watchedOn: "2022-02-02" }); // a rating you gave still counts
    expect(rows).toHaveLength(4);
    expect(undated).toBe(0);
  });

  it("survives missing files and broken JSON", () => {
    expect(traktRows({})).toEqual({ rows: [], undated: 0 });
    expect(traktRows({ watchedMovies: "not json" }).rows).toEqual([]);
  });
});

describe("MyAnimeList through Jikan", () => {
  const page = (data: unknown[], more = false) => ({ data, pagination: { has_next_page: more } }) as never;
  it("completed anime only, one row per MAL id, rated 1..10, dated when Jikan says", () => {
    const { rows, undated } = jikanRows([
      page([
        { watching_status: 2, score: 9, finish_date: "2021-05-05T00:00:00+00:00", anime: { mal_id: 16498, title: "Shingeki no Kyojin", year: 2013 } },
        { watching_status: 1, score: 0, anime: { mal_id: 20, title: "Naruto" } },
        { watching_status: 2, score: 0, anime: { mal_id: 1, title: "Cowboy Bebop" } },
      ], true),
      page([{ watching_status: 2, score: 8, anime: { mal_id: 16498, title: "dup" } }, { watching_status: "Completed", score: 7, start_date: "2020-01-01", anime: { mal_id: 5114, title: "Fullmetal Alchemist: Brotherhood" } }]),
    ]);
    expect(rows.map((r) => [r.title, r.malId, r.rating, r.watchedOn])).toEqual([
      ["Shingeki no Kyojin", 16498, 9, "2021-05-05"],
      ["Cowboy Bebop", 1, null, null],
      ["Fullmetal Alchemist: Brotherhood", 5114, 7, "2020-01-01"],
    ]);
    expect(undated).toBe(1);
  });
  it("is empty for nothing", () => {
    expect(jikanRows([])).toEqual({ rows: [], undated: 0 });
    expect(jikanRows([page([])]).rows).toEqual([]);
  });
});

describe("importing series and IMDb ids", () => {
  let db: AnyDb;
  beforeEach(async () => { db = await createTestDb(); await seedUsers(db, ["Ann", "Bob"]); });
  const row = (o: Partial<ImportRow>): ImportRow => ({ source: "imdb", kind: "movie", title: "Dune", year: 2021, rating: 8, watchedOn: "2025-01-01", rewatch: false, review: null, ...o });
  const opts = { includeReviews: true, includeUndated: false, today: "2026-12-01" };

  it("a series and a film with the same TMDB number are two different titles", async () => {
    await importRows(db, "u-ann", [row({ kind: "movie", tmdbId: 100, title: "A film" }), row({ kind: "tv", tmdbId: 100, title: "A series", source: "trakt" })], opts);
    const media = await db.select().from(mediaEntity);
    expect(media.map((m) => [m.kind, m.tmdbId]).sort()).toEqual([["movie", 100], ["tv", 100]]);
  });

  it("the same IMDb id joins what someone already logged", async () => {
    await importRows(db, "u-ann", [row({ imdbId: "tt1160419", tmdbId: 438631 })], opts);
    const res = await importRows(db, "u-bob", [row({ imdbId: "tt1160419", title: "Dune (2021)", tmdbId: null })], opts);
    expect(res.newTitles).toBe(0);
    expect((await db.select().from(mediaEntity)).length).toBe(1);
    expect((await db.select().from(log).where(eq(log.userId, "u-bob"))).length).toBe(1);
  });

  it("is idempotent: importing the same file twice adds nothing the second time", async () => {
    const rows = [row({ imdbId: "tt1", title: "One" }), row({ imdbId: "tt2", title: "Two", kind: "tv" })];
    expect((await importRows(db, "u-ann", rows, opts)).imported).toBe(2);
    expect(await importRows(db, "u-ann", rows, opts)).toMatchObject({ imported: 0, alreadyHad: 2 });
  });
});
