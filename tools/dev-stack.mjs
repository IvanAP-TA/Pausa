// A persistent local stack for developing the client: the API (`wrangler dev --local`), the mock TMDB/AniList catalogue and a
// local D1 that survives restarts. Nothing here talks to Cloudflare or to any real service.
//
//   node tools/dev-stack.mjs [--port 8798] [--mock-port 9911] [--seed] [--reset] [--no-build]
//
// State lives in .dev/<port>/ (git-ignored). `--seed` fills it with sample data through the API (tools/seed-dev.mjs). It prints
// `READY http://localhost:<port>` when it is up, writes its pid to .dev/<port>/pid, and stops its own children on Ctrl+C.
// Sign in as a sample person with:  node tools/dev-login.mjs http://localhost:<port> giulia@pausa.test
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "crates", "api");
const wranglerJs = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const flag = (n) => process.argv.includes(n);
const port = Number(arg("--port", "8798"));
const mockPort = Number(arg("--mock-port", "9911"));
const state = path.join(root, ".dev", String(port));
if (flag("--reset")) fs.rmSync(state, { recursive: true, force: true });
fs.mkdirSync(state, { recursive: true });
fs.writeFileSync(path.join(state, "pid"), String(process.pid));

const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const env = {
  ...process.env,
  [pathKey]: fs.existsSync(cargoBin) ? cargoBin + path.delimiter + (process.env[pathKey] ?? "") : process.env[pathKey],
  WRANGLER_SEND_METRICS: "false",
};

const children = [];
function stopAll() {
  for (const c of children) {
    if (c.exitCode !== null || !c.pid) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGTERM");
  }
  try {
    fs.rmSync(path.join(state, "pid"), { force: true });
  } catch {}
}
process.on("exit", stopAll);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const portFree = (p) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(p, "127.0.0.1");
  });

if (!(await portFree(port))) {
  console.error(`port ${port} is in use: pick another with --port`);
  process.exit(1);
}

// wrangler refuses an assets directory that does not exist; an empty one is fine (the client is built separately).
fs.mkdirSync(path.join(root, "apps", "mobile", "dist"), { recursive: true });
if (!flag("--no-build")) {
  console.log("building the Worker (worker-build --release)…");
  const r = spawnSync("worker-build", ["--release"], { cwd: apiDir, env, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const d1 = path.join(state, "d1");
const m = spawnSync(process.execPath, [wranglerJs, "d1", "migrations", "apply", "pausa-v2", "--local", "--persist-to", d1], { cwd: apiDir, env, encoding: "utf8" });
if (m.status !== 0) {
  console.error(m.stdout + m.stderr);
  process.exit(m.status ?? 1);
}

if (await portFree(mockPort)) {
  const mock = spawn(process.execPath, [path.join(root, "tools", "mock-catalog.mjs"), String(mockPort)], { env, stdio: "ignore" });
  children.push(mock);
  console.log(`mock catalogue on ${mockPort}`);
} else {
  console.log(`mock catalogue already running on ${mockPort}: reusing it`);
}

const log = fs.openSync(path.join(state, "api.log"), "w");
const dev = spawn(
  process.execPath,
  [
    wranglerJs, "dev", "--local", "--infer-origin-from-routes=false", "--port", String(port), "--persist-to", d1, "--test-scheduled",
    "--var", `TMDB_BASE_URL:http://127.0.0.1:${mockPort}`, "--var", `ANILIST_URL:http://127.0.0.1:${mockPort}/anilist`, "--var", "TMDB_API_TOKEN:test-token",
    // The web client in `expo start` is served from another port; allow it (development only).
    "--var", "CORS_ORIGINS:http://localhost:8081,http://localhost:8082,http://localhost:19006",
    // Short rounds so a Serata can be tried alone in a minute.
    "--var", `SERATA_MATCH_MS:${process.env.SERATA_MATCH_MS ?? 30000}`, "--var", `SERATA_TABLE_MS:${process.env.SERATA_TABLE_MS ?? 60000}`,
  ],
  { cwd: apiDir, env, stdio: ["ignore", log, log] },
);
children.push(dev);

const base = `http://localhost:${port}`;
let up = false;
for (let i = 0; i < 120 && !up; i++) {
  await new Promise((r) => setTimeout(r, 500));
  up = await fetch(base + "/api/health/db").then((r) => r.ok, () => false);
}
if (!up) {
  console.error("the API did not start; see " + path.join(state, "api.log"));
  process.exit(1);
}

if (flag("--seed")) {
  console.log("seeding sample data…");
  const s = spawnSync(process.execPath, [path.join(root, "tools", "seed-dev.mjs"), base], { cwd: root, env: { ...env, PAUSA_PERSIST: d1 }, stdio: "inherit" });
  if (s.status !== 0) console.error("the seed failed (see above); the stack keeps running");
}
console.log(`READY ${base}   (state: ${state}, pid ${process.pid})`);
setInterval(() => {}, 1 << 30);
