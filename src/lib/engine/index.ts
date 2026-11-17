import { recommend as recommendTs, tastePairs as tastePairsTs, latestRatings, type LogFact, type Person, type Recommendation, type Watching } from "../core/insights";

/* The recommendation engine, written in Rust (engine/) and compiled to WebAssembly (engine.wasm, committed).
 *
 * Loading: on Cloudflare Workers a module cannot be compiled from bytes at runtime, so worker.ts imports the .wasm file
 * (wrangler precompiles it) and hands it over as globalThis.__PAUSA_ENGINE__. In Node (dev, tests) we compile it from disk.
 * If anything fails, we fall back to the TypeScript reference implementation in core/insights.ts, which computes the same
 * numbers: the engine can be slow to load or missing, but recommendations never break. */

type Exports = {
  memory: WebAssembly.Memory;
  alloc: (len: number) => number;
  dealloc: (ptr: number, len: number) => void;
  run: (op: number, ptr: number, len: number) => number;
};

const OP_RECOMMEND = 1;
const OP_TASTE_PAIRS = 2;

let ready: Promise<Exports | null> | undefined;

async function moduleFromDisk(): Promise<WebAssembly.Module> {
  // Hidden from bundlers on purpose: this branch only runs in Node, never in the Worker bundle.
  const fs = await import(/* webpackIgnore: true */ /* @vite-ignore */ "node:fs/promises");
  const path = await import(/* webpackIgnore: true */ /* @vite-ignore */ "node:path");
  const file = path.join(process.cwd(), "src", "lib", "engine", "engine.wasm");
  return new WebAssembly.Module(await fs.readFile(file));
}

function load(): Promise<Exports | null> {
  ready ??= (async () => {
    try {
      const injected = (globalThis as { __PAUSA_ENGINE__?: WebAssembly.Module }).__PAUSA_ENGINE__;
      const instance = await WebAssembly.instantiate(injected ?? (await moduleFromDisk()), {});
      return instance.exports as unknown as Exports;
    } catch (err) {
      console.error("[pausa] recommendation engine unavailable, using the TypeScript fallback", err);
      return null;
    }
  })();
  return ready;
}

/** Calls one operation: JSON in, JSON out, memory freed. */
function call<T>(wasm: Exports, op: number, payload: unknown): T {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const inPtr = wasm.alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, inPtr, bytes.length).set(bytes);
  const outPtr = wasm.run(op, inPtr, bytes.length);
  wasm.dealloc(inPtr, bytes.length);
  const len = new DataView(wasm.memory.buffer).getUint32(outPtr, true);
  const text = new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, outPtr + 4, len));
  wasm.dealloc(outPtr, 4 + len);
  const parsed = JSON.parse(text) as T | { error: string };
  if (parsed && typeof parsed === "object" && "error" in parsed) throw new Error(`engine: ${(parsed as { error: string }).error}`);
  return parsed as T;
}

/** Only what the maths needs, so the request stays small. */
const slimFacts = (facts: LogFact[]) =>
  facts.map((f) => ({ userId: f.userId, mediaId: f.mediaId, rating: f.rating, title: f.title, kind: f.kind, year: f.year, posterPath: f.posterPath }));

/** Same result as `recommend` in core/insights.ts, computed by the Rust engine (or by that function if the engine is unavailable). */
export async function recommendFast(facts: LogFact[], people: Person[], limit = 6, watching: Watching[] = []): Promise<Recommendation[]> {
  const wasm = await load();
  if (!wasm) return recommendTs(facts, people, limit, watching);
  try {
    const recs = call<Recommendation[]>(wasm, OP_RECOMMEND, { facts: slimFacts(facts), people, watching });
    // Ordering by title is locale-aware, so it stays here.
    return recs.sort((a, b) => b.score - a.score || b.unseenBy.length - a.unseenBy.length || a.title.localeCompare(b.title)).slice(0, limit);
  } catch (err) {
    console.error("[pausa] engine call failed, using the TypeScript fallback", err);
    return recommendTs(facts, people, limit, watching);
  }
}

type Pair = { a: Person; b: Person; common: number; score: number | null };

/** Same result as `tastePairs` in core/insights.ts. */
export async function tastePairsFast(facts: LogFact[], people: Person[]): Promise<Pair[]> {
  const wasm = await load();
  const fallback = () => tastePairsTs(people, latestRatings(facts));
  if (!wasm) return fallback();
  try {
    const pairs = call<Pair[]>(wasm, OP_TASTE_PAIRS, { facts: slimFacts(facts), people });
    // Known scores first (best match on top), then pairs that still need more shared titles. Stable sort, like the reference.
    return pairs.sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || y.common - x.common);
  } catch (err) {
    console.error("[pausa] engine call failed, using the TypeScript fallback", err);
    return fallback();
  }
}

/** True when the WebAssembly engine is what answers (used by the health check and tests). */
export async function engineLoaded() {
  return (await load()) !== null;
}
