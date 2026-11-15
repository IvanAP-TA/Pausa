import { describe, it, expect, vi, beforeEach } from "vitest";

const rows: any[] = [];
const fakeDb = {
  select: () => ({ from: () => ({ where: () => ({ get: async () => rows[0] }) }) }),
  insert: () => ({
    values: (v: any) => ({ returning: () => ({ get: async () => { rows.push(v); return v; } }) }),
  }),
} as any;

beforeEach(() => {
  rows.length = 0;
});

describe("getOrCacheMovie", () => {
  it("fetches from TMDB and caches when not present", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      id: 27205, title: "Inception", release_date: "2010-07-15", poster_path: "/x.jpg", overview: "", imdb_id: "tt1375666",
    }))) as any;
    const { getOrCacheMovie } = await import("@/modules/tmdb");
    const m = await getOrCacheMovie(fakeDb, "KEY", 27205);
    expect(m.tmdbId).toBe(27205);
    expect(m.id).toBeTruthy();
  });

  it("returns cached row without fetching", async () => {
    rows.push({ id: "abc", tmdbId: 27205, title: "Inception", type: "movie" });
    globalThis.fetch = vi.fn() as any;
    const { getOrCacheMovie } = await import("@/modules/tmdb");
    const m = await getOrCacheMovie(fakeDb, "KEY", 27205);
    expect(m.id).toBe("abc");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
