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

globalThis.__PAUSA_ENGINE__ = engine;

export * from "./.open-next/worker.js";
export default openNext;
