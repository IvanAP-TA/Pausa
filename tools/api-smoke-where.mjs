// "Where to watch": the region catalogue, my services, a title's availability (read once from TMDB per country, then stored).
import { call, check, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

const MOCK = process.env.MOCK ?? "http://127.0.0.1:9911";
const hits = async () => (await (await fetch(MOCK + "/__stats")).json())["GET /movie/603/watch/providers"] ?? 0;
let r;
sql("DELETE FROM rate_limit");
const ann = await signIn(mail("where-ann"));
const ben = await signIn(mail("where-ben"));

r = await call("GET", "/api/me/providers");
check("needs a session", r.status === 401);
r = await call("GET", "/api/me/providers", { cookie: ann.cookie });
check("nothing set yet", r.status === 200 && r.json.country === null && r.json.providers.length === 0, r.text);

r = await call("GET", "/api/providers?country=XX", { cookie: ann.cookie });
check("an unknown country is refused", r.status === 400);
r = await call("GET", "/api/providers?country=IT", { cookie: ann.cookie });
check("the Italian catalogue is in the country's order", r.status === 200 && r.json.providers.map((p) => p.id).join() === "8,119,337,350", r.text);

r = await call("PUT", "/api/me/providers", { cookie: ann.cookie, body: { country: "XX", providers: [] } });
check("saving with an unknown country is refused", r.status === 400);
r = await call("PUT", "/api/me/providers", { cookie: ann.cookie, body: { country: "IT", providers: [{ id: 8, name: "Netflix", logoPath: "/netflix.jpg" }, { id: 8, name: "dup", logoPath: null }, { id: 337, name: "Disney Plus", logoPath: "//evil" }] } });
check("saved (204)", r.status === 204, r.text);
r = await call("GET", "/api/me/providers", { cookie: ann.cookie });
check("duplicates dropped, a bad logo path dropped, country kept", r.json.country === "IT" && r.json.providers.map((p) => p.id).join() === "337,8" && r.json.providers.find((p) => p.id === 337).logoPath === null, r.text);

// A title with a TMDB id, inserted directly (tmdb:movie:603).
// (other suites may already have stored Matrix: use that row when it exists)
let mid = sql("SELECT id FROM media_entity WHERE kind='movie' AND tmdb_id=603")[0]?.id;
if (!mid) {
  mid = `where-${run}`;
  sql(`INSERT INTO media_entity(id,kind,original_title,year,tmdb_id) VALUES ('${mid}','movie','Matrix',1999,603)`);
}
sql(`DELETE FROM media_availability_check WHERE media_id='${mid}'`);
sql(`DELETE FROM media_provider WHERE media_id='${mid}'`);
const before = await hits();
r = await call("GET", `/api/media/${mid}/availability`, { cookie: ann.cookie });
check("availability uses my country, lists subscription services only, and marks the ones I have", r.status === 200 && r.json.country === "IT" && r.json.known === true && r.json.providers.map((p) => p.id).join() === "8,119" && r.json.mine.map((p) => p.id).join() === "8", r.text);
check("it asked the catalogue once", (await hits()) === before + 1);
r = await call("GET", `/api/media/${mid}/availability`, { cookie: ben.cookie });
check("a second person gets the stored answer (no new catalogue call); no country set, so the language default", r.status === 200 && r.json.country === "IT" && r.json.mine.length === 0 && (await hits()) === before + 1, r.text);
r = await call("GET", `/api/media/${mid}/availability?country=FR`, { cookie: ann.cookie });
check("another country is its own answer: nowhere, but known", r.status === 200 && r.json.country === "FR" && r.json.providers.length === 0 && r.json.known === true, r.text);
check("both answers are stored", sql(`SELECT country FROM media_availability_check WHERE media_id='${mid}' ORDER BY country`).map((x) => x.country).join() === "FR,IT");
sql(`UPDATE media_availability_check SET fetched_at = ${Date.now() - 8 * 86400000} WHERE media_id='${mid}' AND country='IT'`);
const b2 = await hits();
r = await call("GET", `/api/media/${mid}/availability`, { cookie: ann.cookie });
// (the catalogue answer may come from the Worker's own one-day cache, so the mock's counter is not the proof: the stored check time is)
check("after a week it is read again and the check time is renewed", r.status === 200 && r.json.providers.length === 2 && sql(`SELECT fetched_at FROM media_availability_check WHERE media_id='${mid}' AND country='IT'`)[0].fetched_at > Date.now() - 60000 && (await hits()) <= b2 + 1);

const local = `where-local-${run}`;
sql(`INSERT INTO media_entity(id,kind,original_title,year) VALUES ('${local}','movie','Senza TMDB',2000)`);
r = await call("GET", `/api/media/${local}/availability`, { cookie: ann.cookie });
check("a title without a TMDB id is 'unknown', not 'nowhere'", r.status === 200 && r.json.known === false && r.json.providers.length === 0, r.text);
r = await call("GET", "/api/media/nope/availability", { cookie: ann.cookie });
check("an unknown title is 404", r.status === 404);

r = await call("PUT", "/api/me/providers", { cookie: ann.cookie, body: { country: null, providers: [{ id: 8, name: "Netflix" }] } });
r = await call("GET", "/api/me/providers", { cookie: ann.cookie });
check("clearing the country clears the services", r.json.country === null && r.json.providers.length === 0);
finish();
