#!/usr/bin/env node
// Pausa data migration: v1 (Next.js + Better Auth, D1/SQLite) -> v2 (migrations/0001_init.sql).
//
//   node tools/migrate-v1-to-v2/migrate.mjs --from <v1.sqlite> --to <v2.sqlite> [--report report.json] [--dry-run]
//
// v1 is opened READ ONLY and never modified. v2 is created from migrations/0001_init.sql and filled inside ONE transaction.
// Every v1 table is accounted for: for each one the report says `v1 rows - dropped + added = v2 rows`, with a reason for every
// dropped or derived row. The process exits non-zero when a count does not reconcile or a consistency check fails.
//
// Decisions implemented (docs/rebuild/PLAN.md section 6b):
//   D1(a)  a comment/reaction is kept in a Cerchia only if BOTH its author and the log author are members of it and the log is
//          shared there. v1 showed one thread in every Cerchia of the log author; v2 has one thread per Cerchia, so a kept
//          comment is copied once per eligible Cerchia and a comment with no eligible Cerchia is dropped and listed.
//   scope  v1 log.scope = 'circles' (visible in every Cerchia of the author) becomes explicit log_share rows for the Cerchie the
//          author belongs to today; 'private' keeps only its existing shares.
//   ratings rating_current is rebuilt with the exact rule of crates/api/src/diary.rs `rebuild_ratings`.
//   owners  one owner per Cerchia (database-enforced in v2).
//   imports v1 import_batch rows become resumable v2 batches (status 'done', counters from the logs/lists that carry the batch id).
//   auth    sessions, magic-link tokens and rate-limit counters are not migrated: everyone signs in again by magic link.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INIT_SQL = path.resolve(HERE, "..", "..", "migrations", "0001_init.sql");
const SAMPLE_LIMIT = 5000; // how many dropped row ids are listed in the JSON report per table

export class FatalError extends Error {}

/* v1 tables this script knows. Anything else in the file (d1_migrations, _cf_KV, ...) is listed in the report. */
const V1_TABLES = [
  "user", "session", "account", "verification", "rate_limit", "circle", "circle_member", "invite", "invite_use",
  "media_entity", "media_season", "media_title", "media_detail", "favorite", "user_provider", "media_provider",
  "media_availability_check", "import_batch", "log", "log_share", "log_watched_with", "reaction", "comment", "now_watching",
  "list", "list_item", "serata", "serata_candidate", "serata_participant", "serata_vote", "notification", "push_subscription",
  "event", "report", "notification_off",
];
const IGNORED_V1 = /^(sqlite_|_cf_|d1_|__drizzle|_litestream)/;

/** v2 tables with no v1 table of the same name, and where their rows come from. */
const V2_DERIVED = {
  watch_progress: "from v1 now_watching",
  rating_current: "rebuilt from whole-title logs and log_share",
  login_token: "runtime only (magic links, native codes): empty after migration",
  user_block: "new in v2: empty after migration",
};

export function parseArgs(argv) {
  const o = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") o.from = argv[++i];
    else if (a === "--to") o.to = argv[++i];
    else if (a === "--report") o.report = argv[++i];
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new FatalError(`Argomento sconosciuto: ${a}`);
  }
  return o;
}

/**
 * Runs the migration. Returns the report object (`report.ok` false when something does not reconcile).
 * Throws FatalError for conditions that make a faithful migration impossible (nothing is written in that case).
 */
export function migrate({ from, to, dryRun = false, sabotage = null }) {
  if (!from) throw new FatalError("--from <v1.sqlite> richiesto");
  if (!dryRun && !to) throw new FatalError("--to <v2.sqlite> richiesto (oppure --dry-run)");
  if (!fs.existsSync(from)) throw new FatalError(`v1 non trovato: ${from}`);
  if (to && !dryRun) {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      if (fs.existsSync(to + suffix)) throw new FatalError(`Rifiuto di sovrascrivere ${to + suffix}: --to deve essere un file nuovo`);
    }
    if (path.resolve(to) === path.resolve(from)) throw new FatalError("--to coincide con --from");
  }

  const v1 = new DatabaseSync(from, { readOnly: true });
  const target = dryRun ? ":memory:" : to;
  let v2;
  let created = false;
  try {
    v2 = new DatabaseSync(target);
    created = !dryRun;
    v2.exec(fs.readFileSync(INIT_SQL, "utf8"));
    const report = run(v1, v2, { from, to: dryRun ? null : to, dryRun, sabotage });
    v2.close();
    v2 = null;
    if (!report.ok && created) {
      // Never leave a half-trusted database around: the user would have to remember it failed.
      for (const s of ["", "-wal", "-shm", "-journal"]) fs.rmSync(to + s, { force: true });
      report.outputRemoved = true;
    }
    return report;
  } catch (e) {
    try { v2?.close(); } catch { /* ignore */ }
    if (created) for (const s of ["", "-wal", "-shm", "-journal"]) fs.rmSync(to + s, { force: true });
    throw e;
  } finally {
    v1.close();
  }
}

/* ───────────────────────────── the migration proper ───────────────────────────── */

function run(v1, v2, opts) {
  const all = (sql, ...p) => v1.prepare(sql).all(...p);
  const present = new Set(all("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name));
  const missing = V1_TABLES.filter((t) => !present.has(t));
  if (missing.length) throw new FatalError(`Il database non sembra uno schema v1 completo (migrazioni drizzle 0000..0014): mancano ${missing.join(", ")}`);
  const unknownTables = [...present].filter((t) => !V1_TABLES.includes(t) && !IGNORED_V1.test(t));

  const read = (t) => all(`SELECT * FROM "${t}"`);
  const src = Object.fromEntries(V1_TABLES.map((t) => [t, read(t)]));

  const tables = {}; // name -> { v1, v2Table, dropped: {reason: n}, added: {reason: n}, v2 }
  const droppedRows = {}; // name -> [{id, reason}]
  const modified = {}; // "table.field: what" -> n
  const warnings = [];
  const rules = {};
  const bump = (obj, k, n = 1) => { obj[k] = (obj[k] ?? 0) + n; };
  const tab = (name, v2Table = name) => (tables[name] ??= { v1: src[name]?.length ?? 0, v2Table, dropped: {}, added: {}, v2: 0 });
  const drop = (name, reason, id) => {
    bump(tab(name).dropped, reason);
    const list = (droppedRows[name] ??= []);
    if (list.length < SAMPLE_LIMIT) list.push({ id, reason });
  };
  const mod = (key, n = 1) => bump(modified, key, n);

  /** Splits rows into kept and dropped; `check` returns a reason string to drop the row. */
  const keep = (name, rows, check, idOf = (r) => JSON.stringify(r)) => {
    const out = [];
    for (const r of rows) {
      const why = check(r);
      if (why) drop(name, why, idOf(r));
      else out.push(r);
    }
    return out;
  };
  const stmtCache = new Map();
  const insert = (table, row, label = table) => {
    const cols = Object.keys(row);
    const key = table + ":" + cols.join(",");
    let st = stmtCache.get(key);
    if (!st) {
      st = v2.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
      stmtCache.set(key, st);
    }
    try {
      st.run(...cols.map((c) => row[c] ?? null));
    } catch (e) {
      throw new FatalError(`${label}: riga non rappresentabile in v2 (${e.message}): ${JSON.stringify(row).slice(0, 300)}`);
    }
  };
  const bool = (x) => (x ? 1 : 0);
  const oneOf = (key, v, allowed, fallback) => {
    if (allowed.includes(v)) return v;
    mod(`${key}: valore non ammesso in v2 -> ${fallback === null ? "NULL" : `'${fallback}'`}`);
    return fallback;
  };

  // Preflight 1: v1 integrity, reported but not blocking (D1 can hold orphans; they are dropped with a reason below).
  const v1FkViolations = all("PRAGMA foreign_key_check").length;
  if (v1FkViolations) warnings.push(`v1 ha ${v1FkViolations} violazioni di chiave esterna: le righe orfane vengono scartate con motivo`);

  // Preflight 2: v2 emails are case-insensitive unique; v1's were case-sensitive. Merging two people is not our call.
  const byLower = new Map();
  for (const u of src.user) {
    const k = String(u.email).toLowerCase();
    byLower.set(k, [...(byLower.get(k) ?? []), u.id]);
  }
  const clashes = [...byLower].filter(([, ids]) => ids.length > 1);
  if (clashes.length) {
    throw new FatalError(
      `${clashes.length} email uguali ignorando le maiuscole (v2 e' case-insensitive). Da risolvere a mano in v1 (copia) prima: ` +
        clashes.slice(0, 10).map(([e, ids]) => `${e} -> ${ids.join("/")}`).join("; "),
    );
  }

  v2.exec("BEGIN");

  /* ── users ── */
  const userIds = new Set();
  tab("user");
  for (const u of src.user) {
    userIds.add(u.id);
    insert("user", {
      id: u.id, name: u.name, email: u.email, email_verified: bool(u.email_verified), image: u.image,
      is_anonymous: bool(u.is_anonymous), locale: oneOf("user.locale", u.locale ?? null, ["it", "en", "es", null], null),
      country: u.country, email_digest: bool(u.email_digest), digest_sent_at: u.digest_sent_at, bio: u.bio,
      favorite_genres: validJsonArray(u.favorite_genres) ? u.favorite_genres : (mod("user.favorite_genres: JSON non valido -> '[]'"), "[]"),
      disabled_at: null, created_at: u.created_at, updated_at: u.updated_at,
    });
  }
  const anonymousUsers = src.user.filter((u) => u.is_anonymous).length;

  /* ── auth leftovers: nothing but Google links survives ── */
  tab("session"); tab("verification", null); tab("rate_limit");
  for (const s of src.session) drop("session", "session tokens are not migrated: everyone signs in again by magic link", s.id);
  for (const s of src.verification) drop("verification", "single-use magic-link/verification tokens: expired or useless in v2", s.id);
  for (const s of src.rate_limit) drop("rate_limit", "ephemeral counters (1 hour windows): v2 starts clean", s.id);
  const now = Date.now();
  const usersWithLiveSession = new Set(src.session.filter((s) => s.expires_at > now).map((s) => s.user_id)).size;

  tab("account");
  const seenAccounts = new Set();
  let credentialAccounts = 0;
  let accountsWithTokens = 0;
  for (const a of src.account) {
    if (a.access_token || a.refresh_token || a.id_token) accountsWithTokens++;
    if (!userIds.has(a.user_id)) { drop("account", "orphan: user missing", a.id); continue; }
    let provider = null;
    if (a.provider_id === "google") provider = "google";
    else if (a.provider_id === "email") provider = "email";
    else if (a.provider_id === "credential") { credentialAccounts++; drop("account", "password credential: v2 has no passwords (user signs in by magic link or Google)", a.id); continue; }
    else { drop("account", `unsupported provider '${a.provider_id}'`, a.id); continue; }
    const key = provider + "\u0000" + a.account_id;
    if (seenAccounts.has(key)) { drop("account", "duplicate (provider, provider_account_id)", a.id); continue; }
    seenAccounts.add(key);
    insert("account", { id: a.id, user_id: a.user_id, provider, provider_account_id: a.account_id, created_at: a.created_at });
  }

  /* ── Cerchie, members, owners ── */
  const circleIds = new Set();
  tab("circle");
  for (const c of src.circle) {
    circleIds.add(c.id);
    let createdBy = c.created_by;
    if (createdBy && !userIds.has(createdBy)) { mod("circle.created_by: utente mancante -> NULL"); createdBy = null; }
    insert("circle", {
      id: c.id, name: c.name, description: c.description, cover: c.cover, live_watching: bool(c.live_watching),
      created_by: createdBy, created_at: c.created_at,
    });
  }
  const memberRows = keep("circle_member", src.circle_member, (m) =>
    !circleIds.has(m.circle_id) ? "orphan: circle missing" : !userIds.has(m.user_id) ? "orphan: user missing" : null,
    (m) => `${m.circle_id}/${m.user_id}`);
  const membersOf = new Map(); // circle -> Set(user)
  const circlesOf = new Map(); // user -> Set(circle)
  const roleOf = new Map(); // `${circle}/${user}` -> v2 role
  const owners = { demoted: 0, fromCreator: 0, fromOldestAdmin: 0, fromOldestMember: 0, circlesWithoutMembers: 0, circlesWithSeveralV1Owners: 0 };
  {
    const byCircle = new Map();
    for (const m of memberRows) byCircle.set(m.circle_id, [...(byCircle.get(m.circle_id) ?? []), m]);
    const oldest = (arr) => [...arr].sort((a, b) => a.joined_at - b.joined_at || (a.user_id < b.user_id ? -1 : 1))[0];
    for (const c of src.circle) {
      const ms = byCircle.get(c.id) ?? [];
      if (ms.length === 0) { owners.circlesWithoutMembers++; continue; }
      for (const m of ms) {
        const r = m.role === "owner" || m.role === "admin" || m.role === "member" ? m.role : (mod(`circle_member.role: valore '${m.role}' sconosciuto -> 'member'`), "member");
        roleOf.set(`${c.id}/${m.user_id}`, r);
      }
      const v1Owners = ms.filter((m) => roleOf.get(`${c.id}/${m.user_id}`) === "owner");
      let ownerId;
      if (v1Owners.length) {
        ownerId = oldest(v1Owners).user_id;
        if (v1Owners.length > 1) {
          owners.circlesWithSeveralV1Owners++;
          for (const m of v1Owners) if (m.user_id !== ownerId) { roleOf.set(`${c.id}/${m.user_id}`, "admin"); owners.demoted++; }
        }
      } else if (c.created_by && ms.some((m) => m.user_id === c.created_by)) {
        ownerId = c.created_by; owners.fromCreator++;
      } else if (ms.some((m) => roleOf.get(`${c.id}/${m.user_id}`) === "admin")) {
        ownerId = oldest(ms.filter((m) => roleOf.get(`${c.id}/${m.user_id}`) === "admin")).user_id; owners.fromOldestAdmin++;
      } else {
        ownerId = oldest(ms).user_id; owners.fromOldestMember++;
      }
      roleOf.set(`${c.id}/${ownerId}`, "owner");
    }
    rules.owner = owners;
    if (owners.circlesWithoutMembers) warnings.push(`${owners.circlesWithoutMembers} Cerchie senza membri: migrate ma senza owner (v2 le richiede vive solo con membri)`);
  }
  tab("circle_member");
  for (const m of memberRows) {
    insert("circle_member", {
      circle_id: m.circle_id, user_id: m.user_id, role: roleOf.get(`${m.circle_id}/${m.user_id}`), muted: bool(m.muted),
      hide_watching: bool(m.hide_watching), joined_at: m.joined_at,
    });
    if (!membersOf.has(m.circle_id)) membersOf.set(m.circle_id, new Set());
    membersOf.get(m.circle_id).add(m.user_id);
    if (!circlesOf.has(m.user_id)) circlesOf.set(m.user_id, new Set());
    circlesOf.get(m.user_id).add(m.circle_id);
  }

  /* ── invites ── */
  tab("invite");
  const inviteIds = new Set();
  for (const i of keep("invite", src.invite, (i) => (!circleIds.has(i.circle_id) ? "orphan: circle missing" : null), (i) => i.id)) {
    inviteIds.add(i.id);
    insert("invite", {
      id: i.id, circle_id: i.circle_id, code: i.code, created_by: userIds.has(i.created_by) ? i.created_by : null, expires_at: i.expires_at,
      max_uses: i.max_uses, uses: i.uses, revoked_at: i.revoked_at, created_at: i.created_at,
    });
  }
  tab("invite_use");
  for (const u of keep("invite_use", src.invite_use, (u) => (!inviteIds.has(u.invite_id) ? "orphan: invite missing" : !userIds.has(u.user_id) ? "orphan: user missing" : null), (u) => `${u.invite_id}/${u.user_id}`)) {
    insert("invite_use", { invite_id: u.invite_id, user_id: u.user_id, used_at: u.used_at });
  }

  /* ── media catalogue ── */
  tab("media_entity");
  const mediaIds = new Set();
  for (const m of src.media_entity) {
    mediaIds.add(m.id);
    insert("media_entity", {
      id: m.id, kind: m.kind, tmdb_id: m.tmdb_id, anilist_id: m.anilist_id, mal_id: m.mal_id, letterboxd_uri: m.letterboxd_uri,
      imdb_id: m.imdb_id, original_title: m.original_title, year: m.year, runtime_min: m.runtime_min, episodes_total: m.episodes_total,
      details_checked_at: m.details_checked_at, poster_path: m.poster_path, created_at: m.created_at,
    }, "media_entity " + m.id);
  }
  const hasMedia = (m) => (!mediaIds.has(m.media_id) ? "orphan: media missing" : null);
  tab("media_season");
  for (const s of keep("media_season", src.media_season, hasMedia, (s) => `${s.media_id}/${s.season}`)) insert("media_season", { media_id: s.media_id, season: s.season, episodes: s.episodes });
  tab("media_title");
  for (const s of keep("media_title", src.media_title, hasMedia, (s) => `${s.media_id}/${s.locale}`)) insert("media_title", { media_id: s.media_id, locale: s.locale, title: s.title });
  tab("media_detail");
  for (const s of keep("media_detail", src.media_detail, hasMedia, (s) => `${s.media_id}/${s.locale}`)) {
    insert("media_detail", {
      media_id: s.media_id, locale: s.locale, overview: s.overview, genres: validJson(s.genres) ? s.genres : "[]", cast: validJson(s.cast) ? s.cast : "[]",
      source: oneOf("media_detail.source", s.source, ["tmdb", "anilist", "user", "none"], "none"), fetched_at: s.fetched_at,
    });
  }
  tab("media_provider");
  for (const s of keep("media_provider", src.media_provider, hasMedia, (s) => `${s.media_id}/${s.country}/${s.provider_id}`)) {
    insert("media_provider", { media_id: s.media_id, country: s.country, provider_id: s.provider_id, name: s.name, logo_path: s.logo_path });
  }
  tab("media_availability_check");
  for (const s of keep("media_availability_check", src.media_availability_check, hasMedia, (s) => `${s.media_id}/${s.country}`)) {
    insert("media_availability_check", { media_id: s.media_id, country: s.country, fetched_at: s.fetched_at });
  }
  tab("favorite");
  for (const s of keep("favorite", src.favorite, (s) => (!userIds.has(s.user_id) ? "orphan: user missing" : hasMedia(s)), (s) => `${s.user_id}/${s.media_id}`)) {
    insert("favorite", { user_id: s.user_id, media_id: s.media_id, position: s.position, created_at: s.created_at });
  }
  tab("user_provider");
  for (const s of keep("user_provider", src.user_provider, (s) => (!userIds.has(s.user_id) ? "orphan: user missing" : null), (s) => `${s.user_id}/${s.provider_id}`)) {
    insert("user_provider", { user_id: s.user_id, provider_id: s.provider_id, name: s.name, logo_path: s.logo_path });
  }

  /* ── logs: filter first (import_batch counters need the survivors) ── */
  const logRows = keep("log", src.log, (l) => (!userIds.has(l.user_id) ? "orphan: user missing" : !mediaIds.has(l.media_id) ? "orphan: media missing" : null), (l) => l.id);
  const logIds = new Set(logRows.map((l) => l.id));
  const logAuthor = new Map(logRows.map((l) => [l.id, l.user_id]));

  /* ── import batches ── */
  tab("import_batch");
  const batchRows = keep("import_batch", src.import_batch, (b) => (!userIds.has(b.user_id) ? "orphan: user missing" : null), (b) => b.id);
  const batchIds = new Set(batchRows.map((b) => b.id));
  const logsPerBatch = new Map();
  for (const l of logRows) if (l.import_batch_id && batchIds.has(l.import_batch_id)) bump_(logsPerBatch, l.import_batch_id);
  const listsPerBatch = new Map();
  for (const l of src.list) if (l.import_batch_id && batchIds.has(l.import_batch_id)) bump_(listsPerBatch, l.import_batch_id);
  const SOURCES = ["letterboxd", "anilist", "mal", "imdb", "trakt", "cinemaniac"];
  const batchOut = [];
  let emptyBatches = 0;
  for (const b of batchRows) {
    const n = logsPerBatch.get(b.id) ?? 0;
    const lists = listsPerBatch.get(b.id) ?? 0;
    if (n === 0 && lists === 0) emptyBatches++;
    if (!SOURCES.includes(b.source)) { drop("import_batch", `unsupported source '${b.source}'`, b.id); batchIds.delete(b.id); continue; }
    batchOut.push(b);
    insert("import_batch", {
      id: b.id, user_id: b.user_id, source: b.source, circle_id: b.circle_id && circleIds.has(b.circle_id) ? b.circle_id : null,
      status: "done", cursor: n, total: n, failed_rows: 0, imported: n, skipped: 0, new_titles: 0, lists, created_at: b.created_at, finished_at: b.created_at,
    });
  }
  rules.import_batch = {
    migrated: batchOut.length, emptyBatches,
    note: "v1 recorded no state/totals: status 'done', imported = logs carrying the batch id, skipped/new_titles/failed_rows unknown (0)",
  };
  // v1 logs that look imported (created_at = watched_on 12:00 UTC, private, no batch) cannot be grouped: the source is unknown.
  rules.import_batch.untrackedImportLookingLogs = logRows.filter((l) => !l.import_batch_id && l.scope === "private" && /^\d{4}-\d\d-\d\d$/.test(l.watched_on) && l.created_at === Date.parse(l.watched_on + "T12:00:00Z")).length;

  /* ── logs ── */
  tab("log");
  let ratingFixed = 0;
  for (const l of logRows) {
    let rating = l.rating;
    if (rating !== null && rating !== undefined && !(Number.isInteger(rating) && rating >= 1 && rating <= 10)) { rating = null; ratingFixed++; }
    insert("log", {
      id: l.id, user_id: l.user_id, media_id: l.media_id, watched_on: l.watched_on, rating, review: l.review,
      contains_spoilers: bool(l.contains_spoilers), platform: l.platform, season: l.season, episode: l.episode, is_rewatch: bool(l.is_rewatch),
      import_batch_id: l.import_batch_id && batchIds.has(l.import_batch_id) ? l.import_batch_id : null, created_at: l.created_at, updated_at: l.created_at,
    });
  }
  if (ratingFixed) mod("log.rating: fuori da 1..10 -> NULL", ratingFixed);

  /* ── visibility: log.scope -> log_share ── */
  tab("log_share");
  const shares = new Map(); // log -> Map(circle -> {created_at, batch})
  const addShare = (logId, circleId, createdAt, batch) => {
    if (!shares.has(logId)) shares.set(logId, new Map());
    if (!shares.get(logId).has(circleId)) shares.get(logId).set(circleId, { created_at: createdAt, batch });
  };
  for (const s of keep("log_share", src.log_share, (s) => (!logIds.has(s.log_id) ? "orphan: log missing" : !circleIds.has(s.circle_id) ? "orphan: circle missing" : null), (s) => `${s.log_id}/${s.circle_id}`)) {
    addShare(s.log_id, s.circle_id, s.created_at, s.import_batch_id && batchIds.has(s.import_batch_id) ? s.import_batch_id : null);
  }
  const scopeStats = { circlesScopeLogs: 0, circlesScopeLogsWithNoCircle: 0, privateLogs: 0, unknownScopeTreatedAsPrivate: 0, sharesDerivedFromScope: 0, sharesToCerchiaAuthorLeft: 0 };
  for (const l of logRows) {
    let scope = l.scope;
    if (scope !== "circles" && scope !== "private") { scopeStats.unknownScopeTreatedAsPrivate++; scope = "private"; }
    if (scope === "private") { scopeStats.privateLogs++; continue; }
    scopeStats.circlesScopeLogs++;
    const mine = circlesOf.get(l.user_id) ?? new Set();
    if (mine.size === 0) scopeStats.circlesScopeLogsWithNoCircle++;
    for (const c of [...mine].sort()) {
      if (!shares.get(l.id)?.has(c)) { addShare(l.id, c, l.created_at, null); scopeStats.sharesDerivedFromScope++; bump(tab("log_share").added, "derived from log.scope='circles': one share per Cerchia the author belongs to"); }
    }
  }
  for (const [logId, m] of shares) for (const c of m.keys()) if (!circlesOf.get(logAuthor.get(logId))?.has(c)) scopeStats.sharesToCerchiaAuthorLeft++;
  rules.scope = scopeStats;
  if (scopeStats.sharesToCerchiaAuthorLeft) warnings.push(`${scopeStats.sharesToCerchiaAuthorLeft} log_share verso Cerchie di cui l'autore non e' piu' membro: tenuti com'erano in v1 (restano visibili li')`);
  for (const logId of [...shares.keys()].sort()) {
    for (const [c, s] of [...shares.get(logId)].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      insert("log_share", { log_id: logId, circle_id: c, import_batch_id: s.batch, created_at: s.created_at });
    }
  }

  tab("log_watched_with");
  for (const s of keep("log_watched_with", src.log_watched_with, (s) => (!logIds.has(s.log_id) ? "orphan: log missing" : !userIds.has(s.user_id) ? "orphan: user missing" : null), (s) => `${s.log_id}/${s.user_id}`)) {
    insert("log_watched_with", { log_id: s.log_id, user_id: s.user_id });
  }

  /* ── D1(a): comments and reactions, one thread per Cerchia ── */
  const eligibleCircles = (logId, userId) => {
    const authorId = logAuthor.get(logId);
    const out = [];
    for (const c of [...(shares.get(logId)?.keys() ?? [])].sort()) {
      const m = membersOf.get(c);
      if (m && m.has(userId) && m.has(authorId)) out.push(c);
    }
    return out;
  };
  const whyNone = (logId, userId) =>
    !(shares.get(logId)?.size)
      ? "D1(a): the log is not shared in any Cerchia (private to its author)"
      : "D1(a): commenter and log author share no Cerchia that the log is shared with";
  const d1 = { commentsKept: 0, commentCopies: 0, commentsDropped: 0, reactionsKept: 0, reactionCopies: 0, reactionsDropped: 0 };

  tab("comment");
  const commentRows = keep("comment", src.comment, (c) => (!logIds.has(c.log_id) ? "orphan: log missing" : !userIds.has(c.user_id) ? "orphan: user missing" : null), (c) => c.id);
  const commentCopies = new Map(); // v1 comment id -> Map(circle -> v2 id)
  for (const c of commentRows) {
    const cs = eligibleCircles(c.log_id, c.user_id);
    if (cs.length === 0) { d1.commentsDropped++; drop("comment", whyNone(c.log_id, c.user_id), c.id); continue; }
    d1.commentsKept++;
    const ids = new Map();
    cs.forEach((circleId, i) => {
      const id = i === 0 ? c.id : `${c.id}~${circleId}`;
      ids.set(circleId, id);
      insert("comment", { id, log_id: c.log_id, circle_id: circleId, user_id: c.user_id, parent_id: null, body: c.body, is_spoiler: bool(c.is_spoiler), created_at: c.created_at });
      if (i > 0) { d1.commentCopies++; bump(tab("comment").added, "D1(a): copy in each further Cerchia where the comment is still allowed"); }
    });
    commentCopies.set(c.id, ids);
  }
  tab("reaction");
  const reactionRows = keep("reaction", src.reaction, (r) => (!logIds.has(r.log_id) ? "orphan: log missing" : !userIds.has(r.user_id) ? "orphan: user missing" : null), (r) => `${r.log_id}/${r.user_id}/${r.emoji}`);
  for (const r of reactionRows) {
    const cs = eligibleCircles(r.log_id, r.user_id);
    if (cs.length === 0) { d1.reactionsDropped++; drop("reaction", whyNone(r.log_id, r.user_id), `${r.log_id}/${r.user_id}/${r.emoji}`); continue; }
    d1.reactionsKept++;
    cs.forEach((circleId, i) => {
      insert("reaction", { log_id: r.log_id, circle_id: circleId, user_id: r.user_id, emoji: r.emoji, created_at: r.created_at });
      if (i > 0) { d1.reactionCopies++; bump(tab("reaction").added, "D1(a): copy in each further Cerchia where the reaction is still allowed"); }
    });
  }
  rules.d1 = d1;

  /* ── now_watching -> watch_progress ── */
  tab("now_watching", "watch_progress");
  let legacyProgressLabels = 0;
  for (const n of keep("now_watching", src.now_watching, (n) => (!userIds.has(n.user_id) ? "orphan: user missing" : !mediaIds.has(n.media_id) ? "orphan: media missing" : null), (n) => n.user_id)) {
    if (n.progress && n.season == null && n.episode == null) legacyProgressLabels++;
    insert("watch_progress", { user_id: n.user_id, media_id: n.media_id, season: n.season, episode: n.episode, status: "watching", updated_at: n.updated_at });
  }
  if (legacyProgressLabels) mod("now_watching.progress: etichetta libera (es. 'S3-E4') senza stagione/episodio: non rappresentabile, ignorata", legacyProgressLabels);

  /* ── lists ── */
  tab("list");
  const listIds = new Set();
  for (const l of keep("list", src.list, (l) => (!userIds.has(l.owner_id) ? "orphan: owner missing" : l.circle_id && !circleIds.has(l.circle_id) ? "orphan: circle missing" : null), (l) => l.id)) {
    listIds.add(l.id);
    insert("list", {
      id: l.id, circle_id: l.circle_id, owner_id: l.owner_id, kind: oneOf("list.kind", l.kind, ["watchlist", "list", "ranking"], "list"), name: l.name,
      description: l.description, import_batch_id: l.import_batch_id && batchIds.has(l.import_batch_id) ? l.import_batch_id : null, created_at: l.created_at,
    });
  }
  tab("list_item");
  for (const i of keep("list_item", src.list_item, (i) => (!listIds.has(i.list_id) ? "orphan: list missing" : !mediaIds.has(i.media_id) ? "orphan: media missing" : null), (i) => `${i.list_id}/${i.media_id}`)) {
    insert("list_item", { list_id: i.list_id, media_id: i.media_id, position: i.position, added_by: userIds.has(i.added_by) ? i.added_by : null, note: i.note, priority: 0, added_at: i.added_at });
  }

  /* ── serate ── */
  tab("serata");
  const serataIds = new Set();
  const participantCount = new Map();
  for (const p of src.serata_participant) bump_(participantCount, p.serata_id);
  const serataStats = { done: 0, unfinishedBecameExpired: 0, resultsReconstructed: 0 };
  for (const s of keep("serata", src.serata, (s) => (!userIds.has(s.host_id) ? "orphan: host missing" : null), (s) => s.id)) {
    serataIds.add(s.id);
    const done = s.status === "done";
    const status = done ? "done" : "expired"; // v1 live rooms (lobby/voting) cannot continue in v2: the room is a Durable Object
    if (done) serataStats.done++; else serataStats.unfinishedBecameExpired++;
    let result = null;
    if (done) {
      serataStats.resultsReconstructed++;
      result = JSON.stringify({ winner: s.winner_media_id ?? null, mode: s.mode, turns: countTurns(s.state), people: participantCount.get(s.id) ?? 0, drew: false, scores: null, migratedFromV1: true });
    }
    insert("serata", {
      id: s.id, code: s.code, circle_id: s.circle_id && circleIds.has(s.circle_id) ? s.circle_id : null, host_id: s.host_id, mode: s.mode, status,
      winner_media_id: s.winner_media_id && mediaIds.has(s.winner_media_id) ? s.winner_media_id : null, result, watched_log_id: null, repeated_from: null,
      created_at: s.created_at, finished_at: s.finished_at,
    });
  }
  rules.serata = serataStats;
  tab("serata_candidate");
  for (const c of keep("serata_candidate", src.serata_candidate, (c) => (!serataIds.has(c.serata_id) ? "orphan: serata missing" : !mediaIds.has(c.media_id) ? "orphan: media missing" : null), (c) => `${c.serata_id}/${c.media_id}`)) {
    insert("serata_candidate", { serata_id: c.serata_id, media_id: c.media_id, seed: c.seed });
  }
  tab("serata_participant");
  for (const p of keep("serata_participant", src.serata_participant, (p) => (!serataIds.has(p.serata_id) ? "orphan: serata missing" : !userIds.has(p.user_id) ? "orphan: user missing" : null), (p) => `${p.serata_id}/${p.user_id}`)) {
    insert("serata_participant", { serata_id: p.serata_id, user_id: p.user_id, name: p.name, is_guest: bool(p.is_guest), joined_at: p.joined_at });
  }
  tab("serata_vote", null);
  for (const v of src.serata_vote) drop("serata_vote", "v2 keeps only the final result of a Serata, never who voted what", `${v.serata_id}/${v.user_id}/${v.round}/${v.match}/${v.kind}/${v.media_id}`);

  /* ── notifications, push, events, reports ── */
  tab("notification");
  const NTYPES = ["log", "comment", "reaction", "now_watching", "serata_invite", "circle_join", "mention"];
  let notifNoCircle = 0;
  for (const n of keep("notification", src.notification, (n) =>
    !NTYPES.includes(n.type) ? `unsupported type '${n.type}'`
    : !userIds.has(n.user_id) ? "orphan: user missing"
    : n.actor_id && !userIds.has(n.actor_id) ? "orphan: actor missing"
    : n.circle_id && !circleIds.has(n.circle_id) ? "orphan: circle missing"
    : n.log_id && !logIds.has(n.log_id) ? "orphan: log missing"
    : n.media_id && !mediaIds.has(n.media_id) ? "orphan: media missing" : null, (n) => n.id)) {
    if (!n.circle_id && ["log", "comment", "reaction"].includes(n.type)) notifNoCircle++;
    insert("notification", { id: n.id, user_id: n.user_id, type: n.type, actor_id: n.actor_id, circle_id: n.circle_id, log_id: n.log_id, media_id: n.media_id, serata_code: null, read_at: n.read_at, created_at: n.created_at });
  }
  if (notifNoCircle) mod("notification.circle_id: notifiche log/comment/reaction senza Cerchia (v1 non la registrava): restano senza, il silenzio per Cerchia non le ferma", notifNoCircle);
  tab("notification_off");
  for (const n of keep("notification_off", src.notification_off, (n) => (!userIds.has(n.user_id) ? "orphan: user missing" : null), (n) => `${n.user_id}/${n.type}`)) insert("notification_off", { user_id: n.user_id, type: n.type });
  tab("push_subscription");
  for (const p of keep("push_subscription", src.push_subscription, (p) => (!userIds.has(p.user_id) ? "orphan: user missing" : null), (p) => p.id)) {
    insert("push_subscription", { id: p.id, user_id: p.user_id, kind: "webpush", endpoint: p.endpoint, p256dh: p.p256dh, auth: p.auth, locale: p.locale, created_at: p.created_at });
  }
  tab("event");
  for (const e of keep("event", src.event, (e) => (!["card_shared", "invite_shared"].includes(e.name) ? `unsupported event name '${e.name}'` : e.serata_id && !serataIds.has(e.serata_id) ? "orphan: serata missing" : null), (e) => e.id)) {
    insert("event", { id: e.id, name: e.name, user_id: e.user_id && userIds.has(e.user_id) ? e.user_id : null, serata_id: e.serata_id, created_at: e.created_at });
  }
  tab("report");
  const reportStats = { commentTargetRemapped: 0, commentTargetNotMigrated: 0, logTargetNotMigrated: 0 };
  for (const r of keep("report", src.report, (r) =>
    !["comment", "log"].includes(r.kind) ? `unsupported kind '${r.kind}'`
    : r.circle_id && !circleIds.has(r.circle_id) ? "orphan: circle missing (v1 cascade)" : null, (r) => r.id)) {
    let target = r.target_id;
    if (r.kind === "comment") {
      const copies = commentCopies.get(r.target_id);
      if (!copies) reportStats.commentTargetNotMigrated++;
      else if (r.circle_id && copies.has(r.circle_id) && copies.get(r.circle_id) !== r.target_id) { target = copies.get(r.circle_id); reportStats.commentTargetRemapped++; }
    } else if (!logIds.has(r.target_id)) reportStats.logTargetNotMigrated++;
    insert("report", {
      id: r.id, reporter_id: r.reporter_id && userIds.has(r.reporter_id) ? r.reporter_id : null, kind: r.kind, target_id: target, circle_id: r.circle_id,
      reason: oneOf("report.reason", r.reason, ["spam", "abuse", "privacy", "other"], "other"), note: r.note, excerpt: r.excerpt, created_at: r.created_at,
      resolved_at: r.resolved_at, resolution: oneOf("report.resolution", r.resolution ?? null, ["dismissed", "removed", null], null),
    });
  }
  rules.report = reportStats;
  if (reportStats.commentTargetNotMigrated) warnings.push(`${reportStats.commentTargetNotMigrated} segnalazioni puntano a un commento non migrato (D1a): restano con l'estratto salvato`);

  /* ── rating_current: exactly the rule of crates/api/src/diary.rs rebuild_ratings, for every (circle, user) ── */
  const ratingRes = v2.prepare(
    `INSERT INTO rating_current(circle_id, user_id, media_id, rating, rated_at)
     SELECT s.circle_id, l.user_id, l.media_id, l.rating, l.created_at FROM log l JOIN log_share s ON s.log_id = l.id
     WHERE l.season IS NULL AND l.episode IS NULL AND l.rating IS NOT NULL
       AND l.id = (SELECT l2.id FROM log l2 JOIN log_share s2 ON s2.log_id = l2.id AND s2.circle_id = s.circle_id
                   WHERE l2.user_id = l.user_id AND l2.media_id = l.media_id AND l2.season IS NULL AND l2.episode IS NULL
                     AND l2.rating IS NOT NULL ORDER BY l2.watched_on DESC, l2.created_at DESC, l2.id DESC LIMIT 1)`,
  ).run();
  tab("rating_current");
  tables.rating_current.v1 = 0;
  tables.rating_current.added[V2_DERIVED.rating_current] = Number(ratingRes.changes);

  // Sanity hook used only by the test-suite to prove that the checks really detect damage.
  if (opts.sabotage === "delete-share") v2.exec("DELETE FROM log_share WHERE (log_id, circle_id) = (SELECT log_id, circle_id FROM log_share ORDER BY log_id, circle_id LIMIT 1)");
  if (opts.sabotage === "wrong-member") {
    v2.exec("INSERT INTO user(id,name,email) VALUES ('sab','sab','sab@x')");
    v2.exec("UPDATE comment SET user_id = 'sab' WHERE rowid = (SELECT min(rowid) FROM comment)");
  }

  /* ── reconciliation ── */
  const unknown = {};
  for (const t of unknownTables) unknown[t] = Number(v1.prepare(`SELECT count(*) n FROM "${t}"`).get().n);
  const counts = {};
  const v2Names = v2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  for (const n of v2Names) counts[n] = Number(v2.prepare(`SELECT count(*) n FROM "${n}"`).get().n);
  const reconcile = [];
  for (const name of Object.keys(tables)) {
    const t = tables[name];
    t.v2 = t.v2Table ? counts[t.v2Table] ?? 0 : 0;
    const droppedN = sum(t.dropped), addedN = sum(t.added);
    t.expected = t.v1 - droppedN + addedN;
    t.ok = t.expected === t.v2;
    if (!t.ok) reconcile.push(`${name} -> ${t.v2Table}: attesi ${t.expected} (v1 ${t.v1} - scartate ${droppedN} + aggiunte ${addedN}), trovati ${t.v2}`);
  }
  // v2 tables nobody wrote to must be empty, otherwise something else touched them.
  for (const n of v2Names) {
    if (Object.values(tables).some((t) => t.v2Table === n)) continue;
    if (counts[n] !== 0) reconcile.push(`${n}: tabella v2 senza sorgente v1 ma con ${counts[n]} righe`);
    tables[`(v2) ${n}`] = { v1: 0, v2Table: n, dropped: {}, added: {}, v2: counts[n], expected: 0, ok: counts[n] === 0, note: V2_DERIVED[n] ?? "" };
  }

  const consistency = consistencyChecks(v1, v2, { logRows, shares, circlesOf });
  const failedChecks = consistency.filter((c) => !c.ok);

  const notMigrated = [
    { what: "session", rows: src.session.length, usersWithLiveSession, why: "Session tokens are not migrated: everyone signs in again by magic link (or Google)." },
    { what: "verification", rows: src.verification.length, why: "Single-use tokens." },
    { what: "rate_limit", rows: src.rate_limit.length, why: "Ephemeral counters." },
    { what: "account (credential/password)", rows: credentialAccounts, why: "v2 has no passwords: the password hash is not copied." },
    { what: "account tokens (access/refresh/id token)", rows: accountsWithTokens, why: "v2 keeps no provider tokens (it never calls Google for the user)." },
    { what: "serata_vote", rows: src.serata_vote.length, why: "v2 keeps only the final result of a Serata." },
    { what: "serata.state / version", rows: src.serata.length, why: "The v1 engine state JSON is replaced by `result`; unfinished rooms become 'expired'." },
    { what: "now_watching.progress free label", rows: legacyProgressLabels, why: "Superseded by season/episode." },
    { what: "import_batch per-row outcome (skipped, new titles, failed rows)", rows: batchOut.length, why: "v1 never recorded them; v2 columns are 0." },
    { what: "log.scope", rows: logRows.length, why: "Replaced by log_share rows (see rules.scope)." },
    { what: "anonymous guest accounts kept as users", rows: anonymousUsers, why: "Kept (Serata participants point at them) but they can never sign in again: their email is a placeholder." },
  ];
  if (Object.keys(unknown).length) warnings.push(`Tabelle v1 non riconosciute (non migrate): ${Object.entries(unknown).map(([t, n]) => `${t} (${n})`).join(", ")}`);

  const ok = reconcile.length === 0 && failedChecks.length === 0;
  if (ok && !opts.dryRun) v2.exec("COMMIT");
  else v2.exec("ROLLBACK");

  return {
    ok, dryRun: opts.dryRun, from: opts.from, to: opts.to, finishedAt: new Date().toISOString(),
    tables, rules, modified, notMigrated, warnings, unknownV1Tables: unknown, v1ForeignKeyViolations: v1FkViolations,
    reconcileFailures: reconcile, consistency, droppedRows,
    committed: ok && !opts.dryRun,
  };
}

/* ───────────────────────────── consistency checks on the v2 DB ───────────────────────────── */

function consistencyChecks(v1, v2, { logRows, shares, circlesOf }) {
  const out = [];
  const check = (name, ok, detail = "") => out.push({ name, ok: !!ok, detail });
  const q = (sql) => v2.prepare(sql).all();
  const n = (sql) => Number(Object.values(q(sql)[0])[0]);

  const integrity = q("PRAGMA integrity_check").map((r) => r.integrity_check);
  check("PRAGMA integrity_check", integrity.length === 1 && integrity[0] === "ok", integrity.join("; "));
  const fk = q("PRAGMA foreign_key_check");
  check("PRAGMA foreign_key_check (no orphans)", fk.length === 0, fk.length ? JSON.stringify(fk.slice(0, 5)) : "");

  const noOwner = q("SELECT c.id FROM circle c WHERE EXISTS (SELECT 1 FROM circle_member m WHERE m.circle_id = c.id) AND (SELECT count(*) FROM circle_member m WHERE m.circle_id = c.id AND m.role = 'owner') <> 1").map((r) => r.id);
  check("every Cerchia with members has exactly one owner", noOwner.length === 0, noOwner.slice(0, 5).join(","));

  const cBad = n("SELECT count(*) FROM comment c LEFT JOIN circle_member m ON m.circle_id = c.circle_id AND m.user_id = c.user_id WHERE m.user_id IS NULL");
  check("no comment in a Cerchia whose commenter is not a member", cBad === 0, `${cBad} violations`);
  const cAuthor = n("SELECT count(*) FROM comment c JOIN log l ON l.id = c.log_id LEFT JOIN circle_member m ON m.circle_id = c.circle_id AND m.user_id = l.user_id WHERE m.user_id IS NULL");
  check("no comment in a Cerchia whose log author is not a member (D1a)", cAuthor === 0, `${cAuthor} violations`);
  const cShare = n("SELECT count(*) FROM comment c LEFT JOIN log_share s ON s.log_id = c.log_id AND s.circle_id = c.circle_id WHERE s.log_id IS NULL");
  check("every comment sits in a Cerchia the log is shared with", cShare === 0, `${cShare} violations`);
  const rBad = n("SELECT count(*) FROM reaction r LEFT JOIN circle_member m ON m.circle_id = r.circle_id AND m.user_id = r.user_id WHERE m.user_id IS NULL");
  const rAuthor = n("SELECT count(*) FROM reaction r JOIN log l ON l.id = r.log_id LEFT JOIN circle_member m ON m.circle_id = r.circle_id AND m.user_id = l.user_id WHERE m.user_id IS NULL");
  const rShare = n("SELECT count(*) FROM reaction r LEFT JOIN log_share s ON s.log_id = r.log_id AND s.circle_id = r.circle_id WHERE s.log_id IS NULL");
  check("reactions: reactor and log author are members, log shared there", rBad + rAuthor + rShare === 0, `${rBad}+${rAuthor}+${rShare} violations`);

  // Shares consistent with v1 scope: private = exactly its v1 shares; circles = at least one share per Cerchia of the author.
  const v2Shares = new Map();
  for (const r of q("SELECT log_id, circle_id FROM log_share")) {
    if (!v2Shares.has(r.log_id)) v2Shares.set(r.log_id, new Set());
    v2Shares.get(r.log_id).add(r.circle_id);
  }
  let badPrivate = 0, badCircles = 0;
  for (const l of logRows) {
    const have = v2Shares.get(l.id) ?? new Set();
    const wasShared = new Set(shares.get(l.id)?.keys() ?? []);
    if (l.scope === "circles") {
      for (const c of circlesOf.get(l.user_id) ?? []) if (!have.has(c)) badCircles++;
    }
    for (const c of wasShared) if (!have.has(c)) badPrivate++;
    if (l.scope !== "circles") for (const c of have) if (!wasShared.has(c)) badPrivate++;
  }
  check("every log: shares consistent with v1 scope", badPrivate === 0 && badCircles === 0, `${badPrivate} private mismatches, ${badCircles} circles-scope mismatches`);

  // rating_current checked with a DIFFERENT formulation (window function) than the one that built it.
  const expected = q(`SELECT circle_id, user_id, media_id, rating, rated_at FROM (
      SELECT s.circle_id, l.user_id, l.media_id, l.rating, l.created_at AS rated_at,
             row_number() OVER (PARTITION BY s.circle_id, l.user_id, l.media_id ORDER BY l.watched_on DESC, l.created_at DESC, l.id DESC) AS rn
      FROM log l JOIN log_share s ON s.log_id = l.id WHERE l.season IS NULL AND l.episode IS NULL AND l.rating IS NOT NULL) WHERE rn = 1
      ORDER BY circle_id, user_id, media_id`);
  const actual = q("SELECT circle_id, user_id, media_id, rating, rated_at FROM rating_current ORDER BY circle_id, user_id, media_id");
  check("rating_current equals an independent recomputation (window function)", JSON.stringify(expected) === JSON.stringify(actual), `${actual.length} vs ${expected.length} rows`);
  const rcShared = n("SELECT count(*) FROM rating_current r WHERE NOT EXISTS (SELECT 1 FROM log l JOIN log_share s ON s.log_id = l.id WHERE s.circle_id = r.circle_id AND l.user_id = r.user_id AND l.media_id = r.media_id AND l.rating = r.rating)");
  check("every rating_current row comes from a log shared in that Cerchia", rcShared === 0, `${rcShared} violations`);

  const ownerless = n("SELECT count(*) FROM circle c WHERE NOT EXISTS (SELECT 1 FROM circle_member m WHERE m.circle_id = c.id)");
  check("Cerchie without members (informational)", true, `${ownerless}`);
  return out;
}

/* ───────────────────────────── helpers ───────────────────────────── */

function sum(o) { return Object.values(o).reduce((a, b) => a + b, 0); }
function bump_(map, k) { map.set(k, (map.get(k) ?? 0) + 1); }
function validJson(s) { try { JSON.parse(s); return true; } catch { return false; } }
function validJsonArray(s) { try { return Array.isArray(JSON.parse(s)); } catch { return false; } }
function countTurns(state) {
  try {
    const st = typeof state === "string" ? JSON.parse(state) : state;
    if (st?.kind === "bracket") return st.rounds.flat().filter((m) => m && m.w).length;
  } catch { /* unknown shape */ }
  return 0;
}

/* ───────────────────────────── CLI ───────────────────────────── */

export function summary(r) {
  const L = [];
  L.push(r.dryRun ? "Migrazione v1 -> v2 (PROVA A SECCO: nulla scritto)" : "Migrazione v1 -> v2");
  L.push("");
  L.push("Tabella".padEnd(28) + "v1".padStart(7) + "scartate".padStart(10) + "aggiunte".padStart(10) + "v2".padStart(7) + "  esito");
  for (const [name, t] of Object.entries(r.tables)) {
    L.push(name.padEnd(28) + String(t.v1).padStart(7) + String(sum(t.dropped)).padStart(10) + String(sum(t.added)).padStart(10) + String(t.v2).padStart(7) + "  " + (t.ok ? "ok" : `NON QUADRA (attese ${t.expected})`) + (t.v2Table === null ? "  -> (nessuna tabella v2)" : t.v2Table !== name && !name.startsWith("(v2)") ? `  -> ${t.v2Table}` : ""));
  }
  L.push("");
  L.push("Righe scartate (motivo):");
  let any = false;
  for (const [name, t] of Object.entries(r.tables)) for (const [why, n] of Object.entries(t.dropped)) { any = true; L.push(`  ${name}: ${n} - ${why}`); }
  if (!any) L.push("  nessuna");
  L.push("Righe aggiunte (motivo):");
  any = false;
  for (const [name, t] of Object.entries(r.tables)) for (const [why, n] of Object.entries(t.added)) { any = true; L.push(`  ${name}: ${n} - ${why}`); }
  if (!any) L.push("  nessuna");
  L.push("Campi modificati:");
  const mods = Object.entries(r.modified);
  if (!mods.length) L.push("  nessuno");
  for (const [k, n] of mods) L.push(`  ${n} x ${k}`);
  L.push("Non migrato:");
  for (const m of r.notMigrated) L.push(`  ${m.what}: ${m.rows} - ${m.why}`);
  L.push(`Sessioni: ${r.notMigrated[0].usersWithLiveSession} utenti avevano una sessione attiva e dovranno rientrare con il link magico.`);
  if (r.warnings.length) { L.push("Avvisi:"); for (const w of r.warnings) L.push("  " + w); }
  L.push("");
  L.push("Controlli di coerenza sul DB v2:");
  for (const c of r.consistency) L.push(`  [${c.ok ? "ok" : "KO"}] ${c.name}${c.detail ? "  (" + c.detail + ")" : ""}`);
  L.push("");
  L.push(r.ok ? (r.dryRun ? "ESITO: OK (prova a secco, nulla scritto)" : `ESITO: OK, v2 scritto in ${r.to}`) : "ESITO: FALLITO" + (r.outputRemoved ? " (il file v2 e' stato rimosso)" : ""));
  for (const f of r.reconcileFailures) L.push("  " + f);
  return L.join("\n");
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (args.help) {
    console.log("uso: node tools/migrate-v1-to-v2/migrate.mjs --from <v1.sqlite> --to <v2.sqlite> [--report report.json] [--dry-run]");
    return;
  }
  try {
    const report = migrate({ from: args.from, to: args.to, dryRun: args.dryRun, sabotage: process.env.PAUSA_MIGRATE_SABOTAGE || null });
    if (args.report) fs.writeFileSync(args.report, JSON.stringify(report, null, 2), "utf8");
    console.log(summary(report));
    process.exit(report.ok ? 0 : 1);
  } catch (e) {
    console.error("ERRORE: " + e.message);
    process.exit(e instanceof FatalError ? 2 : 3);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
