// Traguardi, the opt-in global board, the public profile page and personal statistics, in a real browser against the local API.
// The board is computed by the hourly cron: the test fires it through wrangler's --test-scheduled endpoint (/cdn-cgi/handler/scheduled).
import { expect, test } from "@playwright/test";
import { api, API, circleOf, person, signIn, type Person } from "./clientb-helpers";

// The area's own strings (src/features/achievements/achievements.messages.ts, Italian), as the screen shows them.
const T = {
  off: "Non sei in classifica. È una scelta",
  nameInvalid: "Scegli un nome da 2 a 32 caratteri, senza email o link.",
  publicPage: "Pagina pubblica",
  joined: (n: string) => `Sei in classifica come ${n}.`,
  notYet: "Il tuo punteggio arriva al prossimo calcolo (ogni ora).",
  leave: "Esci dalla classifica",
  leaveConfirm: "Esci e cancella nome e punteggio",
  left: "Sei uscito dalla classifica: nome e punteggio sono cancellati.",
};

let apiUp = false;
test.beforeAll(async () => {
  apiUp = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
});
test.beforeEach(() => test.skip(!apiUp, `API not running on ${API}: these tests did NOT run.`));
test.describe.configure({ mode: "serial" });

const cron = async () => expect((await fetch(`${API}/cdn-cgi/handler/scheduled?cron=0+*+*+*+*`)).ok).toBe(true);
const today = new Date().toISOString().slice(0, 10);

/** n viewings logged by hand, today (the board counts the day they were written). */
async function logMany(p: Person, n: number) {
  const key = (await api<Array<{ key: string }>>(p, "GET", "/api/media/search?q=matrix&locale=it")).json[0].key;
  for (let i = 0; i < n; i++) expect((await api(p, "POST", "/api/logs", { mediaKey: key, watchedOn: today, circles: [], isRewatch: i > 0 })).status).toBe(201);
}

/** n viewings through an import (never on the board, but in the milestones). */
async function importMany(p: Person, n: number) {
  const batch = await api<{ id: string }>(p, "POST", "/api/imports", { source: "letterboxd", total: n });
  expect(batch.status).toBe(201);
  const rows = Array.from({ length: n }, (_, i) => ({ kind: "movie", title: "The Matrix", year: 1999, rating: null, watchedOn: `2024-01-${String(i + 1).padStart(2, "0")}`, rewatch: i > 0, review: null, letterboxdUri: null, anilistId: null, malId: null, tmdbId: 603, imdbId: null }));
  expect((await api(p, "POST", `/api/imports/${batch.json.id}/rows`, { rows, offset: 0, includeReviews: false, includeUndated: false, locale: "it" })).status).toBe(200);
  expect((await api(p, "POST", `/api/imports/${batch.json.id}/finish`, {})).status).toBe(200);
}

test.describe("milestones and the global board", () => {
  let giulia: Person, marco: Person;
  let handle = "";
  const name = `Giulia ${Date.now().toString(36).slice(-4)}`;

  test("nobody is on the board until they choose to; milestones count everything, imports included", async ({ browser }) => {
    giulia = await person(browser, "boardgiulia");
    marco = await person(browser, "boardmarco");
    await signIn(giulia.page, giulia.email);
    await signIn(marco.page, marco.email);
    await logMany(giulia, 7);
    await importMany(giulia, 4);
    await logMany(marco, 2);
    const mine = await api<{ board: { joined: boolean }; milestones: Array<{ kind: string; value: number }> }>(giulia, "GET", "/api/me/achievements");
    expect(mine.json.board.joined).toBe(false);
    expect(mine.json.milestones.find((m) => m.kind === "viewings")?.value).toBe(11);
    await giulia.page.goto("/it/me/achievements");
    await expect(giulia.page.getByTestId("milestone-viewings")).toContainText("11 su 50");
    await expect(giulia.page.getByText(T.off)).toBeVisible();
  });

  test("joining needs a public name fit for strangers; the page explains the rules", async () => {
    const { page } = giulia;
    await page.getByTestId("board-name").fill("scrivimi a me@mail.it");
    await page.getByTestId("board-join").click();
    await expect(page.getByText(T.nameInvalid)).toBeVisible();
    await page.getByTestId("board-name").fill(name);
    await page.getByRole("switch", { name: T.publicPage }).click();
    await page.getByTestId("board-join").click();
    await expect(page.getByText(T.joined(name))).toBeVisible();
    await expect(page.getByText(T.notYet)).toBeVisible();
    expect((await api(marco, "PUT", "/api/me/leaderboard", { publicName: "Marco", publicProfile: false })).status).toBe(200);
  });

  test("the hourly computation: hand-logged viewings only, at most 5 a day; the board ranks, marks you, links public pages only", async () => {
    await cron();
    const { page } = giulia;
    await page.reload();
    // 7 written today, capped at 5; the 4 imported ones never count
    await expect(page.getByTestId("board-me-all")).toContainText("5 punti");
    const rows = page.getByTestId("board-row");
    await expect(rows.filter({ hasText: name })).toContainText("tu");
    await expect(rows.filter({ hasText: name })).toContainText("5 punti");
    await expect(rows.filter({ hasText: "Marco" }).first()).toContainText("2 punti");
    const me = await api<{ board: { handle: string; rankAll: number } }>(giulia, "GET", "/api/me/achievements");
    handle = me.json.board.handle;
    expect(handle).toMatch(/^[a-z0-9]{12}$/);
    const board = await api<{ rows: Array<{ publicName: string; handle: string | null }> }>(marco, "GET", "/api/leaderboard?period=month");
    expect(board.json.rows.find((r) => r.publicName === name)?.handle).toBe(handle);
    expect(board.json.rows.find((r) => r.publicName === "Marco")?.handle).toBeNull();
  });

  test("the public page shows only what was chosen, to anyone, with no sign-in", async ({ browser }) => {
    const stranger = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const page = await stranger.newPage();
    await page.goto(`/it/u/${handle}`);
    await expect(page.getByTestId("public-name")).toHaveText(name);
    await expect(page.getByTestId("public-score")).toContainText("5 punti");
    await expect(page.getByTestId("milestone-viewings")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain("Matrix");
    await stranger.close();
  });

  test("leaving deletes the name and the score at once; the public page stops answering", async () => {
    const { page } = giulia;
    await page.getByRole("button", { name: T.leave }).click();
    await page.getByRole("button", { name: T.leaveConfirm }).click();
    await expect(page.getByText(T.left)).toBeVisible();
    expect((await fetch(`${API}/api/u/${handle}`)).status).toBe(404);
    const board = await api<{ rows: Array<{ publicName: string }> }>(marco, "GET", "/api/leaderboard?period=all");
    expect(board.json.rows.map((r) => r.publicName)).not.toContain(name);
    await cron();
    const again = await api<{ rows: Array<{ publicName: string }> }>(marco, "GET", "/api/leaderboard?period=all");
    expect(again.json.rows.map((r) => r.publicName)).not.toContain(name);
  });

  test("personal statistics: viewings, films, genres, year by year", async () => {
    const { page } = giulia;
    await page.goto("/it/me/stats");
    await expect(page.getByTestId("stats-viewings")).toHaveText("11 visioni");
    await expect(page.getByText(today.slice(0, 4), { exact: true })).toBeVisible();
    await expect(page.getByText("2024", { exact: true })).toBeVisible();
    await giulia.ctx.close();
    await marco.ctx.close();
  });
});

test.describe("the invite's QR code", () => {
  test("the Cerchia page shows a QR of the invite link on request, dark on white, with a name for screen readers", async ({ browser }) => {
    const p = await person(browser, "qrowner");
    await signIn(p.page, p.email);
    const c = await circleOf(p, "Con il QR");
    await p.page.goto(`/it/c/${c.id}/members`);
    const show = p.page.getByRole("button", { name: "Mostra il QR" }).first();
    await show.click();
    const qr = p.page.getByRole("img", { name: "Codice QR dell'invito alla Cerchia" });
    await expect(qr).toBeVisible();
    const box = await qr.boundingBox();
    expect(Math.round(box!.width)).toBe(200);
    await expect(p.page.getByText("Inquadralo con la fotocamera: apre l'invito.")).toBeVisible();
    await p.page.getByRole("button", { name: "Nascondi il QR" }).click();
    await expect(qr).toHaveCount(0);
    await p.ctx.close();
  });
});

test.describe("anime only AniList knows", () => {
  test("where to watch lists AniList's streaming sites; a high rating makes it a 'Per te' seed with AniList's recommendations", async ({ browser }) => {
    const p = await person(browser, "anilistonly");
    await signIn(p.page, p.email);
    // Death Note: the mock catalogue knows it on AniList only (no TMDB id), like many anime
    const results = await api<Array<{ key: string; title: string }>>(p, "GET", "/api/media/search?q=death%20note&locale=it");
    const key = results.json.find((r) => r.title === "Death Note")?.key;
    expect(key).toBeTruthy();
    const made = await api<{ mediaId: string }>(p, "POST", "/api/logs", { mediaKey: key, watchedOn: "2026-11-20", circles: [], rating: 9 });
    expect(made.status).toBe(201);
    const mediaId = made.json.mediaId;
    const a = await api<{ providers: unknown[]; links: Array<{ site: string; url: string }>; known: boolean }>(p, "GET", `/api/media/${mediaId}/availability`);
    expect(a.json.links.map((l) => l.site)).toEqual(["Crunchyroll", "Netflix"]);
    expect(a.json.providers).toEqual([]);
    await p.page.goto(`/it/t/${mediaId}`);
    await expect(p.page.getByTestId("watch-links")).toContainText("Crunchyroll");
    await expect(p.page.getByTestId("watch-links")).toContainText("Siti di streaming segnalati da AniList");
    const fy = await api<{ enabled: boolean; seeded: number; picks: Array<{ key: string }> }>(p, "GET", "/api/me/for-you?locale=it");
    expect(fy.json.enabled).toBe(true);
    expect(fy.json.picks.map((x) => x.key)).toEqual(expect.arrayContaining(["anilist:21", "anilist:20"]));
    expect(fy.json.picks.map((x) => x.key)).not.toContain("anilist:1535");
    await p.ctx.close();
  });
});
