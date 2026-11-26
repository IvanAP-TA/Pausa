// Runs the whole API end-to-end suite from a clean state, locally or in CI:
//   node tools/run-smoke.mjs [--no-build] [--port 8797] [--only api-smoke|api-smoke-diary]
// It builds the Worker (worker-build), applies the migrations to a throw-away D1 state, starts the mock catalogue and
// `wrangler dev --local`, runs the suites, and stops ONLY the processes it started (by pid tree).
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "crates", "api");
const wranglerJs = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const port = Number(arg("--port", "8797"));
const mockPort = Number(arg("--mock-port", "9911"));
const only = arg("--only", null);
const persist = fs.mkdtempSync(path.join(os.tmpdir(), "pausa-smoke-"));
// `wrangler dev` re-runs `worker-build`, and cargo is usually not on PATH in a fresh shell: add it, whatever the PATH key's case.
const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const env = {
  ...process.env,
  [pathKey]: fs.existsSync(cargoBin) ? cargoBin + path.delimiter + (process.env[pathKey] ?? "") : process.env[pathKey],
  WRANGLER_SEND_METRICS: "false",
  PAUSA_PERSIST: persist,
  MOCK: `http://127.0.0.1:${mockPort}`,
};

// Web Push needs a signing key; a throw-away one is made for each run (the suites read the public half to check the signature).
const vapid = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const vapidJwk = vapid.privateKey.export({ format: "jwk" });
env.VAPID_PUBLIC_B64 = Buffer.concat([Buffer.from([4]), Buffer.from(vapidJwk.x, "base64url"), Buffer.from(vapidJwk.y, "base64url")]).toString("base64url");

const children = [];
function stopAll() {
  for (const c of children) {
    if (c.exitCode !== null || !c.pid) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGTERM");
  }
  // workerd may hold the files for a moment after being killed (Windows): retry, and never fail the run over a temp directory.
  try {
    fs.rmSync(persist, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {}
}
process.on("exit", stopAll);
process.on("SIGINT", () => process.exit(130));

function step(title, cmd, args, opts = {}) {
  console.log(`\n▶ ${title}`);
  const r = spawnSync(cmd, args, { cwd: apiDir, env, stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.log(`✖ ${title} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

// wrangler refuses an assets directory that does not exist; an empty one is fine (the client is built separately).
fs.mkdirSync(path.join(root, "apps", "mobile", "dist"), { recursive: true });
if (!process.argv.includes("--no-build")) step("worker-build --release", "worker-build", ["--release"], { shell: process.platform === "win32" });
step("apply migrations to a clean D1", process.execPath, [wranglerJs, "d1", "migrations", "apply", "pausa-v2", "--local", "--persist-to", persist]);

const mock = spawn(process.execPath, [path.join(root, "tools", "mock-catalog.mjs"), String(mockPort)], { env, stdio: "ignore" });
children.push(mock);
const devLog = path.join(os.tmpdir(), "pausa-smoke-dev.log");
const devFd = fs.openSync(devLog, "w");
const dev = spawn(
  process.execPath,
  [
    wranglerJs, "dev", "--local", "--infer-origin-from-routes=false", "--port", String(port), "--persist-to", persist, "--test-scheduled",
    "--var", `TMDB_BASE_URL:http://127.0.0.1:${mockPort}`, "--var", `ANILIST_URL:http://127.0.0.1:${mockPort}/anilist`, "--var", "TMDB_API_TOKEN:test-token", "--var", "CORS_ORIGINS:http://localhost:8081", "--var", "OPERATOR_EMAILS:operator@pausa.test", "--var", "REVIEW_EMAIL:review@pausa.test", "--var", "REVIEW_PASSWORD:review-pass-test", "--var", `VAPID_PRIVATE_JWK:${JSON.stringify(vapidJwk)}`, "--var", `VAPID_PUBLIC_KEY:${env.VAPID_PUBLIC_B64}`, "--var", "VAPID_SUBJECT:mailto:test@pausa.test", "--var", "VAPID_DEV_LOOPBACK:1", "--var", `EXPO_PUSH_URL:http://127.0.0.1:${mockPort}/expo/send`, "--var", "SERATA_MATCH_MS:2500", "--var", "SERATA_TABLE_MS:2500", "--var", "SERATA_LOBBY_TTL_MS:25000",
  ],
  { cwd: apiDir, env, stdio: ["ignore", devFd, devFd] },
);
children.push(dev);

const base = `http://localhost:${port}`;
let up = false;
for (let i = 0; i < 90 && !up; i++) {
  await new Promise((r) => setTimeout(r, 500));
  up = await fetch(base + "/api/health/db").then((r) => r.ok, () => false);
}
if (!up) {
  console.log("✖ the API did not start. Last lines of " + devLog + ":\n" + fs.readFileSync(devLog, "utf8").split("\n").slice(-25).join("\n"));
  process.exit(1);
}

let failed = 0;
for (const name of ["api-smoke", "api-smoke-diary", "api-smoke-people", "api-smoke-stats", "api-smoke-serata", "api-smoke-import", "api-smoke-admin", "api-smoke-push", "api-smoke-assets", "api-smoke-where", "api-smoke-foryou", "api-smoke-email", "api-smoke-idem"]) {
  if (only && only !== name) continue;
  console.log(`\n▶ ${name}`);
  const r = spawnSync(process.execPath, [path.join(root, "tools", `${name}.mjs`), base], { cwd: root, env, stdio: "inherit" });
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
