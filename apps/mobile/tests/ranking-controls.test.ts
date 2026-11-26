// apps/mobile/tests/ranking-controls.test.ts
import { describe, expect, it } from "vitest";
import { nextSort, presetOf, splitVotes, yearPresets } from "@/features/stats/ranking-controls";

describe("sort cycle", () => {
  it("off → desc → asc → off on the same key", () => {
    const a = nextSort(null, "avg");
    expect(a).toEqual({ key: "avg", dir: "desc" });
    const b = nextSort(a, "avg");
    expect(b).toEqual({ key: "avg", dir: "asc" });
    expect(nextSort(b, "avg")).toBeNull();
  });
  it("another key starts again at desc and replaces the old one", () => {
    expect(nextSort({ key: "avg", dir: "asc" }, "year")).toEqual({ key: "year", dir: "desc" });
  });
});

describe("year presets", () => {
  it("fixed presets first, then one per decade that has titles", () => {
    const p = yearPresets(2026, 1957, 2024);
    expect(p.map((x) => x.id)).toEqual(["all", "last1", "last5", "last10", "last20", "d1950", "d1960", "d1970", "d1980", "d1990", "d2000", "d2010", "d2020"]);
    expect(p.find((x) => x.id === "last1")).toEqual({ id: "last1", yearFrom: 2025 });
    expect(p.find((x) => x.id === "d1960")).toEqual({ id: "d1960", yearFrom: 1960, yearTo: 1969 });
    expect(p[0]).toEqual({ id: "all" });
  });
  it("no titles: only the fixed presets", () => {
    expect(yearPresets(2026, null, null).map((x) => x.id)).toEqual(["all", "last1", "last5", "last10", "last20"]);
  });
  it("recognises a range as a preset or as custom", () => {
    const p = yearPresets(2026, 1990, 2020);
    expect(presetOf({}, p)).toBe("all");
    expect(presetOf({ yearFrom: 1990, yearTo: 1999 }, p)).toBe("d1990");
    expect(presetOf({ yearFrom: 1993, yearTo: 1999 }, p)).toBe("custom");
  });
});

describe("vote avatars", () => {
  it("shows three and counts the rest until opened", () => {
    expect(splitVotes([1, 2, 3, 4, 5], false)).toEqual({ shown: [1, 2, 3], hidden: 2 });
    expect(splitVotes([1, 2, 3, 4, 5], true)).toEqual({ shown: [1, 2, 3, 4, 5], hidden: 0 });
    expect(splitVotes([1, 2, 3], false)).toEqual({ shown: [1, 2, 3], hidden: 0 });
  });
});
