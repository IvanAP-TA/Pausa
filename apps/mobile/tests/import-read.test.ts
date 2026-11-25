import { gzipSync, strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { letterboxdRows } from "@/features/import/parsers";
import { assertSomething, classifyLetterboxd, fetchAniList, fetchJikan, ImportReadError, parseFiles, type Picked } from "@/features/import/parsers/read";

const file = (name: string, text: string): Picked => ({ name, bytes: strToU8(text) });
const problem = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ImportReadError ? e.problem : `other:${String(e)}`;
  }
  return null;
};

const DIARY = "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-05,Past Lives,2023,https://boxd.it/aaa,4.5,,,2024-01-04\n";
const RATINGS = "Date,Name,Year,Letterboxd URI,Rating\n2022-08-10,Aftersun,2022,https://boxd.it/ccc,5\n";
const WATCHLIST = "Date,Name,Year,Letterboxd URI\n2026-08-12,The Wild Robot,2024,https://boxd.it/IWFy\n";
const LIST = 'Letterboxd list export v7\nDate,Name,Tags,URL,Description\n2026-03-01,"Slow nights",,https://boxd.it/abc12,"For rainy days."\n\nPosition,Name,Year,URL,Description\n1,Drive My Car,2021,https://boxd.it/sv94,\n';

describe("Letterboxd files", () => {
  it("reads the real export shape: a ZIP with diary and ratings at the top, a watchlist, lists/ and ignored folders", () => {
    const zip = zipSync({
      "diary.csv": strToU8(DIARY),
      "ratings.csv": strToU8(RATINGS),
      "watchlist.csv": strToU8(WATCHLIST),
      "lists/slow-nights.csv": strToU8(LIST),
      "deleted/diary.csv": strToU8(DIARY.replace("Past Lives", "Deleted One")),
      "likes/films.csv": strToU8("Date,Name,Year,Letterboxd URI\n2020-01-01,Liked,2019,https://boxd.it/zzz\n"),
    });
    const p = parseFiles("letterboxd", [{ name: "letterboxd-export.zip", bytes: zip }]);
    expect(p.rows.map((r) => r.title).sort()).toEqual(["Aftersun", "Past Lives"]);
    expect(p.lists?.map((l) => [l.name, l.kind, l.rows.length]).sort()).toEqual([["Slow nights", "list", 1], ["Watchlist", "watchlist", 1]]);
  });

  it("takes loose CSV files by name, or by header when they were renamed", () => {
    expect(classifyLetterboxd("diary.csv", "")).toBe("diary");
    expect(classifyLetterboxd("my export (1).csv", DIARY)).toBe("diary");
    expect(classifyLetterboxd("renamed.csv", RATINGS)).toBe("ratings");
    expect(classifyLetterboxd("x.csv", "Date,Name\n")).toBeNull();
    const p = parseFiles("letterboxd", [file("diary.csv", DIARY), file("ratings.csv", RATINGS)]);
    expect(p.rows).toHaveLength(2);
  });

  it("a diary without the Rewatch column used to crash the parser (v1 bug): now it reads", () => {
    const noRewatch = "Date,Name,Year,Letterboxd URI,Rating,Watched Date\n2024-01-05,Past Lives,2023,https://boxd.it/aaa,4.5,2024-01-04\n";
    expect(letterboxdRows({ diary: noRewatch }).rows).toMatchObject([{ title: "Past Lives", rewatch: false, watchedOn: "2024-01-04" }]);
  });

  it("says which problem it is: not a Letterboxd file, or a broken ZIP", () => {
    expect(problem(() => parseFiles("letterboxd", [file("notes.csv", "a,b\n1,2\n")]))).toBe("letterboxdFormat");
    expect(problem(() => parseFiles("letterboxd", [{ name: "x.zip", bytes: Uint8Array.from([0x50, 0x4b, 1, 2, 3]) }]))).toBe("read");
  });
});

describe("the other sources", () => {
  it("IMDb: a CSV reads; a ZIP is refused with its own message; a CSV that lost its Const column too", () => {
    const csv = "Const,Your Rating,Date Rated,Title,Title Type,Year\ntt0816692,10,2025-03-01,Interstellar,Movie,2014\n";
    expect(parseFiles("imdb", [file("ratings.csv", csv)]).rows).toHaveLength(1);
    expect(problem(() => parseFiles("imdb", [{ name: "x.zip", bytes: zipSync({ "a.csv": strToU8(csv) }) }]))).toBe("imdbZip");
    expect(problem(() => parseFiles("imdb", [file("ratings.csv", "Title;Year\nX;2000\n")]))).toBe("imdbFormat");
  });

  it("Trakt: every .json of the ZIP in any folder counts; macOS leftovers and other files do not", () => {
    const watched = JSON.stringify([{ plays: 1, last_watched_at: "2024-03-03T21:00:00.000Z", movie: { title: "Dune", year: 2021, ids: { tmdb: 438631 } } }]);
    const zip = zipSync({ "watched/watched-movies.json": strToU8(watched), "watched/._watched-movies.json": strToU8("garbage"), "notes.txt": strToU8("hi") });
    const p = parseFiles("trakt", [{ name: "trakt.zip", bytes: zip }]);
    expect(p.rows.map((r) => r.title)).toEqual(["Dune"]);
    expect(problem(() => parseFiles("trakt", [file("a.json", "<html>")]))).toBe("traktJson");
    expect(problem(() => parseFiles("trakt", [file("a.json", JSON.stringify({ hello: 1 }))]))).toBe("traktFormat");
  });

  it("Cinemaniac: a backup reads, with its watchlist as a list; another JSON is refused", () => {
    const bak = JSON.stringify({ app: "Cinemaniac", movies: [{ id_movie: 1, title: "Seen", year: 2015, date: Date.UTC(2023, 4, 2), seen: 1, note: "" }, { id_movie: 2, title: "Later", seen: 0 }], shows: [], ratings: [] });
    const p = parseFiles("cinemaniac", [file("Cinemaniac.bak", bak)]);
    expect(p.rows).toHaveLength(1);
    expect(p.lists?.[0].rows).toHaveLength(1);
    expect(problem(() => parseFiles("cinemaniac", [file("x.json", JSON.stringify({ app: "Other", movies: [] }))]))).toBe("cinemaniacFormat");
  });

  it("MyAnimeList: a .xml.gz is unpacked by its first bytes, a plain .xml works too", () => {
    const xml = "<myanimelist><anime><series_animedb_id>1</series_animedb_id><series_title><![CDATA[Cowboy Bebop]]></series_title><my_score>10</my_score><my_status>Completed</my_status><my_finish_date>2020-02-01</my_finish_date></anime></myanimelist>";
    expect(parseFiles("mal", [{ name: "animelist.xml.gz", bytes: gzipSync(strToU8(xml)) }]).rows).toMatchObject([{ malId: 1, title: "Cowboy Bebop", rating: 10, watchedOn: "2020-02-01" }]);
    expect(parseFiles("mal", [file("animelist.xml", xml)]).rows).toHaveLength(1);
  });

  it("an empty result is 'empty', not a blank summary", () => {
    expect(problem(() => assertSomething({ rows: [], undated: 0 }))).toBe("empty");
    expect(assertSomething({ rows: [], lists: [{ name: "W", description: null, kind: "watchlist", rows: [] }], undated: 0 }).lists).toHaveLength(1);
  });
});

describe("AniList and Jikan are asked from the device", () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("AniList: pages until it says there is no next chunk; sends the user name; 404 is 'not found'; other errors 'down'", async () => {
    const calls: unknown[] = [];
    let n = 0;
    const doFetch = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)).variables);
      return res(200, { data: { MediaListCollection: { hasNextChunk: ++n < 3, lists: [] } } });
    }) as unknown as typeof fetch;
    expect(await fetchAniList("giulia", doFetch)).toHaveLength(3);
    expect(calls).toEqual([{ userName: "giulia", chunk: 1 }, { userName: "giulia", chunk: 2 }, { userName: "giulia", chunk: 3 }]);
    await expect(fetchAniList("x", (async () => res(404, {})) as unknown as typeof fetch)).rejects.toMatchObject({ problem: "anilistNotFound" });
    await expect(fetchAniList("x", (async () => res(500, {})) as unknown as typeof fetch)).rejects.toMatchObject({ problem: "anilistDown" });
  });

  it("Jikan: goes page by page, waits and retries on 429, and 404 is 'not found'", async () => {
    const waits: number[] = [];
    let call = 0;
    const doFetch = (async (url: string) => {
      call++;
      if (call === 1) return res(429, {}); // too fast: wait, then the same page again
      return res(200, { data: [{ watching_status: 2, score: 8, anime: { mal_id: call, title: `A${call}` } }], pagination: { has_next_page: url.endsWith("page=1") } });
    }) as unknown as typeof fetch;
    const pages = await fetchJikan("me", doFetch, async (ms) => void waits.push(ms));
    expect(pages).toHaveLength(2);
    expect(waits).toEqual([1500, 400]);
    await expect(fetchJikan("nobody", (async () => res(404, {})) as unknown as typeof fetch, async () => undefined)).rejects.toMatchObject({ problem: "malNotFound" });
  });
});
