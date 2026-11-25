import type { ChunkResult, ListChunkResult } from "@pausa/api-types";
import { describe, expect, it } from "vitest";
import { ApiFailure } from "@/api/errors";
import { CHUNK, runImport, wire, type RunnerApi, type RunOptions } from "@/features/import/runner";
import type { ImportList, ImportRow } from "@/features/import/parsers";

const row = (i: number, extra: Partial<ImportRow> = {}): ImportRow => ({ source: "imdb", kind: "movie", title: `Film ${i}`, year: 2000, rating: 8, watchedOn: "2024-01-01", rewatch: false, review: `rec ${i}`, imdbId: `tt${i}`, ...extra });
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i));
const ok = (over: Partial<ChunkResult> & { processed: number }): ChunkResult => ({ imported: over.processed, already: 0, newTitles: 0, skippedUndated: 0, rejected: [], cursor: 0, ...over });
const instant = () => Promise.resolve();

type Calls = { rows: Array<{ offset: number; titles: string[] }>; lists: Array<{ name: string; offset: number; n: number }>; finished: number };
function fake(handler: Partial<RunnerApi> = {}): { api: RunnerApi; calls: Calls } {
  const calls: Calls = { rows: [], lists: [], finished: 0 };
  const api: RunnerApi = {
    rows: async (_id, input) => {
      calls.rows.push({ offset: input.offset, titles: input.rows.map((r) => r.title) });
      return ok({ processed: input.rows.length });
    },
    lists: async (_id, input) => {
      calls.lists.push({ name: input.name, offset: input.offset, n: input.rows.length });
      return { listId: "l1", processed: input.rows.length, added: input.rows.length, newTitles: 0, rejected: [] } satisfies ListChunkResult;
    },
    finish: async () => {
      calls.finished++;
    },
    ...handler,
  };
  return { api, calls };
}
const opts = (api: RunnerApi, over: Partial<RunOptions> = {}): RunOptions => ({
  batchId: "b1", rows: rows(70), lists: [], startAt: 0, includeReviews: true, includeUndated: false, locale: "it", api,
  shouldStop: () => false, onProgress: () => undefined, wait: instant, ...over,
});

describe("the chunk loop", () => {
  it("sends 30 rows a call from the start of what is left, then closes the import", async () => {
    const { api, calls } = fake();
    const r = await runImport(opts(api));
    expect(calls.rows.map((c) => [c.offset, c.titles.length])).toEqual([[0, 30], [30, 30], [60, 10]]);
    expect(r).toMatchObject({ status: "done", cursor: 70, progress: { done: 70, total: 70 }, totals: { imported: 70 } });
    expect(calls.finished).toBe(1);
  });

  it("when the server takes fewer rows than sent, the next call starts exactly where it stopped (nothing skipped, nothing repeated)", async () => {
    const { api, calls } = fake({
      rows: async (_id, input) => {
        calls.rows.push({ offset: input.offset, titles: input.rows.map((r) => r.title) });
        return ok({ processed: Math.min(12, input.rows.length) }); // the Worker's per-call budget
      },
    });
    const r = await runImport(opts(api, { rows: rows(30) }));
    expect(calls.rows.map((c) => [c.offset, c.titles[0], c.titles.length])).toEqual([[0, "Film 0", 30], [12, "Film 12", 18], [24, "Film 24", 6]]);
    const sentTitles = calls.rows.flatMap((c, i) => c.titles.slice(0, i < 2 ? 12 : 6));
    expect(sentTitles).toEqual(rows(30).map((x) => x.title));
    expect(r.status).toBe("done");
  });

  it("resumes from the server's cursor: rows before it are not sent again", async () => {
    const { api, calls } = fake();
    const r = await runImport(opts(api, { startAt: 45 }));
    expect(calls.rows.map((c) => c.offset)).toEqual([45]);
    expect(calls.rows[0].titles[0]).toBe("Film 45");
    expect(r.progress).toEqual({ done: 70, total: 70 });
  });

  it("reports the progress as it goes, to the total of rows plus list rows", async () => {
    const { api } = fake();
    const seen: number[] = [];
    const list: ImportList = { name: "Watchlist", description: null, kind: "watchlist", rows: rows(5) };
    const r = await runImport(opts(api, { rows: rows(31), lists: [list], onProgress: (p) => seen.push(p.done) }));
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(36);
    expect(seen).toEqual([...seen].sort((a, b) => a - b)); // never goes back
    expect(r.progress.total).toBe(36);
  });

  it("collects the rows the server refused with their place in the WHOLE file, not in the chunk", async () => {
    const { api } = fake({
      rows: async (_id, input) => ok({ processed: input.rows.length, imported: input.rows.length - (input.offset === 30 ? 1 : 0), rejected: input.offset === 30 ? [{ index: 2, reason: "title" }] : [] }),
    });
    const r = await runImport(opts(api, { rows: rows(40) }));
    expect(r.rejected).toEqual([{ index: 32, title: "Film 32", reason: "title" }]);
  });

  it("a 429 stops at once with 'limited', keeps what was done and does NOT close the import", async () => {
    let n = 0;
    const { api, calls } = fake({
      rows: async (_id, input) => {
        if (++n === 2) throw new ApiFailure("rate_limited", 429, 3600);
        return ok({ processed: input.rows.length });
      },
    });
    const r = await runImport(opts(api));
    expect(r).toMatchObject({ status: "limited", cursor: 30, totals: { imported: 30 } });
    expect(calls.finished).toBe(0);
  });

  it("a call that fails is sent again, and three failures in a row stop with an error (progress kept)", async () => {
    let n = 0;
    const { api } = fake({
      rows: async (_id, input) => {
        n++;
        if (n === 1) throw new ApiFailure("network", 0); // one blip: recovered
        if (n >= 3) throw new ApiFailure("internal", 500); // then the server stays down
        return ok({ processed: input.rows.length });
      },
    });
    const r = await runImport(opts(api));
    expect(n).toBe(5); // blip, ok, then three in a row
    expect(r).toMatchObject({ status: "failed", cursor: 30, totals: { imported: 30 } });
    expect(r.error).toBeInstanceOf(ApiFailure);
  });

  it("a call that handles nothing is a failure, not an endless loop", async () => {
    const { api } = fake({ rows: async () => ok({ processed: 0, imported: 0 }) });
    const r = await runImport(opts(api));
    expect(r.status).toBe("failed");
  });

  it("the person can stop between calls; the cursor says where, and a second run continues from it", async () => {
    const { api, calls } = fake();
    let asked = 0;
    const first = await runImport(opts(api, { shouldStop: () => ++asked > 1 }));
    expect(first).toMatchObject({ status: "stopped", cursor: 30 });
    expect(calls.finished).toBe(0);
    const second = await runImport(opts(api, { startAt: first.cursor }));
    expect(calls.rows.map((c) => c.offset)).toEqual([0, 30, 60]);
    expect(second.status).toBe("done");
  });

  it("after the viewings, each list goes in chunks of 20 from its first row, and counts once", async () => {
    const { api, calls } = fake();
    const lists: ImportList[] = [
      { name: "A", description: "d", kind: "list", rows: rows(45) },
      { name: "Watchlist", description: null, kind: "watchlist", rows: rows(3) },
    ];
    const r = await runImport(opts(api, { rows: rows(2), lists }));
    expect(calls.lists.map((c) => [c.name, c.offset, c.n])).toEqual([["A", 0, 20], ["A", 20, 20], ["A", 40, 5], ["Watchlist", 0, 3]]);
    expect(r.totals).toMatchObject({ lists: 2, listItems: 48 });
    expect(r.progress).toEqual({ done: 50, total: 50 });
  });

  it("a resumed import with every viewing already done goes straight to the lists, then closes", async () => {
    const { api, calls } = fake();
    const r = await runImport(opts(api, { rows: rows(10), startAt: 10, lists: [{ name: "L", description: null, kind: "list", rows: rows(2) }] }));
    expect(calls.rows).toEqual([]);
    expect(calls.lists).toHaveLength(1);
    expect(r.status).toBe("done");
  });
});

describe("the row sent to the server", () => {
  it("carries only the fields the server knows, and drops the review when the person left reviews out", () => {
    const full = wire(row(1, { posterPath: "x", originalTitle: "y", runtimeMin: 90, titles: { it: "z" }, letterboxdUri: "https://boxd.it/a" }), true);
    expect(Object.keys(full).sort()).toEqual(["anilistId", "imdbId", "kind", "letterboxdUri", "malId", "rating", "review", "rewatch", "title", "tmdbId", "watchedOn", "year"]);
    expect(full.review).toBe("rec 1");
    expect(wire(row(1), false).review).toBeNull();
  });
  it("the chunk size is the server's cap", () => expect(CHUNK).toBe(30));
});
