# scripts

| Script | Use |
|---|---|
| `dev-lan.cjs` | `npm run dev:lan`: dev server reachable from a phone on the same Wi-Fi |
| `vapid.cjs` | `node scripts/vapid.cjs [--write-env]`: generate a Web Push key pair |
| `engine-build.cjs` | `npm run engine:build`: recompile the Rust engine to `src/lib/engine/engine.wasm` |
| `engine-bench.test.ts` | `BENCH=1 npx vitest run scripts/engine-bench.test.ts --reporter=verbose`: Rust vs TypeScript timing |
| `add-messages.cjs` | merge a JSON file `{ it: {...}, en: {...}, es: {...} }` into `messages/*.json` without touching existing keys |
