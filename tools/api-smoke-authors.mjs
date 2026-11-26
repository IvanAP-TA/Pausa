// Genres and authors: stored on resolve, shown on the title, searchable, with a person page.
import { call, check, finish, mail, sql, signIn } from "./smoke-lib.mjs";

sql("DELETE FROM rate_limit");
const a = await signIn(mail("au1"));
const res = await call("POST", "/api/media/resolve", { cookie: a.cookie, body: { mediaKey: "tmdb:movie:603", locale: "it" } });
check("resolve ok", res.status === 200, res.text);
const mid = res.json.id;
const g = sql(`SELECT genre FROM media_genre WHERE media_id='${mid}' ORDER BY genre`);
check("matrix: stable genres stored", JSON.stringify(g.map((r) => r.genre)) === JSON.stringify(["action", "scifi"]), JSON.stringify(g));
check("catalog_v2_at set", sql(`SELECT catalog_v2_at FROM media_entity WHERE id='${mid}'`)[0].catalog_v2_at > 0);

const people = sql(`SELECT p.name, mp.role FROM media_person mp JOIN person p ON p.id = mp.person_id WHERE mp.media_id='${mid}' ORDER BY mp.position`);
check("matrix: two directors stored", JSON.stringify(people) === JSON.stringify([{ name: "Lana Wachowski", role: "director" }, { name: "Lilly Wachowski", role: "director" }]), JSON.stringify(people));
const bb = (await call("POST", "/api/media/resolve", { cookie: a.cookie, body: { mediaKey: "tmdb:tv:1396", locale: "it" } })).json.id;
check("breaking bad: creator", sql(`SELECT p.name FROM media_person mp JOIN person p ON p.id=mp.person_id WHERE mp.media_id='${bb}' AND mp.role='creator'`)[0]?.name === "Vince Gilligan");
const op1 = (await call("POST", "/api/media/resolve", { cookie: a.cookie, body: { mediaKey: "anilist:21", locale: "it" } })).json.id;
check("one piece: director not stored when an author exists", sql(`SELECT COUNT(*) AS n FROM media_person WHERE media_id='${op1}' AND role='director'`)[0].n === 0);
check("one piece: original creator stored as author", sql(`SELECT p.name FROM media_person mp JOIN person p ON p.id=mp.person_id WHERE mp.media_id='${op1}' AND mp.role='author'`)[0]?.name === "Eiichiro Oda");

// Lazy fill on detail.
sql(`DELETE FROM media_person WHERE media_id='${mid}'; UPDATE media_entity SET catalog_v2_at=NULL WHERE id='${mid}'`);
const d = await call("GET", `/api/media/${mid}?locale=it`, { cookie: a.cookie });
check("detail: authors filled on first read", d.json.authors.map((x) => x.name).join(",") === "Lana Wachowski,Lilly Wachowski", d.text);

// backfill: a title from before 0003 (no genres/people, catalog_v2_at NULL) is filled by the admin endpoint
sql(`DELETE FROM media_person WHERE media_id='${mid}'; DELETE FROM media_genre WHERE media_id='${mid}'; UPDATE media_entity SET catalog_v2_at=NULL WHERE id='${mid}'`);
// a title the catalogue does not know (mock answers 404) must end stamped, with no people
const ghost = "ghost-v2-title";
sql(`INSERT INTO media_entity(id, kind, tmdb_id, original_title) VALUES ('${ghost}', 'movie', 999999, 'Ghost')`);
// other suites insert bare titles by SQL; mark them done so only this title is left
sql(`UPDATE media_entity SET catalog_v2_at=1 WHERE catalog_v2_at IS NULL AND id NOT IN ('${mid}', '${ghost}')`);
const op = await signIn("operator@pausa.test"); // the operator account used by api-smoke-admin
const bf = await call("POST", "/api/admin/catalog-backfill?limit=10", { cookie: op.cookie });
check("backfill: answers done/left", bf.status === 200 && bf.json.left === 0 && bf.json.done === 2 && bf.json.failed === 0, bf.text);
check("backfill: people back", sql(`SELECT COUNT(*) AS n FROM media_person WHERE media_id='${mid}'`)[0].n === 2);
check("backfill: vanished title stamped, no people", sql(`SELECT catalog_v2_at FROM media_entity WHERE id='${ghost}'`)[0].catalog_v2_at > 1 && sql(`SELECT COUNT(*) AS n FROM media_person WHERE media_id='${ghost}'`)[0].n === 0);
check("backfill: genres back", sql(`SELECT COUNT(*) AS n FROM media_genre WHERE media_id='${mid}'`)[0].n === 2);
check("backfill needs an operator", (await call("POST", "/api/admin/catalog-backfill", { cookie: a.cookie })).status === 404);

// people search and the person page
const hits = await call("GET", "/api/people/search?q=simon&locale=it", { cookie: a.cookie });
check("people search: writers yes, actors no", hits.json.map((h) => h.key).join() === "tmdb:1223786", hits.text);
const oda = await call("GET", "/api/people/search?q=oda&locale=it", { cookie: a.cookie });
check("people search: anilist staff too", oda.json.some((h) => h.key === "anilist:96881"));

// a circle where two people rated Matrix
const K = (await call("POST", "/api/circles", { cookie: a.cookie, body: { name: "Registi" } })).json;
const b = await signIn(mail("au2"));
await call("POST", "/api/circles/join", { cookie: b.cookie, body: { code: K.inviteCode } });
for (const [who, r] of [[a, 9], [b, 7]]) await call("POST", "/api/logs", { cookie: who.cookie, body: { mediaKey: `local:${mid}`, watchedOn: "2026-03-15", rating: r, circles: [K.id] } });
const pg = await call("GET", `/api/people/tmdb:9339?locale=it&circle=${K.id}`, { cookie: a.cookie });
check("person page: works with circle votes", pg.status === 200 && pg.json.works[0].title === "Matrix Reloaded" && pg.json.works[1].mediaId === mid && pg.json.works[1].avg === 8 && pg.json.works[1].ratings.length === 2, pg.text);
check("person page: unknown work has no media id", pg.json.works[0].mediaId === null && pg.json.works[0].workKey === "tmdb:movie:604");
const enc = await call("GET", `/api/people/tmdb%3A9339?locale=it&circle=${K.id}`, { cookie: a.cookie });
check("person page: percent-encoded key works", enc.status === 200 && enc.json.works.length === pg.json.works.length, enc.text);
check("person page: non-canonical key 404", (await call("GET", "/api/people/tmdb:09339", { cookie: a.cookie })).status === 404);
const out = await signIn(mail("au3"));
check("person page: circle of others is 404", (await call("GET", `/api/people/tmdb:9339?circle=${K.id}`, { cookie: out.cookie })).status === 404);
check("person page: bad key 404", (await call("GET", "/api/people/nope:1", { cookie: a.cookie })).status === 404);
check("person page needs a session", (await call("GET", "/api/people/tmdb:9339")).status === 401);

finish();
