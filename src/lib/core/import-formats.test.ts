import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cinemaniacBackup, imdbRows, traktJsonRows } from "./import-parsers";

/* The shapes the real exports arrive in, beyond the tidy cases of import-sources.test.ts. */

describe("IMDb: what people actually upload", () => {
  const header = "Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors";

  it("reads today's and yesterday's spellings of the title type, with a BOM and Windows line ends", () => {
    const csv = "﻿" + [
      header,
      'tt0111161,10,2024-01-05,"The Shawshank Redemption","The Shawshank Redemption",https://x,Movie,9.3,142,1994,Drama,1,1994-10-14,Frank Darabont',
      "tt0944947,9,2023-02-02,Game of Thrones,Game of Thrones,https://x,tvSeries,9.2,57,2011,Drama,1,2011-04-17,",
      "tt7366338,9,2023-03-03,Chernobyl,Chernobyl,https://x,tvMiniSeries,9.3,330,2019,Drama,1,2019-05-06,",
      "tt0000002,7,2023-04-04,Direct to Video,Direct to Video,https://x,Video,6.0,80,2001,Action,1,2001-01-01,",
      "tt0000003,6,2023-05-05,A Special,A Special,https://x,TV Special,6.0,60,2015,Comedy,1,2015-01-01,",
      'tt0000004,8,2023-06-06,"Comma, The Film","Comma, The Film",https://x,TV Movie,6.0,90,2010,"Drama, Comedy",1,2010-01-01,"A, B"',
      "tt0000005,8,2023-07-07,A Podcast,A Podcast,https://x,Podcast Series,6.0,,2020,,1,,",
    ].join("\r\n") + "\r\n";
    const { rows, skipped, recognized } = imdbRows(csv);
    expect(recognized).toBe(true);
    expect(rows.map((r) => [r.title, r.kind, r.year, r.rating])).toEqual([
      ["The Shawshank Redemption", "movie", 1994, 10],
      ["Game of Thrones", "tv", 2011, 9],
      ["Chernobyl", "tv", 2019, 9],
      ["Direct to Video", "movie", 2001, 7],
      ["A Special", "movie", 2015, 6],
      ["Comma, The Film", "movie", 2010, 8],
    ]);
    expect(skipped).toEqual({ episodes: 0, other: 1 });
  });

  it("reads a list or watchlist export: same titles, no vote and no date", () => {
    const csv = [
      "Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors,Your Rating,Date Rated",
      "1,tt0816692,2024-01-01,2024-01-01,,Interstellar,Interstellar,https://x,Movie,8.7,169,2014,Sci-Fi,1,2014-11-05,Nolan,,",
    ].join("\n");
    const { rows, undated, recognized } = imdbRows(csv);
    expect(recognized).toBe(true);
    expect(rows).toMatchObject([{ title: "Interstellar", imdbId: "tt0816692", rating: null, watchedOn: null }]);
    expect(undated).toBe(1);
  });

  it("never sends the server a year or a date it would refuse", () => {
    const { rows } = imdbRows([header, "tt0000006,8,05/06/2023,Old,Old,https://x,Movie,6.0,1,1850,,1,,", "tt0000007,8,2023-06-05 10:00,Time,Time,https://x,Movie,6.0,1,,,1,,"].join("\n"));
    expect(rows.map((r) => [r.year, r.watchedOn])).toEqual([[null, null], [null, "2023-06-05"]]);
  });

  it("says when the file is something else", () => {
    expect(imdbRows("Date,Name,Year,Letterboxd URI\n2024-01-01,Dune,2021,https://boxd.it/abc").recognized).toBe(false);
    expect(imdbRows("").recognized).toBe(false);
    expect(imdbRows("Const;Your Rating;Title\ntt1;5;X").recognized).toBe(false); // re-saved by a spreadsheet with semicolons
    expect(imdbRows(header + "\n")).toMatchObject({ rows: [], recognized: true }); // the right file, with nothing in it
  });
});

describe("Trakt: every file of the export, whatever it is called", () => {
  const movie = (title: string, year: number, tmdb: number, imdb?: string) => ({ title, year, ids: { trakt: tmdb, slug: title.toLowerCase(), tmdb, ...(imdb ? { imdb } : {}) } });

  it("tells viewings and ratings from watchlist, collection and comments by what the entries hold", () => {
    const watched = JSON.stringify([{ plays: 1, last_watched_at: "2024-03-03T21:00:00.000Z", last_updated_at: "2024-03-03T21:00:00.000Z", movie: movie("Dune", 2021, 438631, "tt1160419") }]);
    const watchlist = JSON.stringify([{ rank: 1, id: 9, listed_at: "2024-01-01T00:00:00.000Z", type: "movie", movie: movie("Not Seen Yet", 2025, 77) }]);
    const collection = JSON.stringify([{ collected_at: "2020-01-01T00:00:00.000Z", updated_at: "2020-01-01T00:00:00.000Z", movie: movie("On The Shelf", 1999, 78) }]);
    const comments = JSON.stringify([{ type: "movie", comment: { id: 1, comment: "great" }, movie: movie("Commented", 2000, 79) }]);
    const ratings = JSON.stringify([{ rated_at: "2024-03-04T00:00:00.000Z", rating: 8, type: "movie", movie: movie("Dune", 2021, 438631) }]);
    const { rows, recognized, broken } = traktJsonRows([watchlist, collection, comments, ratings, watched]); // ratings before watched: order must not matter
    expect(recognized).toBe(true);
    expect(broken).toBe(0);
    expect(rows).toMatchObject([{ title: "Dune", kind: "movie", rating: 8, watchedOn: "2024-03-03", tmdbId: 438631, imdbId: "tt1160419", rewatch: false }]);
    expect(rows).toHaveLength(1);
  });

  it("reads the history: films by play, a show from its episodes, a second play is a rewatch", () => {
    const history = JSON.stringify([
      { id: 3, watched_at: "2025-02-02T20:00:00.000Z", action: "watch", type: "movie", movie: movie("Dune", 2021, 438631) },
      { id: 2, watched_at: "2023-01-01T20:00:00.000Z", action: "watch", type: "movie", movie: movie("Dune", 2021, 438631) },
      { id: 1, watched_at: "2022-05-05T20:00:00.000Z", action: "watch", type: "episode", episode: { season: 1, number: 2, title: "Half Loop" }, show: movie("Severance", 2022, 95396) },
      { id: 0, watched_at: "2022-05-01T20:00:00.000Z", action: "watch", type: "episode", episode: { season: 1, number: 1, title: "Good News" }, show: movie("Severance", 2022, 95396) },
    ]);
    const episodeVote = JSON.stringify([{ rated_at: "2022-05-06T00:00:00.000Z", rating: 10, type: "episode", episode: { season: 1, number: 2 }, show: movie("Severance", 2022, 95396) }]);
    const { rows } = traktJsonRows([history, episodeVote]);
    expect(rows).toMatchObject([
      { title: "Dune", kind: "movie", watchedOn: "2025-02-02", rewatch: true },
      { title: "Severance", kind: "tv", watchedOn: "2022-05-05", rewatch: false, rating: null }, // a vote on an episode is not a vote on the show
    ]);
  });

  it("says when nothing in the files is from Trakt, and when a file is not JSON at all", () => {
    expect(traktJsonRows([JSON.stringify({ username: "me" }), JSON.stringify([{ listed_at: "2024-01-01", movie: { title: "X" } }])])).toMatchObject({ rows: [], recognized: false, broken: 0 });
    expect(traktJsonRows(["<html>"])).toMatchObject({ recognized: false, broken: 1 });
    expect(traktJsonRows([])).toMatchObject({ rows: [], recognized: false, broken: 0 });
  });
});

describe("the import screen's own texts", () => {
  // The bug that kept IMDb and Trakt from opening at all: their steps were saved as {"0": …} instead of a list.
  it("every source's steps are a list of sentences, in every language", () => {
    for (const locale of ["it", "en", "es"]) {
      const m = JSON.parse(readFileSync(`./messages/${locale}.json`, "utf8")).import;
      for (const source of ["letterboxd", "imdb", "trakt", "mal"]) {
        expect(Array.isArray(m[source].steps), `${locale} ${source}`).toBe(true);
        expect(m[source].steps.every((s: unknown) => typeof s === "string" && s.length > 0)).toBe(true);
      }
    }
  });
});

describe("Cinemaniac: the .bak backup of the Android app", () => {
  const now = Date.UTC(2026, 10, 21);
  const movie = (id: number, title: string, seen: 0 | 1, date: number, extra = {}) => ({
    id_movie: id, title, year: 2015, rating: 7.1, duration: 120, genres: "35,18", overview: "…", date, backdrop: "x.jpg", seen, note: "", categories: "", ...extra,
  });
  const show = (id: number, title: string, seen: number, date: number) => ({
    id_tv: id, title, first_air_date: Date.UTC(2007, 8, 24), last_air_date: 0, rating: 7.7, duration: 43, genres: "35", overview: "…", date,
    backdrop: "/y.jpg", watching: 1, episodes: 10, episodes_seen: seen, seasons: "[[1,1]]", note: "", categories: "",
  });
  const backup = (body: object) => JSON.stringify({ app: "Cinemaniac", appVersion: 172, backupVersion: 11, settings: {}, categories: [], ...body });

  it("turns seen films and started series into viewings, with their votes, and the rest into the watchlist", () => {
    const { rows, watchlist, undated, recognized } = cinemaniacBackup(backup({
      ratings: [{ id: 1, r: 6.5 }, { id: 2, r: 8 }, { id: 3, r: 7.5 }],
      movies: [movie(1, "Seen And Rated", 1, Date.UTC(2023, 4, 2, 21)), movie(2, "Seen, Broken Date", 1, 824355210), movie(3, "Not Seen", 0, Date.UTC(2024, 0, 1))],
      shows: [show(10, "Started Show", 4, Date.UTC(2022, 7, 29)), show(11, "Show For Later", 0, Date.UTC(2025, 0, 1))],
    }), now);
    expect(recognized).toBe(true);
    expect(rows).toEqual([
      expect.objectContaining({ source: "cinemaniac", kind: "movie", title: "Seen And Rated", tmdbId: 1, rating: 7, watchedOn: "2023-05-02", review: null }),
      expect.objectContaining({ kind: "movie", title: "Seen, Broken Date", tmdbId: 2, rating: 8, watchedOn: null }), // 1970: an old bug of the app
      expect.objectContaining({ kind: "tv", title: "Started Show", tmdbId: 10, year: 2007, rating: null, watchedOn: "2022-08-29" }),
    ]);
    expect(undated).toBe(1);
    expect(watchlist).toMatchObject({ name: "Watchlist", kind: "watchlist" });
    expect(watchlist!.rows.map((r) => [r.kind, r.tmdbId, r.rating, r.watchedOn])).toEqual([["movie", 3, null, null], ["tv", 11, null, null]]); // a vote on an unseen film is not a viewing
  });

  it("keeps a note as the review, and skips entries without an id or a title", () => {
    const { rows, watchlist } = cinemaniacBackup(backup({
      ratings: [],
      movies: [movie(5, "With A Note", 1, Date.UTC(2024, 1, 1), { note: "  Visto al cinema  " }), movie(0, "No Id", 1, 0), { title: "Broken" }, null],
      shows: [],
    }), now);
    expect(rows).toHaveLength(1);
    expect(rows[0].review).toBe("Visto al cinema");
    expect(watchlist).toBeNull();
  });

  it("says when a file is not a Cinemaniac backup", () => {
    expect(cinemaniacBackup("not json").recognized).toBe(false);
    expect(cinemaniacBackup(JSON.stringify([{ movie: { title: "Trakt" } }])).recognized).toBe(false);
    expect(cinemaniacBackup(JSON.stringify({ app: "Other", movies: [] })).recognized).toBe(false);
  });
});
