// Import end-to-end: normalised rows in chunks, matching, enrichment (mock TMDB/AniList), idempotency, resume, destination Cerchia,
// lists, undo. The files themselves are parsed on the client; here the rows are written the way the client would send them.
import { call, check, days, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

const MOCK = process.env.MOCK ?? "http://127.0.0.1:9911";
const stats = async () => (await fetch(MOCK + "/__stats")).json();
const total = (s) => Object.values(s).reduce((a, b) => a + b, 0);
let r;

sql("DELETE FROM rate_limit");
await fetch(MOCK + "/__reset");
const U = await signIn(mail("imp"));
const V = await signIn(mail("mate"));
const X = await signIn(mail("stranger"));
const guestRes = await call("POST", "/api/auth/guest", { body: { name: "g" } });
const G = { cookie: guestRes.cookies[0].split(";")[0] };

const C = (await call("POST", "/api/circles", { cookie: U.cookie, body: { name: "Archivio" } })).json;
await call("POST", "/api/circles/join", { cookie: V.cookie, body: { code: C.inviteCode } });

const start = (who, body) => call("POST", "/api/imports", { cookie: who.cookie, body });
const chunk = (who, id, body) => call("POST", `/api/imports/${id}/rows`, { cookie: who.cookie, body });
const status = async (who, id) => (await call("GET", `/api/imports/${id}`, { cookie: who.cookie })).json;
const row = (title, extra = {}) => ({ kind: "movie", title, watchedOn: "2026-01-02", ...extra });
// Other suites share this database: what counts as a "new title" depends on what is already stored, so expectations are computed.
const known = (tmdb) => sql(`SELECT COUNT(*) AS n FROM media_entity WHERE tmdb_id = ${tmdb}`)[0].n > 0;
const knownTitle = (t) => sql(`SELECT COUNT(*) AS n FROM media_entity WHERE original_title = '${t}' COLLATE NOCASE`)[0].n > 0;

/** Sends rows the way the client does: from the start, and again from `processed` until everything was handled. */
async function sendAll(who, id, rows, opts = {}) {
  let offset = 0;
  const sum = { calls: 0, imported: 0, already: 0, newTitles: 0, skippedUndated: 0, rejected: [], processedEach: [] };
  while (offset < rows.length) {
    const part = rows.slice(offset, offset + 30);
    const res = await chunk(who, id, { rows: part, offset, ...opts });
    if (res.status !== 200) throw new Error(`chunk failed ${res.status} ${res.text}`);
    const j = res.json;
    sum.calls++;
    sum.imported += j.imported;
    sum.already += j.already;
    sum.newTitles += j.newTitles;
    sum.skippedUndated += j.skippedUndated;
    sum.rejected.push(...j.rejected.map((x) => ({ ...x, index: x.index + offset })));
    sum.processedEach.push(j.processed);
    if (j.processed === 0) throw new Error("no progress");
    offset += j.processed;
    sum.cursor = j.cursor;
  }
  return sum;
}

// ═════════ opening an import ═════════
r = await start({ cookie: "" }, { source: "letterboxd" });
check("starting needs a session", r.status === 401);
r = await start(G, { source: "letterboxd" });
check("a guest cannot import (403)", r.status === 403);
r = await start(U, { source: "netflix" });
check("an unknown source is refused", r.status === 400, r.text);
r = await start(X, { source: "letterboxd", circleId: C.id });
check("a Cerchia I am not in cannot be a destination (404)", r.status === 404, r.text);
r = await start(U, { source: "imdb", total: 6 });
check("an import is opened (201)", r.status === 201 && !!r.json.id, r.text);
const B = r.json.id;
let st = await status(U, B);
check("it starts running at cursor 0 with its total", st.status === "running" && st.cursor === 0 && st.total === 6 && st.circleId === null && st.imported === 0, JSON.stringify(st));
r = await call("GET", `/api/imports/${B}`, { cookie: X.cookie });
check("somebody else's import does not exist (404)", r.status === 404);

// ═════════ rows: validation, enrichment, idempotency ═════════
r = await chunk(U, B, { rows: [] });
check("an empty chunk is refused", r.status === 400);
r = await chunk(U, B, { rows: Array.from({ length: 31 }, (_, i) => row(`T${i}`)) });
check("31 rows are refused (30 at most)", r.status === 400);

const s0 = total(await stats());
const expectFirstNew = (known(603) ? 0 : 1) + (known(807) ? 0 : 1);
const first = [
  row("Matrix", { year: 1999, imdbId: "tt0133093", rating: 9, review: "Capolavoro" }),
  row("Se7en", { year: 1995, rating: 8, watchedOn: "2026-01-03" }),
  row("", { year: 2000 }),
  { kind: "book", title: "Un libro" },
  row("Senza data", { watchedOn: null }),
  row("Data futura", { watchedOn: "2099-01-01" }),
  row("Cattivo", { year: 1500, rating: 11, watchedOn: "2026-02-30", letterboxdUri: "https://evil.example/x" }),
];
r = await chunk(U, B, { rows: first, offset: 0 });
const j1 = r.json;
check("one bad row does not sink the chunk: the two bad rows are named, the rest handled", r.status === 200 && j1.processed === 7 && JSON.stringify(j1.rejected.map((x) => [x.index, x.reason])) === JSON.stringify([[2, "title"], [3, "kind"]]), r.text);
check("undated rows are left out by default and counted (no date, impossible date, future date)", j1.skippedUndated === 3 && j1.imported === 2, JSON.stringify(j1));
check("the titles the database did not have yet were made (and only those)", j1.newTitles === expectFirstNew && j1.already === 0, JSON.stringify([j1, expectFirstNew]));
const m = sql(`SELECT id, kind, tmdb_id, imdb_id, year, runtime_min FROM media_entity WHERE tmdb_id = 603`)[0];
check("Matrix came from TMDB through its IMDb id, with the details", m && m.imdb_id === "tt0133093" && m.runtime_min === 136 && m.year === 1999, JSON.stringify(m));
check("Se7en was found by title and year and enriched", sql(`SELECT COUNT(*) AS n FROM media_entity WHERE tmdb_id = 807`)[0].n === 1);
const logs = sql(`SELECT l.watched_on, l.rating, l.review, l.created_at, l.import_batch_id FROM log l WHERE l.user_id='${U.id}' ORDER BY l.watched_on`);
check("the viewings carry date, rating, review and the batch; created_at is noon of the viewing day", logs.length === 2 && logs[0].watched_on === "2026-01-02" && logs[0].rating === 9 && logs[0].review === "Capolavoro" && logs[0].import_batch_id === B && logs[0].created_at === Date.UTC(2026, 0, 2, 12), JSON.stringify(logs));
check("with no destination Cerchia nothing is shared", sql(`SELECT COUNT(*) AS n FROM log_share WHERE import_batch_id='${B}'`)[0].n === 0);
check("no notification goes out for imported history", sql(`SELECT COUNT(*) AS n FROM notification WHERE type='log' AND actor_id='${U.id}'`)[0].n === 0);
check("the cursor and the counts are kept on the import", (await status(U, B)).cursor === 7 && (await status(U, B)).imported === 2);

const afterFirst = total(await stats());
r = await chunk(U, B, { rows: first, offset: 0 });
check("sending the same chunk again adds nothing (idempotent)", r.json.imported === 0 && r.json.already === 2 && r.json.newTitles === 0 && sql(`SELECT COUNT(*) AS n FROM log WHERE user_id='${U.id}'`)[0].n === 2, JSON.stringify(r.json));
check("and costs no catalogue call: the titles are already known", total(await stats()) === afterFirst);
check("the title lookups of the first chunk used the catalogue", afterFirst > s0);

// ═════════ matching ═════════
const s1 = total(await stats());
r = await chunk(U, B, { rows: [row("matrix", { year: 2000, watchedOn: "2026-03-01" }), row("MATRIX", { watchedOn: "2026-03-02" })] });
check("a title is matched case-insensitively, year within one or missing, without calling the catalogue", r.json.newTitles === 0 && r.json.imported === 2 && total(await stats()) === s1 && sql(`SELECT COUNT(*) AS n FROM media_entity WHERE original_title = 'The Matrix' COLLATE NOCASE`)[0].n === 1, JSON.stringify(r.json));
r = await chunk(U, B, { rows: [row("Matrix", { year: 2010, watchedOn: "2026-03-03" })] });
check("a year more than one apart is a different title", r.json.newTitles === 1, JSON.stringify(r.json));
r = await chunk(U, B, { rows: [row("Se7en", { kind: "tv", year: 1995, watchedOn: "2026-03-04" })] });
check("the same title as another kind is a different title", r.json.newTitles === 1);
r = await chunk(U, B, { rows: [row("Titolo che il catalogo non conosce", { year: 1982, watchedOn: "2026-04-01" })] });
const minimal = sql(`SELECT id, original_title, year, tmdb_id FROM media_entity WHERE original_title = 'Titolo che il catalogo non conosce'`)[0];
check("a title the catalogue does not know is kept from what the file says (the viewing is not lost)", r.json.imported === 1 && minimal && minimal.year === 1982 && minimal.tmdb_id === null);
r = await chunk(U, B, { rows: [row("Titolo che il catalogo non conosce", { year: 1982, watchedOn: "2026-04-02" })] });
check("and found again by title afterwards", r.json.newTitles === 0 && r.json.imported === 1);

const expectThree = 2 + (known(1396) ? 0 : 1);
r = await chunk(U, B, { rows: [row("Amélie", { tmdbId: 194, year: 2001, watchedOn: "2026-05-01" }), row("Breaking Bad", { kind: "tv", imdbId: "tt0903747", watchedOn: "2026-05-02" }), row("Inception", { watchedOn: "2026-05-03", year: 2010 })] });
check("by TMDB id, by IMDb id (series) and by title: all three viewings imported, new titles only where the title was not stored", r.json.imported === 3 && r.json.newTitles === expectThree, JSON.stringify([r.json, expectThree]));
check("the series came with its seasons", sql(`SELECT COUNT(*) AS n FROM media_season WHERE media_id=(SELECT id FROM media_entity WHERE tmdb_id=1396)`)[0].n === 2);
const expectAnime = 1 + (knownTitle("ONE PIECE") ? 0 : 1);
r = await chunk(U, B, { rows: [row("Death Note", { kind: "anime", malId: 1535, watchedOn: "2026-06-01" }), row("One Piece", { kind: "anime", anilistId: 21, watchedOn: "2026-06-02" })] });
check("anime come from AniList by MAL id; One Piece is recognised by title when TMDB already stored it", r.json.imported === 2 && r.json.newTitles === expectAnime && sql(`SELECT COUNT(*) AS n FROM media_entity WHERE mal_id=1535`)[0].n === 1, JSON.stringify([r.json, expectAnime]));
const dn = sql(`SELECT anilist_id, mal_id FROM media_entity WHERE mal_id = 1535`)[0];
check("the anime keeps both ids", dn.anilist_id === 1535 && dn.mal_id === 1535, JSON.stringify(dn));

// diary entries made by hand count as already there
const mid = sql(`SELECT id FROM media_entity WHERE tmdb_id = 27205`)[0].id;
r = await call("POST", "/api/logs", { cookie: U.cookie, body: { mediaKey: `local:${mid}`, watchedOn: "2026-07-07", circles: [] } });
r = await chunk(U, B, { rows: [row("Inception", { year: 2010, watchedOn: "2026-07-07" })] });
check("a viewing already written by hand for that title and day is not duplicated", r.json.already === 1 && r.json.imported === 0, JSON.stringify(r.json));

// options
r = await chunk(U, B, { rows: [row("Inception", { year: 2010, watchedOn: "2026-08-01", review: "Bello", rating: 7 })], includeReviews: false });
check("reviews can be left out", r.json.imported === 1 && sql(`SELECT review FROM log WHERE watched_on='2026-08-01' AND user_id='${U.id}'`)[0].review === null);
r = await chunk(U, B, { rows: [row("Se7en", { year: 1995, watchedOn: null })], includeUndated: true });
check("undated rows can be counted as seen today", r.json.imported === 1 && r.json.skippedUndated === 0 && sql(`SELECT COUNT(*) AS n FROM log WHERE user_id='${U.id}' AND watched_on='${days(0)}'`)[0].n === 1);

// ═════════ the request budget: many unknown titles are handled over several calls ═════════
const many = Array.from({ length: 30 }, (_, i) => row(`Sconosciuto ${i}`, { year: 1970 + (i % 20), watchedOn: `2025-01-${String(1 + (i % 28)).padStart(2, "0")}` }));
const B2 = (await start(U, { source: "letterboxd", total: 30 })).json.id;
const sum = await sendAll(U, B2, many);
check("30 unknown titles are not done in one call (a Worker call has 50 outgoing requests and 50 queries)", sum.calls >= 3 && sum.processedEach[0] <= 12 && sum.processedEach.every((p) => p >= 1), JSON.stringify(sum.processedEach));
check("but all 30 end up imported, once each, whatever the number of calls", sum.imported === 30 && sum.already === 0 && sql(`SELECT COUNT(*) AS n FROM log WHERE import_batch_id='${B2}'`)[0].n === 30, JSON.stringify(sum));
check("the cursor covers the whole file", (await status(U, B2)).cursor === 30);
// resume: pretend the client died after the first call, then restarted from the stored cursor
const B3 = (await start(U, { source: "trakt" })).json.id;
const many2 = Array.from({ length: 24 }, (_, i) => row(`Ripresa ${i}`, { year: 1960 + i, watchedOn: `2025-02-${String(1 + (i % 28)).padStart(2, "0")}` }));
r = await chunk(U, B3, { rows: many2, offset: 0 });
const done1 = r.json.processed;
check("the first call handled only part of it", done1 > 0 && done1 < 24, String(done1));
const resumeAt = (await status(U, B3)).cursor;
check("the stored cursor says where to resume", resumeAt === done1);
const rest = await sendAll(U, B3, many2.slice(resumeAt));
check("resuming from the cursor imports the rest, and the whole is 24 viewings with none repeated", sql(`SELECT COUNT(*) AS n FROM log WHERE import_batch_id='${B3}'`)[0].n === 24 && rest.imported === 24 - done1);
r = await chunk(U, B3, { rows: many2.slice(0, 12), offset: 0 });
check("resending the beginning after a resume adds nothing", r.json.imported === 0);

// ═════════ finishing ═════════
r = await call("POST", `/api/imports/${B3}/finish`, { cookie: U.cookie, body: {} });
check("an import is closed as done", r.status === 200 && r.json.status === "done" && r.json.finishedAt > 0, r.text);
r = await chunk(U, B3, { rows: [row("Dopo la fine")] });
check("a closed import takes no more rows (409)", r.status === 409);
const B4 = (await start(U, { source: "mal" })).json.id;
r = await call("POST", `/api/imports/${B4}/finish`, { cookie: U.cookie, body: { cancel: true } });
check("or cancelled", r.json.status === "cancelled");
r = await call("GET", "/api/imports", { cookie: U.cookie });
check("the list shows imports that added something, newest first, and leaves out empty ones", r.status === 200 && r.json.length >= 3 && !r.json.some((b) => b.id === B4) && r.json.every((b) => b.imported > 0 || b.lists > 0 || b.status === "running"), r.text.slice(0, 300));
check("the list belongs to the person", (await call("GET", "/api/imports", { cookie: V.cookie })).json.length === 0);

// ═════════ importing into a Cerchia ═════════
r = await start(U, { source: "letterboxd", circleId: C.id });
const BC = r.json.id;
const circleRows = [row("Matrix", { year: 1999, rating: 10, watchedOn: "2024-05-05" }), row("Se7en", { year: 1995, rating: 4, watchedOn: "2024-05-06" }), row("Amélie", { year: 2001, watchedOn: "2024-05-07" })];
r = await chunk(U, BC, { rows: circleRows });
check("imported into a Cerchia", r.json.imported === 3, r.text);
check("each viewing is shared there, dated at its own day (so years of history do not jump to the top of the feed)", sql(`SELECT COUNT(*) AS n FROM log_share WHERE import_batch_id='${BC}' AND circle_id='${C.id}'`)[0].n === 3 && sql(`SELECT MIN(created_at) AS a, MAX(created_at) AS b FROM log_share WHERE import_batch_id='${BC}'`)[0].b === Date.UTC(2024, 4, 7, 12));
r = await call("GET", `/api/circles/${C.id}/feed`, { cookie: V.cookie });
check("members of the Cerchia see them in the feed", r.json.items.length === 3 && r.json.items.every((i) => i.author.id === U.id), r.text.slice(0, 200));
const rc = (media) => sql(`SELECT rating FROM rating_current WHERE circle_id='${C.id}' AND user_id='${U.id}' AND media_id=(SELECT id FROM media_entity WHERE tmdb_id=${media})`)[0]?.rating;
check("their ratings count in the Cerchia (latest rated viewing)", rc(603) === 10 && rc(807) === 4);
check("and nobody is notified", sql(`SELECT COUNT(*) AS n FROM notification WHERE user_id='${V.id}' AND type='log'`)[0].n === 0);
const lc = await call("POST", `/api/imports/${BC}/lists`, { cookie: U.cookie, body: { name: "Preferiti", kind: "list", description: "I miei", offset: 0, rows: [row("Matrix", { year: 1999 }), row("Amélie", { year: 2001 })] } });
check("a list goes to the Cerchia as a group list", lc.status === 200 && lc.json.added === 2 && sql(`SELECT circle_id FROM list WHERE id='${lc.json.listId}'`)[0].circle_id === C.id, lc.text);
r = await call("POST", `/api/imports/${BC}/lists`, { cookie: U.cookie, body: { name: "Preferiti", kind: "list", offset: 2, rows: [row("Se7en", { year: 1995 }), row("Matrix", { year: 1999 })] } });
check("the next chunk continues the same list, skips the title already in it, and keeps positions 0,1,2", r.json.listId === lc.json.listId && r.json.added === 1 && sql(`SELECT position FROM list_item WHERE list_id='${lc.json.listId}' ORDER BY position`).map((x) => x.position).join() === "0,1,2", JSON.stringify(r.json));
check("the import counts one list", (await status(U, BC)).lists === 1);

r = await call("POST", `/api/imports/${BC}/remove-from-circle`, { cookie: V.cookie });
check("somebody else cannot take my import out (404)", r.status === 404);
r = await call("POST", `/api/imports/${BC}/remove-from-circle`, { cookie: U.cookie });
check("taking the import out of the Cerchia: 3 viewings, 1 list", r.status === 200 && r.json.viewings === 3 && r.json.lists === 1, r.text);
check("the viewings stay in my diary", sql(`SELECT COUNT(*) AS n FROM log WHERE import_batch_id='${BC}'`)[0].n === 3 && sql(`SELECT COUNT(*) AS n FROM log_share WHERE import_batch_id='${BC}'`)[0].n === 0);
check("the group list became personal", sql(`SELECT circle_id FROM list WHERE id='${lc.json.listId}'`)[0].circle_id === null);
check("the Cerchia no longer counts those ratings", rc(603) === undefined && rc(807) === undefined);
r = await call("GET", `/api/circles/${C.id}/feed`, { cookie: V.cookie });
check("and the feed is empty again", r.json.items.length === 0);
r = await call("POST", `/api/imports/${BC}/remove-from-circle`, { cookie: U.cookie });
check("doing it twice is fine and moves nothing", r.status === 200 && r.json.viewings === 0 && r.json.lists === 0);

// ═════════ deleting an import for good ═════════
const before = sql(`SELECT COUNT(*) AS n FROM log WHERE user_id='${U.id}'`)[0].n;
r = await call("DELETE", `/api/imports/${BC}`, { cookie: V.cookie });
check("somebody else cannot delete it (404)", r.status === 404);
r = await call("DELETE", `/api/imports/${BC}`, { cookie: U.cookie });
check("deleting removes the viewings it made (3), keeps the list", r.status === 200 && r.json.viewings === 3 && r.json.lists === 0 && sql(`SELECT COUNT(*) AS n FROM log WHERE user_id='${U.id}'`)[0].n === before - 3 && sql(`SELECT COUNT(*) AS n FROM list WHERE id='${lc.json.listId}'`)[0].n === 1, r.text);
check("the titles it created stay", sql(`SELECT COUNT(*) AS n FROM media_entity WHERE tmdb_id IN (603,807,194)`)[0].n === 3);
r = await call("DELETE", `/api/imports/${B2}?lists=1`, { cookie: U.cookie });
check("another import deleted: its 30 viewings go", r.json.viewings === 30 && sql(`SELECT COUNT(*) AS n FROM log WHERE import_batch_id='${B2}'`)[0].n === 0);

// ═════════ lists on a personal import, validation ═════════
const BL = (await start(U, { source: "letterboxd" })).json.id;
r = await call("POST", `/api/imports/${BL}/lists`, { cookie: U.cookie, body: { name: "  ", rows: [row("Matrix")] } });
check("a list needs a name", r.status === 400);
r = await call("POST", `/api/imports/${BL}/lists`, { cookie: U.cookie, body: { name: "Watchlist", kind: "watchlist", offset: 6000, rows: [row("Matrix")] } });
check("a list offset beyond 5000 is refused", r.status === 400);
r = await call("POST", `/api/imports/${BL}/lists`, { cookie: U.cookie, body: { name: "Watchlist", kind: "watchlist", offset: 0, rows: [row("Matrix", { year: 1999 }), { kind: "book", title: "x" }, row("Death Note", { kind: "anime", malId: 1535 })] } });
check("a personal watchlist; a bad row is named; an anime row is treated as a series (lists hold films and series)", r.status === 200 && r.json.rejected.length === 1 && r.json.rejected[0].index === 1 && sql(`SELECT kind, circle_id FROM list WHERE id='${r.json.listId}'`)[0].kind === "watchlist", r.text);

finish();
