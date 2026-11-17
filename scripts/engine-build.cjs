/* `npm run engine:build`: compiles engine/ (Rust) to WebAssembly and copies it to src/lib/engine/engine.wasm.
 * The compiled file is committed, so whoever deploys does not need Rust; run this only after changing engine/src. */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const r = spawnSync("cargo", ["build", "--release", "--target", "wasm32-unknown-unknown"], { cwd: path.join(root, "engine"), stdio: "inherit", shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

const from = path.join(root, "engine", "target", "wasm32-unknown-unknown", "release", "pausa_engine.wasm");
const to = path.join(root, "src", "lib", "engine", "engine.wasm");
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
console.log(`engine.wasm: ${fs.statSync(to).size} bytes -> ${path.relative(root, to)}`);
