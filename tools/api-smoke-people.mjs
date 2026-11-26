// T4a/T4b end-to-end checks: profile, preferences, favourites, other members' profiles, the notification inbox, lists.
// Titles are inserted straight into D1 and used through `local:<id>` keys, so this suite needs no catalogue.
import { call, check, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

let r;
sql("DELETE FROM rate_limit");
const ann = await signIn(mail("ann"));
const ben = await signIn(mail("ben"));
const cleo = await signIn(mail("cleo"));
const dan = await signIn(mail("dan"));

const mkCircle = async (who, name) => (await call("POST", "/api/circles", { cookie: who.cookie, body: { name } })).json;
const C = await mkCircle(ann, "Casa");
for (const u of [ben, cleo]) await call("POST", "/api/circles/join", { cookie: u.cookie, body: { code: C.inviteCode } });
const C2 = await mkCircle(ben, "Ufficio");
await call("POST", "/api/circles/join", { cookie: ann.cookie, body: { code: C2.inviteCode } });

// Titles, inserted directly.
const M = [];
for (let i = 1; i <= 10; i++) {
  const id = `pm${i}-${run}`;
  M.push(id);
  sql(`INSERT INTO media_entity(id,kind,original_title,year,poster_path) VALUES ('${id}','movie','Titolo ${i}',${1990 + i},'/p${i}.jpg')`);
}
const settings = async (who) => (await call("GET", "/api/me/settings", { cookie: who.cookie })).json;
const notes = (user, type) => sql(`SELECT id, circle_id FROM notification WHERE user_id='${user}' AND type='${type}'`);

// ═════════ profile ═════════
r = await call("PUT", "/api/me/profile", { body: { name: "x" } });
check("profile needs a session", r.status === 401);
r = await call("PUT", "/api/me/profile", { cookie: ann.cookie, body: { name: "   " } });
check("an empty name is refused", r.status === 400, r.text);
r = await call("PUT", "/api/me/profile", { cookie: ann.cookie, body: { name: "x".repeat(41) } });
check("a 41-character name is refused", r.status === 400);
r = await call("PUT", "/api/me/profile", { cookie: ann.cookie, body: { name: "Ann", avatar: "javascript:alert(1)" } });
check("an avatar outside the list is refused", r.status === 400, r.text);
r = await call("PUT", "/api/me/profile", { cookie: ann.cookie, body: { name: "  Ann Lee ", bio: "  Amo il noir.  ", genres: ["horror", "horror", "nope", "anime", "drama", "comedy", "war", "western"], avatar: "🍿" } });
check("profile saved (204)", r.status === 204, r.text);
let st = await settings(ann);
check("name trimmed, bio trimmed, genres cleaned to five known ones in order, avatar stored as emoji:", st.name === "Ann Lee" && st.bio === "Amo il noir." && JSON.stringify(st.genres) === JSON.stringify(["horror", "anime", "drama", "comedy", "war"]) && st.image === "emoji:🍿", JSON.stringify(st));
r = await call("PUT", "/api/me/profile", { cookie: ann.cookie, body: { name: "Ann Lee", bio: "y".repeat(1000), genres: [], avatar: "" } });
st = await settings(ann);
check("a very long bio is cut to 280, an empty avatar keeps the picture, genres can be cleared", st.bio.length === 280 && st.image === "emoji:🍿" && st.genres.length === 0, JSON.stringify([st.bio.length, st.image, st.genres]));
await call("PUT", "/api/me/profile", { cookie: ann.cookie, body: { name: "Ann Lee", bio: "   ", avatar: "none" } });
st = await settings(ann);
check("'none' goes back to the initial; a blank bio clears it", st.image === null && st.bio === null);

// ═════════ preferences ═════════
r = await call("PUT", "/api/me/settings", { cookie: ann.cookie, body: {} });
check("an empty preferences change is refused", r.status === 400);
r = await call("PUT", "/api/me/settings", { cookie: ann.cookie, body: { country: "XX" } });
check("an unknown country is refused", r.status === 400);
r = await call("PUT", "/api/me/settings", { cookie: ann.cookie, body: { locale: "fr" } });
check("an unsupported language is refused", r.status === 400);
r = await call("PUT", "/api/me/settings", { cookie: ann.cookie, body: { notifyOff: ["reaction", "bogus"] } });
check("an unknown notification type is refused (and nothing is half-saved)", r.status === 400 && (await settings(ann)).notifyOff.length === 0);
r = await call("PUT", "/api/me/settings", { cookie: ann.cookie, body: { locale: "en", country: "IT", emailDigest: true, notifyOff: ["reaction", "comment", "comment"] } });
st = await settings(ann);
check("preferences saved; notifyOff deduplicated", r.status === 204 && st.locale === "en" && st.country === "IT" && st.emailDigest === true && JSON.stringify(st.notifyOff) === JSON.stringify(["comment", "reaction"]), JSON.stringify(st));
await call("PUT", "/api/me/settings", { cookie: ann.cookie, body: { locale: "", country: "", notifyOff: [] } });
st = await settings(ann);
check("empty values reset to 'follow the browser', no country, nothing switched off", st.locale === null && st.country === null && st.notifyOff.length === 0 && st.emailDigest === true);

// per-Cerchia switches
r = await call("PUT", `/api/circles/${C.id}/me`, { cookie: ben.cookie, body: { muted: true } });
check("muting a Cerchia (204)", r.status === 204);
st = await settings(ben);
check("settings list my Cerchie with their switches", st.circles.length === 2 && st.circles.find((c) => c.circleId === C.id).muted === true && st.circles.find((c) => c.circleId === C2.id).muted === false, JSON.stringify(st.circles));
r = await call("PUT", `/api/circles/${C.id}/me`, { cookie: dan.cookie, body: { muted: true } });
check("an outsider cannot touch a Cerchia's switches (404)", r.status === 404);
r = await call("PUT", `/api/circles/${C.id}/me`, { cookie: ben.cookie, body: {} });
check("an empty switch change is refused", r.status === 400);

// the switches really silence things
const share = (who, media, circles, extra = {}) =>
  call("POST", "/api/logs", { cookie: who.cookie, body: { mediaKey: `local:${media}`, watchedOn: "2026-11-10", circles, ...extra } });
await call("PUT", "/api/me/settings", { cookie: cleo.cookie, body: { notifyOff: ["log"] } });
r = await share(ann, M[0], [C.id], { rating: 9 });
check("a viewing shared with Casa notifies nobody who muted it or switched 'log' off", notes(ben.id, "log").length === 0 && notes(cleo.id, "log").length === 0);
await call("PUT", `/api/circles/${C.id}/me`, { cookie: ben.cookie, body: { muted: false } });
r = await share(ann, M[1], [C.id], { rating: 8 });
check("an unmuted member is notified", notes(ben.id, "log").length === 1 && notes(ann.id, "log").length === 0);

// ═════════ favourites ═════════
for (let i = 0; i < 5; i++) {
  r = await call("POST", "/api/me/favorites", { cookie: ann.cookie, body: { mediaId: M[i] } });
  if (r.status !== 204) check(`favourite ${i} accepted`, false, r.text);
}
r = await call("POST", "/api/me/favorites", { cookie: ann.cookie, body: { mediaId: M[0] } });
check("pinning one already there is fine", r.status === 204);
r = await call("POST", "/api/me/favorites", { cookie: ann.cookie, body: { mediaId: M[5] } });
check("a sixth favourite is refused (the shelf holds five)", r.status === 409, r.text);
r = await call("POST", "/api/me/favorites", { cookie: ann.cookie, body: { mediaId: "nope" } });
check("an unknown title is 404", r.status === 404 || r.status === 409, r.text);
st = await settings(ann);
check("favourites come back in order with titles", st.favorites.length === 5 && st.favorites[0].id === M[0] && st.favorites[0].title === "Titolo 1" && st.favorites[4].id === M[4], JSON.stringify(st.favorites.map((f) => f.title)));
r = await call("DELETE", `/api/me/favorites/${M[1]}`, { cookie: ann.cookie });
r = await call("POST", "/api/me/favorites", { cookie: ann.cookie, body: { mediaId: M[5] } });
st = await settings(ann);
check("removing makes room; the new one goes to the end", r.status === 204 && st.favorites.length === 5 && st.favorites[4].id === M[5], JSON.stringify(st.favorites.map((f) => f.title)));

// ═════════ other members' profiles ═════════
// ann and ben rate the same three titles; cleo shares nothing.
await share(ann, M[2], [C.id], { rating: 3 });
await share(ben, M[0], [C.id], { rating: 9 });
await share(ben, M[1], [C.id], { rating: 7 });
await share(ben, M[2], [C.id], { rating: 3 });
await share(ben, M[6], [C2.id], { rating: 10 }); // shared only in Ufficio
r = await call("GET", `/api/circles/${C.id}/people/${ben.id}`, { cookie: ann.cookie });
const pb = r.json;
check("a member's profile: viewings shared in THIS Cerchia only", r.status === 200 && pb.logs === 3 && pb.person.id === ben.id, r.text);
check("average rating in this Cerchia (9+7+3)/3", Math.abs(pb.avgRating - 19 / 3) < 1e-9, String(pb.avgRating));
check("loved = rated 8+ here, not what was shared elsewhere", pb.loved.length === 1 && pb.loved[0].id === M[0], JSON.stringify(pb.loved.map((l) => l.title)));
check("taste match with the viewer over three shared titles", pb.tasteCommon === 3 && Math.abs(pb.tasteMatch - (1 - 1 / 3 / 9)) < 1e-9, JSON.stringify([pb.tasteCommon, pb.tasteMatch]));
r = await call("GET", `/api/circles/${C.id}/people/${cleo.id}`, { cookie: ann.cookie });
check("someone with nothing shared still has a profile; no match yet", r.json.logs === 0 && r.json.avgRating === null && r.json.tasteMatch === null && r.json.loved.length === 0, r.text);
r = await call("GET", `/api/circles/${C.id}/people/${ann.id}`, { cookie: ann.cookie });
check("my own profile has no taste match with myself", r.json.tasteMatch === null && r.json.favorites.length === 5, r.text);
r = await call("GET", `/api/circles/${C.id}/people/${dan.id}`, { cookie: ann.cookie });
check("a person who is not in the Cerchia is 404", r.status === 404);
r = await call("GET", `/api/circles/${C.id}/people/${ben.id}`, { cookie: dan.cookie });
check("an outsider cannot read profiles (404)", r.status === 404);
r = await call("GET", `/api/circles/${C2.id}/people/${ben.id}`, { cookie: ann.cookie });
check("the same person in another Cerchia shows that Cerchia's viewings", r.json.logs === 1 && r.json.loved[0]?.id === M[6]);

// ═════════ notification inbox ═════════
r = await call("GET", "/api/notifications", { cookie: ben.cookie });
const inbox = r.json;
check("inbox: items with actor, Cerchia and title; unread counted", r.status === 200 && inbox.items.length >= 2 && inbox.unread === inbox.items.filter((i) => !i.read).length && inbox.items[0].actor?.name && inbox.items[0].circleName === "Casa" && inbox.items.some((i) => i.type === "log" && i.media?.title === "Titolo 2"), r.text.slice(0, 300));
r = await call("GET", "/api/notifications");
check("inbox needs a session", r.status === 401);
r = await call("GET", `/api/notifications?circle=${C2.id}`, { cookie: ben.cookie });
check("filtering by Cerchia", r.json.items.every((i) => i.circleId === C2.id));
// join notices from the setup exist in both Cerchie for ben (owner of Ufficio: ann joined)
const before = (await call("GET", "/api/notifications", { cookie: ben.cookie })).json.unread;
r = await call("POST", "/api/notifications/read", { cookie: ben.cookie, body: { circleId: C.id } });
const mid = (await call("GET", "/api/notifications", { cookie: ben.cookie })).json;
check("reading one Cerchia's notices leaves the others unread (v1 marked everything)", r.status === 204 && mid.items.filter((i) => i.circleId === C.id).every((i) => i.read) && mid.items.some((i) => i.circleId === C2.id && !i.read) && mid.unread < before, JSON.stringify([before, mid.unread]));
await call("POST", "/api/notifications/read", { cookie: ben.cookie, body: {} });
check("reading all", (await call("GET", "/api/notifications", { cookie: ben.cookie })).json.unread === 0);

// pagination across identical timestamps
for (let i = 0; i < 35; i++) sql(`INSERT INTO notification(id,user_id,type,actor_id,circle_id,created_at) VALUES ('pn-${run}-${String(i).padStart(2, "0")}','${cleo.id}','log','${ann.id}','${C.id}',1900000000000)`);
let page = await call("GET", "/api/notifications", { cookie: cleo.cookie });
const seen = new Set();
let pages = 0;
while (true) {
  pages++;
  for (const i of page.json.items) seen.add(i.id);
  if (!page.json.next) break;
  page = await call("GET", `/api/notifications?before=${encodeURIComponent(page.json.next)}`, { cookie: cleo.cookie });
}
check("35+ notices with the same timestamp: two pages, none skipped or repeated", pages === 2 && [...seen].filter((i) => i.startsWith("pn-")).length === 35, `pages=${pages} seen=${seen.size}`);
check("the unread counter caps at 100", (await call("GET", "/api/notifications", { cookie: cleo.cookie })).json.unread >= 35);
r = await call("POST", `/api/circles/${C2.id}/leave`, { cookie: ann.cookie });
check("ann leaves Ufficio", r.status === 204);
sql(`INSERT INTO notification(id,user_id,type,actor_id,circle_id,created_at) VALUES ('gone-${run}','${ann.id}','log','${ben.id}','${C2.id}',1950000000000)`);
r = await call("GET", "/api/notifications", { cookie: ann.cookie });
check("notices about a Cerchia I left are not shown", !r.json.items.some((i) => i.id === `gone-${run}`));

// ═════════ lists ═════════
r = await call("POST", "/api/lists", { cookie: ann.cookie, body: { name: "   " } });
check("a list needs a name", r.status === 400);
r = await call("POST", "/api/lists", { cookie: ann.cookie, body: { name: "x".repeat(81) } });
check("a name over 80 characters is refused", r.status === 400);
r = await call("POST", "/api/lists", { cookie: dan.cookie, body: { name: "Intruso", circleId: C.id } });
check("a list in a Cerchia needs membership (404)", r.status === 404);
const guest = await call("POST", "/api/auth/guest", { body: { name: "Ospite" } });
r = await call("POST", "/api/lists", { cookie: guest.cookies[0].split(";")[0], body: { name: "Guest list" } });
check("a guest cannot create lists", r.status === 403);
r = await call("POST", "/api/lists", { cookie: ann.cookie, body: { name: "  Da vedere ", kind: "watchlist" } });
const wl = r.json.id;
check("a personal watchlist is created", r.status === 201 && !!wl);
r = await call("POST", "/api/lists", { cookie: ann.cookie, body: { name: "Classifica Casa", kind: "weird", circleId: C.id, description: "Giovedì" } });
const gl = r.json.id;
check("a group list; an unknown kind becomes an ordinary list", r.status === 201 && sql(`SELECT kind FROM list WHERE id='${gl}'`)[0].kind === "list");
r = await call("GET", `/api/lists?circle=${C.id}`, { cookie: ann.cookie });
check("overview: my personal lists and the Cerchia's, watchlist first", r.json.length === 2 && r.json[0].kind === "watchlist" && r.json[1].circleId === C.id && r.json[1].description === "Giovedì", r.text);
r = await call("GET", `/api/lists?circle=${C.id}`, { cookie: ben.cookie });
check("ben sees the group list but not ann's personal one", r.json.length === 1 && r.json[0].id === gl, r.text);
r = await call("GET", `/api/lists?circle=${C.id}`, { cookie: dan.cookie });
check("an outsider asking for a Cerchia's lists is 404", r.status === 404);
r = await call("GET", `/api/lists/${wl}`, { cookie: ben.cookie });
check("another person's personal list does not exist (404)", r.status === 404);
r = await call("GET", `/api/lists/${gl}`, { cookie: dan.cookie });
check("nor does a group list I am not in (404)", r.status === 404);

// items
const add = (who, id, body) => call("POST", `/api/lists/${id}/items`, { cookie: who.cookie, body });
r = await add(ann, wl, { mediaId: M[3], note: "per sabato", priority: 2 });
check("add a title by id with note and priority", r.status === 201 && r.json.added === true, r.text);
r = await add(ann, wl, { mediaId: M[3] });
check("adding it again changes nothing", r.status === 200 && r.json.added === false);
// overview card data: the owner's name and the strip of titles (a "ranking" kind is kept as such)
r = await call("POST", "/api/lists", { cookie: ann.cookie, body: { name: "Top di Ann", kind: "ranking", circleId: C.id } });
const rk = r.json.id;
check("a ranking list is created and keeps its kind", r.status === 201 && sql(`SELECT kind FROM list WHERE id='${rk}'`)[0].kind === "ranking", r.text);
await add(ann, rk, { mediaId: M[3] });
await add(ann, rk, { mediaId: M[4] });
r = await call("GET", `/api/lists?circle=${C.id}&locale=it`, { cookie: ben.cookie });
const card = r.json.find((l) => l.id === rk);
check("overview carries the owner's name and the strip in order (id, title, posterPath)", !!card && typeof card.ownerName === "string" && card.ownerName.length > 0 && card.strip.length === 2 && card.strip[0].id === M[3] && card.strip[1].id === M[4] && card.strip.every((m) => m.title && "posterPath" in m), r.text);
r = await call("GET", `/api/lists/${wl}?locale=it`, { cookie: ann.cookie });
check("detail carries the same fields on its list", r.json.list.ownerName.length > 0 && r.json.list.strip.length === 1 && r.json.list.strip[0].id === M[3], r.text);
r = await add(ann, wl, { mediaId: "does-not-exist" });
check("an unknown title is 404", r.status === 404, r.text);
r = await add(ann, wl, { mediaId: M[4], priority: 5 });
check("priority above 3 is refused", r.status === 400);
r = await add(ann, wl, { mediaId: M[4], note: "n".repeat(281) });
check("a note over 280 characters is refused", r.status === 400);
r = await add(ann, wl, {});
check("a title must be named", r.status === 400);
r = await add(ben, wl, { mediaId: M[4] });
check("nobody else adds to my personal list (404)", r.status === 404);
for (const m of [M[4], M[5], M[6]]) await add(ann, wl, { mediaId: m });
r = await add(ben, gl, { mediaId: M[7] });
check("any member adds to a group list", r.status === 201);
await add(ann, gl, { mediaId: M[8] });
r = await call("GET", `/api/lists/${wl}`, { cookie: ann.cookie });
check("detail: titles in order with note, priority and who added them", r.json.items.length === 4 && r.json.items[0].media.id === M[3] && r.json.items[0].note === "per sabato" && r.json.items[0].priority === 2 && r.json.items.map((i) => i.position).join() === "0,1,2,3" && r.json.canEdit && r.json.canDelete && r.json.list.posters.length === 4, JSON.stringify(r.json.items.map((i) => [i.media.title, i.position])));
r = await call("GET", `/api/lists/${gl}`, { cookie: ben.cookie });
check("group detail shows who added what and what ben may do", r.json.items[0].addedBy.name.startsWith("ben") && r.json.canEdit === true && r.json.canDelete === false, r.text);

// reorder
const order = [M[6], M[3], M[5], M[4]];
r = await call("PUT", `/api/lists/${wl}/order`, { cookie: ann.cookie, body: { mediaIds: order } });
check("reorder in one call", r.status === 204);
r = await call("GET", `/api/lists/${wl}`, { cookie: ann.cookie });
check("the new order is stored", JSON.stringify(r.json.items.map((i) => i.media.id)) === JSON.stringify(order));
r = await call("PUT", `/api/lists/${wl}/order`, { cookie: ann.cookie, body: { mediaIds: [M[6], M[3], M[5]] } });
check("an order that misses a title is refused", r.status === 400);
r = await call("PUT", `/api/lists/${wl}/order`, { cookie: ann.cookie, body: { mediaIds: [M[6], M[3], M[5], M[5]] } });
check("an order with a repeat is refused", r.status === 400);
r = await call("PUT", `/api/lists/${wl}/order`, { cookie: ann.cookie, body: { mediaIds: [M[6], M[3], M[5], M[9]] } });
check("an order naming a stranger title is refused", r.status === 400);

// edit / remove
r = await call("PATCH", `/api/lists/${wl}/items/${M[6]}`, { cookie: ann.cookie, body: { note: "  ", priority: 3 } });
r = await call("GET", `/api/lists/${wl}`, { cookie: ann.cookie });
check("note cleared, priority set", r.json.items[0].note === null && r.json.items[0].priority === 3);
r = await call("PATCH", `/api/lists/${wl}/items/${M[9]}`, { cookie: ann.cookie, body: { priority: 1 } });
check("editing a title that is not in the list is 404", r.status === 404);
r = await call("DELETE", `/api/lists/${wl}/items/${M[3]}`, { cookie: ann.cookie });
r = await call("GET", `/api/lists/${wl}`, { cookie: ann.cookie });
check("removing closes the gap in positions", r.json.items.length === 3 && r.json.items.map((i) => i.position).join() === "0,1,2" && !r.json.items.some((i) => i.media.id === M[3]), JSON.stringify(r.json.items.map((i) => i.position)));

// rename / delete
r = await call("PATCH", `/api/lists/${gl}`, { cookie: ben.cookie, body: { name: "  Casa: top  ", description: "" } });
r = await call("GET", `/api/lists/${gl}`, { cookie: cleo.cookie });
check("any member renames a group list; an empty description clears it", r.json.list.name === "Casa: top" && r.json.list.description === null, r.text);
r = await call("DELETE", `/api/lists/${gl}`, { cookie: cleo.cookie });
check("a plain member cannot delete a group list (403)", r.status === 403);
await call("PUT", `/api/circles/${C.id}/members/${cleo.id}/role`, { cookie: ann.cookie, body: { role: "admin" } });
// duplicate before deleting
r = await call("POST", `/api/lists/${gl}/duplicate`, { cookie: ben.cookie, body: {} });
const dup = r.json.id;
r = await call("GET", `/api/lists/${dup}`, { cookie: ben.cookie });
check("duplicate: a personal copy with the same titles, owned by the copier", r.json.list.name === "Casa: top (copia)" && r.json.list.circleId === null && r.json.items.length === 2 && r.json.list.ownerId === ben.id, r.text);
r = await call("POST", `/api/lists/${gl}/duplicate`, { cookie: dan.cookie, body: {} });
check("one cannot duplicate a list one cannot see (404)", r.status === 404);
r = await call("DELETE", `/api/lists/${gl}`, { cookie: cleo.cookie });
check("a manager of the Cerchia can delete a group list", r.status === 204);
r = await call("GET", `/api/lists/${gl}`, { cookie: ann.cookie });
check("it is gone", r.status === 404);
check("its titles went with it", sql(`SELECT COUNT(*) AS n FROM list_item WHERE list_id='${gl}'`)[0].n === 0 && sql(`SELECT COUNT(*) AS n FROM list_item WHERE list_id='${dup}'`)[0].n === 2);
r = await call("DELETE", `/api/lists/${wl}`, { cookie: ben.cookie });
check("another person's personal list cannot be deleted (404)", r.status === 404);

// the 200 title cap
const big = (await call("POST", "/api/lists", { cookie: ann.cookie, body: { name: "Enorme" } })).json.id;
const capIds = Array.from({ length: 200 }, (_, i) => `cap${i}-${run}`);
sql(`INSERT INTO media_entity(id,kind,original_title) VALUES ${capIds.map((id) => `('${id}','movie','B')`).join(",")}`);
sql(`INSERT INTO list_item(list_id,media_id,position,added_by) VALUES ${capIds.map((id, i) => `('${big}','${id}',${i},'${ann.id}')`).join(",")}`);
r = await add(ann, big, { mediaId: M[9] });
check("a list holds at most 200 titles: the 201st is refused", r.status === 409, `status=${r.status} ${r.text}`);
r = await call("DELETE", `/api/lists/${big}/items/${capIds[0]}`, { cookie: ann.cookie });
r = await add(ann, big, { mediaId: M[9] });
check("and there is room again after removing one", r.status === 201, `status=${r.status} ${r.text}`);

// ═════════ person page: titles, kinds, loved ratings, what they are watching ═════════
r = await call("GET", `/api/circles/${C.id}/people/${ben.id}`, { cookie: ann.cookie });
check("person page: distinct titles and the split per kind", r.json.titles === 3 && JSON.stringify(r.json.kinds) === JSON.stringify([{ kind: "movie", count: 3 }]), JSON.stringify([r.json.titles, r.json.kinds]));
check("person page: loved comes with its rating in half stars, same order", JSON.stringify(r.json.lovedRatings) === "[9]", JSON.stringify(r.json.lovedRatings));
sql(`INSERT INTO watch_progress(user_id,media_id,season,episode,status,updated_at) VALUES ('${ben.id}','${M[3]}',2,5,'watching',${Date.now()})`);
sql(`UPDATE circle SET live_watching=1 WHERE id='${C.id}'`);
sql(`UPDATE circle_member SET hide_watching=0 WHERE circle_id='${C.id}'`);
r = await call("GET", `/api/circles/${C.id}/people/${ben.id}`, { cookie: ann.cookie });
check("person page: shows what they are watching, with the episode", r.json.watching?.media.id === M[3] && r.json.watching.season === 2 && r.json.watching.episode === 5, JSON.stringify(r.json.watching));
sql(`UPDATE circle_member SET hide_watching=1 WHERE circle_id='${C.id}' AND user_id='${ben.id}'`);
r = await call("GET", `/api/circles/${C.id}/people/${ben.id}`, { cookie: ann.cookie });
check("person page: nothing when they hide it", r.json.watching === null);
sql(`UPDATE circle_member SET hide_watching=0 WHERE circle_id='${C.id}' AND user_id='${ben.id}'`);
sql(`UPDATE circle_member SET hide_watching=1 WHERE circle_id='${C.id}' AND user_id='${ann.id}'`);
r = await call("GET", `/api/circles/${C.id}/people/${ben.id}`, { cookie: ann.cookie });
check("person page: nothing when the viewer hides theirs (no peeking)", r.json.watching === null);
sql(`UPDATE circle_member SET hide_watching=0 WHERE circle_id='${C.id}' AND user_id='${ann.id}'`);
sql(`UPDATE circle SET live_watching=0 WHERE id='${C.id}'`);
r = await call("GET", `/api/circles/${C.id}/people/${ben.id}`, { cookie: ann.cookie });
check("person page: nothing when the Cerchia switched live watching off", r.json.watching === null);
sql(`UPDATE circle SET live_watching=1 WHERE id='${C.id}'`);

// ═════════ invitation preview, native guest, CORS (found by the client work) ═════════
r = await call("GET", `/api/invites/${C.inviteCode.toLowerCase()}`);
check("invite preview needs no sign-in: name, members, state", r.status === 200 && r.json.circleName === "Casa" && r.json.members === 3 && r.json.state === "active", r.text);
sql(`UPDATE invite SET revoked_at = 1 WHERE code='${C.inviteCode}'`);
r = await call("GET", `/api/invites/${C.inviteCode}`);
check("a revoked invite says so", r.json.state === "revoked");
check("a dead invite gives the reason and nothing about the Cerchia (no name, no head count)", r.json.circleName === "" && r.json.members === 0, r.text);
sql(`UPDATE invite SET revoked_at = NULL, expires_at = 1 WHERE code='${C.inviteCode}'`);
r = await call("GET", `/api/invites/${C.inviteCode}`);
check("an expired invite says so, and keeps the Cerchia private", r.json.state === "expired" && r.json.circleName === "", r.text);
sql(`UPDATE invite SET expires_at = NULL WHERE code='${C.inviteCode}'`);
sql(`UPDATE invite SET revoked_at = NULL WHERE code='${C.inviteCode}'`);
r = await call("GET", "/api/invites/ZZZZZZZZ");
check("an unknown code is 404", r.status === 404);
r = await call("GET", "/api/invites/ab");
check("a malformed code is 404, not an error", r.status === 404);
sql("DELETE FROM rate_limit WHERE key LIKE 'invite:ip:%'");
let last;
for (let i = 0; i < 62; i++) last = await call("GET", "/api/invites/ZZZZZZZZ");
check("guessing codes is limited per IP (429 after 60 an hour)", last.status === 429 && last.json?.code === "rate_limited", String(last.status));
sql("DELETE FROM rate_limit");

r = await call("POST", "/api/auth/guest", { body: { name: "App", native: true } });
check("a native guest gets a token in the body and no cookie", r.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(r.json?.token ?? "") && r.cookies.length === 0, r.text);
r = await call("GET", "/api/me", { headers: { authorization: `Bearer ${r.json.token}` } });
check("and the token works as Bearer", r.status === 200 && r.json.isAnonymous === true);

// ═════════ profile page numbers: visions, private visions, people brought ═════════
{
  const mine = async (who) => (await call("GET", "/api/me/settings", { cookie: who.cookie })).json;
  const annLogs = Number(sql(`SELECT COUNT(*) AS n FROM log WHERE user_id='${ann.id}'`)[0].n);
  const annPrivate = Number(sql(`SELECT COUNT(*) AS n FROM log l WHERE l.user_id='${ann.id}' AND NOT EXISTS (SELECT 1 FROM log_share s WHERE s.log_id = l.id)`)[0].n);
  st = await mine(ann);
  check("settings count my visions and the ones only mine", st.logs === annLogs && st.privateLogs === annPrivate && st.privateLogs <= st.logs, JSON.stringify([st.logs, st.privateLogs, annLogs, annPrivate]));
  const broughtByAnn = Number(sql(`SELECT COUNT(DISTINCT u.user_id) AS n FROM invite_use u JOIN invite i ON i.id = u.invite_id WHERE i.created_by='${ann.id}' AND u.user_id <> '${ann.id}'`)[0].n);
  check("ann brought ben and cleo", st.brought === broughtByAnn && st.brought === 2, String(st.brought));
  st = await mine(dan);
  check("dan brought nobody and has no visions", st.brought === 0 && st.logs === 0 && st.privateLogs === 0, JSON.stringify(st));
  r = await call("DELETE", "/api/account", { cookie: dan.cookie, body: { confirm: true, email: "not-my-address@example.test" } });
  check("deleting the account with another email typed is refused, and nothing goes", r.status === 400 && (await call("GET", "/api/me", { cookie: dan.cookie })).status === 200, r.text);
}

const ORIGIN = "http://localhost:8081";
r = await call("OPTIONS", "/api/me", { headers: { origin: ORIGIN, "access-control-request-method": "GET" } });
check("CORS preflight for the configured origin", r.status === 204 && r.headers.get("access-control-allow-origin") === ORIGIN && r.headers.get("access-control-allow-credentials") === "true" && /PUT/.test(r.headers.get("access-control-allow-methods") ?? ""), JSON.stringify([...r.headers]));
r = await call("GET", "/api/me", { cookie: ann.cookie, headers: { origin: ORIGIN } });
check("and the real answer carries the headers", r.status === 200 && r.headers.get("access-control-allow-origin") === ORIGIN);
r = await call("OPTIONS", "/api/me", { headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
check("another origin gets no CORS permission", !r.headers.get("access-control-allow-origin"), JSON.stringify([...r.headers]));
r = await call("GET", "/api/me", { cookie: ann.cookie, headers: { origin: "https://evil.example" } });
check("not even on a normal request", !r.headers.get("access-control-allow-origin"));
r = await call("GET", "/api/me", { cookie: ann.cookie });
check("without an Origin header nothing changes", r.status === 200 && !r.headers.get("access-control-allow-origin"));
finish();
