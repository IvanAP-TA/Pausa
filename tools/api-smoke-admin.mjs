// Moderation, operator metrics, user blocks and the security headers. The operator is `operator@pausa.test`
// (run-smoke starts the Worker with OPERATOR_EMAILS=operator@pausa.test).
import { base, call, check, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

let r;
sql("DELETE FROM rate_limit");
const op = await signIn("operator@pausa.test");
const ann = await signIn(mail("adm-ann"));
const ben = await signIn(mail("adm-ben"));
const cleo = await signIn(mail("adm-cleo"));

// ═════════ operator gate ═════════
r = await call("GET", "/api/admin/reports");
check("admin needs a session (401)", r.status === 401);
r = await call("GET", "/api/admin/reports", { cookie: ann.cookie });
check("a normal person gets 404, not 403: the area is not revealed", r.status === 404, r.text);
r = await call("GET", "/api/admin/metrics", { cookie: ann.cookie });
check("metrics are 404 for a normal person", r.status === 404);
r = await call("GET", "/api/admin/reports", { cookie: op.cookie });
check("the operator can read the queue", r.status === 200 && Array.isArray(r.json?.reports), r.text);

// ═════════ setup: a Cerchia, two viewings, comments ═════════
const C = (await call("POST", "/api/circles", { cookie: ann.cookie, body: { name: "Mod" } })).json;
for (const u of [ben, cleo]) await call("POST", "/api/circles/join", { cookie: u.cookie, body: { code: C.inviteCode } });
const media = `adm-${run}`;
sql(`INSERT INTO media_entity(id,kind,original_title,year,poster_path) VALUES ('${media}','movie','Titolo mod',2001,'/p.jpg')`);
const mkLog = async (who, extra = {}) =>
  (await call("POST", "/api/logs", { cookie: who.cookie, body: { mediaKey: `local:${media}`, watchedOn: "2026-11-10", circles: [C.id], ...extra } })).json.id;
const logAnn = await mkLog(ann, { rating: 8, review: "Bello." });
const logBen = await mkLog(ben, { rating: 3, review: "Testo da segnalare" });
const comment = async (who, log, text) =>
  (await call("POST", `/api/circles/${C.id}/logs/${log}/comments`, { cookie: who.cookie, body: { body: text } })).json.id;
const cBen = await comment(ben, logAnn, "Commento offensivo di Ben");
const cCleo = await comment(cleo, logAnn, "Commento normale di Cleo");

// ═════════ reports and resolution ═════════
await call("POST", "/api/reports", { cookie: ann.cookie, body: { kind: "comment", targetId: cBen, reason: "abuse", note: "insulti" } });
await call("POST", "/api/reports", { cookie: ann.cookie, body: { kind: "log", targetId: logBen, reason: "spam" } });
r = await call("GET", "/api/admin/reports", { cookie: op.cookie });
const mine = (r.json?.reports ?? []).filter((x) => x.targetId === cBen || x.targetId === logBen);
check("both reports are in the open queue with reporter, Cerchia and a snapshot of the text", mine.length === 2 && mine.every((x) => x.reporterName && x.circleName === "Mod" && x.excerpt), JSON.stringify(mine));
const repComment = mine.find((x) => x.targetId === cBen);
const repLog = mine.find((x) => x.targetId === logBen);

r = await call("POST", `/api/admin/reports/${repComment.id}/resolve`, { cookie: ann.cookie, body: { resolution: "removed" } });
check("a normal person cannot resolve (404)", r.status === 404);
r = await call("POST", `/api/admin/reports/${repComment.id}/resolve`, { cookie: op.cookie, body: { resolution: "banana" } });
check("an unknown resolution is refused", r.status === 400);
r = await call("POST", `/api/admin/reports/${repComment.id}/resolve`, { cookie: op.cookie, body: { resolution: "removed" } });
check("resolving a comment report as removed (204)", r.status === 204, r.text);
check("the reported comment is gone, the other stays", sql(`SELECT id FROM comment WHERE id IN ('${cBen}','${cCleo}')`).map((x) => x.id).join() === cCleo);
r = await call("POST", `/api/admin/reports/${repComment.id}/resolve`, { cookie: op.cookie, body: { resolution: "dismissed" } });
check("a resolved report cannot be resolved again (409)", r.status === 409, String(r.status));
check("it moves to the resolved list", ((await call("GET", "/api/admin/reports?status=resolved", { cookie: op.cookie })).json?.reports ?? []).some((x) => x.id === repComment.id && x.resolution === "removed"));

// A viewing removed from the Cerchia stays in the author's diary.
r = await call("POST", `/api/admin/reports/${repLog.id}/resolve`, { cookie: op.cookie, body: { resolution: "removed" } });
check("resolving a viewing report as removed", r.status === 204, r.text);
check("the viewing is no longer shared in the Cerchia but still exists", sql(`SELECT 1 AS x FROM log_share WHERE log_id='${logBen}'`).length === 0 && sql(`SELECT 1 AS x FROM log WHERE id='${logBen}'`).length === 1);
check("the ratings of the Cerchia no longer count it", sql(`SELECT 1 AS x FROM rating_current WHERE user_id='${ben.id}' AND circle_id='${C.id}'`).length === 0);

// user_disabled signs the author out and blocks sign-in
const logCleo = await mkLog(cleo, { review: "altro testo" });
await call("POST", "/api/reports", { cookie: ann.cookie, body: { kind: "log", targetId: logCleo, reason: "abuse" } });
const repCleo = ((await call("GET", "/api/admin/reports", { cookie: op.cookie })).json?.reports ?? []).find((x) => x.targetId === logCleo);
r = await call("POST", `/api/admin/reports/${repCleo.id}/resolve`, { cookie: op.cookie, body: { resolution: "user_disabled" } });
check("user_disabled (204)", r.status === 204, r.text);
check("the disabled person's session no longer works", (await call("GET", "/api/me", { cookie: cleo.cookie })).status === 401);
check("the disabled flag is stored", sql(`SELECT disabled_at FROM user WHERE id='${cleo.id}'`)[0]?.disabled_at > 0);

// ═════════ metrics ═════════
r = await call("GET", "/api/admin/metrics", { cookie: op.cookie });
check("metrics: counts only", r.status === 200 && r.json.users >= 4 && r.json.circles >= 1 && r.json.logs >= 3 && typeof r.json.openReports === "number" && !JSON.stringify(r.json).includes("@"), r.text);

// ═════════ blocks ═════════
r = await call("PUT", `/api/me/blocks/${ann.id}`, { cookie: ann.cookie });
check("you cannot block yourself", r.status === 400);
r = await call("PUT", "/api/me/blocks/not-a-user", { cookie: ann.cookie });
check("you cannot block someone you share no Cerchia with (404)", r.status === 404, String(r.status));
const cBen2 = await comment(ben, logAnn, "Altro commento di Ben");
r = await call("PUT", `/api/me/blocks/${ben.id}`, { cookie: ann.cookie });
check("blocking a member (204)", r.status === 204, r.text);
r = await call("PUT", `/api/me/blocks/${ben.id}`, { cookie: ann.cookie });
check("blocking twice changes nothing (204)", r.status === 204);
r = await call("GET", `/api/circles/${C.id}/logs/${logAnn}`, { cookie: ann.cookie });
check("the blocker no longer sees the blocked person's comment", r.status === 200 && !JSON.stringify(r.json).includes(cBen2), r.text.slice(0, 200));
const logBen2 = await mkLog(ben, { review: "visibile?" });
r = await call("GET", `/api/circles/${C.id}/feed`, { cookie: ann.cookie });
check("the blocker's feed hides the blocked person's viewings", r.status === 200 && !JSON.stringify(r.json).includes(logBen2));
r = await call("GET", `/api/circles/${C.id}/feed`, { cookie: ben.cookie });
check("the blocked person still sees their own viewing, and is not told", r.status === 200 && JSON.stringify(r.json).includes(logBen2));
r = await call("GET", "/api/me/blocks", { cookie: ann.cookie });
check("the block list shows the name", r.json?.blocked?.length === 1 && r.json.blocked[0].id === ben.id, r.text);
r = await call("DELETE", `/api/me/blocks/${ben.id}`, { cookie: ann.cookie });
r = await call("GET", `/api/circles/${C.id}/feed`, { cookie: ann.cookie });
check("after unblocking the viewings are back", JSON.stringify(r.json).includes(logBen2));

// ═════════ security headers ═════════
r = await fetch(base + "/api/health");
check(
  "API answers carry the security headers",
  r.headers.get("x-content-type-options") === "nosniff" && r.headers.get("x-frame-options") === "DENY" && r.headers.get("referrer-policy") === "strict-origin-when-cross-origin" && !!r.headers.get("permissions-policy"),
  JSON.stringify([...r.headers]),
);

// ═════════ CSV export ═════════
r = await fetch(base + "/api/account/export?format=csv", { headers: { cookie: ann.cookie } });
const csv = await r.text();
check("the diary exports as CSV with Letterboxd-style columns, half stars and a download name", r.status === 200 && (r.headers.get("content-type") ?? "").startsWith("text/csv") && (r.headers.get("content-disposition") ?? "").includes("pausa-diario.csv") && csv.startsWith("Date,Name,Year,Rating,Rewatch,Review") && csv.includes("Titolo mod,2001,4,"), csv.slice(0, 200));
r = await fetch(base + "/api/account/export?format=csv");
check("the CSV export needs a session", r.status === 401);

finish();
