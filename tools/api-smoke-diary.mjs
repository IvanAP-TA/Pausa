// T3 end-to-end checks: titles, diary, sharing, feed, spoilers, per-Cerchia threads, reactions, reports, series progress.
// Needs: the API (`wrangler dev --local` with TMDB_BASE_URL / ANILIST_URL / TMDB_API_TOKEN pointing at tools/mock-catalog.mjs),
// the mock running on MOCK (default http://127.0.0.1:9911). Usage: node tools/api-smoke-diary.mjs http://localhost:8797
import { call, check, days, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

const MOCK = process.env.MOCK ?? "http://127.0.0.1:9911";
const stats = async () => (await fetch(MOCK + "/__stats")).json();
const today = days(0);
let r;

sql("DELETE FROM rate_limit");
await fetch(MOCK + "/__reset");
// Other suites may have left rows behind: compare against what was there at the start instead of assuming empty tables.
const mediaCount = () => sql("SELECT COUNT(*) AS n FROM media_entity")[0].n;
const logCount = () => sql("SELECT COUNT(*) AS n FROM log")[0].n;
const baseMedia = mediaCount();
const baseLogs = logCount();

const alice = await signIn(mail("alice"));
const bob = await signIn(mail("bob"));
const carol = await signIn(mail("carol"));
const mk = async (who, name) => (await call("POST", "/api/circles", { cookie: who.cookie, body: { name } })).json;
const c1 = await mk(alice, "Divano");
const c2 = await mk(bob, "Cineforum");
await call("POST", "/api/circles/join", { cookie: bob.cookie, body: { code: c1.inviteCode } });
await call("POST", "/api/circles/join", { cookie: carol.cookie, body: { code: c2.inviteCode } });
// alice+bob in C1, bob+carol in C2.

// ═════════ search: nothing is stored, results are cached, bad catalogue rows are filtered ═════════
r = await call("GET", "/api/media/search?q=matrix");
check("search needs a session", r.status === 401);
r = await call("GET", "/api/media/search", { cookie: alice.cookie });
check("search needs a term", r.status === 400, r.text);
r = await call("GET", "/api/media/search?q=matrix&locale=it", { cookie: alice.cookie });
check("TMDB result becomes a candidate", r.status === 200 && r.json.length === 1 && r.json[0].key === "tmdb:movie:603" && r.json[0].title === "Matrix" && r.json[0].year === 1999 && r.json[0].kind === "movie", r.text);
check("a search stores nothing (v1 stored up to 18 rows per search)", mediaCount() === baseMedia);
const s1 = await stats();
r = await call("GET", "/api/media/search?q=matrix&locale=it", { cookie: bob.cookie });
const s2 = await stats();
check("the same search from another person is served from the cache", JSON.stringify(s1) === JSON.stringify(s2) && r.json?.length === 1, JSON.stringify([s1, s2]));
r = await call("GET", "/api/media/search?q=one%20piece", { cookie: alice.cookie });
check("anime listed by both catalogues appears once, as anime", r.json.length === 1 && r.json[0].kind === "anime" && r.json[0].key === "tmdb:tv:37854", r.text);
r = await call("GET", "/api/media/search?q=death%20note", { cookie: alice.cookie });
check("AniList-only anime is found", r.json.length === 1 && r.json[0].key === "anilist:1535" && r.json[0].poster_path === undefined && r.json[0].posterPath?.startsWith("https://s4.anilist.co/"), r.text);
r = await call("GET", "/api/media/search?q=adult%20person", { cookie: alice.cookie });
check("adult titles and people are filtered out", r.status === 200 && r.json.length === 0, r.text);

// ═════════ writing a viewing ═════════
const log = (who, extra = {}) =>
  call("POST", "/api/logs", { cookie: who.cookie, body: { mediaKey: "tmdb:movie:603", watchedOn: "2026-11-01", rating: 9, review: "Capolavoro", circles: [c1.id], locale: "it", ...extra } });

r = await call("POST", "/api/logs", { body: {} });
check("logging needs a session", r.status === 401);
r = await log(alice, { watchedOn: days(5) });
check("a future date is refused (v1 only limited it in the HTML)", r.status === 400, r.text);
r = await log(alice, { watchedOn: "2026-02-30" });
check("an impossible date is refused", r.status === 400, r.text);
r = await log(alice, { rating: 11 });
check("rating 11 is refused", r.status === 400, r.text);
r = await log(alice, { mediaKey: "nonsense" });
check("a bad media key is refused", r.status === 400, r.text);
r = await log(alice, { circles: [c2.id] });
check("sharing with a Cerchia I am not in is forbidden", r.status === 403, r.text);
r = await log(alice, { mediaKey: "tmdb:movie:999999" });
check("a title the catalogue does not know is 503 catalog_unavailable", r.status === 503 && r.json?.code === "catalog_unavailable", r.text);
check("nothing was written by the refused attempts", logCount() === baseLogs && mediaCount() === baseMedia);

r = await log(alice);
check("alice logs Matrix, shared with Divano (201)", r.status === 201 && !!r.json.id, r.text);
const logA = r.json.id;
const media = sql("SELECT id, kind, tmdb_id, runtime_min, year, imdb_id FROM media_entity WHERE tmdb_id = 603")[0];
check("the title was created from the catalogue in one go", media.kind === "movie" && media.tmdb_id === 603 && media.runtime_min === 136 && media.year === 1999 && media.imdb_id === "tt0133093", JSON.stringify(media));
check("title, synopsis, genres and cast were stored for the language", sql(`SELECT t.title, d.overview, d.genres, d.cast FROM media_title t JOIN media_detail d ON d.media_id = t.media_id AND d.locale = t.locale WHERE t.media_id='${media.id}' AND t.locale='it'`).some((x) => x.title === "Matrix" && x.overview.startsWith("Un hacker") && JSON.parse(x.genres).length === 2 && JSON.parse(x.cast)[0].name === "Keanu Reeves"));
const before = await stats();
r = await log(bob, { watchedOn: "2026-11-02", rating: 7, review: "Bello" });
check("a second person logging the same title does not call the catalogue again", r.status === 201 && JSON.stringify(await stats()) === JSON.stringify(before));
const logB = r.json.id;
check("still one title row", sql("SELECT COUNT(*) AS n FROM media_entity WHERE tmdb_id = 603")[0].n === 1);

r = await call("GET", `/api/circles/${c1.id}/feed`, { cookie: bob.cookie });
check("bob's feed in Divano shows both viewings, newest share first", r.status === 200 && r.json.items.length === 2 && r.json.items[0].id === logB && r.json.items[0].author.name.startsWith("bob") && r.json.items[1].rating === 9 && r.json.items[0].media.title === "Matrix", r.text);
check("feed rows carry counts, not private data", r.json.items[0].commentCount === 0 && Array.isArray(r.json.items[0].reactions) && r.json.items[0].sharedIn.length === 0);
r = await call("GET", `/api/circles/${c1.id}/feed`, { cookie: carol.cookie });
check("carol is not in Divano: 404, not 403", r.status === 404, r.text);
r = await call("GET", `/api/circles/${c2.id}/feed`, { cookie: carol.cookie });
check("Cineforum has no viewings yet (nothing is shared into a Cerchia unasked)", r.status === 200 && r.json.items.length === 0, r.text);

r = await call("GET", "/api/me/diary", { cookie: alice.cookie });
check("alice's own diary shows her viewing with where it is shared", r.json.items.length === 1 && r.json.items[0].sharedIn[0] === c1.id && r.json.items[0].review === "Capolavoro", r.text);

// ═════════ rating that counts: latest rated whole-title log per Cerchia ═════════
const rc = (circle, user, mediaId) => sql(`SELECT rating FROM rating_current WHERE circle_id='${circle}' AND user_id='${user}' AND media_id='${mediaId}'`);
check("alice's rating in Divano is her 9", rc(c1.id, alice.id, media.id)[0]?.rating === 9);
r = await log(alice, { watchedOn: "2026-11-20", rating: 5, review: "Rivisto: meno bene", isRewatch: true });
const logA2 = r.json.id;
check("a later viewing replaces the rating that counts", rc(c1.id, alice.id, media.id)[0]?.rating === 5);
r = await log(alice, { watchedOn: "2026-10-01", rating: 2 });
const logOld = r.json.id;
check("a backdated viewing does not override a newer rating", rc(c1.id, alice.id, media.id)[0]?.rating === 5);
r = await call("DELETE", `/api/logs/${logA2}`, { cookie: alice.cookie });
check("deleting the newest falls back to the previous one", r.status === 204 && rc(c1.id, alice.id, media.id)[0]?.rating === 9, JSON.stringify(rc(c1.id, alice.id, media.id)));
r = await call("DELETE", `/api/logs/${logOld}`, { cookie: alice.cookie });
r = await call("DELETE", `/api/logs/${logB}`, { cookie: alice.cookie });
check("someone else's viewing is 404, not 403", r.status === 404, r.text);
check("bob's viewing is untouched", sql(`SELECT COUNT(*) AS n FROM log WHERE id='${logB}'`)[0].n === 1);

// ═════════ spoilers: the text does not travel until asked ═════════
r = await log(alice, { watchedOn: "2026-11-03", review: "Neo è l'eletto", containsSpoilers: true, mediaKey: "tmdb:movie:603" });
const logSp = r.json.id;
r = await call("GET", `/api/circles/${c1.id}/feed`, { cookie: bob.cookie });
const sp = r.json.items.find((i) => i.id === logSp);
check("a spoiler review is withheld from others in the feed", sp.review === null && sp.reviewHidden === true && sp.containsSpoilers === true && !r.text.includes("eletto"), JSON.stringify(sp));
r = await call("GET", `/api/circles/${c1.id}/feed`, { cookie: alice.cookie });
check("its author still sees it", r.json.items.find((i) => i.id === logSp).review === "Neo è l'eletto");
r = await call("GET", `/api/circles/${c1.id}/logs/${logSp}?reveal=1`, { cookie: bob.cookie });
check("reveal=1 returns the text", r.status === 200 && r.json.log.review === "Neo è l'eletto" && r.json.log.reviewHidden === false, r.text);
r = await call("GET", `/api/circles/${c1.id}/logs/${logSp}`, { cookie: bob.cookie });
check("the thread without reveal keeps it hidden", r.json.log.review === null && r.json.log.reviewHidden === true);

// ═════════ editing, who watched with ═════════
r = await call("PUT", `/api/logs/${logA}`, { cookie: bob.cookie, body: { watchedOn: "2026-11-01", rating: 1 } });
check("only the author edits (404 for others)", r.status === 404, r.text);
r = await call("PUT", `/api/logs/${logA}`, { cookie: alice.cookie, body: { watchedOn: "2026-11-01", rating: 8, review: "  Ancora meglio  ", platform: "  Netflix ", containsSpoilers: false, isRewatch: false, watchedWith: [bob.id, carol.id, "stranger"] } });
check("author edits (204)", r.status === 204, r.text);
r = await call("GET", `/api/circles/${c1.id}/logs/${logA}`, { cookie: bob.cookie });
check("review and platform trimmed, rating updated", r.json.log.review === "Ancora meglio" && r.json.log.platform === "Netflix" && r.json.log.rating === 8, r.text);
check("'watched with' keeps only members of the Cerchie it is shared with (carol is not in Divano)", r.json.watchedWith.length === 1 && r.json.watchedWith[0].id === bob.id, JSON.stringify(r.json.watchedWith));
check("editing an older viewing does not change the rating that counts (the 3 Nov one still wins)", rc(c1.id, alice.id, media.id)[0]?.rating === 9, JSON.stringify(rc(c1.id, alice.id, media.id)));
r = await call("PUT", `/api/logs/${logSp}`, { cookie: alice.cookie, body: { watchedOn: "2026-11-03", rating: 4, review: "Neo è l'eletto", containsSpoilers: true } });
check("editing the newest viewing moves it", r.status === 204 && rc(c1.id, alice.id, media.id)[0]?.rating === 4, JSON.stringify(rc(c1.id, alice.id, media.id)));
r = await call("PUT", `/api/logs/${logA}`, { cookie: alice.cookie, body: { watchedOn: days(9), rating: 8 } });
check("an edit cannot move a viewing into the future", r.status === 400);

// ═════════ sharing is explicit and per Cerchia ═════════
r = await call("PUT", `/api/logs/${logB}/shares`, { cookie: bob.cookie, body: { circles: [c1.id, c2.id] } });
check("bob shares his viewing with both Cerchie", r.status === 204, r.text);
r = await call("GET", `/api/circles/${c2.id}/feed`, { cookie: carol.cookie });
check("it now arrives in Cineforum", r.json.items.length === 1 && r.json.items[0].id === logB, r.text);
r = await call("PUT", `/api/logs/${logB}/shares`, { cookie: bob.cookie, body: { circles: [c1.id, "not-mine"] } });
check("sharing with a Cerchia I am not in is forbidden", r.status === 403, r.text);
r = await call("PUT", `/api/logs/${logB}/shares`, { cookie: alice.cookie, body: { circles: [] } });
check("only the author changes sharing", r.status === 404);

// per-Cerchia threads: the same viewing has a separate conversation in each
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/comments`, { cookie: alice.cookie, body: { body: "Concordo" } });
check("alice comments in Divano (201)", r.status === 201 && !!r.json.id, r.text);
const cmA = r.json.id;
r = await call("POST", `/api/circles/${c2.id}/logs/${logB}/comments`, { cookie: carol.cookie, body: { body: "Per me è troppo lungo" } });
const cmC = r.json.id;
r = await call("GET", `/api/circles/${c1.id}/logs/${logB}`, { cookie: bob.cookie });
check("Divano's thread shows only Divano's comment", r.json.comments.length === 1 && r.json.comments[0].body === "Concordo" && r.json.log.commentCount === 1, r.text);
r = await call("GET", `/api/circles/${c2.id}/logs/${logB}`, { cookie: bob.cookie });
check("Cineforum's thread shows only Cineforum's comment (no cross-group leak)", r.json.comments.length === 1 && r.json.comments[0].body === "Per me è troppo lungo" && r.json.comments[0].author.name.startsWith("carol"), r.text);
r = await call("GET", `/api/circles/${c2.id}/logs/${logA}`, { cookie: carol.cookie });
check("a viewing not shared in a Cerchia is 404 there", r.status === 404, r.text);

// notifications
const notes = (user, type) => sql(`SELECT circle_id, log_id, actor_id FROM notification WHERE user_id='${user}' AND type='${type}'`);
check("bob (the author) was told about alice's comment, in Divano", notes(bob.id, "comment").some((n) => n.circle_id === c1.id && n.actor_id === alice.id));
check("and about carol's, in Cineforum", notes(bob.id, "comment").some((n) => n.circle_id === c2.id && n.actor_id === carol.id));
check("alice was NOT told about a comment in a Cerchia she is not in", !notes(alice.id, "comment").some((n) => n.circle_id === c2.id));
check("the commenter is not notified about their own comment", notes(alice.id, "comment").length === 0);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/comments`, { cookie: bob.cookie, body: { body: "Grazie!", parentId: cmA } });
check("a reply notifies the earlier commenter", r.status === 201 && notes(alice.id, "comment").length === 1);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/comments`, { cookie: bob.cookie, body: { body: "x", parentId: cmC } });
check("a reply cannot point at a comment of another Cerchia's thread", r.status === 400, r.text);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/comments`, { cookie: bob.cookie, body: { body: "   " } });
check("an empty comment is refused", r.status === 400);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/comments`, { cookie: bob.cookie, body: { body: "x".repeat(2001) } });
check("a 2001-character comment is refused", r.status === 400);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/comments`, { cookie: carol.cookie, body: { body: "intruder" } });
check("a non-member cannot comment (404)", r.status === 404);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/comments`, { cookie: alice.cookie, body: { body: "Finale a sorpresa", isSpoiler: true } });
const cmSp = r.json.id;
r = await call("GET", `/api/circles/${c1.id}/logs/${logB}`, { cookie: bob.cookie });
const spc = r.json.comments.find((c) => c.id === cmSp);
check("a spoiler comment is withheld from others", spc.body === null && spc.bodyHidden === true && !r.text.includes("sorpresa"), JSON.stringify(spc));
r = await call("GET", `/api/circles/${c1.id}/logs/${logB}?reveal=1`, { cookie: bob.cookie });
check("and revealed on request", r.json.comments.find((c) => c.id === cmSp).body === "Finale a sorpresa");

// edit / delete permissions
r = await call("PATCH", `/api/comments/${cmA}`, { cookie: bob.cookie, body: { body: "hack" } });
check("only the commenter edits (403)", r.status === 403, r.text);
r = await call("PATCH", `/api/comments/${cmA}`, { cookie: alice.cookie, body: { body: "Concordo, davvero", isSpoiler: false } });
check("the commenter edits (204)", r.status === 204);
r = await call("PATCH", `/api/comments/${cmA}`, { cookie: carol.cookie, body: { body: "hack" } });
check("someone outside that Cerchia cannot even see it (404)", r.status === 404, r.text);
r = await call("DELETE", `/api/comments/${cmC}`, { cookie: alice.cookie });
check("alice (not in Cineforum) cannot delete there (404)", r.status === 404);
r = await call("DELETE", `/api/comments/${cmC}`, { cookie: bob.cookie });
check("the viewing's author may delete a comment under it", r.status === 204);
r = await call("DELETE", `/api/comments/${cmA}`, { cookie: alice.cookie });
check("replies go with their parent", r.status === 204 && sql(`SELECT COUNT(*) AS n FROM comment WHERE parent_id='${cmA}'`)[0].n === 0);

// reactions
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/reactions`, { cookie: alice.cookie, body: { emoji: "🍿" } });
check("a reaction is added", r.status === 200 && r.json.on === true, r.text);
check("the author is told once", notes(bob.id, "reaction").length === 1);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/reactions`, { cookie: alice.cookie, body: { emoji: "🍿" } });
check("the same call again removes it", r.json.on === false);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/reactions`, { cookie: alice.cookie, body: { emoji: "🍿" } });
check("putting it back does not nudge again while the first notice is unread", r.json.on === true && notes(bob.id, "reaction").length === 1);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/reactions`, { cookie: alice.cookie, body: { emoji: "💩" } });
check("only the five reactions exist", r.status === 400);
r = await call("POST", `/api/circles/${c1.id}/logs/${logB}/reactions`, { cookie: alice.cookie, body: { emoji: "❤️" } });
r = await call("GET", `/api/circles/${c1.id}/feed`, { cookie: alice.cookie });
const fb = r.json.items.find((i) => i.id === logB);
check("the feed counts reactions and tells me which are mine", fb.reactions.length === 2 && fb.reactions.every((x) => x.count === 1 && x.mine === true), JSON.stringify(fb.reactions));
r = await call("GET", `/api/circles/${c2.id}/feed`, { cookie: carol.cookie });
check("reactions are per Cerchia: none show in Cineforum", r.json.items[0].reactions.length === 0 && r.json.items[0].commentCount === 0, JSON.stringify(r.json.items[0]));
r = await call("POST", `/api/circles/${c2.id}/logs/${logA}/reactions`, { cookie: carol.cookie, body: { emoji: "🍿" } });
check("reacting to a viewing not shared there is 404", r.status === 404);

// ═════════ reports ═════════
r = await call("POST", `/api/circles/${c2.id}/logs/${logB}/comments`, { cookie: carol.cookie, body: { body: "Commento da segnalare. Seconda frase." } });
const cmBad = r.json.id;
r = await call("POST", "/api/reports", { cookie: alice.cookie, body: { kind: "comment", targetId: cmBad, reason: "spam" } });
check("a report of something I cannot see is 404", r.status === 404, r.text);
r = await call("POST", "/api/reports", { cookie: carol.cookie, body: { kind: "comment", targetId: cmBad, reason: "spam" } });
check("reporting your own content is refused (v1 pretended it worked)", r.status === 400, r.text);
r = await call("POST", "/api/reports", { cookie: bob.cookie, body: { kind: "comment", targetId: cmBad, reason: "bogus" } });
check("an unknown reason is refused", r.status === 400);
r = await call("POST", "/api/reports", { cookie: bob.cookie, body: { kind: "comment", targetId: cmBad, reason: "abuse", note: "x".repeat(501) } });
check("a note over 500 characters is refused", r.status === 400);
r = await call("POST", "/api/reports", { cookie: bob.cookie, body: { kind: "comment", targetId: cmBad, reason: "abuse", note: "Offensivo" } });
check("bob reports carol's comment (204)", r.status === 204, r.text);
r = await call("POST", "/api/reports", { cookie: bob.cookie, body: { kind: "comment", targetId: cmBad, reason: "abuse" } });
check("reporting twice is not an error and adds nothing", r.status === 204 && sql(`SELECT COUNT(*) AS n FROM report WHERE target_id='${cmBad}'`)[0].n === 1);
const rep = sql(`SELECT circle_id, excerpt, reason, resolved_at FROM report WHERE target_id='${cmBad}'`)[0];
check("the report keeps a snapshot of the text and the Cerchia", rep.circle_id === c2.id && rep.excerpt === "Commento da segnalare. Seconda frase." && rep.resolved_at === null, JSON.stringify(rep));
r = await call("POST", "/api/reports", { cookie: alice.cookie, body: { kind: "log", targetId: logB, reason: "other" } });
check("a viewing can be reported by someone who sees it", r.status === 204 && sql(`SELECT COUNT(*) AS n FROM report WHERE target_id='${logB}'`)[0].n === 1);

// ═════════ taking my viewings out of a Cerchia ═════════
r = await call("POST", `/api/circles/${c1.id}/withdraw`, { cookie: bob.cookie, body: { confirm: "pausa " } });
check("the word PAUSA is case and space tolerant", r.status === 200 && r.json.removed === 1, r.text);
r = await call("POST", `/api/circles/${c1.id}/withdraw`, { cookie: bob.cookie, body: { confirm: "sì" } });
check("any other word is refused", r.status === 400);
r = await call("GET", `/api/circles/${c1.id}/feed`, { cookie: alice.cookie });
check("bob's viewings are gone from Divano", !r.json.items.some((i) => i.author.id === bob.id));
r = await call("GET", `/api/circles/${c2.id}/feed`, { cookie: carol.cookie });
check("but still in Cineforum", r.json.items.some((i) => i.id === logB));
check("his viewings still exist (only the sharing went)", sql(`SELECT COUNT(*) AS n FROM log WHERE user_id='${bob.id}'`)[0].n === 1 && sql(`SELECT COUNT(*) AS n FROM comment WHERE log_id='${logB}' AND circle_id='${c1.id}'`)[0].n === 0);
check("his rating no longer counts in Divano", rc(c1.id, bob.id, media.id).length === 0 && rc(c2.id, bob.id, media.id).length === 1);

r = await call("POST", `/api/circles/${c2.id}/leave`, { cookie: carol.cookie });
check("carol leaves Cineforum", r.status === 204);

// ═════════ pagination without skips, filters ═════════
const big = await signIn(mail("big"));
const bigC = await mk(big, "Archivio");
const bigId = sql(`SELECT id FROM user WHERE email='${mail("big")}'`)[0].id;
sql(`INSERT INTO media_entity(id,kind,original_title,year) VALUES ('mm-${run}','movie','Film X',2001),('ma-${run}','anime','Anime Y',2010)`);
const rows = [];
for (let i = 0; i < 45; i++) {
  const id = `bl-${run}-${String(i).padStart(2, "0")}`;
  const m = i % 5 === 0 ? `ma-${run}` : `mm-${run}`;
  rows.push(`('${id}','${bigId}','${m}','2026-10-${String(1 + (i % 28)).padStart(2, "0")}',${(i % 10) + 1},${1700000000000 + i})`);
}
sql(`INSERT INTO log(id,user_id,media_id,watched_on,rating,created_at) VALUES ${rows.join(",")}`);
// every share has the SAME arrival millisecond: the old "created_at < before" cursor would skip rows across pages
sql(`INSERT INTO log_share(log_id,circle_id,created_at) SELECT id,'${bigC.id}',1800000000000 FROM log WHERE user_id='${bigId}'`);
const seen = new Set();
let page = await call("GET", `/api/circles/${bigC.id}/feed`, { cookie: big.cookie });
let pages = 0;
while (true) {
  pages++;
  for (const i of page.json.items) seen.add(i.id);
  if (!page.json.next) break;
  page = await call("GET", `/api/circles/${bigC.id}/feed?before=${encodeURIComponent(page.json.next)}`, { cookie: big.cookie });
}
check("45 viewings arriving in the same millisecond come back in 3 pages with none skipped or repeated", pages === 3 && seen.size === 45, `pages=${pages} seen=${seen.size}`);
r = await call("GET", `/api/circles/${bigC.id}/feed?kind=anime`, { cookie: big.cookie });
check("filter by kind (anime)", r.json.items.length === 9 && r.json.items.every((i) => i.media.kind === "anime"), String(r.json.items.length));
r = await call("GET", `/api/circles/${bigC.id}/feed?year=2010`, { cookie: big.cookie });
check("filter by release year", r.json.items.length === 9);
r = await call("GET", `/api/circles/${bigC.id}/feed?minRating=10`, { cookie: big.cookie });
check("filter by minimum rating", r.json.items.length === 4 && r.json.items.every((i) => i.rating === 10), String(r.json.items.length));
r = await call("GET", `/api/circles/${bigC.id}/feed?person=${bigId}&kind=movie&minRating=9`, { cookie: big.cookie });
check("filters combine", r.json.items.length > 0 && r.json.items.every((i) => i.media.kind === "movie" && i.rating >= 9));
r = await call("GET", `/api/circles/${bigC.id}/feed?before=garbage`, { cookie: big.cookie });
check("a malformed cursor is ignored, not a 500", r.status === 200 || r.status === 400, String(r.status));
const dseen = new Set();
page = await call("GET", "/api/me/diary", { cookie: big.cookie });
let dpages = 0;
while (true) {
  dpages++;
  for (const i of page.json.items) dseen.add(i.id);
  if (!page.json.next) break;
  page = await call("GET", `/api/me/diary?before=${encodeURIComponent(page.json.next)}`, { cookie: big.cookie });
}
check("the personal diary paginates the same way", dpages === 3 && dseen.size === 45, `pages=${dpages} seen=${dseen.size}`);

// ═════════ private by default ═════════
r = await call("POST", "/api/logs", { cookie: alice.cookie, body: { mediaKey: "tmdb:movie:603", watchedOn: "2026-11-10", review: "Solo per me", circles: [] } });
const priv = r.json.id;
r = await call("GET", "/api/me/diary", { cookie: alice.cookie });
check("a viewing shared nowhere is in my diary, readable and editable", r.json.items.some((i) => i.id === priv && i.review === "Solo per me" && i.sharedIn.length === 0));
r = await call("GET", `/api/circles/${c1.id}/feed`, { cookie: bob.cookie });
check("and in no feed", !r.json.items.some((i) => i.id === priv));
r = await call("GET", `/api/circles/${c1.id}/logs/${priv}`, { cookie: bob.cookie });
check("nor reachable by id (404)", r.status === 404);

// ═════════ series: episodes, bookmark, rating ═════════
const ep = (extra) => call("POST", "/api/logs", { cookie: alice.cookie, body: { mediaKey: "tmdb:tv:1396", watchedOn: "2026-11-11", circles: [c1.id], locale: "it", ...extra } });
r = await ep({ season: 2, episode: 20, rating: 10 });
check("an episode log is cut to the last episode of its season (13)", r.status === 201 && sql(`SELECT season, episode FROM log WHERE id='${r.json.id}'`)[0].episode === 13);
const tv = sql("SELECT id FROM media_entity WHERE tmdb_id = 1396")[0].id;
check("the seasons were stored without the specials", JSON.stringify(sql(`SELECT season, episodes FROM media_season WHERE media_id='${tv}' ORDER BY season`)) === JSON.stringify([{ season: 1, episodes: 7 }, { season: 2, episodes: 13 }]));
check("an episode rating does NOT overwrite the rating of the whole series (v1 bug)", rc(c1.id, alice.id, tv).length === 0);
r = await call("GET", "/api/me/progress", { cookie: alice.cookie });
check("my bookmark moved to S2·E13 and the series is in 'continue watching' (no next: last episode)", r.json.length === 1 && r.json[0].season === 2 && r.json[0].episode === 13 && r.json[0].next === null && r.json[0].media.title === "Breaking Bad", r.text);
r = await call("PUT", `/api/media/${tv}/progress`, { cookie: alice.cookie, body: { season: 1, episode: 7 } });
r = await call("POST", `/api/media/${tv}/progress/advance`, { cookie: alice.cookie, body: {} });
check("+1 episode rolls into the next season", r.status === 200 && r.json.season === 2 && r.json.episode === 1, r.text);
r = await call("POST", `/api/media/${tv}/progress/advance`, { cookie: alice.cookie, body: { season: true } });
check("'next season' goes to its first episode", r.json.season === 3 && r.json.episode === 1, r.text);
r = await call("PUT", `/api/media/${tv}/progress`, { cookie: alice.cookie, body: { season: 9, episode: 99 } });
r = await call("GET", "/api/me/progress", { cookie: alice.cookie });
check("a position beyond the known counts is cut to what exists", r.json[0].season === 2 && r.json[0].episode === 13, r.text);
r = await call("PUT", `/api/media/${tv}/progress`, { cookie: alice.cookie, body: { episode: 3 } });
check("an episode needs a season", r.status === 400);
r = await ep({ rating: 9, review: "Serie intera" });
check("a whole-series log sets the rating and finishes it", r.status === 201 && rc(c1.id, alice.id, tv)[0]?.rating === 9 && sql(`SELECT status FROM watch_progress WHERE user_id='${alice.id}' AND media_id='${tv}'`)[0].status === "done");
r = await call("GET", "/api/me/progress", { cookie: alice.cookie });
check("a finished series leaves 'continue watching'", r.json.length === 0, r.text);
r = await call("DELETE", `/api/media/${tv}/progress`, { cookie: alice.cookie });
check("clearing is 204", r.status === 204);

// "sta guardando" notices: once, when a series is started, to Cerchie that have it on
sql(`DELETE FROM notification WHERE type='now_watching'`);
const tvAnime = (await call("GET", "/api/media/search?q=one%20piece", { cookie: alice.cookie })).json[0].key;
await call("POST", "/api/logs", { cookie: alice.cookie, body: { mediaKey: tvAnime, watchedOn: "2026-11-12", season: 1, episode: 1, circles: [c1.id] } }); // creates the title
const op = sql("SELECT id FROM media_entity WHERE tmdb_id = 37854")[0].id;
sql(`DELETE FROM notification WHERE type='now_watching'`);
sql(`DELETE FROM watch_progress WHERE user_id='${alice.id}'`);
r = await call("PUT", `/api/media/${op}/progress`, { cookie: alice.cookie, body: { season: 1, episode: 2 } });
check("setting progress on a new title notifies Cerchie members", notes(bob.id, "now_watching").length === 1, JSON.stringify(notes(bob.id, "now_watching")));
r = await call("PUT", `/api/media/${op}/progress`, { cookie: alice.cookie, body: { season: 1, episode: 3 } });
check("moving along does not notify again", notes(bob.id, "now_watching").length === 1);
sql(`DELETE FROM watch_progress WHERE user_id='${alice.id}'`);
sql(`DELETE FROM notification WHERE type='now_watching'`);
sql(`UPDATE circle SET live_watching=0 WHERE id='${c1.id}'`);
r = await call("PUT", `/api/media/${op}/progress`, { cookie: alice.cookie, body: { season: 1, episode: 1 } });
check("a Cerchia with 'sta guardando' off gets nothing", notes(bob.id, "now_watching").length === 0);
sql(`UPDATE circle SET live_watching=1 WHERE id='${c1.id}'`);

// ═════════ title detail, localised on demand ═════════
const st1 = await stats();
r = await call("GET", `/api/media/${media.id}?locale=it`, { cookie: alice.cookie });
check("detail: synopsis, genres, cast and runtime", r.status === 200 && r.json.runtimeMin === 136 && r.json.overview?.startsWith("Un hacker") && r.json.genres.length === 2 && r.json.cast[0].name === "Keanu Reeves" && r.json.media.title === "Matrix", r.text);
check("detail in a language already stored costs no catalogue call", JSON.stringify(await stats()) === JSON.stringify(st1));
r = await call("GET", `/api/media/${media.id}?locale=en`, { cookie: alice.cookie });
check("the first request in a new language fetches it once", r.json.media.title === "The Matrix (en)" && r.json.overview?.startsWith("A hacker"), r.text);
const st2 = await stats();
r = await call("GET", `/api/media/${media.id}?locale=en`, { cookie: bob.cookie });
check("and keeps it", JSON.stringify(await stats()) === JSON.stringify(st2) && r.json.media.title === "The Matrix (en)");
r = await call("GET", "/api/media/does-not-exist", { cookie: alice.cookie });
check("an unknown title is 404", r.status === 404, r.text);
r = await call("GET", `/api/media/search?q=Mat`, { cookie: alice.cookie });
check("titles Pausa already has are found by prefix without calling anyone", r.json.some((c) => c.key === `local:${media.id}`), r.text);

// ═════════ accounts: viewings leave with a deleted person ═════════
r = await call("DELETE", "/api/account", { cookie: bob.cookie, body: { confirm: true } });
check("deleting an account removes their viewings from the feeds they were in", r.status === 204 && sql(`SELECT COUNT(*) AS n FROM log_share WHERE log_id='${logB}'`)[0].n === 0);

finish();
