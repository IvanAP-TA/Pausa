// POST /api/logs with an Idempotency-Key: a retry (offline queue, a lost answer) gives the first log back and creates nothing.
import { call, check, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

let r;
sql("DELETE FROM rate_limit");
const ann = await signIn(mail("idem-ann"));
const ben = await signIn(mail("idem-ben"));
const media = `idem-${run}`;
sql(`INSERT INTO media_entity(id,kind,original_title,year) VALUES ('${media}','movie','Idempotente',2020)`);
const post = (who, key, extra = {}) =>
  call("POST", "/api/logs", { cookie: who.cookie, headers: key ? { "idempotency-key": key } : {}, body: { mediaKey: `local:${media}`, watchedOn: "2026-11-10", circles: [], rating: 7, ...extra } });
const count = (who) => sql(`SELECT COUNT(*) AS n FROM log WHERE user_id='${who.id}'`)[0].n;

r = await post(ann, `k-${run}-1`);
check("the first request creates the log (201)", r.status === 201 && !!r.json.id, r.text);
const first = r.json;
r = await post(ann, `k-${run}-1`, { rating: 3 });
check("the same key again returns the first log (200, same id), even if the body differs", r.status === 200 && r.json.id === first.id && r.json.mediaId === first.mediaId, r.text);
check("and only one row exists", count(ann) === 1);
check("the stored rating is the first one", sql(`SELECT rating FROM log WHERE id='${first.id}'`)[0].rating === 7);
r = await post(ann, `k-${run}-2`);
check("another key creates another log", r.status === 201 && r.json.id !== first.id && count(ann) === 2);
r = await post(ann, null);
r = await post(ann, null);
check("without a key every request creates a log, as before", count(ann) === 4);
r = await post(ben, `k-${run}-1`);
check("keys are per person: Ben can use the same string", r.status === 201 && r.json.id !== first.id);
for (const bad of ["x".repeat(65), "has space", "semi;colon", "é"]) {
  r = await post(ann, bad);
  check(`a bad key is refused (${bad.slice(0, 12)}…)`, r.status === 400, String(r.status));
}
// two copies at the same moment
const key = `k-${run}-race`;
const [a, b] = await Promise.all([post(ann, key), post(ann, key)]);
check("two simultaneous copies create one log and both answers name it", [201, 200].includes(a.status) && [201, 200].includes(b.status) && a.json.id === b.json.id && sql(`SELECT COUNT(*) AS n FROM log WHERE user_id='${ann.id}' AND idempotency_key='${key}'`)[0].n === 1, `${a.status} ${b.status} ${a.text} ${b.text}`);
finish();
