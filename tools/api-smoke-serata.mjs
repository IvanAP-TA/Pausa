// Serata end-to-end: the Durable Object room, its alarm (the server closes rounds), WebSocket views, history, repeat, diary link.
// The orchestrator starts the API with SERATA_MATCH_MS=2500, SERATA_TABLE_MS=2500, SERATA_LOBBY_TTL_MS=25000.
import { call, check, finish, mail, run, sql, signIn, base } from "./smoke-lib.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let r;
sql("DELETE FROM rate_limit");
const H = await signIn(mail("host"));
const M = await signIn(mail("memb"));
const O = await signIn(mail("outs"));
const guestRes = await call("POST", "/api/auth/guest", { body: { name: "x" } });
const G = { cookie: guestRes.cookies[0].split(";")[0] };
G.id = (await call("GET", "/api/me", { cookie: G.cookie })).json.id;

const C = (await call("POST", "/api/circles", { cookie: H.cookie, body: { name: "Serate" } })).json;
await call("POST", "/api/circles/join", { cookie: M.cookie, body: { code: C.inviteCode } });
const Other = (await call("POST", "/api/circles", { cookie: O.cookie, body: { name: "Altrove" } })).json;

const T = [];
for (let i = 1; i <= 10; i++) {
  T.push(`sr${i}-${run}`);
  sql(`INSERT INTO media_entity(id,kind,original_title,year,poster_path) VALUES ('${T[i - 1]}','movie','Film ${i}',${2000 + i},'/f${i}.jpg')`);
}
const keys = (n) => T.slice(0, n).map((id) => `local:${id}`);
const create = (who, body) => call("POST", "/api/serate", { cookie: who.cookie, body: { circleId: C.id, mode: "bracket", mediaKeys: keys(3), ...body } });
const act = (who, code, op, body) => call("POST", `/api/serate/${code}/${op}`, { cookie: who.cookie, body: body ?? {} });
const view = async (who, code) => (await call("GET", `/api/serate/${code}`, { cookie: who.cookie })).json;
const join = (who, code, body) => call("POST", `/api/serate/${code}/join`, { cookie: who.cookie, body: body ?? {} });

// ═════════ creating ═════════
r = await call("POST", "/api/serate", { body: {} });
check("creating needs a session", r.status === 401);
r = await create(G, {});
check("a guest cannot create a Serata", r.status === 403, r.text);
r = await call("POST", "/api/serate", { cookie: O.cookie, body: { circleId: C.id, mode: "table", mediaKeys: keys(2) } });
check("a non-member cannot create one in the Cerchia (404)", r.status === 404, r.text);
r = await create(H, { mediaKeys: keys(1) });
check("one title is refused", r.status === 400, r.text);
r = await create(H, { mediaKeys: T.slice(0, 9).map((id) => `local:${id}`) });
check("nine titles are refused", r.status === 400, r.text);
r = await create(H, { mode: "roulette" });
check("an unknown mode is refused", r.status === 400, r.text);
r = await create(H, { mediaKeys: ["local:does-not-exist", `local:${T[0]}`] });
check("an unknown stored title is 404", r.status === 404, r.text);
check("refused attempts left nothing behind", sql(`SELECT COUNT(*) AS n FROM serata WHERE circle_id='${C.id}'`)[0].n === 0);
r = await create(H, { mediaKeys: [`local:${T[0]}`, `local:${T[0]}`] });
check("the same title twice counts once (and one is too few)", r.status === 400, r.text);

sql(`UPDATE circle_member SET muted = 0 WHERE circle_id='${C.id}'`);
r = await create(H, {});
const code = r.json?.code;
check("a Serata is created (201) with a six-character code", r.status === 201 && /^[A-HJ-NP-Z2-9]{6}$/.test(code ?? ""), r.text);
const row = sql(`SELECT id, status, mode, host_id FROM serata WHERE code='${code}'`)[0];
check("its record, seeded candidates and host seat are in D1", row.status === "lobby" && row.mode === "bracket" && row.host_id === H.id && JSON.stringify(sql(`SELECT media_id FROM serata_candidate WHERE serata_id='${row.id}' ORDER BY seed`).map((x) => x.media_id)) === JSON.stringify(T.slice(0, 3)), JSON.stringify(row));
check("the others in the Cerchia are invited, with the room code; the host is not", sql(`SELECT user_id, serata_code FROM notification WHERE type='serata_invite' AND serata_code='${code}'`).map((n) => n.user_id).join() === M.id);

// ═════════ the lobby ═════════
r = await call("GET", `/api/serate/${code}`);
check("state needs a session", r.status === 401);
r = await call("GET", "/api/serate/ZZZZZZ", { cookie: H.cookie });
check("an unknown room is 404", r.status === 404, r.text);
r = await call("GET", "/api/serate/abc", { cookie: H.cookie });
check("a malformed code is 404", r.status === 404);
let v = await view(H, code);
check("host view: lobby, host, joined, titles in seed order, no one has voted", v.status === "lobby" && v.isHost && v.joined && v.candidates.map((c) => c.title).join() === "Film 1,Film 2,Film 3" && v.participants.length === 1 && v.bracket === null, JSON.stringify(v));
v = await view(M, code);
check("a member who has not joined sees the titles but is not in", v.joined === false && v.isHost === false && v.candidates.length === 3);

r = await join(M, code);
check("a member joins under their own name", r.status === 200 && r.json.joined === true && r.json.participants.length === 2 && r.json.participants[1].name.startsWith("memb"), r.text);
r = await join(G, code, {});
check("a guest must give a name", r.status === 400, r.text);
r = await join(G, code, { name: "  Nonna  ", avatar: "🦊" });
check("a guest joins with a name and a guest picture", r.status === 200 && r.json.participants.some((p) => p.name === "Nonna" && p.isGuest && p.image === "emoji:🦊"), r.text);
r = await join(G, code, { name: "Nonna Rosa", avatar: "🍿" });
check("a guest picture outside the eight is ignored; renaming does not duplicate the seat", r.json.participants.length === 3 && r.json.participants.find((p) => p.isGuest).name === "Nonna Rosa" && r.json.participants.find((p) => p.isGuest).image === "emoji:🦊", JSON.stringify(r.json.participants));
r = await join(G, code, { name: "x".repeat(40) });
check("a guest name is cut to 24 characters", r.json.participants.find((p) => p.isGuest).name.length === 24);
r = await join(O, code);
check("any signed-in person with the code can join (the code is the key)", r.status === 200 && r.json.participants.length === 4);
r = await act(O, code, "leave");
check("and can leave again", r.status === 200 && (await view(H, code)).participants.length === 3);

r = await act(M, code, "start");
check("only the host starts (403)", r.status === 403, r.text);
r = await act(M, code, "vote", { mediaId: T[1] });
check("no voting before the start (409)", r.status === 409, r.text);

// ═════════ a bracket, voted by everybody ═════════
r = await act(H, code, "start");
check("the host starts: voting, with the first match s2 vs s3 (s1 has the bye)", r.status === 200 && r.json.status === "voting" && r.json.bracket.a === T[1] && r.json.bracket.b === T[2] && r.json.bracket.roundName === "semi" && r.json.bracket.total === 2, r.text);
check("the match has a server deadline", r.json.bracket.deadline > r.json.serverNow && r.json.bracket.deadline - r.json.serverNow <= 2500);
r = await act(H, code, "start");
check("starting twice is refused (409)", r.status === 409);
const late = await signIn(mail("late"));
r = await join(late, code);
check("nobody new joins once voting started (v1 let anyone in and raised the quorum)", r.status === 409, r.text);
r = await join(M, code);
check("but somebody already in can come back", r.status === 200 && r.json.joined);
r = await act(H, code, "vote", { mediaId: T[0] });
check("a vote must be for one of the two in the match (400)", r.status === 400, r.text);
r = await act(late, code, "vote", { mediaId: T[1] });
check("a stranger cannot vote (403)", r.status === 403, r.text);
r = await act(H, code, "ballot", { dots: { [T[0]]: 3 }, veto: null });
check("a ballot in a bracket is refused (409)", r.status === 409);
r = await act(H, code, "vote", { mediaId: T[1] });
check("host votes s2", r.status === 200 && r.json.bracket.myPick === T[1], r.text);
r = await act(H, code, "vote", { mediaId: T[2] });
check("and changes their mind while it is open", r.json.bracket.myPick === T[2]);
v = await view(M, code);
check("others see that the host voted, never what", v.participants.find((p) => p.id === H.id).voted === true && v.bracket.myPick === null && !JSON.stringify(v).includes('"picks"'));
await act(M, code, "vote", { mediaId: T[1] });
r = await act(G, code, "vote", { mediaId: T[1] });
check("when everybody has voted the round closes at once: s2 wins 2-1 and the final (s1 vs s2) begins", r.status === 200 && r.json.status === "voting" && r.json.bracket.roundName === "final" && r.json.bracket.a === T[0] && r.json.bracket.b === T[1] && r.json.bracket.done === 1, r.text);
await act(H, code, "vote", { mediaId: T[0] });
await act(M, code, "vote", { mediaId: T[0] });
r = await act(G, code, "vote", { mediaId: T[0] });
check("the final closes: s1 wins, status done, a result without any tally", r.json.status === "done" && r.json.result.winner === T[0] && r.json.result.turns === 2 && r.json.result.people === 3 && r.json.result.drew === false && !JSON.stringify(r.json).includes('"votes"'), r.text);
r = await act(H, code, "vote", { mediaId: T[0] });
check("a vote after the end is refused (409)", r.status === 409);
await sleep(300);
const done = sql(`SELECT status, winner_media_id, finished_at, result FROM serata WHERE code='${code}'`)[0];
check("the finished room was written to D1 once: winner, result, finish time", done.status === "done" && done.winner_media_id === T[0] && done.finished_at > 0 && JSON.parse(done.result).turns === 2, JSON.stringify(done));
check("with who took part (names as that night)", sql(`SELECT name FROM serata_participant WHERE serata_id='${row.id}' ORDER BY name`).map((p) => p.name).join().includes("x".repeat(24)), JSON.stringify(sql(`SELECT name FROM serata_participant WHERE serata_id='${row.id}'`)));

// ═════════ public result, history, diary link, repeat ═════════
r = await call("GET", `/api/serate/${code}/result`);
check("the share-card data needs no sign-in: winner, Cerchia, mode, turns, people", r.status === 200 && r.json.winner.title === "Film 1" && r.json.circleName === "Serate" && r.json.mode === "bracket" && r.json.turns === 2 && r.json.people === 3 && r.json.finishedAt > 0, r.text);
check("and shows nobody's votes", !/voted|pick|ballot/i.test(r.text));
r = await call("GET", "/api/serate/ZZZZZZ/result");
check("a result of an unknown room is 404", r.status === 404);
r = await call("GET", `/api/circles/${C.id}/serate`, { cookie: M.cookie });
check("history lists it with its winner and the number of people", r.json.length === 1 && r.json[0].code === code && r.json[0].status === "done" && r.json[0].winner.title === "Film 1" && r.json[0].people === 3 && r.json[0].watched === false, r.text);
r = await call("GET", `/api/circles/${C.id}/serate`, { cookie: late.cookie });
check("history is for members (404 otherwise)", r.status === 404);

const wl = (await call("POST", "/api/logs", { cookie: H.cookie, body: { mediaKey: `local:${T[0]}`, watchedOn: "2026-11-20", circles: [C.id], rating: 8 } })).json.id;
const wrong = (await call("POST", "/api/logs", { cookie: H.cookie, body: { mediaKey: `local:${T[1]}`, watchedOn: "2026-11-20", circles: [C.id] } })).json.id;
r = await call("POST", `/api/serate/${code}/watched`, { cookie: H.cookie, body: { logId: wrong } });
check("'we watched it' must point at a diary entry for the winning title (400)", r.status === 400, r.text);
r = await call("POST", `/api/serate/${code}/watched`, { cookie: M.cookie, body: { logId: wl } });
check("and at one of MY entries (404)", r.status === 404, r.text);
r = await call("POST", `/api/serate/${code}/watched`, { cookie: H.cookie, body: { logId: wl } });
check("host links the diary entry (204)", r.status === 204);
r = await call("GET", `/api/circles/${C.id}/serate`, { cookie: M.cookie });
check("history marks it as watched", r.json[0].watched === true);

r = await call("POST", `/api/serate/${code}/repeat`, { cookie: M.cookie });
check("a member repeats it: same titles and mode in a new room (201)", r.status === 201 && r.json.code !== code, r.text);
const again = r.json.code;
check("the new room remembers where it came from and keeps the seeding", sql(`SELECT repeated_from FROM serata WHERE code='${again}'`)[0].repeated_from === row.id && JSON.stringify(sql(`SELECT media_id FROM serata_candidate WHERE serata_id=(SELECT id FROM serata WHERE code='${again}') ORDER BY seed`).map((x) => x.media_id)) === JSON.stringify(T.slice(0, 3)));
r = await call("POST", `/api/serate/${code}/repeat`, { cookie: late.cookie });
check("an outsider cannot repeat it (404)", r.status === 404);
r = await call("POST", `/api/serate/${code}/repeat`, { cookie: G.cookie });
check("a guest cannot (403)", r.status === 403);

// ═════════ the table: ballots, veto, force ═════════
r = await call("POST", "/api/serate", { cookie: H.cookie, body: { circleId: C.id, mode: "table", mediaKeys: keys(3) } });
const tcode = r.json.code;
await join(M, tcode);
await act(H, tcode, "start");
v = await view(H, tcode);
check("a table has three dots each and a deadline", v.table.dots === 3 && v.table.deadline > v.serverNow && v.bracket === null, JSON.stringify(v.table));
r = await act(H, tcode, "ballot", { dots: { [T[0]]: 4 }, veto: null });
check("four dots are refused", r.status === 400);
r = await act(H, tcode, "ballot", { dots: { [T[0]]: 1 }, veto: null });
check("one dot is refused", r.status === 400);
r = await act(H, tcode, "ballot", { dots: { nope: 3 }, veto: null });
check("an unknown title is refused", r.status === 400);
r = await act(H, tcode, "ballot", { dots: { [T[0]]: 3 }, veto: "nope" });
check("an unknown veto is refused", r.status === 400);
r = await act(H, tcode, "ballot", { dots: { [T[0]]: 3 }, veto: T[1] });
check("a valid ballot is stored", r.status === 200 && r.json.table.myBallot.veto === T[1], r.text);
r = await act(M, tcode, "force");
check("only the host forces (403)", r.status === 403);
r = await act(H, tcode, "force");
check("the host closes the table with the ballots there are", r.status === 200 && r.json.status === "done" && r.json.result.winner === T[0] && r.json.result.scores[0].dots === 3, r.text);
check("the table result lists dots and veto flags, never who", r.json.result.scores.length === 3 && r.json.result.scores.find((s) => s.mediaId === T[1]).vetoed === true && !/userId|voter/.test(JSON.stringify(r.json.result)));

// ═════════ the server owns the clock ═════════
r = await call("POST", "/api/serate", { cookie: H.cookie, body: { circleId: C.id, mode: "table", mediaKeys: keys(2) } });
const silent = r.json.code;
await join(M, silent);
await act(H, silent, "start");
await sleep(3200);
v = await view(M, silent);
check("nobody voted and nobody was looking: the deadline passed and the server closed the table by itself (a draw)", v.status === "done" && !!v.result.winner && v.result.drew === true, JSON.stringify(v));

r = await call("POST", "/api/serate", { cookie: H.cookie, body: { circleId: C.id, mode: "bracket", mediaKeys: keys(2) } });
const slow = r.json.code;
await join(M, slow);
await act(H, slow, "start");
await act(H, slow, "vote", { mediaId: T[1] });
await sleep(3200);
v = await view(H, slow);
check("a round with one vote out of two closes at the deadline for the vote there is (s2 wins), by the alarm", v.status === "done" && v.result.winner === T[1] && v.result.drew === false, JSON.stringify(v.result));
r = await act(M, slow, "vote", { mediaId: T[0] });
check("a late vote is refused", r.status === 409);

// ═════════ leaving ═════════
r = await call("POST", "/api/serate", { cookie: H.cookie, body: { circleId: C.id, mode: "bracket", mediaKeys: keys(2) } });
const lv = r.json.code;
await join(M, lv);
await join(G, lv, { name: "Ospite" });
await act(H, lv, "start");
await act(H, lv, "vote", { mediaId: T[0] });
await act(M, lv, "vote", { mediaId: T[0] });
v = await view(H, lv);
check("two of three have voted: still open", v.status === "voting");
r = await act(G, lv, "leave");
check("the third leaves: the round no longer waits for them and closes", r.status === 200 && (await view(H, lv)).status === "done");

r = await call("POST", "/api/serate", { cookie: H.cookie, body: { circleId: C.id, mode: "table", mediaKeys: keys(2) } });
const hl = r.json.code;
await join(M, hl);
r = await act(H, hl, "leave");
v = await view(M, hl);
check("a host who leaves the lobby hands the room to the next person", v.isHost === true && v.participants.length === 1, JSON.stringify(v.participants));
r = await act(H, hl, "start");
check("and the former host can no longer start it (403: not in the room)", r.status === 403);
r = await act(M, hl, "leave");
v = await view(M, hl);
check("the last one leaving closes it as expired", v.status === "expired");
await sleep(300);
check("an expired room is recorded as such", sql(`SELECT status FROM serata WHERE code='${hl}'`)[0].status === "expired");

r = await call("POST", "/api/serate", { cookie: H.cookie, body: { circleId: C.id, mode: "table", mediaKeys: keys(2) } });
const idle = r.json.code;
await sleep(25600);
v = await view(H, idle);
check("a lobby nobody starts expires by itself", v.status === "expired", JSON.stringify(v.status));
r = await act(H, idle, "start");
check("an expired room cannot be started (409)", r.status === 409);

// ═════════ WebSocket: everybody gets their own view as it changes ═════════
r = await call("POST", "/api/serate", { cookie: H.cookie, body: { circleId: C.id, mode: "bracket", mediaKeys: keys(2) } });
const wcode = r.json.code;
await join(M, wcode);
const ws = (who) =>
  new Promise((resolve, reject) => {
    const url = base.replace(/^http/, "ws") + `/api/serate/${wcode}/ws`;
    let sock;
    try {
      sock = new WebSocket(url, { headers: { cookie: who.cookie } });
    } catch (e) {
      return reject(e);
    }
    const msgs = [];
    sock.onmessage = (e) => {
      try {
        msgs.push(JSON.parse(e.data));
      } catch {
        msgs.push(e.data); // "pong"
      }
    };
    sock.onopen = () => resolve({ sock, msgs });
    sock.onerror = (e) => reject(new Error("ws error " + (e.message ?? "")));
  });
let hws, mws;
try {
  hws = await ws(H);
  mws = await ws(M);
  await sleep(400);
  check("a WebSocket opens with the current view right away", hws.msgs.length === 1 && hws.msgs[0].status === "lobby" && hws.msgs[0].isHost === true && mws.msgs[0].isHost === false, JSON.stringify([hws.msgs, mws.msgs]));
  await act(H, wcode, "start");
  await sleep(400);
  check("starting is pushed to everybody connected", hws.msgs.at(-1).status === "voting" && mws.msgs.at(-1).status === "voting" && mws.msgs.at(-1).version > mws.msgs[0].version);
  await act(M, wcode, "vote", { mediaId: T[1] });
  await sleep(400);
  const hv = hws.msgs.at(-1);
  const mv = mws.msgs.at(-1);
  check("each person gets THEIR view: M sees their own pick, the host only sees that M voted", mv.bracket.myPick === T[1] && hv.bracket.myPick === null && hv.participants.find((p) => p.id === M.id).voted === true);
  hws.sock.send("ping");
  await sleep(300);
  check("a ping is answered with a pong", hws.msgs.includes("pong"));
  await sleep(300);
  await act(H, wcode, "vote", { mediaId: T[1] });
  await sleep(400);
  check("the result reaches both screens at the same moment", hws.msgs.at(-1).status === "done" && mws.msgs.at(-1).status === "done" && mws.msgs.at(-1).result.winner === T[1]);
  hws.sock.close();
  mws.sock.close();
} catch (e) {
  check("WebSocket test could run (Node WebSocket with headers)", false, String(e));
}
const refused = await new Promise((resolve) => {
  const sock = new WebSocket(base.replace(/^http/, "ws") + `/api/serate/${wcode}/ws`);
  sock.onopen = () => {
    sock.close();
    resolve(false);
  };
  sock.onerror = () => resolve(true);
  sock.onclose = () => resolve(true);
  setTimeout(() => resolve(false), 4000);
});
check("a WebSocket without a session is refused", refused);
finish();
