import { describe, expect, it } from "vitest";
import { parseAniListDetails, parseTmdbDetails, plainText, trimOverview } from "./details";

describe("title details", () => {
  it("reads synopsis, genres, cast and runtime from a TMDB film", () => {
    const d = parseTmdbDetails({
      overview: "  A crew goes under.  ", runtime: 143,
      genres: [{ id: 1, name: "Thriller" }, { id: 2, name: "Drama" }, { id: 3 }],
      credits: { cast: Array.from({ length: 9 }, (_, i) => ({ name: `Actor ${i}`, character: i === 0 ? "" : `Role ${i}` })) },
    });
    expect(d.overview).toBe("A crew goes under.");
    expect(d.genres).toEqual(["Thriller", "Drama"]);
    expect(d.cast).toHaveLength(6);
    expect(d.cast[0]).toEqual({ name: "Actor 0", role: null });
    expect(d.cast[1]).toEqual({ name: "Actor 1", role: "Role 1" });
    expect(d.runtimeMin).toBe(143);
  });

  it("takes a series' episode length and survives an empty or broken answer", () => {
    expect(parseTmdbDetails({ episode_run_time: [48] }).runtimeMin).toBe(48);
    expect(parseTmdbDetails(null)).toEqual({ overview: null, genres: [], cast: [], runtimeMin: null });
    expect(parseTmdbDetails({ overview: "", genres: "x", credits: { cast: "y" } })).toEqual({ overview: null, genres: [], cast: [], runtimeMin: null });
  });

  it("cuts a long synopsis at the end of a sentence", () => {
    const long = "First sentence here. " + "word ".repeat(400);
    const cut = trimOverview(long, 60)!;
    expect(cut.length).toBeLessThanOrEqual(61);
    expect(trimOverview("Short.", 60)).toBe("Short.");
    expect(trimOverview("   ", 60)).toBeNull();
  });

  it("turns an AniList description into plain text", () => {
    expect(plainText("A boy<br><br>meets <i>a girl</i> &amp; a cat.<br><br>(Source: Somewhere)")).toBe("A boy\n\nmeets a girl & a cat.");
    const d = parseAniListDetails({ data: { Media: { description: "One<br>two", genres: ["Action", "Drama"], duration: 24 } } });
    expect(d).toEqual({ overview: "One\ntwo", genres: ["Action", "Drama"], cast: [], runtimeMin: 24 });
    expect(parseAniListDetails({})).toEqual({ overview: null, genres: [], cast: [], runtimeMin: null });
  });
});
