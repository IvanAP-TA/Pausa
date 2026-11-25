// Sample data for development, written through the public API (so it exercises the same rules as real use).
//   node tools/seed-dev.mjs http://localhost:8798     (needs the mock catalogue: `node tools/dev-stack.mjs --seed` does it all)
// People: giulia (owner of "Divano"), marco, anna, luca. Everything is local; the data is meant to be thrown away.
const base = (process.argv[2] ?? "http://localhost:8798").replace(/\/$/, "");

async function call(method, url, { cookie, body } = {}) {
  const res = await fetch(base + url, { method, redirect: "manual", headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, cookies: res.headers.getSetCookie?.() ?? [] };
}

async function signIn(email, name) {
  const r = await call("POST", "/api/auth/magic-link", { body: { email, next: "/", locale: "it" } });
  if (!r.json?.devLink) throw new Error("no devLink for " + email + ": " + r.text);
  const link = new URL(r.json.devLink);
  const v = await call("GET", link.pathname + link.search);
  const cookie = v.cookies.find((c) => c.startsWith("pausa_session="))?.split(";")[0];
  if (!cookie) throw new Error("no cookie for " + email);
  const me = (await call("GET", "/api/me", { cookie })).json;
  await call("PUT", "/api/me/profile", { cookie, body: { name, bio: `Sono ${name}.`, genres: ["drama", "scifi"], avatar: ["🍿", "🎬", "📼", "🦊"][name.length % 4] } });
  return { cookie, id: me.id, email, name };
}

const must = (r, what) => {
  if (r.status >= 300) throw new Error(`${what} failed: ${r.status} ${r.text}`);
  return r.json;
};

const giulia = await signIn("giulia@pausa.test", "Giulia");
const marco = await signIn("marco@pausa.test", "Marco");
const anna = await signIn("anna@pausa.test", "Anna");
const luca = await signIn("luca@pausa.test", "Luca");

const divano = must(await call("POST", "/api/circles", { cookie: giulia.cookie, body: { name: "Divano" } }), "circle");
for (const u of [marco, anna, luca]) must(await call("POST", "/api/circles/join", { cookie: u.cookie, body: { code: divano.inviteCode } }), "join");
await call("PUT", `/api/circles/${divano.id}/members/${marco.id}/role`, { cookie: giulia.cookie, body: { role: "admin" } });
const ufficio = must(await call("POST", "/api/circles", { cookie: marco.cookie, body: { name: "Ufficio" } }), "circle 2");
for (const u of [giulia, anna]) must(await call("POST", "/api/circles/join", { cookie: u.cookie, body: { code: ufficio.inviteCode } }), "join 2");

const log = async (who, key, extra) => must(await call("POST", "/api/logs", { cookie: who.cookie, body: { mediaKey: key, watchedOn: "2026-10-01", circles: [divano.id], locale: "it", ...extra } }), `log ${key}`);
const matrix = "tmdb:movie:603", seven = "tmdb:movie:807", amelie = "tmdb:movie:194", inception = "tmdb:movie:27205", bb = "tmdb:tv:1396", op = "tmdb:tv:37854";
const logs = {};
logs.g1 = await log(giulia, matrix, { rating: 9, review: "Ancora attualissimo.", watchedOn: "2026-09-12", platform: "Netflix" });
logs.g2 = await log(giulia, seven, { rating: 10, review: "Il finale: la scatola… (spoiler)", containsSpoilers: true, watchedOn: "2026-09-20", watchedWith: [marco.id] });
logs.m1 = await log(marco, matrix, { rating: 7, review: "Bello, ma troppo lungo il finale.", watchedOn: "2026-09-13" });
logs.m2 = await log(marco, inception, { rating: 8, watchedOn: "2026-10-02", circles: [divano.id, ufficio.id] });
logs.a1 = await log(anna, amelie, { rating: 9, review: "Dolcissimo.", watchedOn: "2026-10-03" });
logs.a2 = await log(anna, seven, { rating: 3, review: "Troppo cupo per me.", watchedOn: "2026-10-04" });
logs.l1 = await log(luca, inception, { rating: 6, watchedOn: "2026-10-05" });
logs.l2 = await log(luca, bb, { season: 2, episode: 5, rating: 9, watchedOn: "2026-10-06", review: "La seconda stagione decolla." });
await log(giulia, bb, { season: 1, episode: 3, watchedOn: "2026-10-07" });
must(await call("POST", "/api/logs", { cookie: giulia.cookie, body: { mediaKey: amelie, watchedOn: "2026-10-08", review: "Solo per me.", circles: [] } }), "private log");

const comment = async (who, circle, log, body, extra) => must(await call("POST", `/api/circles/${circle}/logs/${log}/comments`, { cookie: who.cookie, body: { body, ...extra } }), "comment");
const c1 = await comment(marco, divano.id, logs.g1.id, "Lo rivedo domani!");
await comment(giulia, divano.id, logs.g1.id, "Fallo, poi ne parliamo.", { parentId: c1.id });
await comment(anna, divano.id, logs.g2.id, "Quando scopri cos'è nella scatola…", { isSpoiler: true });
for (const [who, log, emoji] of [[marco, logs.g1.id, "🍿"], [anna, logs.g1.id, "❤️"], [luca, logs.g2.id, "🤯"], [giulia, logs.a1.id, "😂"]]) {
  await call("POST", `/api/circles/${divano.id}/logs/${log}/reactions`, { cookie: who.cookie, body: { emoji } });
}

const wl = must(await call("POST", "/api/lists", { cookie: giulia.cookie, body: { name: "Da vedere", kind: "watchlist" } }), "watchlist");
for (const [key, priority, note] of [[amelie, 2, "con Anna"], [inception, 0, null], [op, 1, null]]) await call("POST", `/api/lists/${wl.id}/items`, { cookie: giulia.cookie, body: { mediaKey: key, priority, note } });
const gl = must(await call("POST", "/api/lists", { cookie: giulia.cookie, body: { name: "Serate a tema: thriller", circleId: divano.id } }), "group list");
for (const key of [seven, matrix]) await call("POST", `/api/lists/${gl.id}/items`, { cookie: marco.cookie, body: { mediaKey: key } });

await call("PUT", `/api/media/${logs.l2.mediaId}/progress`, { cookie: luca.cookie, body: { season: 2, episode: 6 } });

// A finished Serata (Torneo lampo, three titles, voted by the three who were in the room).
const room = must(await call("POST", "/api/serate", { cookie: giulia.cookie, body: { circleId: divano.id, mode: "bracket", mediaKeys: [matrix, seven, amelie] } }), "serata");
for (const u of [marco, anna]) await call("POST", `/api/serate/${room.code}/join`, { cookie: u.cookie, body: {} });
await call("POST", `/api/serate/${room.code}/start`, { cookie: giulia.cookie, body: {} });
const state = async (u) => (await call("GET", `/api/serate/${room.code}`, { cookie: u.cookie })).json;
for (let round = 0; round < 2; round++) {
  const s = await state(giulia);
  if (s.status !== "voting") break;
  for (const u of [giulia, marco, anna]) await call("POST", `/api/serate/${room.code}/vote`, { cookie: u.cookie, body: { mediaId: s.bracket.a } });
}
// An open lobby, to try joining.
const open = must(await call("POST", "/api/serate", { cookie: marco.cookie, body: { circleId: divano.id, mode: "table", mediaKeys: [matrix, seven, amelie, inception] } }), "open serata");

console.log(JSON.stringify({ people: ["giulia", "marco", "anna", "luca"].map((n) => `${n}@pausa.test`), circles: { divano: divano.id, ufficio: ufficio.id }, inviteCodeDivano: divano.inviteCode, finishedSerata: room.code, openSerata: open.code }, null, 2));
