// node --test tools/migrate-v1-to-v2/
// Runs the migration on a synthetic v1 database (make-v1-fixture.mjs) and asserts reconciliation, the D1(a) behaviour on named
// hand-built cases, the rating rule against an independent oracle, the safety rails of the CLI and the v2 integrity.
// MIGRATE_SCRIPT can point at a variant of migrate.mjs (used while developing to prove that these tests catch a broken one).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFixture } from "./make-v1-fixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = process.env.MIGRATE_SCRIPT ? path.resolve(process.env.MIGRATE_SCRIPT) : path.join(HERE, "migrate.mjs");
const { migrate } = await import(pathToFileURL(SCRIPT).href);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pausa-migrate-test-"));
const v1Path = path.join(dir, "v1.sqlite");
const v2Path = path.join(dir, "v2.sqlite");
let fixture, report, v1Hash, v1, v2;

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env } });
const q = (db, sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r }));
const count = (db, t) => Number(q(db, `SELECT count(*) n FROM "${t}"`)[0].n);
const commentCircles = (id) => q(v2, "SELECT circle_id FROM comment WHERE log_id = (SELECT log_id FROM comment WHERE id = ?) AND body = (SELECT body FROM comment WHERE id = ?) ORDER BY circle_id", id, id).map((r) => r.circle_id);

before(() => {
  fixture = buildFixture(v1Path);
  v1Hash = sha(v1Path);
  report = migrate({ from: v1Path, to: v2Path });
  v1 = new DatabaseSync(v1Path, { readOnly: true });
  v2 = fs.existsSync(v2Path) ? new DatabaseSync(v2Path, { readOnly: true }) : null; // absent when the migration refused to commit
});
after(() => {
  v1?.close(); v2?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("fixture is shaped as promised (50 users, 6 Cerchie, hundreds of logs, all v1 areas)", () => {
  const c = fixture.counts;
  assert.equal(c.user, 50);
  assert.equal(c.circle, 6);
  assert.ok(c.log >= 300, `logs ${c.log}`);
  for (const t of ["comment", "reaction", "list", "list_item", "serata", "serata_vote", "notification", "import_batch", "report", "push_subscription", "now_watching", "session"]) assert.ok(c[t] > 0, t);
  assert.ok(q(v1, "SELECT 1 FROM media_entity WHERE kind='anime' AND anilist_id IS NOT NULL").length > 0);
  assert.ok(q(v1, "SELECT 1 FROM log WHERE rating IN (1,3,5,7,9)").length > 0, "half stars present");
  assert.ok(q(v1, "SELECT 1 FROM log WHERE is_rewatch=1").length > 0 && q(v1, "SELECT 1 FROM log WHERE contains_spoilers=1").length > 0);
  assert.ok(q(v1, "SELECT 1 FROM log WHERE scope='private'").length > 0 && q(v1, "SELECT 1 FROM log WHERE scope='circles'").length > 0);
});

test("migration succeeds, report.ok, v2 written", () => {
  assert.equal(report.ok, true, JSON.stringify(report.reconcileFailures) + JSON.stringify(report.consistency.filter((c) => !c.ok)));
  assert.equal(report.committed, true);
  assert.ok(fs.existsSync(v2Path));
});

test("counts reconcile for every table: v1 - dropped + added = v2 (recounted here, not trusted from the report)", () => {
  for (const [name, t] of Object.entries(report.tables)) {
    if (name.startsWith("(v2)")) continue;
    const v1n = name === "rating_current" ? 0 : count(v1, name);
    assert.equal(t.v1, v1n, `${name}: report v1 count`);
    const dropped = Object.values(t.dropped).reduce((a, b) => a + b, 0);
    const added = Object.values(t.added).reduce((a, b) => a + b, 0);
    assert.equal(t.v2Table ? count(v2, t.v2Table) : 0, v1n - dropped + added, `${name} -> ${t.v2Table}`);
  }
  // Every v1 table is in the report: nothing is silently skipped.
  const v1Tables = q(v1, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE '__drizzle%'").map((r) => r.name);
  for (const t of v1Tables) assert.ok(report.tables[t], `v1 table ${t} missing from report`);
});

test("straight copies lose nothing: users, circles, members, logs, media, lists, serate, notifications", () => {
  for (const [a, b] of [["user", "user"], ["circle", "circle"], ["circle_member", "circle_member"], ["log", "log"], ["media_entity", "media_entity"], ["list", "list"], ["list_item", "list_item"], ["serata", "serata"], ["notification", "notification"], ["import_batch", "import_batch"], ["now_watching", "watch_progress"], ["push_subscription", "push_subscription"], ["report", "report"], ["event", "event"]]) {
    assert.equal(count(v2, b), count(v1, a), `${a} -> ${b}`);
  }
  assert.deepEqual(q(v2, "SELECT id, email, name FROM user ORDER BY id"), q(v1, "SELECT id, email, name FROM user ORDER BY id"));
  assert.equal(q(v2, "SELECT count(*) n FROM log WHERE rating = 9 OR rating = 1")[0].n, q(v1, "SELECT count(*) n FROM log WHERE rating = 9 OR rating = 1")[0].n, "half-star ratings intact");
});

test("v1 is never modified (read-only): file hash identical after the run", () => {
  assert.equal(sha(v1Path), v1Hash);
});

test("v2 passes PRAGMA foreign_key_check and integrity_check", () => {
  assert.deepEqual(q(v2, "PRAGMA foreign_key_check"), []);
  assert.deepEqual(q(v2, "PRAGMA integrity_check"), [{ integrity_check: "ok" }]);
  for (const c of report.consistency) assert.equal(c.ok, true, c.name + " " + c.detail);
});

/* ---------- D1(a), named hand-built cases ---------- */

test("D1(a) case bob_only_in_A: commenter in one common Cerchia -> kept there only", () => {
  const C = fixture.cases.circles;
  assert.deepEqual(q(v2, "SELECT circle_id FROM comment WHERE id = ?", fixture.cases.commentBobOnlyA).map((r) => r.circle_id), [C.A]);
});

test("D1(a) case dan_in_both: commenter and author share two Cerchie -> one copy in each, original id kept once", () => {
  const C = fixture.cases.circles;
  const rows = q(v2, "SELECT id, circle_id FROM comment WHERE log_id = 'l-circ' AND user_id = 'u-dan' ORDER BY circle_id");
  assert.deepEqual(rows.map((r) => r.circle_id), [C.A, C.B].sort());
  assert.equal(new Set(rows.map((r) => r.id)).size, 2);
  assert.ok(rows.some((r) => r.id === fixture.cases.commentDanBoth));
});

test("D1(a) case cat_only_in_B: kept only in B", () => {
  assert.deepEqual(q(v2, "SELECT circle_id FROM comment WHERE id = 'k-cat'").map((r) => r.circle_id), [fixture.cases.circles.B]);
});

test("D1(a) case fay_and_eve_dropped: no common Cerchia / no Cerchia at all -> dropped, counted, listed", () => {
  for (const id of ["k-fay", "k-eve"]) assert.equal(q(v2, "SELECT 1 FROM comment WHERE id = ?", id).length, 0, id);
  const listed = report.droppedRows.comment.filter((r) => ["k-fay", "k-eve"].includes(r.id));
  assert.equal(listed.length, 2);
  assert.ok(listed.every((r) => /^D1\(a\)/.test(r.reason)));
  // their reactions likewise
  assert.equal(q(v2, "SELECT count(*) n FROM reaction WHERE log_id = 'l-circ' AND user_id IN ('u-fay','u-eve')")[0].n, 0);
});

test("D1(a) case private_log_without_share: comments (even the author's own) on an unshared log are dropped with their own reason", () => {
  for (const id of ["k-bob-priv", "k-ann-self"]) {
    assert.equal(q(v2, "SELECT 1 FROM comment WHERE id = ?", id).length, 0);
    assert.match(report.droppedRows.comment.find((r) => r.id === id).reason, /not shared in any Cerchia/);
  }
  assert.equal(q(v2, "SELECT count(*) n FROM reaction WHERE log_id = 'l-priv0'")[0].n, 0);
  assert.equal(q(v2, "SELECT count(*) n FROM log_share WHERE log_id = 'l-priv0'")[0].n, 0, "private stays private");
});

test("D1(a) case private_log_shared_only_in_A: kept in A for a member of A, dropped for someone who is only in B", () => {
  assert.deepEqual(q(v2, "SELECT circle_id FROM comment WHERE id = 'k-dan-priv'").map((r) => r.circle_id), [fixture.cases.circles.A]);
  assert.equal(q(v2, "SELECT 1 FROM comment WHERE id = 'k-cat-priv'").length, 0);
  assert.deepEqual(q(v2, "SELECT circle_id, user_id FROM reaction WHERE log_id = 'l-priv-a' ORDER BY user_id"), [{ circle_id: fixture.cases.circles.A, user_id: "u-dan" }]);
});

test("D1(a) case author_not_in_the_shared_Cerchia: commenter is a member of the Cerchia the log is shared in but the log author is not -> dropped", () => {
  assert.equal(q(v2, "SELECT 1 FROM comment WHERE id = 'k-fay-c'").length, 0);
  assert.equal(q(v2, "SELECT count(*) n FROM reaction WHERE log_id = 'l-priv-c'")[0].n, 0);
  assert.equal(q(v2, "SELECT circle_id FROM log_share WHERE log_id = 'l-priv-c'")[0].circle_id, fixture.cases.circles.C, "the share itself is kept as in v1");
  assert.ok(report.warnings.some((w) => /non e. piu. membro/.test(w)));
});

test("D1(a) case author_in_no_Cerchia: circles-scope log of someone in no Cerchia gets no share and its comment is dropped", () => {
  assert.equal(q(v2, "SELECT count(*) n FROM log_share WHERE log_id = 'l-eve'")[0].n, 0);
  assert.equal(q(v2, "SELECT 1 FROM comment WHERE id = 'k-ann-eve'").length, 0);
  assert.ok(report.rules.scope.circlesScopeLogsWithNoCircle >= 1);
});

test("D1(a) every dropped comment/reaction is accounted for in the report totals (nothing silent)", () => {
  const dr = report.tables.comment.dropped, dx = report.tables.reaction.dropped;
  const d1c = Object.entries(dr).filter(([k]) => k.startsWith("D1(a)")).reduce((a, [, n]) => a + n, 0);
  const d1r = Object.entries(dx).filter(([k]) => k.startsWith("D1(a)")).reduce((a, [, n]) => a + n, 0);
  assert.equal(report.rules.d1.commentsDropped, d1c);
  assert.equal(report.rules.d1.reactionsDropped, d1r);
  assert.equal(report.droppedRows.comment.length, Object.values(dr).reduce((a, b) => a + b, 0));
  // Independent oracle from v1 only: a comment survives iff some Cerchia has both people and a share of the log.
  const member = new Set(q(v1, "SELECT circle_id||'/'||user_id k FROM circle_member").map((r) => r.k));
  const circlesOfUser = (u) => q(v1, "SELECT circle_id c FROM circle_member WHERE user_id = ?", u).map((r) => r.c);
  let kept = 0, copies = 0;
  for (const c of q(v1, "SELECT c.id, c.user_id, l.id log_id, l.user_id author, l.scope FROM comment c JOIN log l ON l.id = c.log_id")) {
    const shared = new Set(q(v1, "SELECT circle_id FROM log_share WHERE log_id = ?", c.log_id).map((r) => r.circle_id));
    if (c.scope === "circles") for (const x of circlesOfUser(c.author)) shared.add(x);
    const ok = [...shared].filter((x) => member.has(`${x}/${c.user_id}`) && member.has(`${x}/${c.author}`));
    if (ok.length) { kept++; copies += ok.length - 1; }
  }
  assert.equal(report.rules.d1.commentsKept, kept);
  assert.equal(count(v2, "comment"), kept + copies);
});

test("report on a dropped comment is kept with its snapshot; report on a copied comment is re-pointed to its Cerchia's copy", () => {
  const r = q(v2, "SELECT target_id, excerpt FROM report WHERE id = 'rep-dropped'")[0];
  assert.equal(r.target_id, "k-fay");
  assert.ok(r.excerpt);
  assert.ok(report.warnings.some((w) => /segnalazioni puntano a un commento non migrato/.test(w)));
  const kept = q(v2, "SELECT target_id FROM report WHERE id = 'rep-kept'")[0];
  assert.ok(q(v2, "SELECT 1 FROM comment WHERE id = ? AND circle_id = ?", kept.target_id, fixture.cases.circles.B).length === 1);
});

/* ---------- scope -> log_share ---------- */

test("scope: a circles-scope log is shared with every Cerchia of its author; a private one keeps only its own shares", () => {
  const myCircles = (u) => q(v1, "SELECT circle_id c FROM circle_member WHERE user_id = ? ORDER BY 1", u).map((r) => r.c);
  const sharedIn = (id) => q(v2, "SELECT circle_id c FROM log_share WHERE log_id = ? ORDER BY 1", id).map((r) => r.c);
  assert.deepEqual(sharedIn("l-circ"), myCircles("u-ann"));
  assert.deepEqual(sharedIn("l-priv-a"), [fixture.cases.circles.A]);
  for (const l of q(v1, "SELECT id, user_id FROM log WHERE scope = 'circles'")) {
    const mine = myCircles(l.user_id);
    const have = sharedIn(l.id);
    for (const c of mine) assert.ok(have.includes(c), `${l.id} not shared in ${c}`);
  }
  for (const l of q(v1, "SELECT id FROM log WHERE scope = 'private'")) {
    assert.deepEqual(sharedIn(l.id), q(v1, "SELECT circle_id c FROM log_share WHERE log_id = ? ORDER BY 1", l.id).map((r) => r.c), l.id);
  }
});

/* ---------- rating_current ---------- */

test("rating_current equals an independent oracle computed in JS from v1 only", () => {
  const shares = new Map();
  const add = (log, c) => { if (!shares.has(log)) shares.set(log, new Set()); shares.get(log).add(c); };
  for (const s of q(v1, "SELECT log_id, circle_id FROM log_share")) add(s.log_id, s.circle_id);
  const logs = q(v1, "SELECT * FROM log");
  for (const l of logs) if (l.scope === "circles") for (const c of q(v1, "SELECT circle_id FROM circle_member WHERE user_id = ?", l.user_id)) add(l.id, c.circle_id);
  const best = new Map();
  for (const l of logs) {
    if (l.season !== null || l.episode !== null || l.rating === null || l.rating < 1 || l.rating > 10) continue;
    for (const c of shares.get(l.id) ?? []) {
      const k = `${c}|${l.user_id}|${l.media_id}`;
      const cur = best.get(k);
      const better = !cur || cmp(l, cur) > 0;
      if (better) best.set(k, l);
    }
  }
  const expected = [...best].map(([k, l]) => `${k}|${l.rating}|${l.created_at}`).sort();
  const actual = q(v2, "SELECT circle_id||'|'||user_id||'|'||media_id||'|'||rating||'|'||rated_at k FROM rating_current").map((r) => r.k).sort();
  assert.deepEqual(actual, expected);
  assert.ok(actual.length > 50);
});
function cmp(a, b) { return a.watched_on !== b.watched_on ? (a.watched_on > b.watched_on ? 1 : -1) : a.created_at !== b.created_at ? (a.created_at > b.created_at ? 1 : -1) : a.id > b.id ? 1 : -1; }

test("rating_current named cases: latest rated wins, unrated rewatch ignored, episode/season never overwrite, unshared never seen, same-day tie by created_at", () => {
  const { A, B } = fixture.cases.circles;
  const r = (c, u, m) => q(v2, "SELECT rating FROM rating_current WHERE circle_id = ? AND user_id = ? AND media_id = ?", c, u, m)[0]?.rating;
  const { M1, M2, SER } = fixture.cases;
  assert.equal(r(A, "u-ann", M1), 9); assert.equal(r(B, "u-ann", M1), 9);
  assert.equal(r(A, "u-ann", M2), 4, "A only saw the 4");
  assert.equal(r(B, "u-ann", M2), 10, "B only saw the 10; the newest 2 is shared nowhere");
  assert.equal(r(A, "u-bob", M2), 7, "same watched_on: later created_at wins");
  assert.equal(r(A, "u-ann", SER), 7, "episode (3) and season (2) ratings do not replace the whole-title 7");
  assert.equal(r(A, "u-dan", fixture.cases.AN), 1, "half star 0.5");
  assert.equal(q(v2, "SELECT count(*) n FROM rating_current WHERE rating NOT BETWEEN 1 AND 10")[0].n, 0);
});

/* ---------- owners, auth, imports, serate ---------- */

test("owners: exactly one per Cerchia; two v1 owners -> oldest stays owner, the other becomes admin; creator who left -> oldest admin", () => {
  const f = fixture.cases;
  const role = (c, u) => q(v2, "SELECT role FROM circle_member WHERE circle_id = ? AND user_id = ?", c, u)[0].role;
  assert.equal(role(f.twoOwnerCircle, f.oldestOwner), "owner");
  assert.equal(role(f.twoOwnerCircle, f.youngerOwner), "admin");
  assert.equal(role(...f.creatorBecomesOwner), "owner");
  assert.equal(role(...f.leftCreatorCircle), "owner");
  for (const c of q(v2, "SELECT id FROM circle")) assert.equal(q(v2, "SELECT count(*) n FROM circle_member WHERE circle_id = ? AND role = 'owner'", c.id)[0].n, 1, c.id);
  assert.equal(report.rules.owner.demoted, 1);
  assert.equal(report.rules.owner.circlesWithSeveralV1Owners, 1);
});

test("sessions and tokens are not migrated and the report says so; Google links survive, passwords do not", () => {
  assert.equal(count(v2, "session"), 0);
  assert.equal(count(v2, "login_token"), 0);
  assert.equal(report.tables.session.v1, 60);
  assert.match(Object.keys(report.tables.session.dropped)[0], /signs in again by magic link/);
  assert.equal(report.notMigrated.find((m) => m.what === "session").usersWithLiveSession, 40);
  assert.equal(count(v2, "account"), 20);
  assert.equal(q(v2, "SELECT count(*) n FROM account WHERE provider <> 'google'")[0].n, 0);
  assert.equal(report.tables.account.dropped["password credential: v2 has no passwords (user signs in by magic link or Google)"], 10);
});

test("import_batch: v1 batches become done batches with counters from their logs/lists/shares; untracked bulk logs are reported, not invented", () => {
  const b = (id) => q(v2, "SELECT * FROM import_batch WHERE id = ?", id)[0];
  assert.deepEqual([b("b-letterboxd").source, b("b-letterboxd").status, b("b-letterboxd").imported, b("b-letterboxd").cursor, b("b-letterboxd").lists, b("b-letterboxd").circle_id], ["letterboxd", "done", 30, 30, 1, fixture.cases.circles.A]);
  assert.equal(b("b-anilist").imported, 20); assert.equal(b("b-anilist").circle_id, null);
  assert.equal(b("b-mal-empty").imported, 0);
  assert.equal(b("b-imdb").imported, 6);
  assert.equal(q(v2, "SELECT count(*) n FROM log WHERE import_batch_id = 'b-letterboxd'")[0].n, 30);
  assert.equal(q(v2, "SELECT count(*) n FROM log_share WHERE import_batch_id = 'b-letterboxd'")[0].n, 30);
  assert.equal(q(v2, "SELECT count(*) n FROM list WHERE import_batch_id = 'b-letterboxd'")[0].n, 1);
  assert.equal(report.rules.import_batch.emptyBatches, 1);
  assert.ok(report.rules.import_batch.untrackedImportLookingLogs >= 12);
});

test("serate: finished ones keep a result and winner, unfinished ones become 'expired', votes are listed as not migrated", () => {
  const done = q(v2, "SELECT * FROM serata WHERE status = 'done'");
  assert.equal(done.length, 3);
  for (const s of done) { const r = JSON.parse(s.result); assert.ok(r.winner && r.people >= 1 && r.turns >= 1, s.id); }
  assert.equal(q(v2, "SELECT count(*) n FROM serata WHERE status = 'expired'")[0].n, 4);
  assert.equal(report.notMigrated.find((m) => m.what === "serata_vote").rows, 21);
});

test("out-of-range v1 ratings become NULL and are reported; nothing else about those logs changes", () => {
  assert.equal(q(v2, "SELECT rating FROM log WHERE id = 'l-badrating-0'")[0].rating, null);
  assert.equal(q(v2, "SELECT rating FROM log WHERE id = 'l-badrating-11'")[0].rating, null);
  assert.equal(report.modified["log.rating: fuori da 1..10 -> NULL"], 2);
});

/* ---------- CLI safety rails ---------- */

test("CLI refuses to overwrite an existing --to (file untouched) and exits 2", () => {
  const before = sha(v2Path);
  const r = cli("--from", v1Path, "--to", v2Path);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /Rifiuto di sovrascrivere/);
  assert.equal(sha(v2Path), before);
  assert.equal(sha(v1Path), v1Hash);
});

test("CLI full run: exit 0, writes the JSON report, prints the Italian summary; second run to the same --to is refused (idempotent refusal)", () => {
  const out = path.join(dir, "cli-v2.sqlite"), rep = path.join(dir, "cli-report.json");
  const r = cli("--from", v1Path, "--to", out, "--report", rep);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ESITO: OK/);
  const json = JSON.parse(fs.readFileSync(rep, "utf8"));
  assert.equal(json.ok, true);
  assert.equal(json.tables.log.v2, fixture.counts.log);
  const again = cli("--from", v1Path, "--to", out);
  assert.equal(again.status, 2);
});

test("deterministic: two runs give identical v2 contents (comments, shares, ratings, owners)", () => {
  const other = path.join(dir, "other-v2.sqlite");
  migrate({ from: v1Path, to: other });
  const o = new DatabaseSync(other, { readOnly: true });
  for (const sql of ["SELECT * FROM comment ORDER BY id", "SELECT * FROM log_share ORDER BY log_id, circle_id", "SELECT * FROM rating_current ORDER BY 1,2,3", "SELECT circle_id,user_id,role FROM circle_member ORDER BY 1,2", "SELECT * FROM reaction ORDER BY 1,2,3,4"]) {
    assert.deepEqual(q(o, sql), q(v2, sql), sql);
  }
  o.close();
});

test("--dry-run writes no file, still reconciles, exit 0", () => {
  const out = path.join(dir, "dry.sqlite");
  const r = cli("--from", v1Path, "--to", out, "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PROVA A SECCO/);
  assert.equal(fs.existsSync(out), false);
});

test("a count that does not reconcile (a share lost after copying) -> exit 1 and the bad v2 file is removed", () => {
  const out = path.join(dir, "sab1.sqlite");
  const r = spawnSync(process.execPath, [SCRIPT, "--from", v1Path, "--to", out], { encoding: "utf8", env: { ...process.env, PAUSA_MIGRATE_SABOTAGE: "delete-share" } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /NON QUADRA/);
  assert.match(r.stdout, /ESITO: FALLITO/);
  assert.equal(fs.existsSync(out), false);
});

test("a comment left in a Cerchia where the commenter is not a member -> consistency check fails, exit 1", () => {
  const out = path.join(dir, "sab2.sqlite");
  const r = spawnSync(process.execPath, [SCRIPT, "--from", v1Path, "--to", out], { encoding: "utf8", env: { ...process.env, PAUSA_MIGRATE_SABOTAGE: "wrong-member" } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /\[KO\] no comment in a Cerchia whose commenter is not a member/);
});

test("case-insensitive duplicate emails stop the migration before anything is written (exit 2)", () => {
  const f = path.join(dir, "dup-v1.sqlite");
  buildFixture(f, { seed: 7 });
  const d = new DatabaseSync(f);
  d.exec("UPDATE user SET email = upper(email) WHERE id = 'u-bob'; INSERT INTO user(id,name,email) VALUES ('u-bob2','Bob due','BOB@example.test'), ('u-bob3','x','bob@example.test');");
  d.close();
  const out = path.join(dir, "dup-v2.sqlite");
  const r = cli("--from", f, "--to", out);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /email uguali ignorando le maiuscole/);
  assert.equal(fs.existsSync(out), false);
});

test("an empty v1 (migrations only) migrates to an empty v2 with every count 0", () => {
  const f = path.join(dir, "empty-v1.sqlite");
  const d = new DatabaseSync(f);
  for (const m of fs.readdirSync(path.join(HERE, "v1-schema")).filter((n) => n.endsWith(".sql")).sort()) d.exec(fs.readFileSync(path.join(HERE, "v1-schema", m), "utf8"));
  d.close();
  const out = path.join(dir, "empty-v2.sqlite");
  const rep = migrate({ from: f, to: out });
  assert.equal(rep.ok, true);
  assert.ok(Object.values(rep.tables).every((t) => t.v2 === 0));
});

test("a file that is not a v1 database is rejected (exit 2)", () => {
  const f = path.join(dir, "not-v1.sqlite");
  const d = new DatabaseSync(f); d.exec("CREATE TABLE x(a)"); d.close();
  const r = cli("--from", f, "--to", path.join(dir, "nope.sqlite"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /non sembra uno schema v1/);
});
