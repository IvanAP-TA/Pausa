import { describe, expect, it } from "vitest";
import { rankTitles } from "./ranking";
import type { LogFact, Person } from "./insights";

const people: Person[] = [{ id: "a", name: "Ann" }, { id: "b", name: "Bob" }, { id: "c", name: "Cy" }];
let n = 0;
const fact = (userId: string, mediaId: string, rating: number | null, o: Partial<LogFact> = {}): LogFact => ({
  logId: `l${++n}`, userId, mediaId, title: mediaId.toUpperCase(), kind: "movie", year: 2020, posterPath: null, runtimeMin: 100,
  rating, watchedOn: "2026-01-01", platform: null, watchedWith: [], ...o,
});

describe("rankTitles", () => {
  const facts = [
    fact("a", "x", 10), fact("b", "x", 8), fact("a", "y", 10), fact("a", "z", 4, { year: 1999 }), fact("b", "z", 6, { year: 1999 }), fact("c", "z", null, { year: 1999 }),
  ];

  it("averages each person's rating and ranks by it, then by number of votes", () => {
    const r = rankTitles(facts, people);
    expect(r.map((t) => [t.mediaId, t.avg, t.votes])).toEqual([["y", 10, 1], ["x", 9, 2], ["z", 5, 2]]);
  });

  it("counts a rewatch once, with the latest rating", () => {
    const r = rankTitles([...facts, fact("a", "x", 2, { watchedOn: "2026-02-01" })], people).find((t) => t.mediaId === "x")!;
    expect(r.votes).toBe(2);
    expect(r.avg).toBe(5);
  });

  it("filters by votes, release year, kind and name", () => {
    expect(rankTitles(facts, people, { minVotes: 2 }).map((t) => t.mediaId)).toEqual(["x", "z"]);
    expect(rankTitles(facts, people, { yearTo: 2000 }).map((t) => t.mediaId)).toEqual(["z"]);
    expect(rankTitles(facts, people, { yearFrom: 2010 }).map((t) => t.mediaId)).toEqual(["y", "x"]);
    expect(rankTitles([...facts, fact("a", "s", 9, { kind: "tv" })], people, { kind: "tv" }).map((t) => t.mediaId)).toEqual(["s"]);
    expect(rankTitles(facts, people, { q: "x" }).map((t) => t.mediaId)).toEqual(["x"]);
  });

  it("can keep only what everyone watched, or what one person watched", () => {
    expect(rankTitles(facts, people, { everyone: true, minVotes: 0 }).map((t) => t.mediaId)).toEqual(["z"]);
    expect(rankTitles(facts, people, { by: "b" }).map((t) => t.mediaId)).toEqual(["x", "z"]);
  });

  it("lists titles nobody rated last when asked for with minVotes 0", () => {
    const r = rankTitles([...facts, fact("c", "w", null)], people, { minVotes: 0 });
    expect(r.at(-1)).toMatchObject({ mediaId: "w", avg: null, votes: 0 });
  });

  it("sorts by year and by title", () => {
    expect(rankTitles(facts, people, { sort: "year" }).map((t) => t.mediaId)).toEqual(["x", "y", "z"]);
    expect(rankTitles(facts, people, { sort: "title" }).map((t) => t.mediaId)).toEqual(["X", "Y", "Z"].map((s) => s.toLowerCase()));
  });
});
