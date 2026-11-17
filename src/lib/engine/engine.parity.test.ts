import { describe, expect, it } from "vitest";
import { engineLoaded, recommendFast, tastePairsFast } from "./index";
import { latestRatings, recommend, tastePairs, type LogFact, type Person, type Watching } from "../core/insights";

/* The Rust engine must give exactly what the TypeScript reference gives. This builds thousands of random Cerchie
 * (small, big, sparse, opposite tastes, ties, rewatches, people "now watching") and compares both implementations. */

// Small deterministic generator, so a failure can be reproduced from its seed.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function scenario(seed: number) {
  const r = rng(seed);
  const pick = (n: number) => Math.floor(r() * n);
  const nPeople = 2 + pick(7);
  const nTitles = 1 + pick(25);
  const people: Person[] = Array.from({ length: nPeople }, (_, i) => ({ id: `u${i}`, name: `Person ${i}` }));
  const facts: LogFact[] = [];
  const day = (n: number) => `2026-${String(1 + (n % 12)).padStart(2, "0")}-${String(1 + (n % 28)).padStart(2, "0")}`;
  let n = 0;
  for (let t = 0; t < nTitles; t++) {
    const watchers = people.filter(() => r() < 0.55);
    for (const p of watchers) {
      const logs = r() < 0.15 ? 2 : 1; // a rewatch can change the rating
      for (let k = 0; k < logs; k++) {
        facts.push({
          logId: `l${n}`, userId: p.id, mediaId: `m${t}`, title: `Titolo ${t % 7} ${"àèìòùé"[t % 6]}`, kind: (["movie", "tv", "anime"] as const)[t % 3],
          year: 1990 + (t % 30), posterPath: t % 4 === 0 ? null : `/p${t}.jpg`, runtimeMin: null, rating: r() < 0.15 ? null : 1 + pick(10),
          watchedOn: day(n++), platform: null, watchedWith: [],
        });
      }
    }
  }
  const watching: Watching[] = people.filter(() => r() < 0.2).map((p) => ({ userId: p.id, mediaId: `m${pick(nTitles)}` }));
  return { people, facts, watching };
}

describe("Rust engine parity with the TypeScript reference", () => {
  it("is loaded from engine.wasm (not the fallback)", async () => {
    expect(await engineLoaded()).toBe(true);
  });

  it("recommend: identical on 3000 random Cerchie", async () => {
    let withRecs = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const { people, facts, watching } = scenario(seed);
      const expected = recommend(facts, people, 6, watching);
      const actual = await recommendFast(facts, people, 6, watching);
      if (expected.length) withRecs++;
      expect(actual, `seed ${seed}`).toEqual(expected);
    }
    expect(withRecs).toBeGreaterThan(300); // the generator must actually exercise the interesting paths
  });

  it("recommend: identical with a large limit (the full ordering, not only the top six)", async () => {
    for (let seed = 5000; seed < 5300; seed++) {
      const { people, facts, watching } = scenario(seed);
      expect(await recommendFast(facts, people, 1000, watching), `seed ${seed}`).toEqual(recommend(facts, people, 1000, watching));
    }
  });

  it("tastePairs: identical on 3000 random Cerchie", async () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const { people, facts } = scenario(seed);
      expect(await tastePairsFast(facts, people), `seed ${seed}`).toEqual(tastePairs(people, latestRatings(facts)));
    }
  });

  it("handles the edges: nobody, one person, no facts, unicode", async () => {
    expect(await recommendFast([], [], 6)).toEqual([]);
    expect(await recommendFast([], [{ id: "a", name: "Ann" }], 6)).toEqual([]);
    expect(await tastePairsFast([], [{ id: "a", name: "Ann" }, { id: "b", name: "Bob" }])).toEqual(tastePairs([{ id: "a", name: "Ann" }, { id: "b", name: "Bob" }], new Map()));
    const people = [{ id: "a", name: "Zoë" }, { id: "b", name: "日本語" }];
    const facts = [{ logId: "1", userId: "a", mediaId: "m", title: "千と千尋の神隠し", kind: "anime", year: 2001, posterPath: null, runtimeMin: null, rating: 10, watchedOn: "2026-01-01", platform: null, watchedWith: [] }] as LogFact[];
    expect(await recommendFast(facts, people)).toEqual(recommend(facts, people));
  });
});
