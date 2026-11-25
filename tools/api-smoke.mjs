// End-to-end checks of the v2 API against a running `wrangler dev --local` (D1 local, no mail key: sign-in links come back as
// `devLink`). Usage:  node tools/api-smoke.mjs http://localhost:8798
// It resets the rate-limit counters through `wrangler d1 execute --local`, so it must run next to crates/api.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:8798").replace(/\/$/, "");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerJs = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

let failed = 0;
let passed = 0;
function check(name, cond, detail = "") {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

function sql(query) {
  const persist = process.env.PAUSA_PERSIST ? ["--persist-to", process.env.PAUSA_PERSIST] : [];
  const r = spawnSync(process.execPath, [wranglerJs, "d1", "execute", "pausa-v2", "--local", ...persist, "--json", "--command", query], {
    cwd: path.join(root, "crates", "api"),
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (r.status !== 0) throw new Error("wrangler d1 execute failed: " + (r.stderr || r.stdout));
  const out = JSON.parse(r.stdout.slice(r.stdout.indexOf("[")));
  return out[0]?.results ?? [];
}

async function call(method, url, { cookie, body, redirect = "manual", headers = {} } = {}) {
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

const run = Date.now().toString(36);
const mail = (n) => `${n}-${run}@pausa.test`;

/** Signs in through the full magic-link round trip and returns the session cookie. */
let linkBudget = 0;
async function signIn(email, next = "/it/home") {
  if (++linkBudget > 4) {
    sql("DELETE FROM rate_limit");
    linkBudget = 1;
  }
  const r = await call("POST", "/api/auth/magic-link", { body: { email, next, locale: "it" } });
  check(`link requested for ${email}`, r.status === 200 && r.json?.ok === true && r.json?.devLink, JSON.stringify(r));
  const link = new URL(r.json.devLink);
  const v = await call("GET", link.pathname + link.search);
  check("verify redirects (303)", v.status === 303, String(v.status));
  const set = v.cookies.find((c) => c.startsWith("pausa_session="));
  check("verify sets the session cookie", !!set, JSON.stringify(v.cookies));
  return { cookie: set?.split(";")[0], location: v.headers.get("location"), setCookie: set, link: link.pathname + link.search };
}

// ── health and error contract
let r = await call("GET", "/api/health/db");
check("health/db", r.status === 200 && r.json?.db === true);
r = await call("GET", "/api/nope");
check("unknown route is a JSON 404", r.status === 404 && r.json?.code === "not_found", r.text);
r = await call("GET", "/api/me");
check("me without a session is 401", r.status === 401 && r.json?.code === "unauthorized", r.text);

// ── magic link
sql("DELETE FROM rate_limit");
r = await call("POST", "/api/auth/magic-link", { body: { email: "not-an-email" } });
check("malformed email is 400", r.status === 400 && r.json?.code === "invalid", r.text);

const giulia = await signIn(mail("giulia"));
check("lands on the requested path", new URL(giulia.location).pathname === "/it/home", giulia.location);
check("cookie is HttpOnly, SameSite=Lax, Path=/", /HttpOnly/.test(giulia.setCookie) && /SameSite=Lax/.test(giulia.setCookie) && /Path=\//.test(giulia.setCookie));
check("plain http dev cookie has no Secure/__Host-", !/Secure/.test(giulia.setCookie));

// A link works once.
const reuse = await call("GET", giulia.link);
check("reused link does not sign in", reuse.status === 303 && /signin_error=link/.test(reuse.headers.get("location") ?? "") && reuse.cookies.length === 0, JSON.stringify([reuse.status, reuse.headers.get("location")]));

// Only the hash of the token is stored.
const token = giulia.cookie.split("=")[1];
const stored = sql("SELECT token_hash FROM session ORDER BY created_at DESC LIMIT 5").map((x) => x.token_hash);
check("the database never holds the raw token", !stored.includes(token) && stored.every((h) => /^[0-9a-f]{64}$/.test(h)));

// Open-redirect guard.
const evil = await signIn(mail("evil"), "//evil.example");
check("//evil next falls back to /", new URL(evil.location).pathname === "/" && new URL(evil.location).host === new URL(base).host, evil.location);

// ── me and circles
r = await call("GET", "/api/me", { cookie: giulia.cookie });
check("me returns the person with no circles", r.status === 200 && r.json?.name?.startsWith("giulia") && Array.isArray(r.json?.circles) && r.json.circles.length === 0 && r.json.isAnonymous === false, r.text);

r = await call("POST", "/api/circles", { cookie: giulia.cookie, body: { name: "   " } });
check("empty circle name is 400", r.status === 400, r.text);
r = await call("POST", "/api/circles", { body: { name: "X" } });
check("create needs a session", r.status === 401);
r = await call("POST", "/api/circles", { cookie: giulia.cookie, body: { name: "  Divano  " } });
check("create circle (201)", r.status === 201 && /^[A-HJ-NP-Z2-9]{8}$/.test(r.json?.inviteCode ?? ""), r.text);
const circleId = r.json.id;
const code = r.json.inviteCode;
r = await call("GET", "/api/me", { cookie: giulia.cookie });
check("creator is the owner, name trimmed", r.json?.circles?.[0]?.name === "Divano" && r.json.circles[0].role === "owner" && r.json.circles[0].id === circleId, r.text);
check("exactly one owner row", sql(`SELECT COUNT(*) AS n FROM circle_member WHERE circle_id='${circleId}' AND role='owner'`)[0].n === 1);

// ── joining
const marco = await signIn(mail("marco"));
r = await call("POST", "/api/circles/join", { cookie: marco.cookie, body: { code: "ZZZZZZZZ" } });
check("unknown code is 404", r.status === 404 && r.json?.code === "not_found", r.text);
r = await call("POST", "/api/circles/join", { cookie: marco.cookie, body: { code: code.toLowerCase() } });
check("join with the typed (lower-case) code", r.status === 200 && r.json?.joined === true && r.json?.circleId === circleId, r.text);
r = await call("POST", "/api/circles/join", { cookie: marco.cookie, body: { code } });
check("joining twice changes nothing", r.status === 200 && r.json?.joined === false, r.text);
r = await call("GET", "/api/me", { cookie: marco.cookie });
check("joiner is a member", r.json?.circles?.[0]?.role === "member", r.text);
check("invite use counted once", sql(`SELECT uses FROM invite WHERE code='${code}'`)[0].uses === 1);
check("who joined through the invite is recorded", sql(`SELECT COUNT(*) AS n FROM invite_use iu JOIN invite i ON i.id=iu.invite_id WHERE i.code='${code}'`)[0].n === 1);

sql(`UPDATE invite SET max_uses = 1 WHERE code='${code}'`);
const anna = await signIn(mail("anna"));
r = await call("POST", "/api/circles/join", { cookie: anna.cookie, body: { code } });
check("an exhausted invite is refused", r.status === 409 && r.json?.code === "invite_exhausted", r.text);
sql(`UPDATE invite SET max_uses = NULL, revoked_at = 1 WHERE code='${code}'`);
r = await call("POST", "/api/circles/join", { cookie: anna.cookie, body: { code } });
check("a revoked invite is refused", r.status === 409 && r.json?.code === "invite_revoked", r.text);
sql(`UPDATE invite SET revoked_at = NULL, expires_at = 1 WHERE code='${code}'`);
r = await call("POST", "/api/circles/join", { cookie: anna.cookie, body: { code } });
check("an expired invite is refused", r.status === 409 && r.json?.code === "invite_expired", r.text);
check("a refused join writes no membership", sql(`SELECT COUNT(*) AS n FROM circle_member WHERE circle_id='${circleId}'`)[0].n === 2);

// ── a full Cerchia refuses newcomers
sql(`UPDATE invite SET expires_at = NULL WHERE code='${code}'`);
for (let i = 0; i < 28; i++) {
  sql(`INSERT INTO user(id,name,email) VALUES ('fill${i}-${run}','f','fill${i}-${run}@x.test')`);
  sql(`INSERT INTO circle_member(circle_id,user_id) VALUES ('${circleId}','fill${i}-${run}')`);
}
r = await call("POST", "/api/circles/join", { cookie: anna.cookie, body: { code } });
check("a Cerchia of 30 is full", r.status === 409 && r.json?.code === "circle_full", r.text);

// ── guest
r = await call("POST", "/api/auth/guest", { body: { name: "Nonna" } });
const gcookie = r.cookies.find((c) => c.startsWith("pausa_session="))?.split(";")[0];
check("guest session", r.status === 200 && !!gcookie, r.text);
r = await call("GET", "/api/me", { cookie: gcookie });
check("guest is anonymous", r.json?.isAnonymous === true && r.json?.name === "Nonna", r.text);
r = await call("POST", "/api/circles", { cookie: gcookie, body: { name: "Nope" } });
check("a guest cannot create a Cerchia", r.status === 403 && r.json?.code === "forbidden", r.text);

// ── logout
r = await call("POST", "/api/auth/logout", { cookie: marco.cookie });
check("logout is 204 and clears the cookie", r.status === 204 && r.cookies.some((c) => /Max-Age=0/.test(c)), JSON.stringify(r.cookies));
r = await call("GET", "/api/me", { cookie: marco.cookie });
check("the old cookie no longer works", r.status === 401);

// ── a session that expired or whose user was disabled is refused
const bea = await signIn(mail("bea"));
sql(`UPDATE user SET disabled_at = 1 WHERE email = '${mail("bea")}'`);
r = await call("GET", "/api/me", { cookie: bea.cookie });
check("a disabled account is signed out at once", r.status === 401);

// ═════════ T2b: managing a Cerchia ═════════
async function newCircle(ownerEmail, name = "Sala") {
  const owner = await signIn(ownerEmail);
  const c = await call("POST", "/api/circles", { cookie: owner.cookie, body: { name } });
  return { owner, id: c.json.id, code: c.json.inviteCode };
}
async function joinAs(email, code) {
  const u = await signIn(email);
  const j = await call("POST", "/api/circles/join", { cookie: u.cookie, body: { code } });
  check(`${email.split("-")[0]} joins`, j.json?.joined === true, j.text);
  const me = await call("GET", "/api/me", { cookie: u.cookie });
  return { ...u, userId: me.json.id };
}
const uid = async (c) => (await call("GET", "/api/me", { cookie: c.cookie })).json.id;
sql("DELETE FROM rate_limit");

const g = await newCircle(mail("own"));
const ownerId = await uid(g.owner);
const m1 = await joinAs(mail("m1"), g.code);
const a1 = await joinAs(mail("a1"), g.code);
const outsider = await signIn(mail("out"));
check("creating+joining notified the owner twice (circle_join)", sql(`SELECT COUNT(*) AS n FROM notification WHERE user_id='${ownerId}' AND type='circle_join' AND circle_id='${g.id}'`)[0].n === 2);

// detail: members see people and invites, outsiders see nothing (404, not 403)
r = await call("GET", `/api/circles/${g.id}`, { cookie: g.owner.cookie });
check("detail: owner sees 3 members and the invite", r.status === 200 && r.json.myRole === "owner" && r.json.members.length === 3 && r.json.invites.length === 1 && r.json.invites[0].code === g.code, r.text);
r = await call("GET", `/api/circles/${g.id}`, { cookie: outsider.cookie });
check("detail: a non-member gets 404", r.status === 404 && r.json?.code === "not_found", r.text);
r = await call("GET", `/api/circles/${g.id}`);
check("detail: no session is 401", r.status === 401);
r = await call("GET", `/api/circles/does-not-exist`, { cookie: g.owner.cookie });
check("detail: unknown id is 404", r.status === 404);

// roles: only the owner changes them, nobody becomes owner this way
r = await call("PUT", `/api/circles/${g.id}/members/${a1.userId}/role`, { cookie: m1.cookie, body: { role: "admin" } });
check("a member cannot promote", r.status === 403, r.text);
r = await call("PUT", `/api/circles/${g.id}/members/${a1.userId}/role`, { cookie: g.owner.cookie, body: { role: "admin" } });
check("owner promotes a member to admin", r.status === 204, r.text);
r = await call("PUT", `/api/circles/${g.id}/members/${m1.userId}/role`, { cookie: a1.cookie, body: { role: "admin" } });
check("an admin cannot promote either", r.status === 403, r.text);
r = await call("PUT", `/api/circles/${g.id}/members/${m1.userId}/role`, { cookie: g.owner.cookie, body: { role: "owner" } });
check("nobody is made owner through role change", r.status === 403, r.text);
r = await call("PUT", `/api/circles/${g.id}/members/${ownerId}/role`, { cookie: g.owner.cookie, body: { role: "member" } });
check("the owner cannot demote themselves", r.status === 403, r.text);
r = await call("PUT", `/api/circles/${g.id}/members/${m1.userId}/role`, { cookie: g.owner.cookie, body: { role: "root" } });
check("unknown role is 400", r.status === 400, r.text);
r = await call("PUT", `/api/circles/${g.id}/members/nobody/role`, { cookie: g.owner.cookie, body: { role: "admin" } });
check("role of a non-member is 404", r.status === 404, r.text);

// invites: managers only, validated, revocable
r = await call("POST", `/api/circles/${g.id}/invites`, { cookie: m1.cookie, body: {} });
check("a member cannot create invites", r.status === 403, r.text);
r = await call("POST", `/api/circles/${g.id}/invites`, { cookie: outsider.cookie, body: {} });
check("an outsider cannot even see the Cerchia (404)", r.status === 404, r.text);
r = await call("POST", `/api/circles/${g.id}/invites`, { cookie: a1.cookie, body: { expiry: "2d" } });
check("invalid expiry is 400", r.status === 400, r.text);
r = await call("POST", `/api/circles/${g.id}/invites`, { cookie: a1.cookie, body: { expiry: "1d", maxUses: 7 } });
check("invalid maxUses is 400", r.status === 400, r.text);
r = await call("POST", `/api/circles/${g.id}/invites`, { cookie: a1.cookie, body: { expiry: "1d", maxUses: 5 } });
const day = 86_400_000;
check("an admin creates an invite (1 day, 5 uses)", r.status === 201 && r.json.maxUses === 5 && Math.abs(r.json.expiresAt - (Date.now() + day)) < 60_000 && /^[A-HJ-NP-Z2-9]{8}$/.test(r.json.code), r.text);
const inv2 = r.json;
r = await call("POST", `/api/circles/${g.id}/invites`, { cookie: a1.cookie, body: {} });
check("default invite lasts 7 days with unlimited uses", r.status === 201 && r.json.maxUses === null && Math.abs(r.json.expiresAt - (Date.now() + 7 * day)) < 60_000, r.text);
r = await call("POST", `/api/circles/${g.id}/invites`, { cookie: a1.cookie, body: { expiry: "never" } });
check("'never' means no expiry", r.status === 201 && r.json.expiresAt === null, r.text);
r = await call("POST", `/api/circles/${g.id}/invites/${inv2.id}/revoke`, { cookie: m1.cookie });
check("a member cannot revoke", r.status === 403, r.text);
r = await call("POST", `/api/circles/${g.id}/invites/${inv2.id}/revoke`, { cookie: a1.cookie });
check("an admin revokes (204)", r.status === 204, r.text);
r = await call("POST", `/api/circles/${g.id}/invites/not-an-invite/revoke`, { cookie: a1.cookie });
check("revoking an unknown id is not an error", r.status === 204, r.text);
r = await call("POST", "/api/circles/join", { cookie: outsider.cookie, body: { code: inv2.code } });
check("a revoked invite no longer works", r.status === 409 && r.json?.code === "invite_revoked", r.text);
r = await call("GET", `/api/circles/${g.id}`, { cookie: m1.cookie });
check("revoked invites disappear from the detail", !r.json.invites.some((i) => i.id === inv2.id) && r.json.invites.length === 3, r.text);

// settings
r = await call("PATCH", `/api/circles/${g.id}`, { cookie: m1.cookie, body: { name: "Hack" } });
check("a member cannot change settings", r.status === 403, r.text);
r = await call("PATCH", `/api/circles/${g.id}`, { cookie: a1.cookie, body: {} });
check("empty settings are 400", r.status === 400, r.text);
r = await call("PATCH", `/api/circles/${g.id}`, { cookie: a1.cookie, body: { cover: "../x" } });
check("a cover must be a preset key", r.status === 400, r.text);
r = await call("PATCH", `/api/circles/${g.id}`, { cookie: a1.cookie, body: { name: "  Sala Grande ", description: "Giovedì sera", cover: "sala-cinema", liveWatching: false } });
check("an admin updates settings", r.status === 204, r.text);
r = await call("GET", `/api/circles/${g.id}`, { cookie: m1.cookie });
check("settings are reflected", r.json.name === "Sala Grande" && r.json.description === "Giovedì sera" && r.json.cover === "sala-cinema" && r.json.liveWatching === false, r.text);
r = await call("PATCH", `/api/circles/${g.id}`, { cookie: a1.cookie, body: { description: "", cover: "" } });
r = await call("GET", `/api/circles/${g.id}`, { cookie: m1.cookie });
check("an empty description and cover clear them", r.json.description === null && r.json.cover === null, r.text);

// muting the Cerchia silences join notices for that person
sql(`UPDATE circle_member SET muted = 1 WHERE circle_id='${g.id}' AND user_id='${ownerId}'`);
const before = sql(`SELECT COUNT(*) AS n FROM notification WHERE user_id='${ownerId}' AND type='circle_join'`)[0].n;
const m2 = await joinAs(mail("m2"), g.code);
check("a muted owner gets no join notice", sql(`SELECT COUNT(*) AS n FROM notification WHERE user_id='${ownerId}' AND type='circle_join'`)[0].n === before);
check("an unmuted member does", sql(`SELECT COUNT(*) AS n FROM notification WHERE user_id='${m1.userId}' AND type='circle_join' AND actor_id='${m2.userId}'`)[0].n === 1);
r = await call("GET", "/api/me", { cookie: m1.cookie });
check("unread counts reach /api/me", r.json.circles[0].unread >= 1, r.text);

// removal
r = await call("DELETE", `/api/circles/${g.id}/members/${m2.userId}`, { cookie: m1.cookie });
check("a member cannot remove", r.status === 403, r.text);
r = await call("DELETE", `/api/circles/${g.id}/members/${ownerId}`, { cookie: a1.cookie });
check("an admin cannot remove the creator any more", r.status === 403, r.text);
r = await call("DELETE", `/api/circles/${g.id}/members/${a1.userId}`, { cookie: a1.cookie });
check("removing yourself this way is refused", r.status === 400, r.text);
r = await call("PUT", `/api/circles/${g.id}/members/${m1.userId}/role`, { cookie: g.owner.cookie, body: { role: "admin" } });
r = await call("DELETE", `/api/circles/${g.id}/members/${m1.userId}`, { cookie: a1.cookie });
check("an admin cannot remove another admin", r.status === 403, r.text);
r = await call("DELETE", `/api/circles/${g.id}/members/${m2.userId}`, { cookie: a1.cookie });
check("an admin removes a member", r.status === 204, r.text);
r = await call("GET", `/api/circles/${g.id}`, { cookie: m2.cookie });
check("the removed person no longer sees the Cerchia", r.status === 404);
r = await call("DELETE", `/api/circles/${g.id}/members/${a1.userId}`, { cookie: g.owner.cookie });
check("the owner removes an admin", r.status === 204, r.text);
r = await call("POST", "/api/circles/join", { cookie: a1.cookie, body: { code: g.code } });
check("a removed person can rejoin with an active invite", r.status === 200 && r.json.joined === true, r.text);

// leaving and handing over
r = await call("POST", `/api/circles/${g.id}/leave`, { cookie: g.owner.cookie });
check("the owner cannot leave without handing over", r.status === 409 && r.json?.code === "must_transfer", r.text);
r = await call("POST", `/api/circles/${g.id}/transfer`, { cookie: m1.cookie, body: { userId: m1.userId } });
check("only the owner transfers", r.status === 403, r.text);
r = await call("POST", `/api/circles/${g.id}/transfer`, { cookie: g.owner.cookie, body: { userId: m2.userId } });
check("transfer to a non-member is refused", r.status === 400, r.text);
r = await call("POST", `/api/circles/${g.id}/transfer`, { cookie: g.owner.cookie, body: { userId: ownerId } });
check("transfer to yourself is refused", r.status === 400, r.text);
r = await call("POST", `/api/circles/${g.id}/transfer`, { cookie: g.owner.cookie, body: { userId: m1.userId } });
check("owner hands the Cerchia over", r.status === 204, r.text);
const roles = Object.fromEntries(sql(`SELECT user_id, role FROM circle_member WHERE circle_id='${g.id}'`).map((x) => [x.user_id, x.role]));
check("exactly one owner after the hand-over; the old owner is an admin", roles[m1.userId] === "owner" && roles[ownerId] === "admin" && Object.values(roles).filter((x) => x === "owner").length === 1, JSON.stringify(roles));
r = await call("POST", `/api/circles/${g.id}/leave`, { cookie: a1.cookie });
check("a member leaves (204)", r.status === 204);
r = await call("GET", `/api/circles/${g.id}`, { cookie: a1.cookie });
check("and no longer sees it", r.status === 404);

// deletion needs the owner and the name typed
r = await call("DELETE", `/api/circles/${g.id}`, { cookie: g.owner.cookie, body: { name: "Sala Grande" } });
check("the former owner cannot delete", r.status === 403, r.text);
r = await call("DELETE", `/api/circles/${g.id}`, { cookie: m1.cookie, body: { name: "wrong" } });
check("a wrong name is refused", r.status === 400, r.text);
r = await call("DELETE", `/api/circles/${g.id}`, { cookie: m1.cookie, body: { name: " Sala Grande " } });
check("the owner deletes with the name typed", r.status === 204, r.text);
check("the Cerchia, its people and its invites are gone", sql(`SELECT (SELECT COUNT(*) FROM circle WHERE id='${g.id}') + (SELECT COUNT(*) FROM circle_member WHERE circle_id='${g.id}') + (SELECT COUNT(*) FROM invite WHERE circle_id='${g.id}') AS n`)[0].n === 0);

// a lone owner leaving deletes the Cerchia with them
const solo = await newCircle(mail("solo"));
r = await call("POST", `/api/circles/${solo.id}/leave`, { cookie: solo.owner.cookie });
check("a lone owner can leave: the Cerchia goes with them", r.status === 204 && sql(`SELECT COUNT(*) AS n FROM circle WHERE id='${solo.id}'`)[0].n === 0, r.text);

// ═════════ T2b: account ═════════
const x = await signIn(mail("acct"));
const x2 = await signIn(mail("acct"));
r = await call("GET", "/api/account/sessions", { cookie: x.cookie });
check("two devices listed, this one marked current", r.status === 200 && r.json.length === 2 && r.json.filter((s) => s.current).length === 1, r.text);
const other = r.json.find((s) => !s.current);
r = await call("DELETE", `/api/account/sessions/${other.id}`, { cookie: x.cookie });
check("signing another device out", r.status === 204);
r = await call("GET", "/api/me", { cookie: x2.cookie });
check("that device is signed out at once", r.status === 401);
const mine = (await call("GET", "/api/account/sessions", { cookie: x.cookie })).json.find((s) => s.current);
r = await call("DELETE", `/api/account/sessions/${mine.id}`, { cookie: m1.cookie });
r = await call("GET", "/api/me", { cookie: x.cookie });
check("a stranger cannot sign someone else's device out", r.status === 200, r.text);
// export
const acctId = await uid(x);
sql(`INSERT INTO media_entity(id,kind,original_title,year) VALUES ('mx-${run}','movie','Il Posto delle Fragole',1957)`);
sql(`INSERT INTO log(id,user_id,media_id,watched_on,rating,review) VALUES ('lx-${run}','${acctId}','mx-${run}','2026-11-20',9,'Bellissimo')`);
r = await call("GET", "/api/account/export", { cookie: x.cookie });
check("export: attachment with profile and logs", r.status === 200 && /attachment/.test(r.headers.get("content-disposition") ?? "") && r.json.profile?.email === mail("acct") && r.json.logs?.[0]?.title === "Il Posto delle Fragole" && r.json.logs[0].rating === 9 && Array.isArray(r.json.circles), r.text.slice(0, 300));
check("export holds no password hash or tokens", !/token|password/i.test(r.text));
r = await call("GET", "/api/account/export");
check("export needs a session", r.status === 401);

// deletion: the Cerchia goes to the longest-standing admin, else member
const d = await newCircle(mail("dying"), "Eredita");
const dOwner = await uid(d.owner);
const early = await joinAs(mail("early"), d.code);
await new Promise((res) => setTimeout(res, 20));
const late = await joinAs(mail("late"), d.code);
r = await call("PUT", `/api/circles/${d.id}/members/${late.userId}/role`, { cookie: d.owner.cookie, body: { role: "admin" } });
const lone = await newCircle(mail("dying") , "Da sola"); // same owner, no other members
r = await call("DELETE", "/api/account", { cookie: d.owner.cookie, body: { confirm: false } });
check("deleting needs confirm:true", r.status === 400, r.text);
r = await call("DELETE", "/api/account", { cookie: d.owner.cookie, body: { confirm: true } });
check("delete account (204) clears the cookie", r.status === 204 && r.cookies.some((c) => /Max-Age=0/.test(c)), r.text);
const heirRoles = Object.fromEntries(sql(`SELECT user_id, role FROM circle_member WHERE circle_id='${d.id}'`).map((q) => [q.user_id, q.role]));
check("the longest-standing admin inherits the Cerchia (not the older plain member)", heirRoles[late.userId] === "owner" && heirRoles[early.userId] === "member" && Object.keys(heirRoles).length === 2, JSON.stringify(heirRoles));
check("a Cerchia with nobody left is deleted", sql(`SELECT COUNT(*) AS n FROM circle WHERE id='${lone.id}'`)[0].n === 0);
check("the account and its sessions are gone", sql(`SELECT (SELECT COUNT(*) FROM user WHERE id='${dOwner}') + (SELECT COUNT(*) FROM session WHERE user_id='${dOwner}') AS n`)[0].n === 0);
check("the Cerchia keeps working: created_by is cleared, not dangling", sql(`SELECT created_by FROM circle WHERE id='${d.id}'`)[0].created_by === null);

// ═════════ T2b: native app handshake ═════════
r = await call("POST", "/api/auth/magic-link", { body: { email: mail("native"), next: "/it/home", locale: "es", native: true } });
check("native link carries native=1 and the language", /native=1/.test(r.json?.devLink) && /[?&]l=es/.test(r.json?.devLink), r.text);
const nlink = new URL(r.json.devLink);
r = await call("GET", nlink.pathname + nlink.search);
const deep = /href="(pausa:\/\/auth\?[^"]+)"/.exec(r.text)?.[1]?.replaceAll("&amp;", "&");
check("verify answers with a page that opens the app, and sets no cookie", r.status === 200 && /text\/html/.test(r.headers.get("content-type") ?? "") && !!deep && r.cookies.length === 0 && /Volver a Pausa/.test(r.text), r.text.slice(0, 200));
const ncode = new URL(deep).searchParams.get("code");
check("the deep link keeps the safe next path", new URL(deep).searchParams.get("next") === "/it/home", deep);
r = await call("POST", "/api/auth/native/exchange", { body: { code: ncode } });
const ntoken = r.json?.token;
check("exchange returns the app's own token", r.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(ntoken ?? ""), r.text);
r = await call("GET", "/api/me", { headers: { authorization: `Bearer ${ntoken}` } });
check("the Bearer token works on the API", r.status === 200 && r.json?.name?.startsWith("native"), r.text);
check("native sessions are marked native", sql(`SELECT kind FROM session ORDER BY created_at DESC LIMIT 1`)[0].kind === "native");
r = await call("POST", "/api/auth/native/exchange", { body: { code: ncode } });
check("a code works once", r.status === 401, r.text);
r = await call("GET", "/api/me", { headers: { authorization: "Bearer not-a-token" } });
check("a bad Bearer token is 401", r.status === 401);
r = await call("POST", "/api/auth/native/code", { cookie: giulia.cookie });
check("a signed-in browser can mint a code", r.status === 200 && !!r.json?.code, r.text);
const mint = r.json.code;
sql(`UPDATE login_token SET expires_at = 1 WHERE kind='native_code' AND used_at IS NULL`);
r = await call("POST", "/api/auth/native/exchange", { body: { code: mint } });
check("an expired code is refused", r.status === 401, r.text);
r = await call("POST", "/api/auth/native/code");
check("minting a code needs a session", r.status === 401);

// The browser handoff for Google must also prove that it was started in this app.
r = await call("GET", "/api/auth/google/status");
check("Google is hidden on the local origin", r.status === 200 && r.json?.enabled === false);
r = await call("GET", "/api/auth/google/start");
check("Google cannot start on the local origin", r.status === 404);
const protectedCode = randomBytes(32).toString("base64url");
const verifier = randomBytes(32).toString("hex");
const hash = (value) => createHash("sha256").update(value).digest("hex");
sql(`INSERT INTO login_token(token_hash, kind, user_id, native_challenge, expires_at)
     SELECT '${hash(protectedCode)}', 'native_code', id, '${hash(verifier)}', ${Date.now() + 60_000}
     FROM user WHERE email = '${mail("native")}'`);
r = await call("POST", "/api/auth/native/exchange", { body: { code: protectedCode } });
check("Google native code refuses a missing verifier", r.status === 401);
r = await call("POST", "/api/auth/native/exchange", { body: { code: protectedCode, verifier: "wrong" } });
check("Google native code refuses a wrong verifier", r.status === 401);
r = await call("POST", "/api/auth/native/exchange", { body: { code: protectedCode, verifier } });
check("Google native code accepts the right verifier after failed attempts", r.status === 200 && !!r.json?.token);
r = await call("POST", "/api/auth/native/exchange", { body: { code: protectedCode, verifier } });
check("Google native code cannot be redeemed twice", r.status === 401);

// ═════════ T2b: daily housekeeping ═════════
const ok = await signIn(mail("keep"));
const keepId = await uid(ok);
sql(`INSERT INTO user(id,name,email) VALUES ('old-${run}','o','old-${run}@x.test')`);
sql(`INSERT INTO session(id,token_hash,user_id,expires_at) VALUES ('exp-${run}','h-${run}','old-${run}',1)`);
sql(`INSERT INTO login_token(token_hash,kind,email,expires_at) VALUES ('lt-${run}','magic_link','a@b.test',1)`);
sql(`INSERT INTO rate_limit(key,count,window_start) VALUES ('stale-${run}',1,1)`);
sql(`INSERT INTO user(id,name,email,is_anonymous,created_at) VALUES ('guest-old-${run}','g','guest-old-${run}@guest.invalid',1,1)`);
sql(`INSERT INTO user(id,name,email,is_anonymous) VALUES ('guest-new-${run}','g','guest-new-${run}@guest.invalid',1)`);
const sched = await fetch(base + "/cdn-cgi/handler/scheduled?cron=17+3+*+*+*");
check("cron trigger ran", sched.status === 200, String(sched.status));
await new Promise((res) => setTimeout(res, 800));
const left = (q) => sql(q)[0].n;
check("expired session removed, fresh one kept", left(`SELECT COUNT(*) AS n FROM session WHERE id='exp-${run}'`) === 0 && left(`SELECT COUNT(*) AS n FROM session WHERE user_id='${keepId}'`) >= 1);
check("expired sign-in token removed", left(`SELECT COUNT(*) AS n FROM login_token WHERE token_hash='lt-${run}'`) === 0);
check("stale rate-limit counter removed", left(`SELECT COUNT(*) AS n FROM rate_limit WHERE key='stale-${run}'`) === 0);
check("an old guest is removed, a new guest and real accounts are kept", left(`SELECT COUNT(*) AS n FROM user WHERE id='guest-old-${run}'`) === 0 && left(`SELECT COUNT(*) AS n FROM user WHERE id IN ('guest-new-${run}','old-${run}','${keepId}')`) === 3);

// ── rate limits
sql("DELETE FROM rate_limit");
const spam = mail("spam");
const codes = [];
for (let i = 0; i < 4; i++) codes.push((await call("POST", "/api/auth/magic-link", { body: { email: spam } })).status);
check("3 links per email per 10 minutes, then 429", JSON.stringify(codes) === "[200,200,200,429]", JSON.stringify(codes));
r = await call("POST", "/api/auth/magic-link", { body: { email: spam } });
check("429 carries Retry-After and the error body", r.status === 429 && r.json?.code === "rate_limited" && r.json?.retryAfter > 0 && Number(r.headers.get("retry-after")) > 0, r.text);
sql("DELETE FROM rate_limit");
let ipCodes = [];
for (let i = 0; i < 6; i++) ipCodes.push((await call("POST", "/api/auth/magic-link", { body: { email: mail("ip" + i) } })).status);
check("5 links per IP per 10 minutes, then 429", JSON.stringify(ipCodes) === "[200,200,200,200,200,429]", JSON.stringify(ipCodes));
sql("DELETE FROM rate_limit");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
