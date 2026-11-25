// "For you": seeds are the titles this person rated 4 stars or more that TMDB knows; picks come from TMDB recommendations,
// never include what they already logged, never obscure or poster-less titles.
import { call, check, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

let r;
sql("DELETE FROM rate_limit");
const ann = await signIn(mail("fy-ann"));
const ben = await signIn(mail("fy-ben"));

r = await call("GET", "/api/me/for-you");
check("needs a session", r.status === 401);
r = await call("GET", "/api/me/for-you", { cookie: ben.cookie });
check("no ratings: enabled, nothing seeded, no picks", r.status === 200 && r.json.enabled === true && r.json.seeded === 0 && r.json.picks.length === 0, r.text);

// Matrix (TMDB 603) rated 9, inserted directly; Inception (27205) logged too so it must not come back.
// (other suites may already have stored these films: use those rows when they exist)
const entity = (tmdb, title, year) => {
  const found = sql(`SELECT id FROM media_entity WHERE kind='movie' AND tmdb_id=${tmdb}`)[0]?.id;
  if (found) return found;
  const id = `fy-${tmdb}-${run}`;
  sql(`INSERT INTO media_entity(id,kind,original_title,year,tmdb_id) VALUES ('${id}','movie','${title}',${year},${tmdb})`);
  return id;
};
const matrix = entity(603, "Matrix", 1999);
const incep = entity(27205, "Inception", 2010);
const mk = async (media, extra = {}) => (await call("POST", "/api/logs", { cookie: ann.cookie, body: { mediaKey: `local:${media}`, watchedOn: "2026-11-01", circles: [], ...extra } }));
r = await mk(matrix, { rating: 9 });
check("a rated viewing is logged", r.status < 300, r.text);
await mk(incep, { rating: 3 });
r = await call("GET", "/api/me/for-you", { cookie: ann.cookie });
const keys = (r.json?.picks ?? []).map((p) => p.key);
check("one seed (Matrix); Inception is logged so it is not suggested; obscure and poster-less titles are dropped", r.status === 200 && r.json.seeded === 1 && keys.join() === "tmdb:movie:807,tmdb:movie:1003", r.text);
check("each pick says why", r.json.picks.every((p) => p.because.length === 1 && p.because[0].mediaId === matrix) && r.json.picks[0].score > r.json.picks[1].score);

// The latest rating decides: a rewatch rated 5 takes Matrix out of the seeds.
await mk(matrix, { rating: 5, watchedOn: "2026-11-05" });
r = await call("GET", "/api/me/for-you", { cookie: ann.cookie });
check("the latest rating of a title counts (a rewatch can change your mind)", r.json.seeded === 0 && r.json.picks.length === 0, r.text);
finish();
