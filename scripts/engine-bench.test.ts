import { describe, expect, it } from "vitest";
import { recommendFast } from "../src/lib/engine";
import { recommend, type LogFact, type Person } from "../src/lib/core/insights";

/* Skipped unless BENCH=1 (it takes ~40 s): run with `BENCH=1 npx vitest run scripts/engine-bench.test.ts --reporter=verbose` to compare the engine with the TypeScript reference.
 * It builds one big Cerchia and times both over several runs. */

function bigCircle(people: number, titles: number) {
  let s = 12345;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const ps: Person[] = Array.from({ length: people }, (_, i) => ({ id: `u${i}`, name: `P${i}` }));
  const facts: LogFact[] = [];
  let n = 0;
  for (let t = 0; t < titles; t++) for (const p of ps) {
    if (rand() < 0.35) facts.push({ logId: `l${n}`, userId: p.id, mediaId: `m${t}`, title: `T${t}`, kind: "movie", year: 2000, posterPath: null, runtimeMin: null, rating: 1 + Math.floor(rand() * 10), watchedOn: `2026-01-${String(1 + (n++ % 28)).padStart(2, "0")}`, platform: null, watchedWith: [] });
  }
  return { ps, facts };
}

const time = async (f: () => Promise<unknown> | unknown, runs: number) => {
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) await f();
  return (performance.now() - t0) / runs;
};

describe.skipIf(!process.env.BENCH)("benchmark", () => {
  for (const [people, titles] of [[4, 40], [12, 300], [30, 1500]] as const) {
    it(`${people} people, ${titles} titles`, { timeout: 120_000 }, async () => {
      const { ps, facts } = bigCircle(people, titles);
      await recommendFast(facts, ps, 6); // load the module before timing
      const runs = people >= 30 ? 5 : 30;
      const ts = await time(() => recommend(facts, ps, 6), runs);
      const wasm = await time(() => recommendFast(facts, ps, 6), runs);
      console.log(`${people} people x ${titles} titles (${facts.length} logs): TypeScript ${ts.toFixed(2)} ms, Rust/WASM ${wasm.toFixed(2)} ms`);
      expect(await recommendFast(facts, ps, 6)).toEqual(recommend(facts, ps, 6));
    });
  }
});
