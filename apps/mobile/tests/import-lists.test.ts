import { describe, expect, it } from "vitest";
import { letterboxdList, letterboxdWatchlist } from "@/features/import/parsers";

// List-file half of v1 import-lists.test.ts; importList (server side) is covered by tools/api-smoke-import.mjs.
const LIST_CSV = `Letterboxd list export v7
Date,Name,Tags,URL,Description
2026-03-01,"Slow ""cinema"" nights",quiet,https://boxd.it/abc12,"For rainy days, mostly."

Position,Name,Year,URL,Description
1,Drive My Car,2021,https://boxd.it/sv94,
2,"Evil Does Not Exist",2023,https://boxd.it/HJrc,Great.
3,Perfect Days,2023,https://letterboxd.com/film/perfect-days/,
`;

describe("Letterboxd list files", () => {
  it("reads a list export: name, description, films in order", () => {
    const l = letterboxdList(LIST_CSV)!;
    expect(l).toMatchObject({ name: 'Slow "cinema" nights', description: "For rainy days, mostly.", kind: "list" });
    expect(l.rows.map((r) => r.title)).toEqual(["Drive My Car", "Evil Does Not Exist", "Perfect Days"]);
    expect(l.rows[2].letterboxdUri).toBeNull(); // only boxd.it links are kept
    expect(l.rows[0]).toMatchObject({ year: 2021, watchedOn: null, rating: null, letterboxdUri: "https://boxd.it/sv94" });
  });

  it("reads the watchlist", () => {
    const w = letterboxdWatchlist("Date,Name,Year,Letterboxd URI\n2026-08-12,The Wild Robot,2024,https://boxd.it/IWFy\n")!;
    expect(w).toMatchObject({ name: "Watchlist", kind: "watchlist" });
    expect(w.rows).toHaveLength(1);
  });

  it("ignores files that are not lists", () => {
    expect(letterboxdList("Date,Name,Year,Letterboxd URI\n")).toBeNull();
    expect(letterboxdWatchlist("Date,Name,Year,Letterboxd URI\n")).toBeNull();
  });
});
