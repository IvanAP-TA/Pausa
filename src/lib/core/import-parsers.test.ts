import { describe, expect, it } from "vitest";
import { aniMediaFields, anilistRows, letterboxdRows, malRows, parseCsv, type AniListResponse } from "./import-parsers";

describe("parseCsv", () => {
  it("handles quotes, commas, doubled quotes and newlines inside a field", () => {
    const csv = 'Name,Review\n"Dune: Part Two","Loved it, honestly.\nSecond ""paragraph""."\nAftersun,\n';
    expect(parseCsv(csv)).toEqual([
      { Name: "Dune: Part Two", Review: 'Loved it, honestly.\nSecond "paragraph".' },
      { Name: "Aftersun", Review: "" },
    ]);
  });
  it("ignores a BOM, CRLF line endings and blank lines", () => {
    const BOM = String.fromCharCode(0xfeff);
    expect(parseCsv(`${BOM}A,B\r\n1,2\r\n\r\n3,4\r\n`)).toEqual([{ A: "1", B: "2" }, { A: "3", B: "4" }]);
  });
  it("returns nothing for an empty file", () => expect(parseCsv("")).toEqual([]));
});

describe("letterboxdRows", () => {
  const diary = [
    "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
    "2024-01-05,Past Lives,2023,https://boxd.it/aaa,4.5,,,2024-01-04",
    '2024-03-01,"Dune: Part Two",2024,https://boxd.it/bbb,,Yes,,2024-02-29',
    "2024-03-02,Past Lives,2023,https://boxd.it/aaa,5,Yes,,2024-03-02",
  ].join("\n");
  const reviews = [
    "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date",
    '2024-01-05,Past Lives,2023,https://boxd.it/aaa,4.5,,"Quiet, devastating.\nI cried.",,2024-01-04',
    '2023-05-01,Oppenheimer,2023,https://boxd.it/ooo,3.5,,"Long, loud.",,2023-04-30',
  ].join("\n");
  const ratings = [
    "Date,Name,Year,Letterboxd URI,Rating",
    "2024-03-01,Dune: Part Two,2024,https://boxd.it/bbb,4",
    "2022-08-10,Aftersun,2022,https://boxd.it/ccc,5",
  ].join("\n");
  const watched = [
    "Date,Name,Year,Letterboxd URI",
    "2022-08-10,Aftersun,2022,https://boxd.it/ccc",
    "2021-02-02,Perfect Days,2023,https://boxd.it/ddd",
  ].join("\n");

  const { rows, films, undated } = letterboxdRows({ diary, reviews, ratings, watched });
  const find = (title: string, date?: string) => rows.filter((r) => r.title === title && (!date || r.watchedOn === date));

  it("makes one row per viewing: diary entries, plus films that only appear in reviews, ratings or watched", () => {
    expect(rows).toHaveLength(6); // Past Lives ×2, Dune, Oppenheimer, Aftersun, Perfect Days
    expect(films).toBe(5);
    expect(undated).toBe(0);
  });
  it("uses the watched date, and converts ratings to half-stars", () => {
    expect(find("Past Lives", "2024-01-04")[0]).toMatchObject({ rating: 9, rewatch: false, kind: "movie", year: 2023, letterboxdUri: "https://boxd.it/aaa" });
    expect(find("Past Lives", "2024-03-02")[0]).toMatchObject({ rating: 10, rewatch: true });
  });
  it("attaches a review to its viewing, keeping commas and newlines", () => {
    expect(find("Past Lives", "2024-01-04")[0].review).toBe("Quiet, devastating.\nI cried.");
    expect(find("Past Lives", "2024-03-02")[0].review).toBeNull();
  });
  it("creates a viewing for a review the diary doesn't have", () => {
    expect(find("Oppenheimer")[0]).toMatchObject({ watchedOn: "2023-04-30", rating: 7, review: "Long, loud." });
  });
  it("fills a missing diary rating from ratings.csv", () => {
    expect(find("Dune: Part Two")[0]).toMatchObject({ rating: 8, rewatch: true, watchedOn: "2024-02-29" });
  });
  it("dates films that have no diary entry by when you rated or marked them", () => {
    expect(find("Aftersun")[0]).toMatchObject({ watchedOn: "2022-08-10", rating: 10 });
    expect(find("Perfect Days")[0]).toMatchObject({ watchedOn: "2021-02-02", rating: null });
  });
  it("works with only one file, and with none", () => {
    expect(letterboxdRows({ watched }).rows).toHaveLength(2);
    expect(letterboxdRows({}).rows).toEqual([]);
  });
  it("skips rows without a title or URI", () => {
    expect(letterboxdRows({ diary: "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-01,,2020,,3,,,2024-01-01" }).rows).toEqual([]);
  });
});

describe("malRows", () => {
  const entry = (o: { id: number; title: string; status: string; score?: number; start?: string; end?: string }) => `
  <anime>
    <series_animedb_id>${o.id}</series_animedb_id>
    <series_title><![CDATA[${o.title}]]></series_title>
    <series_type>TV</series_type>
    <my_start_date>${o.start ?? "0000-00-00"}</my_start_date>
    <my_finish_date>${o.end ?? "0000-00-00"}</my_finish_date>
    <my_score>${o.score ?? 0}</my_score>
    <my_status>${o.status}</my_status>
  </anime>`;
  const xml = `<?xml version="1.0"?><myanimelist><myinfo><user_name>x</user_name></myinfo>
    ${entry({ id: 1, title: "Cowboy Bebop", status: "Completed", score: 10, start: "2020-01-01", end: "2020-02-01" })}
    ${entry({ id: 5114, title: "Fullmetal Alchemist: Brotherhood & more", status: "Completed", score: 9, start: "2021-03-03" })}
    ${entry({ id: 16498, title: "Shingeki no Kyojin", status: "Completed" })}
    ${entry({ id: 2, title: "Watching one", status: "Watching" })}
    ${entry({ id: 3, title: "Planned", status: "Plan to Watch" })}
    ${entry({ id: 4, title: "Paused", status: "On-Hold" })}
    ${entry({ id: 6, title: "Quit", status: "Dropped" })}
    <manga><manga_mangadb_id>9</manga_mangadb_id><manga_title><![CDATA[Berserk]]></manga_title><my_status>Completed</my_status></manga>
  </myanimelist>`;
  const { rows, skipped, undated } = malRows(xml);

  it("imports completed anime only, and counts what it left out", () => {
    expect(rows.map((r) => r.malId)).toEqual([1, 5114, 16498]);
    expect(skipped).toEqual({ watching: 1, planned: 1, onHold: 1, dropped: 1 });
  });
  it("reads CDATA literally, and decodes entities outside CDATA", () => {
    expect(rows[1].title).toBe("Fullmetal Alchemist: Brotherhood & more");
    const plain = malRows("<myanimelist><anime><series_animedb_id>7</series_animedb_id><series_title>Tom &amp; Jerry &lt;3</series_title><my_status>Completed</my_status></anime></myanimelist>");
    expect(plain.rows[0].title).toBe("Tom & Jerry <3");
  });
  it("keeps MAL's 1..10 score as half-stars, and treats 0 as unrated", () => {
    expect(rows[0].rating).toBe(10);
    expect(rows[1].rating).toBe(9);
    expect(rows[2].rating).toBeNull();
  });
  it("dates by finish date, then start date, else undated (0000-00-00 means unknown)", () => {
    expect(rows[0].watchedOn).toBe("2020-02-01");
    expect(rows[1].watchedOn).toBe("2021-03-03");
    expect(rows[2].watchedOn).toBeNull();
    expect(undated).toBe(1);
  });
  it("ignores manga and tolerates empty input", () => {
    expect(rows.some((r) => r.title === "Berserk")).toBe(false);
    expect(malRows("").rows).toEqual([]);
  });
});

describe("anilistRows", () => {
  const media = (id: number, extra: Partial<{ idMal: number | null; english: string | null; year: number | null }> = {}) => ({
    id, idMal: extra.idMal === undefined ? id + 1000 : extra.idMal,
    title: { romaji: `Romaji ${id}`, english: extra.english === undefined ? `English ${id}` : extra.english },
    coverImage: { large: `https://s4.anilist.co/cover/${id}.jpg` }, seasonYear: extra.year ?? 2015, startDate: { year: 2015 }, duration: 24,
  });
  const res: AniListResponse = {
    data: { MediaListCollection: { hasNextChunk: false, lists: [{ entries: [
      { score: 9, completedAt: { year: 2020, month: 5, day: 3 }, startedAt: { year: 2020, month: 4, day: 1 }, media: media(1) },
      { score: 0, completedAt: { year: null, month: null, day: null }, startedAt: { year: 2019, month: 1, day: 9 }, media: media(2, { english: null }) },
      { score: 7, completedAt: { year: 2021, month: null, day: null }, startedAt: { year: null, month: null, day: null }, media: media(3, { idMal: null }) },
      { score: 8, completedAt: { year: 2022, month: 2, day: 2 }, startedAt: null, media: media(1) }, // duplicate of #1
    ] }] } },
  };
  const { rows, undated } = anilistRows([res]);

  it("turns entries into rows and drops duplicates of the same anime", () => expect(rows.map((r) => r.anilistId)).toEqual([1, 2, 3]));
  it("uses AniList's 0..10 score (0 = unrated)", () => expect(rows.map((r) => r.rating)).toEqual([9, null, 7]));
  it("dates by completion, then start date, else undated; a partial date doesn't count", () => {
    expect(rows.map((r) => r.watchedOn)).toEqual(["2020-05-03", "2019-01-09", null]);
    expect(undated).toBe(1);
  });
  it("carries title, cover, year and the MAL id", () => {
    expect(rows[0]).toMatchObject({ kind: "anime", title: "Romaji 1", originalTitle: "Romaji 1", posterPath: "https://s4.anilist.co/cover/1.jpg", year: 2015, malId: 1001, runtimeMin: 24 });
    expect(rows[0].titles).toEqual({ it: "English 1", en: "English 1", es: "English 1" });
    expect(rows[1].titles?.en).toBe("Romaji 2"); // no English title: fall back to romaji
    expect(rows[2].malId).toBeNull();
  });
  it("merges several chunks and handles an empty response", () => {
    expect(anilistRows([res, { data: { MediaListCollection: { hasNextChunk: false, lists: [{ entries: [{ score: 6, completedAt: null, startedAt: null, media: media(9) }] }] } } }]).rows).toHaveLength(4);
    expect(anilistRows([{}]).rows).toEqual([]);
  });
  it("aniMediaFields works on a bare lookup result", () => {
    expect(aniMediaFields(media(5)).anilistId).toBe(5);
  });
});
