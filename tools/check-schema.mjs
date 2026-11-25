import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const sql = fs.readFileSync(process.argv[2], "utf8");
const db = new DatabaseSync(":memory:");
db.exec(sql);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const indexes = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").get();
console.log("tables", tables.length, "explicit indexes", indexes.n);
console.log("sqlite", db.prepare("select sqlite_version() v").get().v);

// Behaviour checks.
const now = Date.now();
db.exec("INSERT INTO user(id,name,email) VALUES ('a','A','a@x'),('b','B','b@x')");
db.exec("INSERT INTO circle(id,name,created_by) VALUES ('c1','C','a')");
db.exec("INSERT INTO circle_member(circle_id,user_id,role) VALUES ('c1','a','owner')");
let ok = false;
try { db.exec("INSERT INTO circle_member(circle_id,user_id,role) VALUES ('c1','b','owner')"); } catch (e) { ok = /UNIQUE/.test(String(e)); }
console.log("second owner rejected:", ok);
db.exec("INSERT INTO circle_member(circle_id,user_id,role) VALUES ('c1','b','member')");
db.exec("INSERT INTO media_entity(id,kind,tmdb_id,original_title) VALUES ('m1','movie',1,'X'),('m2','tv',NULL,'Y'),('m3','tv',NULL,'Z')");
db.exec("INSERT INTO media_entity(id,kind,original_title) VALUES ('m4','movie','no ids'),('m5','movie','no ids 2')"); // partial unique: many NULLs allowed
console.log("many titles without external ids allowed: true");
ok = false;
try { db.exec("INSERT INTO media_entity(id,kind,tmdb_id,original_title) VALUES ('m9','movie',1,'dup')"); } catch (e) { ok = /UNIQUE/.test(String(e)); }
console.log("duplicate (kind,tmdb_id) rejected:", ok);
ok = false;
try { db.exec("INSERT INTO log(id,user_id,media_id,watched_on,rating) VALUES ('l0','a','m1','2026-01-01',11)"); } catch (e) { ok = /CHECK/.test(String(e)); }
console.log("rating 11 rejected:", ok);
db.exec("INSERT INTO log(id,user_id,media_id,watched_on,rating) VALUES ('l1','a','m1','2026-01-01',9)");
db.exec("INSERT INTO comment(id,log_id,circle_id,user_id,body) VALUES ('k1','l1','c1','b','hi')");
db.exec("INSERT INTO reaction(log_id,circle_id,user_id,emoji) VALUES ('l1','c1','b','x')");
db.exec("DELETE FROM user WHERE id='b'");
console.log("deleting a user removes their comment and reaction:",
  db.prepare("select (select count(*) from comment) c, (select count(*) from reaction) r").get());
db.exec("DELETE FROM circle WHERE id='c1'");
console.log("fk violations:", db.prepare("PRAGMA foreign_key_check").all().length);

// Query plans for the hot reads: none may scan a whole table.
const plans = {
  session_lookup: "SELECT user_id FROM session WHERE token_hash = 'x'",
  diary: "SELECT * FROM log WHERE user_id='a' ORDER BY watched_on DESC, created_at DESC LIMIT 20",
  circle_feed: "SELECT l.* FROM log_share s JOIN log l ON l.id=s.log_id WHERE s.circle_id='c1' ORDER BY s.created_at DESC LIMIT 20",
  thread: "SELECT * FROM comment WHERE log_id='l1' AND circle_id='c1' ORDER BY created_at",
  ranking: "SELECT media_id, avg(rating) FROM rating_current WHERE circle_id='c1' GROUP BY media_id",
  rating_refresh: "DELETE FROM rating_current WHERE user_id='a' AND media_id='m1'",
  feed_filter_by_person: "SELECT l.id FROM log_share s JOIN log l ON l.id=s.log_id WHERE s.circle_id='c1' AND l.user_id='a' ORDER BY s.created_at DESC LIMIT 20",
  my_circles: "SELECT circle_id FROM circle_member WHERE user_id='a'",
  inbox: "SELECT * FROM notification WHERE user_id='a' ORDER BY created_at DESC LIMIT 30",
};
for (const [k, q] of Object.entries(plans)) {
  const rows = db.prepare("EXPLAIN QUERY PLAN " + q).all().map((r) => r.detail);
  const scan = rows.some((d) => /^SCAN/.test(d) && !/USING (COVERING )?INDEX/.test(d));
  console.log((scan ? "SCAN  " : "ok    ") + k.padEnd(15), rows.join(" ; "));
}
