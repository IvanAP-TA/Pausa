// Accessibility audit with axe-core (WCAG 2.1 A + AA) on every signed-in screen and every public page, at 390x844 and 1280x800, in
// the dark and the light theme, plus the states that matter: Registra with a series picked, a thread with a hidden spoiler, the
// open sheets, the Serata room (lobby, bracket, table, result), the import with a file loaded, empty states, the error state.
// The test fails on ANY violation of the WCAG tags, whatever its impact (the bar is higher than "serious/critical").
// Needs the API with the seed (node tools/dev-stack.mjs --seed). Skipped, loudly, when it is not running.
// A11Y_REPORT=<file> appends one JSON line per scan (used for the before/after numbers in docs/rebuild/A11Y.md).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { it } from "./clientb-helpers";
import { API, apiAs, fmt, login, MATRIX, open, scan, settled, type Finding, type Scheme, type Size, type State } from "./a11y-support";
import { buildScene, signInAs, type Scene } from "./a11y-scene";

let apiUp = false;
test.beforeAll(async () => {
  try {
    apiUp = (await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    apiUp = false;
  }
});
test.beforeEach(() => test.skip(!apiUp, `API not running on ${API}: start the dev stack with --seed. These tests did NOT run.`));
// Not serial on purpose: a failing screen must not hide the others (the data is built in beforeAll, once per worker).
test.use({ actionTimeout: 20_000 });

const ids: Scene = { circle: "", invite: "", log: "", spoilerLog: "", media: "", member: "", list: "", doneCode: "", openCode: "", emails: [] };

// The data: a Cerchia with the shape of the dev seed, built on fresh accounts (see e2e/a11y-scene.ts for why). In beforeAll, not in a test:
// Playwright starts a NEW worker process after a failing test, and module state built by an earlier test would be gone in it.
test.beforeAll(async ({ browser }) => {
  if (!apiUp) return;
  Object.assign(ids, await buildScene(browser));
  expect(ids.doneCode).toMatch(/^[A-Z0-9]{6}$/);
  expect(ids.openCode).toMatch(/^[A-Z0-9]{6}$/);
});

/** A member of that Cerchia signed in afresh for this test (never the owner, who would see their own spoiler). Max 3 sign-ins per address per 10 minutes. */
const newViewer = (browser: Browser, _tag: string): Promise<State> => signInAs(browser, ids);

/** Opens `url`, waits for it to settle and scans it. */
async function check(page: Page, out: Finding[], screen: string, env: string, url?: string) {
  if (url) await page.goto(url);
  await settled(page);
  // A11Y_SHOTS=<dir> keeps a screenshot of every scanned state, to read what axe was actually looking at.
  if (process.env.A11Y_SHOTS) await page.screenshot({ path: `${process.env.A11Y_SHOTS}/${env.replace(/ /g, "-")}--${screen.replace(/[^a-z0-9]+/gi, "-")}.png` });
  out.push(...(await scan(page, screen, env)));
}

const routeScreens = (): Array<[string, string]> => [
  ["home", "/it/home"],
  ["circle hub", `/it/c/${ids.circle}`],
  ["feed", `/it/c/${ids.circle}/feed`],
  ["thread", `/it/c/${ids.circle}/log/${ids.log}`],
  ["thread with hidden spoiler", `/it/c/${ids.circle}/log/${ids.spoilerLog}`],
  ["ranking", `/it/c/${ids.circle}/ranking`],
  ["insights", `/it/c/${ids.circle}/insights`],
  ["person", `/it/c/${ids.circle}/people/${ids.member}`],
  ["author page", `/it/c/${ids.circle}/person/tmdb:9339`],
  ["title page", `/it/t/${ids.media}`],
  ["circle settings", `/it/c/${ids.circle}/settings`],
  ["serate (builder + history)", `/it/c/${ids.circle}/serate`],
  ["my diary", "/it/diary"],
  ["log form", "/it/log"],
  ["notifications", "/it/notifications"],
  ["lists", "/it/lists"],
  ["list detail", `/it/lists/${ids.list}`],
  ["import", "/it/import"],
  ["imports (manage)", "/it/imports"],
  ["me", "/it/me"],
  ["edit profile", "/it/me/profile"],
  ["achievements and board", "/it/me/achievements"],
  ["personal statistics", "/it/me/stats"],
  ["public profile (not found)", "/it/u/abcdefghjkmn"],
  ["settings", "/it/me/settings"],
  ["account", "/it/account"],
  ["serata result (done)", `/it/s/${ids.doneCode}`],
  ["serata lobby (seeded)", `/it/s/${ids.openCode}`],
];

const publicScreens: Array<[string, string]> = [
  ["root chooser", "/"],
  ["landing", "/it"],
  ["guide index", "/it/guide"],
  ["guide", "/it/guide/choose-a-movie-with-friends"],
  ["privacy", "/it/privacy"],
  ["terms", "/it/terms"],
  ["landing en", "/en"],
  ["landing es", "/es"],
  ["404", "/it/does-not-exist"],
];

for (const { size, scheme } of MATRIX) {
  const env = `${size.name} ${scheme}`;

  test(`${env}: every signed-in screen`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, await newViewer(browser, "screens"), size, scheme);
    const out: Finding[] = [];
    for (const [name, url] of routeScreens()) {
      await check(page, out, name, env, url);
    }
    await ctx.close();
    expect(fmt(out)).toEqual([]);
  });

  test(`${env}: public pages and the signed-out screens`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, undefined, size, scheme);
    const out: Finding[] = [];
    for (const [name, url] of publicScreens) await check(page, out, name, env, url);
    await check(page, out, "sign-in", env, "/it/sign-in");
    await page.getByLabel(it.auth.email).fill(`axe-${Date.now().toString(36)}@pausa.test`);
    await page.getByRole("button", { name: it.auth.sendLink }).click();
    await page.getByTestId("dev-link").waitFor();
    await check(page, out, "sign-in, link sent", env);
    if (ids.invite) await check(page, out, "invite landing (signed out: goes to sign-in)", env, `/it/join/${ids.invite}`);
    await check(page, out, "invite landing, a link that does not work (the reason)", env, "/it/join/NOTACODE");
    await check(page, out, "serata door (signed out, guest form)", env, `/it/s/${ids.openCode}`);
    await ctx.close();
    expect(fmt(out)).toEqual([]);
  });

  test(`${env}: states (Registra with a series, sheets, import with a file, empty, error)`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, await newViewer(browser, "states"), size, scheme);
    const out: Finding[] = [];
    await statesSignedIn(page, out, env);
    await ctx.close();
    // somebody with no Cerchia, no diary, no list
    const fresh = await open(browser, await login(browser, `axe-empty-${scheme}-${size.name}-${Date.now().toString(36)}@pausa.test`), size, scheme);
    for (const [name, url] of [["empty home", "/it/home"], ["empty diary", "/it/diary"], ["empty lists", "/it/lists"], ["empty notifications", "/it/notifications"], ["empty me", "/it/me"], ["empty log form", "/it/log"]] as const)
      await check(fresh.page, out, name, env, url);
    await fresh.ctx.close();
    expect(fmt(out)).toEqual([]);
  });

  test(`${env}: the Serata room (lobby, tournament, table) and its sheets`, async ({ browser }) => {
    test.setTimeout(240_000);
    await serataStates(browser, size, scheme);
  });
}

const MATRIX_KEY = "tmdb:movie:603";

async function statesSignedIn(page: Page, out: Finding[], env: string) {
  // Registra with a series picked and a season chosen
  await page.goto("/it/log");
  await settled(page);
  await page.getByLabel("Cerca un film, una serie, un anime…").fill("breaking");
  await page.getByRole("button", { name: /^Breaking Bad/ }).first().click();
  // a new viewing has no details section; the details live in the edit form of an existing viewing
  await page.getByTestId("mode-watching").waitFor();
  await check(page, out, "Registra with a series", env);
  // the edit form loads for the author only: this viewer logs a viewing of their own, then opens its edit page
  const mine = await page.request.post("/api/logs", { data: { mediaKey: MATRIX_KEY, watchedOn: "2026-10-02", locale: "it", rating: 8, circles: [ids.circle] } });
  expect(mine.status(), "the viewer's own viewing").toBe(201);
  await page.goto(`/it/log/${(await mine.json()).id}`);
  await settled(page);
  await page.getByTestId("log-details").waitFor();
  if ((await page.getByTestId("log-details").getAttribute("aria-expanded")) !== "true") await page.getByTestId("log-details").click();
  await check(page, out, "Registra: edit with details open", env);
  // the filter panel on the feed (v1: in the page, not a sheet)
  await page.goto(`/it/c/${ids.circle}/feed`);
  await settled(page);
  await page.getByTestId("open-filters").click();
  await page.getByTestId("filter-panel").waitFor();
  await check(page, out, "feed: filter panel open", env);
  // the ranking keeps its filter sheet
  await page.goto(`/it/c/${ids.circle}/ranking`);
  await settled(page);
  await page.getByTestId("open-filters").click();
  await page.getByRole("dialog").waitFor();
  await check(page, out, "ranking: filter sheet open", env);
  await page.keyboard.press("Escape");
  // report sheet in a thread
  await page.goto(`/it/c/${ids.circle}/log/${ids.log}`);
  await settled(page);
  await page.getByRole("button", { name: "Segnala" }).first().click();
  await page.getByRole("dialog").waitFor();
  await check(page, out, "thread: report sheet open", env);
  await page.keyboard.press("Escape");
  // the spoiler revealed
  await page.goto(`/it/c/${ids.circle}/log/${ids.spoilerLog}`);
  await settled(page);
  const reveal = page.getByRole("button", { name: /spoiler/i }).first();
  if (await reveal.count()) {
    await reveal.click();
    await settled(page);
    await check(page, out, "thread: spoiler revealed", env);
  }
  // import with a file loaded
  await page.goto("/it/import");
  await settled(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("pick-file").click();
  await (await chooser).setFiles([{ name: "diary.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-05,Matrix,1999,https://boxd.it/aaa,4.5,,,2024-01-04\n2024-03-02,Se7en,1995,https://boxd.it/bbb,4,Yes,,2024-03-02\n") }]);
  await page.getByTestId("found").waitFor();
  await check(page, out, "import: file loaded, summary", env);
  // error state: the API refuses
  await page.route("**/api/circles/*/feed**", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"code":"internal","retryAfter":null}' }));
  await page.goto(`/it/c/${ids.circle}/feed`);
  await page.getByRole("alert").first().waitFor();
  await check(page, out, "feed: error state", env);
  await page.unroute("**/api/circles/*/feed**");
}

async function serataStates(browser: Browser, size: Size, scheme: Scheme) {
  const env = `${size.name} ${scheme}`;
  const out: Finding[] = [];
  const mine = await newViewer(browser, "room");
  const g = await apiAs(browser, mine);
  const m = await apiAs(browser, await signInAs(browser, ids));
  const { ctx, page } = await open(browser, mine, size, scheme);
  const keys = ["tmdb:movie:603", "tmdb:movie:27205", "tmdb:tv:1396"];
  // tournament: lobby, then the first match
  const t = await g.call<{ code: string }>("POST", "/api/serate", { circleId: ids.circle, mode: "bracket", mediaKeys: keys });
  expect(t.status).toBe(201);
  await m.call("POST", `/api/serate/${t.json.code}/join`, {});
  await page.goto(`/it/s/${t.json.code}`);
  await page.getByTestId("room-code").waitFor();
  await expect(page.locator('[data-testid^="person-"]')).toHaveCount(2);
  await check(page, out, "serata lobby (host)", env);
  await page.getByTestId("start").click();
  await page.getByTestId("round-name").waitFor();
  await page.getByRole("radio").first().click();
  await check(page, out, "serata tournament, a pick made", env);
  // table
  const tb = await g.call<{ code: string }>("POST", "/api/serate", { circleId: ids.circle, mode: "table", mediaKeys: keys });
  expect(tb.status).toBe(201);
  await m.call("POST", `/api/serate/${tb.json.code}/join`, {});
  await page.goto(`/it/s/${tb.json.code}`);
  await page.getByTestId("room-code").waitFor();
  await page.getByTestId("start").click();
  await page.getByTestId("dots-left").waitFor();
  await check(page, out, "serata table", env);
  // result card sheet and the "we watched it" sheet
  await page.goto(`/it/s/${ids.doneCode}`);
  await page.getByTestId("winner-title").waitFor();
  await page.getByTestId("open-card").click();
  await page.getByTestId("card-preview").waitFor();
  await check(page, out, "serata result: share card sheet", env);
  await page.keyboard.press("Escape");
  await page.goto(`/it/c/${ids.circle}/serate`);
  await settled(page);
  const watched = page.getByTestId(`watched-${ids.doneCode}`);
  if (await watched.count()) {
    await watched.click();
    await page.getByRole("dialog").waitFor();
    await check(page, out, "serate: we-watched-it sheet", env);
  }
  await ctx.close();
  await g.ctx.close();
  await m.ctx.close();
  expect(fmt(out)).toEqual([]);
}
