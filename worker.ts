// @ts-nocheck -- the OpenNext output and the .wasm import only exist at build time; wrangler bundles this file.
/**
 * The Worker's entry point: OpenNext's generated worker, plus the recommendation engine.
 *
 * Workers cannot compile WebAssembly from bytes at runtime, but wrangler precompiles a `.wasm` file that is imported
 * statically. We import it here and hand it to the app through a global (see src/lib/engine/index.ts); if it is
 * missing, the app falls back to the TypeScript implementation, which gives the same results.
 */
import engine from "./src/lib/engine/engine.wasm";
import openNext from "./.open-next/worker.js";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./src/db/schema";
import { runCleanup } from "./src/lib/core/cleanup";

globalThis.__PAUSA_ENGINE__ = engine;

export * from "./.open-next/worker.js";

export default {
  fetch: (...args) => openNext.fetch(...args),
  // Daily housekeeping (cron trigger in wrangler.jsonc): old guests, expired sessions and sign-in links, stale counters.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCleanup(drizzle(env.DB, { schema })).then((r) => console.log("[pausa] cleanup", JSON.stringify(r))));
  },
};
