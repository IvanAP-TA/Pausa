import { describe, it, expect } from "vitest";
import { tasteSimilarity, recommend, aggregate } from "@/modules/recs";

describe("tasteSimilarity", () => {
  it("identical ratings -> 1", () => {
    const a = [{ userId: "a", mediaId: "m1", rating: 4 }, { userId: "a", mediaId: "m2", rating: 5 }];
    const b = [{ userId: "b", mediaId: "m1", rating: 4 }, { userId: "b", mediaId: "m2", rating: 5 }];
    expect(tasteSimilarity(a, b)).toBe(1);
  });
  it("max disagreement -> 0", () => {
    const a = [{ userId: "a", mediaId: "m1", rating: 0.5 }];
    const b = [{ userId: "b", mediaId: "m1", rating: 5 }];
    expect(tasteSimilarity(a, b)).toBe(0);
  });
  it("no common titles -> null", () => {
    const a = [{ userId: "a", mediaId: "m1", rating: 4 }];
    const b = [{ userId: "b", mediaId: "m2", rating: 4 }];
    expect(tasteSimilarity(a, b)).toBeNull();
  });
});

describe("recommend", () => {
  it("excludes already-logged, respects limit", () => {
    const catalog = [
      { tmdbId: 1, title: "A", type: "movie" as const },
      { tmdbId: 2, title: "B", type: "movie" as const },
      { tmdbId: 3, title: "C", type: "movie" as const },
    ];
    const recs = recommend(catalog, new Set([1]), 1);
    expect(recs).toEqual([{ tmdbId: 2, title: "B", type: "movie" }]);
  });
});

describe("aggregate", () => {
  it("computes totals, avg, byType, most active", () => {
    const logs = [
      { userId: "u1", rating: 4, type: "movie" },
      { userId: "u1", rating: 5, type: "tv" },
      { userId: "u2", rating: null, type: "movie" },
    ];
    const r = aggregate(logs, { u1: "Ann", u2: "Bob" });
    expect(r.total).toBe(3);
    expect(r.avg).toBe(4.5);
    expect(r.byType).toEqual({ movie: 2, tv: 1 });
    expect(r.mostActive?.name).toBe("Ann");
  });
});
