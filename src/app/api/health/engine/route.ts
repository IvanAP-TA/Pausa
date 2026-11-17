import { engineLoaded, recommendFast } from "@/lib/engine";

/** Deploy check: which implementation answers recommendations ("wasm" is the Rust engine, "typescript" the fallback), and a tiny live calculation. */
export async function GET() {
  const wasm = await engineLoaded();
  const people = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  const fact = (userId: string, mediaId: string, rating: number) =>
    ({ logId: userId + mediaId, userId, mediaId, title: mediaId, kind: "movie" as const, year: null, posterPath: null, runtimeMin: null, rating, watchedOn: "2026-01-01", platform: null, watchedWith: [] });
  const recs = await recommendFast([fact("a", "m1", 10)], people, 3);
  return Response.json({ engine: wasm ? "wasm" : "typescript", sample: recs.map((r) => ({ id: r.mediaId, score: r.score })) }, { headers: { "cache-control": "no-store" } });
}
