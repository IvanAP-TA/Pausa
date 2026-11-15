import { describe, it, expect } from "vitest";
import { mapTmdbMovie } from "@/modules/tmdb/mapper";

describe("mapTmdbMovie", () => {
  it("maps TMDB movie to media entity fields", () => {
    const r = mapTmdbMovie({
      id: 27205, title: "Inception", release_date: "2010-07-15",
      poster_path: "/x.jpg", overview: "A thief...", imdb_id: "tt1375666",
    });
    expect(r.tmdbId).toBe(27205);
    expect(r.type).toBe("movie");
    expect(r.title).toBe("Inception");
    expect(r.year).toBe(2010);
    expect(r.posterPath).toBe("/x.jpg");
    expect(r.imdbId).toBe("tt1375666");
  });

  it("handles missing release_date -> year null", () => {
    const r = mapTmdbMovie({ id: 1, title: "X", release_date: "", poster_path: null, overview: "" });
    expect(r.year).toBeNull();
  });
});
