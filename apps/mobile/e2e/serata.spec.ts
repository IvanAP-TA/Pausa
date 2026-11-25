// A real Serata in real browsers: three people (a member who hosts, a member, a guest with no account) play a Tournament and a Table
// against the local API, over the WebSocket, with the server's timer, a dropped socket, the result card and the history.
// Needs the API (see README.md). Skipped, loudly, when it is not running. Short rounds: start the API with SERATA_MATCH_MS=8000
// SERATA_TABLE_MS=10000 (node tools/dev-stack.mjs, which reads those variables).
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { api, BASE, circleOf, it, person, signIn, API, type Person } from "./clientb-helpers";

let apiUp = false;
test.beforeAll(async () => {
  try {
    apiUp = (await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    apiUp = false;
  }
});
test.beforeEach(() => test.skip(!apiUp, `API not running on ${API}: start it (see README.md). These tests did NOT run.`));
test.describe.configure({ mode: "serial" });

const MATCH_MS = Number(process.env.SERATA_MATCH_MS ?? 8000);

/** Adds a title to the new Serata by searching it (the mock catalogue knows "matrix", "breaking" and "one piece"). */
async function addBySearch(page: Page, query: string, title: string) {
  await page.getByLabel(it.serata.search, { exact: true }).fill(query);
  await page.getByRole("button", { name: `Aggiungi ${title}`, exact: true }).click();
}

const radio = (page: Page, title: string) => page.getByRole("radio", { name: new RegExp(`^${title}`) });
/** A solid-colour PNG, built by hand: the catalogue's poster paths are made up, so the test serves its own artwork (with the CORS header TMDB sends). */
function solidPng(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const row = Buffer.alloc(w * 3 + 1);
  for (let x = 0; x < w; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const png = (buf: Buffer) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), magic: buf.subarray(1, 4).toString() });

test.describe("a Serata with a member host, another member and a guest", () => {
  let host: Person, memb: Person, guest: Person;
  let circleId = "";
  let inviteCode = "";
  let code = "";

  test("the host builds a Tournament: search, add three titles, change the seeding with the buttons, open the room", async ({ browser }) => {
    host = await person(browser, "host");
    memb = await person(browser, "memb");
    guest = await person(browser, "guest");
    await signIn(host.page, host.email, "/it/home");
    const c = await circleOf(host, "Serate di prova");
    circleId = c.id;
    inviteCode = c.inviteCode;
    await signIn(memb.page, memb.email, "/it/home");
    expect((await api(memb, "POST", "/api/circles/join", { code: inviteCode })).status).toBe(200);

    const { page } = host;
    await page.goto(`/it/c/${circleId}/serate`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(it.serata.title);
    // two titles are the minimum: the button says why it waits
    await expect(page.getByTestId("create-serata")).toBeDisabled();
    await addBySearch(page, "matrix", "Matrix");
    await addBySearch(page, "one piece", "One Piece");
    await addBySearch(page, "breaking", "Breaking Bad");
    const items = page.getByTestId("picked-list").getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("Matrix");
    await expect(items.nth(2)).toContainText("Breaking Bad");
    // the accessible way to reorder: Breaking Bad up one place. The order is the seeding.
    await page.getByRole("button", { name: "Sposta Breaking Bad più in alto" }).click();
    await expect(items.nth(1)).toContainText("Breaking Bad");
    await expect(items.nth(2)).toContainText("One Piece");
    await expect(page.getByText("Breaking Bad ora è in posizione 2.")).toBeVisible();
    // and put it back (Matrix, One Piece, Breaking Bad: seeds 1, 2, 3)
    await page.getByRole("button", { name: "Sposta One Piece più in alto" }).click();
    await expect(items.nth(1)).toContainText("One Piece");
    await expect(page.getByTestId("create-serata")).toBeEnabled();
    await page.getByTestId("create-serata").click();
    await page.waitForURL(/\/it\/s\/[A-HJ-NP-Z2-9]{6}$/);
    code = page.url().split("/").pop()!;
    await expect(page.getByTestId("room-code")).toHaveText(code);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(it.serata.title);
  });

  test("a guest with no account sees the door, gives a name and a picture, and is in the room; a member joins with one press", async () => {
    const g = guest.page;
    await g.goto(`/it/s/${code}`);
    await expect(g.getByRole("heading", { level: 1 })).toContainText(it.serata.join.title);
    // a name is needed
    await expect(g.getByTestId("guest-join")).toBeDisabled();
    await g.getByLabel(it.serata.join.name).fill("Nonna Rosa");
    await g.getByRole("radio", { name: "🦊" }).click();
    await expect(g.getByRole("radio", { name: "🦊" })).toHaveAttribute("aria-checked", "true");
    await g.getByTestId("guest-join").click();
    await expect(g.getByTestId("room-code")).toHaveText(code);
    await expect(g.getByTestId("person-Nonna Rosa")).toContainText(it.serata.guest);
    await expect(g.getByTestId("start")).toHaveCount(0); // a guest is never the host

    const m = memb.page;
    await m.goto(`/it/s/${code}`);
    await expect(m.getByTestId("join")).toBeVisible(); // signed in, not in the room yet
    await m.getByTestId("join").click();
    await expect(m.getByTestId("room-code")).toHaveText(code);
    // the host sees both arrive, pushed (no reload)
    await expect(host.page.getByTestId("person-Nonna Rosa")).toBeVisible();
    await expect(host.page.locator('[data-testid^="person-"]')).toHaveCount(3);
    await expect(g.getByText(it.serata.lobby.wait.replace("{name}", host.name))).toBeVisible();
  });

  test("the Tournament: everybody votes with their own phone; the picks are theirs alone; the final decides; the same result on every screen", async () => {
    await host.page.getByTestId("start").click();
    for (const p of [host, memb, guest]) {
      await expect(p.page.getByTestId("round-name")).toContainText(it.serata.round.semi);
      await expect(p.page.getByTestId("round-name")).toContainText("Sfida 1 di 2");
      await expect(p.page.getByTestId("countdown")).toBeVisible();
    }
    // semi: One Piece (seed 2) against Breaking Bad (seed 3). Two vote Breaking Bad, the guest One Piece.
    await radio(host.page, "Breaking Bad").click();
    // optimistic: my pick is marked at once, and nobody else sees WHICH
    await expect(radio(host.page, "Breaking Bad")).toHaveAttribute("aria-checked", "true");
    await expect(host.page.getByTestId("pick-hint")).toContainText(it.serata.pickedWait);
    await expect(memb.page.getByTestId("voted-count")).toContainText("1 su 3");
    await expect(radio(memb.page, "Breaking Bad")).toHaveAttribute("aria-checked", "false");
    await expect(radio(memb.page, "One Piece")).toHaveAttribute("aria-checked", "false");
    // changing one's mind is allowed while the match is open
    await radio(host.page, "One Piece").click();
    await expect(radio(host.page, "One Piece")).toHaveAttribute("aria-checked", "true");
    await expect(radio(host.page, "Breaking Bad")).toHaveAttribute("aria-checked", "false");
    await radio(host.page, "Breaking Bad").click();
    await radio(memb.page, "Breaking Bad").click();
    await radio(guest.page, "One Piece").click();
    // all three voted: the round closes at once and the final (Matrix, who had the bye, against the winner) begins
    for (const p of [host, memb, guest]) await expect(p.page.getByTestId("round-name")).toContainText(it.serata.round.final);
    for (const p of [host, memb, guest]) await expect(p.page.getByTestId("round-name")).toContainText("Sfida 2 di 2");
    await expect(radio(host.page, "Matrix")).toBeVisible();
    await expect(radio(host.page, "Breaking Bad")).toBeVisible();
    await radio(host.page, "Matrix").click();
    await radio(memb.page, "Matrix").click();
    await radio(guest.page, "Breaking Bad").click();
    for (const p of [host, memb, guest]) {
      await expect(p.page.getByTestId("winner-title")).toHaveText("Matrix");
      await expect(p.page.getByTestId("result")).toContainText("2 turni");
      await expect(p.page.getByTestId("result")).toContainText("3 persone");
      await expect(p.page.getByTestId("drew")).toHaveCount(0);
    }
    // the screen and the API show the outcome, never who voted what
    const view = await api<Record<string, unknown>>(memb, "GET", `/api/serate/${code}`);
    expect(JSON.stringify(view.json)).not.toMatch(/picks|votes|ballots|voter/i);
    // the guest, who has no account, is offered to keep the Serata
    await expect(guest.page.getByText(it.serata.result.saveTitle)).toBeVisible();
    await expect(host.page.getByText(it.serata.result.saveTitle)).toHaveCount(0);
  });

  test("the result card: story 1080x1920 and link preview 1200x630 are drawn on the device and downloaded as PNG", async () => {
    const { page } = host;
    // real artwork this time: a red poster, so the drawn card can be checked for it
    await page.route("https://image.tmdb.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: solidPng(40, 60, [255, 0, 0]) }));
    await page.getByTestId("open-card").click();
    await expect(page.getByTestId("card-preview")).toBeVisible();
    const story = page.waitForEvent("download");
    await page.getByTestId("card-save").click();
    const d1 = await story;
    expect(d1.suggestedFilename()).toBe(`pausa-serata-${code}-story.png`);
    const b1 = readFileSync((await d1.path())!);
    expect(png(b1)).toEqual({ w: 1080, h: 1920, magic: "PNG" });
    // the poster box (x 220..860, y 300..1260) is the red artwork, not the placeholder dye; the ground outside it is the petrol dark
    const pixel = (x: number, y: number) =>
      page.evaluate(
        async ({ b64, x, y }) => {
          // decoded as an <img> (img-src allows data:); fetch("data:...") would be refused by the page's connect-src
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          return Array.from(ctx.getImageData(x, y, 1, 1).data);
        },
        { b64: b1.toString("base64"), x, y },
      );
    expect(await pixel(540, 780)).toEqual([255, 0, 0, 255]);
    const ground = await pixel(20, 20);
    expect(ground[0]).toBeLessThan(30);
    expect(ground[2]).toBeGreaterThan(ground[0]);
    await expect(page.getByText("Immagine salvata.")).toBeVisible();
    await page.getByRole("radio", { name: "Anteprima link (1200×630)" }).click();
    const og = page.waitForEvent("download");
    await page.getByTestId("card-save").click();
    const d2 = await og;
    const b2 = readFileSync((await d2.path())!);
    expect(png(b2)).toEqual({ w: 1200, h: 630, magic: "PNG" });
    await d1.saveAs(`${process.env.CLIENTB_SHOTS ?? "test-results"}/card-story.png`).catch(() => undefined);
    await d2.saveAs(`${process.env.CLIENTB_SHOTS ?? "test-results"}/card-og.png`).catch(() => undefined);
  });

  test("somebody with no session sees the public result of a finished Serata, with the card, and no way in", async ({ browser }) => {
    const stranger = await person(browser, "stranger");
    await stranger.page.goto(`/it/s/${code}`);
    await expect(stranger.page.getByTestId("public-winner")).toHaveText("Matrix");
    await expect(stranger.page.getByRole("button", { name: it.serata.result.share })).toBeVisible();
    await expect(stranger.page.getByTestId("guest-join")).toHaveCount(0);
    await stranger.ctx.close();
  });

  test("history: the finished Serata is a card with its winner; 'Ripeti' opens a new room with the same titles", async () => {
    const { page } = host;
    await page.goto(`/it/c/${circleId}/serate`);
    const card = page.getByTestId(`serata-${code}`);
    await expect(card).toContainText("Scelto: Matrix");
    await expect(card).toContainText("3 persone");
    await page.getByTestId(`repeat-${code}`).click();
    await page.waitForURL(/\/it\/s\/[A-HJ-NP-Z2-9]{6}$/);
    const again = page.url().split("/").pop()!;
    expect(again).not.toBe(code);
    await expect(page.getByTestId("room-code")).toHaveText(again);
    await expect(page.getByText("Matrix").first()).toBeVisible();
    await expect(page.getByText("One Piece").first()).toBeVisible();
    await expect(page.getByText("Breaking Bad").first()).toBeVisible();
  });

  test("'we watched it': the host picks one of THEIR diary entries of the winner, and the history says so", async () => {
    const { page } = host;
    // the host has no entry of Matrix yet: the sheet says so and offers the log form
    await page.goto(`/it/c/${circleId}/serate`);
    await page.getByTestId(`watched-${code}`).click();
    await expect(page.getByText("Non hai ancora registrato Matrix.")).toBeVisible();
    await expect(page.getByRole("link", { name: it.serata.result.log })).toHaveAttribute("href", /\/it\/log\?media=/);
    await page.getByRole("button", { name: it.app.close }).click();
    // now write one (as the log screen would) and pick it
    const results = await api<Array<{ key: string; title: string }>>(host, "GET", "/api/media/search?q=matrix&locale=it");
    const key = results.json.find((r) => r.title === "Matrix")!.key;
    const made = await api(host, "POST", "/api/logs", { mediaKey: key, watchedOn: "2026-11-20", circles: [circleId], rating: 8 });
    expect(made.status).toBe(201);
    await page.reload();
    await page.getByTestId(`watched-${code}`).click();
    await page.getByRole("button", { name: /Collega la visione del/ }).click();
    await expect(page.getByTestId(`serata-${code}`)).toContainText("Visto insieme");
    await expect(page.getByTestId(`watched-${code}`)).toHaveCount(0);
  });
});

test.describe("the clock belongs to the server", () => {
  test("a round nobody finishes is closed by the server at its deadline; the screen shows the countdown and only follows", async ({ browser }) => {
    const host = await person(browser, "clockhost");
    const memb = await person(browser, "clockmemb");
    await signIn(host.page, host.email);
    const c = await circleOf(host, "Orologio");
    await signIn(memb.page, memb.email);
    await api(memb, "POST", "/api/circles/join", { code: c.inviteCode });
    // two titles through the API (what the form does), then both people play in the browser
    const key = async (q: string) => (await api<Array<{ key: string }>>(host, "GET", `/api/media/search?q=${q}&locale=it`)).json[0].key;
    const made = await api<{ code: string }>(host, "POST", "/api/serate", { circleId: c.id, mode: "bracket", mediaKeys: [await key("matrix"), await key("breaking")] });
    const code = made.json.code;
    await host.page.goto(`/it/s/${code}`);
    await memb.page.goto(`/it/s/${code}`);
    await memb.page.getByTestId("join").click();
    await expect(host.page.locator('[data-testid^="person-"]')).toHaveCount(2);
    await host.page.getByTestId("start").click();
    await expect(memb.page.getByTestId("countdown")).toBeVisible();
    const started = Date.now();
    await radio(host.page, "Matrix").click(); // one vote of two; the other person looks away
    await expect(memb.page.getByTestId("winner-title")).toHaveText("Matrix", { timeout: MATCH_MS + 8000 });
    const took = Date.now() - started;
    // it did NOT close at once (the other vote was missing) and it did close by itself near the deadline
    expect(took).toBeGreaterThan(MATCH_MS - 3000);
    await expect(host.page.getByTestId("winner-title")).toHaveText("Matrix");
    await host.ctx.close();
    await memb.ctx.close();
  });
});

test.describe("a dropped connection", () => {
  test("the socket dies: the screen says so, keeps up by polling, and goes back to live when the socket is allowed again", async ({ browser }) => {
    const host = await person(browser, "dropnhost");
    const memb = await person(browser, "dropnmemb");
    await signIn(host.page, host.email);
    const c = await circleOf(host, "Linea");
    await signIn(memb.page, memb.email);
    await api(memb, "POST", "/api/circles/join", { code: c.inviteCode });
    const key = async (q: string) => (await api<Array<{ key: string }>>(host, "GET", `/api/media/search?q=${q}&locale=it`)).json[0].key;
    const made = await api<{ code: string }>(host, "POST", "/api/serate", { circleId: c.id, mode: "bracket", mediaKeys: [await key("matrix"), await key("breaking")] });
    const code = made.json.code;

    // memb's sockets go through a relay we can cut: while `cut` is true no new connection is accepted
    let cut = false;
    const live: Array<{ close: () => void }> = [];
    let opened = 0;
    await memb.page.routeWebSocket(/\/api\/serate\/.*\/ws/, (ws) => {
      if (cut) {
        ws.close();
        return;
      }
      opened++;
      const server = ws.connectToServer();
      live.push({ close: () => ws.close() });
      void server;
    });
    await host.page.goto(`/it/s/${code}`);
    await memb.page.goto(`/it/s/${code}`);
    await memb.page.getByTestId("join").click();
    await expect(memb.page.getByTestId("room-code")).toHaveText(code);
    await expect.poll(() => opened).toBeGreaterThan(0);
    await expect(memb.page.getByTestId("connection-note")).toHaveCount(0); // live: nothing to say

    // the network drops
    cut = true;
    live.forEach((s) => s.close());
    await expect(memb.page.getByTestId("connection-note")).toContainText("Connessione instabile");
    // meanwhile the host starts the Serata: memb has no socket, and still sees it (polling every 3 s)
    await host.page.getByTestId("start").click();
    await expect(memb.page.getByTestId("round-name")).toBeVisible({ timeout: 9000 });
    // and a vote cast from memb's screen still goes through
    await radio(memb.page, "Matrix").click();
    await expect(radio(memb.page, "Matrix")).toHaveAttribute("aria-checked", "true");

    // the network is back: the next retry opens the socket and the note goes away
    const before = opened;
    cut = false;
    await expect.poll(() => opened, { timeout: 20_000 }).toBeGreaterThan(before);
    await expect(memb.page.getByTestId("connection-note")).toHaveCount(0, { timeout: 10_000 });
    // live again: the host's vote reaches memb's screen with no polling (the result is pushed)
    await radio(host.page, "Breaking Bad").click();
    await expect(memb.page.getByTestId("winner-title")).toBeVisible({ timeout: 6000 });
    await host.ctx.close();
    await memb.ctx.close();
  });
});

test.describe("the Table", () => {
  test("three dots each and one veto: the form checks before it sends, the vote can be changed, the host closes the round, the scores show the veto", async ({ browser }) => {
    const host = await person(browser, "tblhost");
    const memb = await person(browser, "tblmemb");
    await signIn(host.page, host.email);
    const c = await circleOf(host, "Tavolo");
    await signIn(memb.page, memb.email);
    await api(memb, "POST", "/api/circles/join", { code: c.inviteCode });
    const key = async (q: string) => (await api<Array<{ key: string }>>(host, "GET", `/api/media/search?q=${q}&locale=it`)).json[0].key;
    const made = await api<{ code: string }>(host, "POST", "/api/serate", { circleId: c.id, mode: "table", mediaKeys: [await key("matrix"), await key("breaking"), await key("one piece")] });
    const code = made.json.code;
    await host.page.goto(`/it/s/${code}`);
    await memb.page.goto(`/it/s/${code}`);
    await memb.page.getByTestId("join").click();
    await host.page.getByTestId("start").click();

    const row = (p: Page, title: string) => p.locator('[data-testid^="cand-"]').filter({ hasText: title });
    const plus = (p: Page, title: string) => row(p, title).getByRole("button", { name: `Un voto in più a ${title}` });
    const minus = (p: Page, title: string) => row(p, title).getByRole("button", { name: `Un voto in meno a ${title}` });
    const { page } = host;
    await expect(page.getByTestId("dots-left")).toContainText("Ti restano 3 voti");
    await expect(page.getByTestId("submit-ballot")).toBeDisabled();
    await plus(page, "Matrix").click();
    await plus(page, "Matrix").click();
    await expect(page.getByTestId("dots-left")).toContainText("Ti resta 1 voto");
    await expect(page.getByTestId("submit-ballot")).toBeDisabled(); // 2 of 3: not yet
    await plus(page, "Breaking Bad").click();
    await expect(page.getByTestId("dots-left")).toHaveText("Voti piazzati.");
    // every dot is placed: no more can be added anywhere
    await expect(plus(page, "One Piece")).toBeDisabled();
    await minus(page, "Breaking Bad").click();
    await expect(plus(page, "One Piece")).toBeEnabled();
    await plus(page, "One Piece").click();
    // one veto, on a title that has dots: allowed; moving it to another title takes it off the first
    await row(page, "Breaking Bad").getByRole("checkbox", { name: "Metti il veto su Breaking Bad" }).click();
    await expect(row(page, "Breaking Bad").getByRole("checkbox", { name: "Togli il veto da Breaking Bad" })).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("submit-ballot").click();
    await expect(page.getByTestId("ballot-sent")).toBeVisible();
    await expect(memb.page.getByTestId("voted-count")).toContainText("1 su 2");
    // I can change my mind while it is open
    await page.getByRole("button", { name: it.serata.table.change }).click();
    await expect(page.getByTestId("submit-ballot")).toBeEnabled(); // my ballot came back into the form, ready to resend
    await page.getByTestId("submit-ballot").click();
    await expect(page.getByTestId("ballot-sent")).toBeVisible();

    // the other person votes from the table too, but never sees my dots
    await expect(minus(memb.page, "Matrix")).toBeDisabled();
    await plus(memb.page, "One Piece").click();
    await plus(memb.page, "One Piece").click();
    await plus(memb.page, "One Piece").click();
    await memb.page.getByTestId("submit-ballot").click();
    // everybody voted: closed. Matrix 2, One Piece 1+3 = 4, Breaking Bad 0 and vetoed
    for (const p of [host, memb]) {
      await expect(p.page.getByTestId("winner-title")).toHaveText("One Piece");
      await expect(p.page.getByTestId(/^score-/).first()).toContainText("4 voti");
      await expect(p.page.getByText(it.serata.result.vetoed)).toBeVisible();
    }
    await host.ctx.close();
    await memb.ctx.close();
  });

  test("a vote the server refuses is taken back on screen, with the reason", async ({ browser }) => {
    const host = await person(browser, "rbhost");
    const memb = await person(browser, "rbmemb");
    await signIn(host.page, host.email);
    const c = await circleOf(host, "Rollback");
    await signIn(memb.page, memb.email);
    await api(memb, "POST", "/api/circles/join", { code: c.inviteCode });
    const key = async (q: string) => (await api<Array<{ key: string }>>(host, "GET", `/api/media/search?q=${q}&locale=it`)).json[0].key;
    const made = await api<{ code: string }>(host, "POST", "/api/serate", { circleId: c.id, mode: "bracket", mediaKeys: [await key("matrix"), await key("breaking")] });
    const code = made.json.code;
    await host.page.goto(`/it/s/${code}`);
    await memb.page.goto(`/it/s/${code}`);
    await memb.page.getByTestId("join").click();
    await host.page.getByTestId("start").click();
    await expect(radio(host.page, "Matrix")).toBeVisible();
    // the server says no (a 500): the pick shown at once must go away again
    await host.page.route(`**/api/serate/${code}/vote`, (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"code":"internal","retryAfter":null}' }));
    await radio(host.page, "Matrix").click();
    await expect(host.page.getByTestId("vote-error")).toContainText(it.app.apiErrors.internal);
    await expect(radio(host.page, "Matrix")).toHaveAttribute("aria-checked", "false");
    await expect(memb.page.getByTestId("voted-count")).toContainText("0 su 2");
    await host.page.unroute(`**/api/serate/${code}/vote`);
    await radio(host.page, "Matrix").click();
    await expect(radio(host.page, "Matrix")).toHaveAttribute("aria-checked", "true");
    await host.ctx.close();
    await memb.ctx.close();
  });
});

test.describe("leaving, and a room that does not exist", () => {
  test("a member can leave the lobby; an unknown code says so; a late guest cannot join a room that has started", async ({ browser }) => {
    const host = await person(browser, "lvhost");
    const memb = await person(browser, "lvmemb");
    await signIn(host.page, host.email);
    const c = await circleOf(host, "Uscite");
    await signIn(memb.page, memb.email);
    await api(memb, "POST", "/api/circles/join", { code: c.inviteCode });
    const key = async (q: string) => (await api<Array<{ key: string }>>(host, "GET", `/api/media/search?q=${q}&locale=it`)).json[0].key;
    const made = await api<{ code: string }>(host, "POST", "/api/serate", { circleId: c.id, mode: "table", mediaKeys: [await key("matrix"), await key("breaking")] });
    const code = made.json.code;
    await host.page.goto(`/it/s/${code}`);
    await memb.page.goto(`/it/s/${code}`);
    await memb.page.getByTestId("join").click();
    await expect(host.page.locator('[data-testid^="person-"]')).toHaveCount(2);
    await memb.page.getByTestId("leave").click();
    await memb.page.waitForURL(/\/it\/c\/.+\/serate$/);
    await expect(host.page.locator('[data-testid^="person-"]')).toHaveCount(1);

    await memb.page.goto("/it/s/ZZZZZZ");
    await expect(memb.page.getByText(it.app.apiErrors.not_found).or(memb.page.getByText("Questa Serata non esiste."))).toBeVisible();

    await host.page.getByTestId("start").click();
    const late = await person(browser, "late");
    await late.page.goto(`/it/s/${code}`);
    await late.page.getByLabel(it.serata.join.name).fill("Ritardatario");
    await late.page.getByTestId("guest-join").click();
    await expect(late.page.getByText("La votazione è già cominciata: ormai non si entra più.")).toBeVisible();
    await late.ctx.close();
    await host.ctx.close();
    await memb.ctx.close();
  });
});

test.describe("looks", () => {
  test("the room at 390x844 in dark and light, and wide", async ({ browser }) => {
    test.skip(!process.env.CLIENTB_SHOTS, "set CLIENTB_SHOTS to a folder to write the screenshots");
    const dir = process.env.CLIENTB_SHOTS!;
    for (const [scheme, w, h] of [["dark", 390, 844], ["light", 390, 844], ["dark", 1280, 800]] as const) {
      const host = await person(browser, `look${scheme}${w}`, { colorScheme: scheme, width: w, height: h });
      const memb = await person(browser, `lookm${scheme}${w}`, { colorScheme: scheme, width: w, height: h });
      await signIn(host.page, host.email);
      const c = await circleOf(host, "Aspetto");
      await signIn(memb.page, memb.email);
      await api(memb, "POST", "/api/circles/join", { code: c.inviteCode });
      const key = async (q: string) => (await api<Array<{ key: string }>>(host, "GET", `/api/media/search?q=${q}&locale=it`)).json[0].key;
      const made = await api<{ code: string }>(host, "POST", "/api/serate", { circleId: c.id, mode: "bracket", mediaKeys: [await key("matrix"), await key("breaking"), await key("one piece")] });
      const code = made.json.code;
      await host.page.goto(`/it/s/${code}`);
      await memb.page.goto(`/it/s/${code}`);
      await memb.page.getByTestId("join").click();
      await expect(host.page.locator('[data-testid^="person-"]')).toHaveCount(2);
      await host.page.screenshot({ path: `${dir}/room-lobby-${scheme}-${w}.png` });
      await host.page.getByTestId("start").click();
      await expect(host.page.getByTestId("round-name")).toBeVisible();
      await radio(host.page, "One Piece").click();
      await host.page.waitForTimeout(400);
      await host.page.screenshot({ path: `${dir}/room-bracket-${scheme}-${w}.png` });
      await radio(host.page, "Breaking Bad").click();
      await radio(memb.page, "Breaking Bad").click();
      await radio(host.page, "Matrix").click();
      await radio(memb.page, "Matrix").click();
      await expect(host.page.getByTestId("winner-title")).toBeVisible();
      await host.page.screenshot({ path: `${dir}/room-result-${scheme}-${w}.png`, fullPage: true });
      await host.page.getByTestId("open-card").click();
      await expect(host.page.getByTestId("card-preview")).toBeVisible();
      await host.page.waitForTimeout(300);
      await host.page.screenshot({ path: `${dir}/room-card-${scheme}-${w}.png` });
      await host.page.goto(`/it/c/${c.id}/serate`);
      await expect(host.page.getByTestId("history")).toBeVisible();
      await host.page.screenshot({ path: `${dir}/serate-history-${scheme}-${w}.png`, fullPage: true });
      await host.ctx.close();
      await memb.ctx.close();
    }
  });
});

void BASE;
