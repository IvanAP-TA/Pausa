// Shared helpers for the API smoke tests: HTTP calls, local D1 access, assertions, magic-link sign-in.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const base = (process.argv[2] ?? "http://localhost:8798").replace(/\/$/, "");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerJs = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

let failed = 0;
let passed = 0;
export function check(name, cond, detail = "") {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL  ${name} ${String(detail).slice(0, 400)}`);
  }
}
export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

/** Runs SQL against the local D1 (the same state `wrangler dev --persist-to $PAUSA_PERSIST` serves). Returns the rows. */
export function sql(query, attempt = 1) {
  const persist = process.env.PAUSA_PERSIST ? ["--persist-to", process.env.PAUSA_PERSIST] : [];
  const r = spawnSync(process.execPath, [wranglerJs, "d1", "execute", "pausa-v2", "--local", ...persist, "--json", "--command", query], {
    cwd: path.join(root, "crates", "api"),
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (r.status !== 0) {
    // Local D1 sometimes answers "internal error; reference = ..." when `wrangler d1 execute` and the running Worker touch the same
    // SQLite file at the same moment (seen about 1 run in 6, never reproducible on the same statement). Retry only that message.
    if (attempt < 3 && /internal error; reference/.test(r.stdout + r.stderr)) return sql(query, attempt + 1);
    throw new Error("wrangler d1 execute failed: " + (r.stderr || r.stdout));
  }
  const out = JSON.parse(r.stdout.slice(r.stdout.indexOf("[")));
  return out[0]?.results ?? [];
}

export async function call(method, url, { cookie, body, redirect = "manual", headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    redirect,
    // Synchronous D1 CLI calls between requests can outlive Wrangler's idle keep-alive sockets.
    headers: { connection: "close", ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers, cookies: res.headers.getSetCookie?.() ?? [] };
}

export const run = Date.now().toString(36);
export const mail = (n) => `${n}-${run}@pausa.test`;

let linkBudget = 0;
/** Magic-link sign-in; returns { cookie, id }. Clears the per-IP link counter now and then so a long suite is not rate limited. */
export async function signIn(email) {
  if (++linkBudget > 4) {
    sql("DELETE FROM rate_limit");
    linkBudget = 1;
  }
  const r = await call("POST", "/api/auth/magic-link", { body: { email, next: "/", locale: "it" } });
  if (!r.json?.devLink) throw new Error("no devLink: " + r.text);
  const link = new URL(r.json.devLink);
  const v = await call("GET", link.pathname + link.search);
  const cookie = v.cookies.find((c) => c.startsWith("pausa_session="))?.split(";")[0];
  if (!cookie) throw new Error("no session cookie: " + JSON.stringify(v.cookies));
  const me = await call("GET", "/api/me", { cookie });
  return { cookie, id: me.json.id };
}

export const days = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
