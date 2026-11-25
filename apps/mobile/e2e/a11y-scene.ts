// The data the accessibility specs look at: a Cerchia built through the API with the same shape as the dev seed (tools/seed-dev.mjs): four
// people, nine viewings with ratings, reviews, a spoiler, an episode, comments and reactions, a watchlist and a group list, a finished
// Serata and an open one. It is built on FRESH accounts for every run (the seeded addresses allow 5 sign-in links per 10 minutes and the
// seeded Cerchia has a 30-member cap and joining is limited per hour, so a loop of runs would lock itself out), and the people who LOOK at the
// screens are members of it who sign in again for each test (`signInAs`). The API allows 3 sign-in links per address every 10 minutes, so there are
// eight such members (each signs in once here and twice later, 3 in all) besides the owner (who signs in once).
import { expect, type Browser } from "@playwright/test";
import { apiAs, login, type State } from "./a11y-support";

export type Scene = {
  circle: string;
  invite: string;
  log: string;
  spoilerLog: string;
  media: string;
  member: string;
  list: string;
  doneCode: string;
  openCode: string;
  /** The Cerchia's members, in order: the owner, then eight more. */
  emails: string[];
};

const K = { matrix: "tmdb:movie:603", seven: "tmdb:movie:807", amelie: "tmdb:movie:194", inception: "tmdb:movie:27205", bb: "tmdb:tv:1396", op: "tmdb:tv:37854" };

export async function buildScene(browser: Browser): Promise<Scene> {
  const run = Date.now().toString(36);
  const people = await Promise.all(["owner", "ana", "bruno", "carla", "dora", "elena", "fabio", "gina", "livio"].map(async (n) => {
    const state = await login(browser, `axe-${n}-${run}@pausa.test`);
    const a = await apiAs(browser, state);
    return { n, email: `axe-${n}-${run}@pausa.test`, state, ...a, id: (await a.call<{ id: string }>("GET", "/api/me")).json.id };
  }));
  const [o, ana, bruno, carla, ...others] = people;
  const made = await o.call<{ id: string; inviteCode: string }>("POST", "/api/circles", { name: "Divano" });
  expect(made.status).toBe(201);
  const circle = made.json.id;
  for (const p of [ana, bruno, carla, ...others]) expect((await p.call("POST", "/api/circles/join", { code: made.json.inviteCode })).status).toBe(200);
  const log = async (p: (typeof people)[number], mediaKey: string, extra: Record<string, unknown> = {}) => {
    const r = await p.call<{ id: string; mediaId: string }>("POST", "/api/logs", { mediaKey, watchedOn: "2026-10-01", locale: "it", circles: [circle], ...extra });
    expect(r.status, `log ${mediaKey}`).toBe(201);
    return r.json;
  };
  const g1 = await log(o, K.matrix, { rating: 9, review: "Ancora attualissimo.", platform: "Netflix", watchedOn: "2026-09-12" });
  const g2 = await log(o, K.seven, { rating: 10, review: "Il finale: la scatola (spoiler)", containsSpoilers: true, watchedWith: [ana.id], watchedOn: "2026-09-20" });
  await log(ana, K.matrix, { rating: 7, review: "Bello, ma troppo lungo il finale." });
  await log(ana, K.inception, { rating: 8 });
  await log(bruno, K.amelie, { rating: 9, review: "Dolcissimo." });
  await log(bruno, K.seven, { rating: 3, review: "Troppo cupo per me." });
  await log(carla, K.inception, { rating: 6 });
  await log(carla, K.bb, { season: 2, episode: 5, rating: 9, review: "La seconda stagione decolla." });
  await o.call("POST", "/api/logs", { mediaKey: K.amelie, watchedOn: "2026-10-08", review: "Solo per me.", locale: "it", circles: [] });
  const c1 = await ana.call<{ id: string }>("POST", `/api/circles/${circle}/logs/${g1.id}/comments`, { body: "Lo rivedo domani!" });
  await o.call("POST", `/api/circles/${circle}/logs/${g1.id}/comments`, { body: "Fallo, poi ne parliamo.", parentId: c1.json.id });
  await bruno.call("POST", `/api/circles/${circle}/logs/${g2.id}/comments`, { body: "Quando scopri cos'è nella scatola...", isSpoiler: true });
  for (const [p, l, emoji] of [[ana, g1.id, "🍿"], [bruno, g1.id, "❤️"], [carla, g2.id, "🤯"]] as const) await p.call("POST", `/api/circles/${circle}/logs/${l}/reactions`, { emoji });
  const wl = await o.call<{ id: string }>("POST", "/api/lists", { name: "Da vedere", kind: "watchlist" });
  for (const [key, priority, note] of [[K.amelie, 2, "con Anna"], [K.inception, 0, null], [K.op, 1, null]] as const) await o.call("POST", `/api/lists/${wl.json.id}/items`, { mediaKey: key, priority, note });
  const gl = await o.call<{ id: string }>("POST", "/api/lists", { name: "Serate a tema: thriller", circleId: circle });
  for (const key of [K.seven, K.matrix]) await ana.call("POST", `/api/lists/${gl.json.id}/items`, { mediaKey: key });
  // a finished Serata: three people, two rounds
  const room = await o.call<{ code: string }>("POST", "/api/serate", { circleId: circle, mode: "bracket", mediaKeys: [K.matrix, K.seven, K.amelie] });
  for (const p of [ana, bruno]) await p.call("POST", `/api/serate/${room.json.code}/join`, {});
  await o.call("POST", `/api/serate/${room.json.code}/start`, {});
  for (let round = 0; round < 2; round++) {
    const s = (await o.call<{ status: string; bracket: { a: string } }>("GET", `/api/serate/${room.json.code}`)).json;
    if (s.status !== "voting") break;
    for (const p of [o, ana, bruno]) await p.call("POST", `/api/serate/${room.json.code}/vote`, { mediaId: s.bracket.a });
  }
  const open = await ana.call<{ code: string }>("POST", "/api/serate", { circleId: circle, mode: "table", mediaKeys: [K.matrix, K.seven, K.amelie, K.inception] });
  const feed = (await o.call<{ items: Array<{ id: string; media: { id: string } }> }>("GET", `/api/circles/${circle}/feed?locale=it`)).json.items;
  const lists = (await o.call<Array<{ id: string }>>("GET", `/api/lists?circle=${circle}`)).json;
  const scene: Scene = {
    circle,
    invite: made.json.inviteCode,
    log: g1.id,
    spoilerLog: g2.id,
    media: feed[0].media.id,
    member: ana.id,
    list: lists[0]?.id ?? wl.json.id,
    doneCode: room.json.code,
    openCode: open.json.code,
    emails: people.map((p) => p.email),
  };
  for (const p of people) await p.ctx.close();
  return scene;
}

let turn = 0;
/**
 * Signs in as one of the eight members who are not the owner (the owner wrote the spoiler, so the owner would see it unhidden), taking
 * turns: sixteen sign-ins in a run, two each, which with the one of the scene is the 3 per 10 minutes the API allows per address.
 */
export async function signInAs(browser: Browser, scene: Scene): Promise<State> {
  return login(browser, scene.emails[1 + (turn++ % 8)]);
}
