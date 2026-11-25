#!/usr/bin/env node
// Builds a SYNTHETIC Pausa v1 database (never real data) by applying the real drizzle/*.sql migrations in order and filling it.
//
//   node tools/migrate-v1-to-v2/make-v1-fixture.mjs <out.sqlite> [seed]
//
// Deterministic for a given seed. `buildFixture` also returns `cases`: the ids of the hand-built D1(a) / rating / owner cases the
// tests assert on. Everything is invented: names like "Ann", emails like ann@example.test.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE = path.resolve(HERE, "..", "..", "drizzle");
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFixture(file, { seed = 20261125 } = {}) {
  if (fs.existsSync(file)) throw new Error(`${file} esiste gia'`);
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of fs.readdirSync(DRIZZLE).filter((n) => /^\d+_.*\.sql$/.test(n)).sort()) db.exec(fs.readFileSync(path.join(DRIZZLE, f), "utf8"));

  const R = rng(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const chance = (p) => R() < p;
  const ins = (table, row) => {
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((c) => row[c] ?? null));
  };
  const day = (n) => new Date(T0 + n * DAY).toISOString().slice(0, 10);
  db.exec("BEGIN");

  /* users: 9 named + 41 generic = 50 */
  const named = ["ann", "bob", "cat", "dan", "eve", "fay", "own1", "own2", "imp"];
  const users = [];
  const mkUser = (id, name, extra = {}) => {
    users.push(id);
    ins("user", { id, name, email: `${id.replace(/^u-/, "")}@example.test`, email_verified: 1, locale: pick(["it", "en", "es", null]), country: pick(["IT", "ES", "GB", null]),
      email_digest: chance(0.2) ? 1 : 0, bio: chance(0.3) ? `Bio di ${name}` : null, favorite_genres: JSON.stringify(chance(0.5) ? ["Drammatico", "Sci-Fi"] : []),
      created_at: T0 - int(1, 400) * DAY, updated_at: T0, ...extra });
  };
  for (const n of named) mkUser(`u-${n}`, n[0].toUpperCase() + n.slice(1));
  mkUser("u-gone", "Gone"); // created a Cerchia and left it
  for (let i = 1; i <= 40; i++) mkUser(`u${String(i).padStart(2, "0")}`, `Utente ${i}`, i > 37 ? { is_anonymous: 1, name: "Anonymous" } : {});
  // 9 + 1 + 40 = 50
  const generic = users.filter((u) => /^u\d\d$/.test(u) && !["u38", "u39", "u40"].includes(u));

  /* Cerchie */
  const C = { A: "c-amici", B: "c-film", C: "c-anime", D: "c-lavoro", E: "c-famiglia", F: "c-due-owner" };
  const circleDefs = [[C.A, "Amici", "u-ann", 0], [C.B, "Film club", "u-cat", 1], [C.C, "Anime", "u-gone", 2], [C.D, "Lavoro", "u01", 3], [C.E, "Famiglia", "u02", 4], [C.F, "Due owner", "u-own1", 5]];
  for (const [id, name, by, i] of circleDefs) ins("circle", { id, name, created_by: by, description: i % 2 ? "descrizione" : null, cover: i % 3 ? "c1" : null, live_watching: i === 4 ? 0 : 1, created_at: T0 - (300 - i * 10) * DAY });
  const member = (c, u, role = "member", joined = T0 - 100 * DAY) => ins("circle_member", { circle_id: c, user_id: u, role, muted: chance(0.1) ? 1 : 0, hide_watching: chance(0.1) ? 1 : 0, joined_at: joined });
  const memberOf = new Map(users.map((u) => [u, new Set()]));
  const addMember = (c, u, role, joined) => { member(c, u, role, joined); memberOf.get(u).add(c); };
  addMember(C.A, "u-ann", "admin", T0 - 290 * DAY); addMember(C.A, "u-bob", "member"); addMember(C.A, "u-dan", "member"); addMember(C.A, "u-imp", "member");
  addMember(C.B, "u-cat", "admin", T0 - 280 * DAY); addMember(C.B, "u-ann", "member"); addMember(C.B, "u-dan", "member");
  addMember(C.C, "u-fay", "admin", T0 - 270 * DAY); // oldest admin: becomes owner (creator u-gone left)
  addMember(C.C, "u03", "admin", T0 - 100 * DAY);
  addMember(C.D, "u01", "admin"); addMember(C.E, "u02", "admin");
  addMember(C.F, "u-own1", "owner", T0 - 200 * DAY); addMember(C.F, "u-own2", "owner", T0 - 250 * DAY); // two owners: u-own2 is the oldest
  addMember(C.F, "u04", "member");
  const circleList = [C.A, C.B, C.C, C.D, C.E];
  for (const u of generic) {
    if (["u01", "u02", "u03", "u04"].includes(u)) { if (u === "u03") addMember(C.A, u, "member"); continue; }
    const k = int(0, 2);
    for (const c of [...circleList].sort(() => R() - 0.5).slice(0, k)) if (!memberOf.get(u).has(c)) addMember(c, u, "member", T0 - int(5, 200) * DAY);
  }
  for (const c of circleList) addMember_unless(c, "u-bob");
  function addMember_unless(c, u) { if (c === C.A && !memberOf.get(u).has(c)) addMember(c, u); }

  /* invites */
  const inviteIds = [];
  for (const [id, , by, i] of circleDefs) { const iid = `inv-${i}`; inviteIds.push(iid); ins("invite", { id: iid, circle_id: id, code: `CODE${i}`, created_by: by, uses: i, max_uses: i % 2 ? 10 : null, created_at: T0 - 200 * DAY }); }
  for (const [i, u] of ["u05", "u06", "u07", "u08", "u09", "u10"].entries()) ins("invite_use", { invite_id: inviteIds[i % 6], user_id: u, used_at: T0 - DAY * i });

  /* media: 25 movies, 15 tv, 20 anime */
  const media = { movie: [], tv: [], anime: [] };
  for (let i = 1; i <= 25; i++) { const id = `m-movie${i}`; media.movie.push(id); ins("media_entity", { id, kind: "movie", tmdb_id: 100 + i, imdb_id: `tt${1000 + i}`, original_title: `Film ${i}`, year: 1990 + i, runtime_min: 80 + i, letterboxd_uri: chance(0.4) ? `https://boxd.it/${i}` : null, poster_path: `/p${i}.jpg`, created_at: T0 - 500 * DAY }); }
  for (let i = 1; i <= 15; i++) { const id = `m-tv${i}`; media.tv.push(id); ins("media_entity", { id, kind: "tv", tmdb_id: 500 + i, original_title: `Serie ${i}`, year: 2000 + i, episodes_total: null, details_checked_at: T0, created_at: T0 - 400 * DAY });
    for (let s = 1; s <= 3; s++) ins("media_season", { media_id: id, season: s, episodes: int(6, 12) }); }
  for (let i = 1; i <= 20; i++) { const id = `m-anime${i}`; media.anime.push(id); ins("media_entity", { id, kind: "anime", anilist_id: 2000 + i, mal_id: i % 2 ? 3000 + i : null, original_title: `Anime ${i}`, year: 2005 + i, episodes_total: int(12, 26), poster_path: `https://s4.anilist.co/${i}.jpg`, created_at: T0 - 300 * DAY }); }
  const allMedia = [...media.movie, ...media.tv, ...media.anime];
  for (const id of allMedia) {
    ins("media_title", { media_id: id, locale: "it", title: `${id} (it)` }); if (chance(0.7)) ins("media_title", { media_id: id, locale: "en", title: `${id} (en)` });
    if (chance(0.4)) ins("media_detail", { media_id: id, locale: "it", overview: "trama", genres: JSON.stringify(["Azione"]), cast: JSON.stringify([{ name: "Tizio", role: null }]), source: pick(["tmdb", "anilist", "user", "none"]), fetched_at: T0 });
    if (chance(0.3)) { ins("media_provider", { media_id: id, country: "IT", provider_id: 8, name: "Netflix", logo_path: "/n.jpg" }); ins("media_availability_check", { media_id: id, country: "IT", fetched_at: T0 }); }
  }
  for (const u of users.slice(0, 15)) { ins("user_provider", { user_id: u, provider_id: 8, name: "Netflix" }); }
  for (const u of users.slice(0, 20)) for (const [pos, m] of [pick(media.movie), pick(media.tv)].entries()) { try { ins("favorite", { user_id: u, media_id: m, position: pos }); } catch { /* duplicate pick */ } }

  /* import batches (before logs) */
  ins("import_batch", { id: "b-letterboxd", user_id: "u-imp", source: "letterboxd", circle_id: C.A, created_at: T0 - 30 * DAY });
  ins("import_batch", { id: "b-anilist", user_id: "u-imp", source: "anilist", circle_id: null, created_at: T0 - 20 * DAY });
  ins("import_batch", { id: "b-mal-empty", user_id: "u-imp", source: "mal", circle_id: C.A, created_at: T0 - 10 * DAY });
  ins("import_batch", { id: "b-imdb", user_id: "u05", source: "imdb", circle_id: null, created_at: T0 - 5 * DAY });

  /* logs */
  let logN = 0;
  const logs = []; // {id,user,scope}
  const addLog = (o) => {
    const id = o.id ?? `l${String(++logN).padStart(4, "0")}`;
    const row = { id, user_id: o.user, media_id: o.media, watched_on: o.on ?? day(int(0, 320)), rating: o.rating ?? null, review: o.review ?? null,
      contains_spoilers: o.spoilers ? 1 : 0, platform: o.platform ?? null, season: o.season ?? null, episode: o.episode ?? null, is_rewatch: o.rewatch ? 1 : 0,
      scope: o.scope ?? "circles", import_batch_id: o.batch ?? null, created_at: o.created ?? (T0 + int(0, 320) * DAY + int(0, DAY - 1)) };
    ins("log", row);
    logs.push({ id, user: o.user, scope: row.scope });
    for (const c of o.shares ?? []) ins("log_share", { log_id: id, circle_id: c, created_at: row.created_at + 1, import_batch_id: o.shareBatch ?? null });
    return id;
  };
  const half = () => (chance(0.6) ? int(1, 10) : null);
  const CASE_MEDIA = ["m-movie20", "m-movie21", "m-tv14", "m-anime19"];
  // random diary: ~270 logs
  for (let i = 0; i < 270; i++) {
    const user = pick(users.filter((u) => u !== "u-imp"));
    const kind = pick(["movie", "movie", "tv", "anime"]);
    const m = pick(media[kind].filter((x) => !CASE_MEDIA.includes(x)));
    const mine = [...memberOf.get(user)];
    const scope = chance(0.55) ? "circles" : "private";
    const episode = kind !== "movie" && chance(0.4);
    addLog({ user, media: m, rating: half(), review: chance(0.3) ? "Recensione di prova" : null, spoilers: chance(0.08), platform: chance(0.4) ? pick(["Netflix", "Prime", "cinema"]) : null,
      season: episode ? int(1, 3) : kind === "tv" && chance(0.15) ? int(1, 3) : null, episode: episode ? int(1, 12) : null, rewatch: chance(0.1), scope,
      shares: scope === "private" && chance(0.4) ? mine.slice(0, int(1, 2)) : [] });
  }
  // imports (tracked): private logs, created_at = watched_on 12:00 UTC like the v1 import code
  const importLog = (user, media, n, batch, shares) => { const on = day(-int(30, 700)); addLog({ user, media, on, created: Date.parse(on + "T12:00:00Z"), scope: "private", batch, shares, shareBatch: shares?.length ? batch : null, rating: chance(0.4) ? int(1, 10) : null }); };
  for (let i = 0; i < 30; i++) importLog("u-imp", pick(media.movie), i, "b-letterboxd", [C.A]);
  for (let i = 0; i < 20; i++) importLog("u-imp", pick(media.anime), i, "b-anilist", []);
  for (let i = 0; i < 6; i++) importLog("u05", pick(media.movie), i, "b-imdb", []);
  for (let i = 0; i < 12; i++) { const on = day(-int(800, 900)); addLog({ user: "u-imp", media: pick(media.movie), on, created: Date.parse(on + "T12:00:00Z"), scope: "private" }); } // untracked import-looking
  // logs with a v1 rating outside 1..10 (v2 CHECK): 0 and 11
  addLog({ id: "l-badrating-0", user: "u06", media: "m-movie1", rating: 0, scope: "private" });
  addLog({ id: "l-badrating-11", user: "u06", media: "m-movie2", rating: 11, scope: "private" });

  /* hand-built cases ---------------------------------------------------- */
  const cases = {};
  const M1 = "m-movie20", M2 = "m-movie21", SER = "m-tv14", AN = "m-anime19";
  Object.assign(cases, { M1, M2, SER, AN, circles: C });

  // owners
  cases.twoOwnerCircle = C.F; cases.oldestOwner = "u-own2"; cases.youngerOwner = "u-own1";
  cases.creatorBecomesOwner = [C.A, "u-ann"]; cases.leftCreatorCircle = [C.C, "u-fay"]; // oldest admin takes over

  // D1(a) cases
  cases.LCIRC = addLog({ id: "l-circ", user: "u-ann", media: M1, on: "2026-02-01", created: Date.UTC(2026, 1, 1, 20), rating: 8, scope: "circles" });
  const cm = (id, log, user, body) => { ins("comment", { id, log_id: log, user_id: user, body, is_spoiler: 0, created_at: T0 + 400 * DAY }); return id; };
  const rx = (log, user, emoji) => ins("reaction", { log_id: log, user_id: user, emoji, created_at: T0 + 400 * DAY });
  cases.commentBobOnlyA = cm("k-bob", "l-circ", "u-bob", "bob e' solo in Amici");          // kept in A only
  cases.commentDanBoth = cm("k-dan", "l-circ", "u-dan", "dan e' in Amici e Film club");    // copied in A and B
  cases.commentCatOnlyB = cm("k-cat", "l-circ", "u-cat", "cat e' solo in Film club");      // kept in B only
  cases.commentFayDropped = cm("k-fay", "l-circ", "u-fay", "fay non ha Cerchie in comune"); // dropped: no common Cerchia
  cases.commentEveDropped = cm("k-eve", "l-circ", "u-eve", "eve non e' in nessuna Cerchia"); // dropped
  rx("l-circ", "u-bob", "heart"); rx("l-circ", "u-dan", "fire"); rx("l-circ", "u-fay", "wow"); rx("l-circ", "u-eve", "wow"); rx("l-circ", "u-cat", "heart");
  cases.LPRIV0 = addLog({ id: "l-priv0", user: "u-ann", media: M1, on: "2026-02-02", scope: "private" });
  cases.commentPrivNoShare = cm("k-bob-priv", "l-priv0", "u-bob", "su un log privato senza condivisioni"); rx("l-priv0", "u-bob", "heart");
  cases.commentSelfPrivate = cm("k-ann-self", "l-priv0", "u-ann", "nota dell'autrice sul proprio log privato");
  cases.LPRIVA = addLog({ id: "l-priv-a", user: "u-ann", media: M1, on: "2026-02-03", scope: "private", shares: [C.A] });
  cases.commentDanPrivShared = cm("k-dan-priv", "l-priv-a", "u-dan", "dan: log condiviso solo con Amici"); // kept in A only
  cases.commentCatPrivDropped = cm("k-cat-priv", "l-priv-a", "u-cat", "cat non e' in Amici"); // dropped (log shared only in A)
  rx("l-priv-a", "u-dan", "fire"); rx("l-priv-a", "u-cat", "fire");
  // author left the Cerchia the log is still shared with: fay is a member of C, ann is not -> D1(a) drops (needs BOTH to be members)
  cases.LPRIVC = addLog({ id: "l-priv-c", user: "u-ann", media: M1, on: "2026-02-03", scope: "private", shares: [C.C] });
  cases.commentFayAuthorLeft = cm("k-fay-c", "l-priv-c", "u-fay", "fay e' in Anime, ma l'autrice del log non piu'"); rx("l-priv-c", "u-fay", "wow");
  cases.LEVE = addLog({ id: "l-eve", user: "u-eve", media: M2, on: "2026-02-04", scope: "circles" }); // author in no Cerchia: zero shares
  cases.commentOnLogWithoutCircle = cm("k-ann-eve", "l-eve", "u-ann", "ann commenta il log di eve (che non ha Cerchie)");
  cases.reportOnDropped = "rep-dropped"; cases.reportOnKept = "rep-kept";

  // ratings
  cases.ratingAnn = {
    old: addLog({ id: "r-old", user: "u-ann", media: M1, on: "2026-01-01", created: Date.UTC(2026, 0, 1, 20), rating: 6, scope: "circles" }),
    neu: addLog({ id: "r-new", user: "u-ann", media: M1, on: "2026-05-01", created: Date.UTC(2026, 4, 1, 20), rating: 9, scope: "circles" }),
    unrated: addLog({ id: "r-unrated", user: "u-ann", media: M1, on: "2026-06-01", rewatch: true, scope: "circles" }),
  }; // current rating of ann for M1 in A and B is 9
  addLog({ id: "r-m2-old", user: "u-ann", media: M2, on: "2026-01-10", rating: 4, scope: "private", shares: [C.A] });
  addLog({ id: "r-m2-new", user: "u-ann", media: M2, on: "2026-03-10", rating: 10, scope: "private", shares: [C.B] });
  addLog({ id: "r-m2-hidden", user: "u-ann", media: M2, on: "2026-04-10", rating: 2, scope: "private" }); // newest, but shared nowhere
  addLog({ id: "r-tie-1", user: "u-bob", media: M2, on: "2026-03-03", created: Date.UTC(2026, 2, 3, 10), rating: 3, scope: "circles" });
  addLog({ id: "r-tie-2", user: "u-bob", media: M2, on: "2026-03-03", created: Date.UTC(2026, 2, 3, 22), rating: 7, scope: "circles" }); // same day, created later: wins
  addLog({ id: "r-ser-whole", user: "u-ann", media: SER, on: "2026-01-05", rating: 7, scope: "circles" });
  addLog({ id: "r-ser-ep", user: "u-ann", media: SER, on: "2026-02-05", rating: 3, season: 1, episode: 1, scope: "circles" }); // episode rating never overwrites the series
  addLog({ id: "r-ser-season", user: "u-ann", media: SER, on: "2026-02-06", rating: 2, season: 2, scope: "circles" }); // season log: not a whole-title rating either
  addLog({ id: "r-half-1", user: "u-dan", media: AN, on: "2026-02-07", rating: 1, scope: "circles" });
  addLog({ id: "r-half-5", user: "u-dan", media: M1, on: "2026-02-07", rating: 5, scope: "circles" });
  cases.rewatchLog = addLog({ id: "l-rewatch", user: "u-dan", media: M1, on: "2026-07-07", rewatch: true, spoilers: true, review: "Rivisto, con spoiler", scope: "circles" });

  /* random comments/reactions on random logs (some will be dropped by D1(a)) */
  const authorOf = new Map(logs.map((l) => [l.id, l.user]));
  const commentLogs = logs.filter((l) => /^l[0-9]{4}$/.test(l.id));
  let cN = 0;
  const seenReact = new Set();
  const mates = (u) => { const s = new Set(); for (const c of memberOf.get(u)) for (const [x, set] of memberOf) if (set.has(c)) s.add(x); return [...s]; };
  for (let i = 0; i < 140; i++) {
    const l = pick(commentLogs);
    const commenter = chance(0.6) && mates(l.user).length ? pick(mates(l.user)) : pick(users);
    cm(`k${++cN}`, l.id, commenter, `Commento ${cN}`);
    if (chance(0.3)) ins("comment", { id: `k${++cN}`, log_id: l.id, user_id: pick(users), body: `Risposta ${cN}`, is_spoiler: chance(0.2) ? 1 : 0, created_at: T0 + 401 * DAY });
  }
  for (let i = 0; i < 180; i++) {
    const l = pick(commentLogs); const u = chance(0.6) && mates(l.user).length ? pick(mates(l.user)) : pick(users); const e = pick(["heart", "fire", "laugh", "wow", "sad"]);
    const key = `${l.id}/${u}/${e}`; if (seenReact.has(key)) continue; seenReact.add(key);
    try { rx(l.id, u, e); } catch { /* already hand-built */ }
  }
  for (let i = 0; i < 25; i++) { const l = pick(commentLogs); try { ins("log_watched_with", { log_id: l.id, user_id: pick(mates(l.user)) }); } catch { /* duplicate */ } }

  /* now_watching */
  for (const [i, u] of users.slice(0, 15).entries()) ins("now_watching", { user_id: u, media_id: pick(media.tv), progress: i < 3 ? "S2E5" : null, season: i < 3 ? null : int(1, 3), episode: i < 3 ? null : int(1, 10), updated_at: T0 + i * DAY });

  /* lists */
  let listN = 0;
  const mkList = (owner, circle, kind, name, batch = null) => {
    const id = `ls${++listN}`; ins("list", { id, circle_id: circle, owner_id: owner, kind, name, description: chance(0.3) ? "desc" : null, import_batch_id: batch, created_at: T0 + listN * DAY });
    const used = new Set();
    for (let p = 0; p < int(3, 8); p++) { const m = pick(allMedia); if (used.has(m)) continue; used.add(m); ins("list_item", { list_id: id, media_id: m, position: p, added_by: owner, note: chance(0.3) ? "nota" : null, added_at: T0 + p * DAY }); }
    return id;
  };
  for (const u of users.slice(0, 10)) mkList(u, null, "watchlist", "Da vedere");
  for (const u of users.slice(0, 6)) mkList(u, null, pick(["list", "ranking"]), `Lista di ${u}`);
  for (const c of circleList) mkList(pick([...memberOf].filter(([, s]) => s.has(c)).map(([u]) => u)), c, "list", `Lista di gruppo ${c}`);
  mkList("u-imp", C.A, "list", "Lista importata", "b-letterboxd");

  /* serate: 3 done, 2 voting, 2 lobby (+ participants incl. a guest, candidates, votes) */
  const statuses = ["done", "done", "done", "voting", "voting", "lobby", "lobby"];
  for (const [i, status] of statuses.entries()) {
    const id = `sr${i}`; const circle = i % 3 === 2 ? null : pick(circleList); const host = pick(users.slice(0, 12));
    const cands = [...new Set(Array.from({ length: 4 }, () => pick(allMedia)))];
    const state = status === "done" ? JSON.stringify({ kind: "bracket", rounds: [[{ a: cands[0], b: cands[1], w: cands[0] }, { a: cands[2], b: cands[3] ?? cands[2], w: cands[2] }], [{ a: cands[0], b: cands[2], w: cands[0] }]], round: 1, match: 0, winner: cands[0] }) : JSON.stringify({ kind: "bracket", rounds: [], round: 0, match: 0, winner: null });
    ins("serata", { id, code: `SER${100 + i}`, circle_id: circle, host_id: host, mode: i % 2 ? "table" : "bracket", status, state, winner_media_id: status === "done" ? cands[0] : null, version: i, created_at: T0 + i * DAY, finished_at: status === "done" ? T0 + i * DAY + 3600000 : null });
    for (const [s, m] of cands.entries()) ins("serata_candidate", { serata_id: id, media_id: m, seed: s });
    const parts = [host, ...new Set([pick(users.slice(12, 30)), pick(users.slice(30, 36))])].filter((x, k, a) => a.indexOf(x) === k);
    for (const p of parts) ins("serata_participant", { serata_id: id, user_id: p, name: `P-${p}`, is_guest: 0, joined_at: T0 + i * DAY });
    ins("serata_participant", { serata_id: id, user_id: ["u38", "u39", "u40"][i % 3], name: "Ospite", is_guest: 1, joined_at: T0 + i * DAY });
    for (const p of parts) ins("serata_vote", { serata_id: id, user_id: p, round: 0, match: 0, kind: i % 2 ? "dot" : "pick", media_id: cands[0], weight: 1 });
  }
  ins("event", { id: "ev1", name: "card_shared", user_id: "u-ann", serata_id: "sr0", created_at: T0 });
  for (let i = 0; i < 9; i++) ins("event", { id: `ev-${i}`, name: pick(["card_shared", "invite_shared"]), user_id: pick(users), serata_id: null, created_at: T0 + i });

  /* notifications (some reaction/comment ones without a Cerchia, as v1 stored them) */
  const types = ["log", "comment", "reaction", "now_watching", "serata_invite", "circle_join"];
  for (let i = 0; i < 220; i++) {
    const type = pick(types); const l = pick(commentLogs);
    ins("notification", { id: `n${i}`, user_id: pick(users), type, actor_id: chance(0.9) ? pick(users) : null, circle_id: type === "reaction" || chance(0.2) ? null : pick(circleList), log_id: ["log", "comment", "reaction"].includes(type) ? l.id : null,
      media_id: type === "now_watching" ? pick(allMedia) : null, read_at: chance(0.5) ? T0 + i : null, created_at: T0 + i * 1000 });
  }
  for (const u of users.slice(0, 8)) ins("notification_off", { user_id: u, type: pick(["reaction", "now_watching"]) });
  for (const [i, u] of users.slice(0, 12).entries()) ins("push_subscription", { id: `ps${i}`, user_id: u, endpoint: `https://push.example.test/${i}`, p256dh: "k", auth: "a", locale: pick(["it", "en"]), created_at: T0 });

  /* reports: on a kept comment, on a dropped comment, on a log, one resolved */
  ins("report", { id: "rep-kept", reporter_id: "u-bob", kind: "comment", target_id: "k-dan", circle_id: C.B, reason: "spam", excerpt: "dan e' in Amici e Film club", created_at: T0 + 500 * DAY });
  ins("report", { id: "rep-dropped", reporter_id: "u-dan", kind: "comment", target_id: "k-fay", circle_id: C.A, reason: "abuse", excerpt: "fay non ha Cerchie in comune", created_at: T0 + 501 * DAY, resolved_at: T0 + 502 * DAY, resolution: "dismissed" });
  ins("report", { id: "rep-log", reporter_id: "u-cat", kind: "log", target_id: "l-circ", circle_id: C.B, reason: "other", note: "boh", created_at: T0 + 503 * DAY });
  ins("report", { id: "rep-orphan-reporter", reporter_id: null, kind: "log", target_id: "l-priv0", circle_id: null, reason: "privacy", created_at: T0 + 504 * DAY });

  /* auth leftovers */
  for (const [i, u] of users.entries()) {
    if (i < 20) ins("account", { id: `acc-g${i}`, account_id: `google-sub-${i}`, provider_id: "google", user_id: u, access_token: "tok", refresh_token: "rtok", id_token: "idt", scope: "email", created_at: T0 });
    else if (i < 30) ins("account", { id: `acc-c${i}`, account_id: u, provider_id: "credential", user_id: u, password: "scrypt$hash", created_at: T0 });
  }
  ins("account", { id: "acc-gh", account_id: "gh1", provider_id: "github", user_id: "u40", created_at: T0 });
  for (let i = 0; i < 60; i++) ins("session", { id: `se${i}`, expires_at: i < 40 ? Date.now() + 30 * DAY : T0 - DAY, token: `tok-${i}`, ip_address: "203.0.113.1", user_agent: "test", user_id: users[i % users.length], created_at: T0, updated_at: T0 });
  for (let i = 0; i < 5; i++) ins("verification", { id: `v${i}`, identifier: `x${i}@example.test`, value: "t", expires_at: T0, created_at: T0, updated_at: T0 });
  for (let i = 0; i < 4; i++) ins("rate_limit", { id: `rl${i}`, key: `ip:${i}`, count: i, last_request: T0 });

  db.exec("COMMIT");
  const counts = Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => [r.name, Number(db.prepare(`SELECT count(*) n FROM "${r.name}"`).get().n)]));
  const fk = db.prepare("PRAGMA foreign_key_check").all().length;
  db.close();
  if (fk) throw new Error(`il fixture v1 ha ${fk} violazioni FK`);
  return { cases, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const out = process.argv[2];
  if (!out) { console.error("uso: node make-v1-fixture.mjs <out.sqlite> [seed]"); process.exit(2); }
  const { counts } = buildFixture(out, { seed: process.argv[3] ? Number(process.argv[3]) : undefined });
  console.log(JSON.stringify(counts, null, 2));
}
