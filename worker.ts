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
import { runDigests } from "./src/lib/core/mailer";

globalThis.__PAUSA_ENGINE__ = engine;

export * from "./.open-next/worker.js";

export default {
  fetch: (...args) => openNext.fetch(...args),
  // Two cron triggers (wrangler.jsonc): 03:17 UTC housekeeping (old guests, expired sessions and links, stale counters)
  // and 17:00 UTC the optional email digest for people with no push on any device.
  async scheduled(event, env, ctx) {
    const db = drizzle(env.DB, { schema });
    if (event.cron === "0 17 * * *") {
      ctx.waitUntil(runDigests(db, { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, appUrl: env.BETTER_AUTH_URL ?? "https://pausa.gnagno.org" }).then((r) => console.log("[pausa] digest", JSON.stringify(r))));
    } else {
      ctx.waitUntil(runCleanup(db).then((r) => console.log("[pausa] cleanup", JSON.stringify(r))));
    }
  },
};
