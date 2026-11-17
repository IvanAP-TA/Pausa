/* Writes seed/load.sql: a big group ("Gruppone": 10 friends, 700 titles, about 300 logs each, with reactions, comments and
 * "watched with") so pages can be timed with realistic volume. Not part of the normal seed.
 *   node scripts/gen-load-seed.cjs && npm run db:seed:load      (then sign in as giulia and open "Gruppone")
 * Deterministic (fixed random seed), so two runs give the same data. */
const fs = require("fs");

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const USERS = 10, TITLES = 700, LOGS_PER_USER = 300;
const names = ["Anna", "Bruno", "Carla", "Dario", "Elena", "Fabio", "Gaia", "Hugo", "Irene", "Jacopo"];
const out = ["PRAGMA foreign_keys = ON;"];

out.push("INSERT INTO user (id, name, email, email_verified, is_anonymous, locale) VALUES");
out.push(names.slice(0, USERS).map((n, i) => `  ('u-load-${i}', ${q(n)}, ${q(n.toLowerCase() + "@load.test")}, 1, 0, 'it')`).join(",\n") + ";");
out.push("INSERT INTO circle (id, name, created_by) VALUES ('c-load', 'Gruppone', 'u-giulia');");
out.push("INSERT INTO circle_member (circle_id, user_id, role, joined_at) VALUES\n  ('c-load', 'u-giulia', 'admin', (unixepoch() - 86400 * 400) * 1000),\n" +
  names.slice(0, USERS).map((_, i) => `  ('c-load', 'u-load-${i}', 'member', (unixepoch() - 86400 * ${300 - i}) * 1000)`).join(",\n") + ";");

const kinds = ["movie", "movie", "movie", "tv", "anime"];
const media = [];
for (let i = 0; i < TITLES; i++) media.push({ id: `m-load-${i}`, kind: pick(kinds), year: 1950 + Math.floor(rnd() * 75), title: `Titolo di prova ${i}` });
for (let i = 0; i < media.length; i += 50) {
  out.push("INSERT INTO media_entity (id, kind, original_title, year, runtime_min) VALUES\n" +
    media.slice(i, i + 50).map((m) => `  (${q(m.id)}, ${q(m.kind)}, ${q(m.title)}, ${m.year}, ${80 + Math.floor(rnd() * 80)})`).join(",\n") + ";");
}

const everyone = ["u-giulia", ...names.slice(0, USERS).map((_, i) => `u-load-${i}`)];
const logs = [];
for (const u of everyone) {
  const mine = new Set();
  for (let i = 0; i < LOGS_PER_USER; i++) {
    const m = pick(media);
    const day = Math.floor(rnd() * 700);
    const rating = rnd() < 0.85 ? 1 + Math.floor(rnd() * 10) : null;
    logs.push({ id: `l-load-${logs.length}`, u, m: m.id, day, rating, review: rnd() < 0.3 ? "Una riga a caldo, abbastanza lunga da occupare spazio nella pagina e nel database." : null, rewatch: mine.has(m.id) ? 1 : 0, secs: day * 86400 + Math.floor(rnd() * 80000) });
    mine.add(m.id);
  }
}
for (let i = 0; i < logs.length; i += 40) {
  out.push("INSERT INTO log (id, user_id, media_id, watched_on, rating, review, contains_spoilers, platform, is_rewatch, created_at) VALUES\n" +
    logs.slice(i, i + 40).map((l) => `  (${q(l.id)}, ${q(l.u)}, ${q(l.m)}, date('now','-${l.day} day'), ${l.rating ?? "NULL"}, ${l.review ? q(l.review) : "NULL"}, 0, 'Netflix', ${l.rewatch}, (unixepoch() - ${l.secs}) * 1000)`).join(",\n") + ";");
}
const emojis = ["😭", "🍿", "❤️", "😂", "🤯"];
const reactions = [];
for (const l of logs) if (rnd() < 0.4) for (const u of everyone.filter(() => rnd() < 0.3)) if (u !== l.u) reactions.push(`(${q(l.id)}, ${q(u)}, ${q(pick(emojis))})`);
for (let i = 0; i < reactions.length; i += 80) out.push("INSERT OR IGNORE INTO reaction (log_id, user_id, emoji) VALUES\n  " + reactions.slice(i, i + 80).join(",\n  ") + ";");
const comments = [];
for (const l of logs) if (rnd() < 0.15) comments.push(`(${q("k-" + l.id)}, ${q(l.id)}, ${q(pick(everyone))}, 'Bellissimo, da rivedere.', 0, (unixepoch() - ${l.secs - 600}) * 1000)`);
for (let i = 0; i < comments.length; i += 80) out.push("INSERT INTO comment (id, log_id, user_id, body, is_spoiler, created_at) VALUES\n  " + comments.slice(i, i + 80).join(",\n  ") + ";");

fs.writeFileSync("seed/load.sql", out.join("\n") + "\n");
console.log(`seed/load.sql: ${logs.length} logs, ${reactions.length} reactions, ${comments.length} comments`);
