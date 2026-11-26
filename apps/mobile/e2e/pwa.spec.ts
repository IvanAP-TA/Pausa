// Installability and offline, in a real browser with the service worker ALLOWED (the rest of the suite runs with it blocked, see
// playwright.config.ts): the manifest and its icons, the worker registered by the app shell and never by a public page, the shell
// opening with no network after one online visit, API calls failing into the screens' own error states, the safe update flow, and
// the diary's offline outbox (queue, persistence across a reload, send in order, no duplicates, retry, discard).
import { expect, test, type Page } from "@playwright/test";
import { api, BASE, circleWith, it, logApi, person, signIn, type Person } from "./support-diary";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8798";
let apiUp = false;
test.beforeAll(async () => {
  try {
    apiUp = (await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    apiUp = false;
  }
});
test.beforeEach(() => test.skip(!apiUp, `API not running on ${API}: start the dev stack. These tests did NOT run.`));
test.use({ serviceWorkers: "allow" });
test.describe.configure({ mode: "serial" });

const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

/** Waits until the worker controls the page AND the precache of this build is complete. */
async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(async () => page.evaluate(async () => { const keys = (await caches.keys()).filter((k) => k.startsWith("pausa-pre-")); return keys.length ? (await (await caches.open(keys[0])).keys()).length : 0; }), { timeout: 30_000 })
    .toBeGreaterThan(20);
}
const cacheNames = (page: Page) => page.evaluate(() => caches.keys());

let u: Person;
let cid = "";
let outbox: Person;

test("the manifest of each language: right fields, icons that exist at the size they claim", async ({ page, request }) => {
  for (const l of ["it", "en", "es"]) {
    const res = await request.get(`/manifest-${l}.webmanifest`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("manifest+json");
    const m = await res.json();
    expect(m).toMatchObject({ name: "Pausa", short_name: "Pausa", lang: l, start_url: `/${l}/home`, scope: "/", display: "standalone", theme_color: "#001113", background_color: "#001113" });
    for (const icon of m.icons) {
      const png = await request.get(icon.src);
      expect(png.status(), icon.src).toBe(200);
      const [w, h] = pngSize(await png.body());
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
    }
    expect(m.icons.map((i: { purpose: string }) => i.purpose)).toContain("maskable");
  }
  // linked from a public page and from a private shell page, with the iOS tags
  for (const url of ["/it", "/en/guide", "/es/privacy", "/it/sign-in"]) {
    await page.goto(url);
    const lang = url.split("/")[1];
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", `/manifest-${lang}.webmanifest`);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  }
});

test("a public page never registers the worker; the app shell does", async ({ page }) => {
  for (const url of ["/it", "/it/guide", "/it/privacy"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), url).toBe(0);
  }
  await page.goto("/it/sign-in");
  await controlled(page);
  const reg = await page.evaluate(async () => { const r = (await navigator.serviceWorker.getRegistrations())[0]; return { scope: new URL(r.scope).pathname, script: new URL((r.active ?? r.waiting ?? r.installing)!.scriptURL).pathname }; });
  expect(reg).toEqual({ scope: "/", script: "/sw.js" });
});

test("scene: a signed-in person with a Cerchia", async ({ browser }) => {
  u = await person(browser, "pwa");
  const friend = await person(browser, "pwafriend");
  await signIn(u);
  await signIn(friend);
  cid = await circleWith(u, [friend], "Offline");
  await logApi(friend, { mediaKey: "tmdb:movie:603", rating: 8, review: "Una recensione.", circles: [cid] });
  await friend.ctx.close();
});

test("after one online visit the shell opens with no network, and the API's failure lands in the screens' own error states", async () => {
  const { page, ctx } = u;
  await page.goto("/it/me/circles");
  await expect(page.getByTestId(`circle-${cid}`)).toBeVisible();
  await controlled(page);
  await page.reload(); // from now on the worker controls the page
  await expect(page.getByTestId(`circle-${cid}`)).toBeVisible();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await ctx.setOffline(true);
  // a private page that was never opened: the cached shell, rendered by the client router for that URL
  await page.goto("/it/diary");
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), "the shell came from the worker").toBe(true);
  await expect(page.getByRole("alert").first()).toBeVisible(); // the session check failed: the app says so, it is not a blank page
  await expect(page.getByRole("alert").first()).toContainText(/connession|rete|server/i);
  await page.goto(`/it/c/${cid}/feed`);
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByRole("button", { name: it.errors.retry }).first()).toBeVisible();
  // back online, the retry works: nothing was left in a broken state
  await ctx.setOffline(false);
  await page.getByRole("button", { name: it.errors.retry }).first().click();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("offline, a public page that was never opened gets the offline page; one that was opened comes from the last copy", async () => {
  const { page, ctx } = u;
  await page.goto("/it/guide"); // online: kept as the last copy
  await page.waitForLoadState("networkidle");
  await ctx.setOffline(true);
  await page.goto("/it/guide");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page).toHaveTitle(/Guide/i); // the last copy, from the runtime cache
  await page.goto("/en/terms"); // never opened
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sei offline");
  await expect(page.getByRole("link", { name: "Riprova" })).toBeVisible();
  await ctx.setOffline(false);
});

test("/api/* is never cached by the worker", async () => {
  const { page, ctx } = u;
  await page.goto("/it/home");
  await controlled(page);
  const apiCached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (new URL(r.url).pathname.startsWith("/api/")) out.push(r.url);
    return out;
  });
  expect(apiCached).toEqual([]);
  await ctx.setOffline(true);
  const failed = await page.evaluate(() => fetch("/api/me").then(() => "answered", () => "network error"));
  expect(failed, "offline, an API call fails instead of being answered from a cache").toBe("network error");
  await ctx.setOffline(false);
});

test("update: a new worker waits, the page offers it, one tap activates it, old caches go, the page reloads", async () => {
  const { page, ctx } = u;
  await page.goto("/it/home");
  await controlled(page);
  const before = (await cacheNames(page)).filter((k) => k.startsWith("pausa-pre-"));
  expect(before).toHaveLength(1);
  expect(await page.getByTestId("update-banner").count()).toBe(0);
  // "a new deploy": the worker file changes (a new version string), as it would with a new precache list
  // (serve-dist.mjs answers /sw.js with a different VERSION when this cookie is present: Playwright cannot route the update fetch)
  await ctx.addCookies([{ name: "x-test-sw-version", value: "next-build", url: BASE }]);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r!.update()));
  await expect(page.getByTestId("update-banner")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("update-banner")).toContainText("Aggiornamento disponibile");
  // it WAITS: nothing changed yet. The old caches are still there and so is the old worker's version.
  expect((await cacheNames(page)).filter((k) => k.startsWith("pausa-pre-")).sort()).toEqual([before[0], "pausa-pre-next-build"].sort());
  const urlBefore = page.url();
  const nav = page.waitForNavigation({ timeout: 20_000 });
  await page.getByTestId("update-apply").click();
  await nav; // reloaded by the controllerchange
  expect(page.url()).toBe(urlBefore);
  await expect.poll(() => cacheNames(page).then((k) => k.filter((n) => n.startsWith("pausa-pre-"))), { timeout: 20_000 }).toEqual(["pausa-pre-next-build"]);
  await expect(page.getByTestId("update-banner")).toHaveCount(0);
  await ctx.clearCookies({ name: "x-test-sw-version" });
});

// ---- the offline outbox ---------------------------------------------------------------------------------------------------

const diaryTitles = async (p: Person) => ((await api<{ items: Array<{ media: { title: string }; watchedOn: string }> }>(p, "GET", "/api/me/diary?locale=it")).json.items).map((l) => `${l.media.title}@${l.watchedOn}`);

/** What the SERVER holds, as "day" in the order it received the viewings (arrivedAt): the ground truth, whatever the page saw. */
const serverOrder = async (p: Person) => ((await api<{ items: Array<{ watchedOn: string; arrivedAt: number }> }>(p, "GET", "/api/me/diary?locale=it")).json.items).sort((a, b) => a.arrivedAt - b.arrivedAt).map((l) => l.watchedOn);

async function pickMatrix(page: Page, day: string) {
  // a new viewing has no date field (it is today): make "today" the wanted day
  await page.clock.setFixedTime(new Date(`${day}T12:00:00`));
  await page.goto("/it/log");
  await page.getByLabel("Cerca un film, una serie, un anime…").fill("matrix");
  await page.getByRole("button", { name: /^Matrix/ }).first().click();
  await page.getByTestId("picked-title").waitFor(); // the form has taken its date (the fixed "today") ...
  await page.clock.resume(); // ... now time runs again, so outbox timestamps advance
}

test("outbox: scene", async ({ browser }) => {
  outbox = await person(browser, "outbox");
  await signIn(outbox);
  await api(outbox, "POST", "/api/circles", { name: "Coda" });
});

test("outbox: the connection drops while the form is open: the viewing is queued, shown in the diary, survives a reload, and goes out by itself when the network is back", async () => {
  const { page, ctx } = outbox;
  await page.goto("/it/home");
  await controlled(page);
  await page.reload();
  await pickMatrix(page, "2026-11-01"); // the title is picked while online (the catalogue search needs the server) ...
  await ctx.setOffline(true); // ... then the connection goes
  await page.getByTestId("submit-log").click();
  await page.waitForURL("**/it/diary");
  await expect(page.getByTestId("pending-section")).toBeVisible();
  await expect(page.getByTestId("pending-section")).toContainText("1 visione da inviare");
  await expect(page.getByTestId("pending-section")).toContainText("Sei offline");
  await expect(page.getByText("In attesa di rete").first()).toBeVisible();
  expect(await serverOrder(outbox), "offline: nothing reached the server").toEqual([]);
  // a cold start without a network: the shell comes from the worker and says it cannot reach the server (the queue stays on the device)
  await page.reload();
  await expect(page.getByRole("alert").first()).toContainText(/connession|rete|server/i);
  // back online: retry the session check, the diary shows the queued viewing, which goes out by itself
  await ctx.setOffline(false);
  await page.getByRole("button", { name: it.errors.retry }).first().click();
  // (not "the section is gone": it is also absent while the session is still being checked) the SERVER has it, exactly once
  await expect.poll(() => serverOrder(outbox), { timeout: 30_000 }).toEqual(["2026-11-01"]);
  await expect(page.getByTestId("pending-section")).toHaveCount(0);
  await expect(page.getByText("Matrix").first()).toBeVisible(); // the diary was reloaded with it
});

test("outbox: two viewings queued go out in the order they were written, once each", async () => {
  const { page, ctx } = outbox;
  let down = true;
  await ctx.route("**/api/logs", (r) => (r.request().method() === "POST" && down ? r.abort("connectionrefused") : r.continue())); // the request never leaves
  await pickMatrix(page, "2026-11-03");
  await page.getByTestId("submit-log").click();
  await page.waitForURL("**/it/diary");
  await pickMatrix(page, "2026-11-04");
  await page.getByTestId("submit-log").click();
  await page.waitForURL("**/it/diary");
  await expect(page.getByTestId("pending-section")).toContainText("2 visioni da inviare");
  expect(await serverOrder(outbox), "nothing reached the server").toEqual(["2026-11-01"]); // only the earlier test's viewing
  // it survives a reload (online, the server still refusing: the queue is kept, in order)
  await page.reload();
  await expect(page.getByTestId("pending-section")).toContainText("2 visioni da inviare");
  down = false;
  // retry (a flush may already be running: then the button is disabled and the click is not needed) ...
  await page.getByTestId(/^pending-retry-/).first().click({ timeout: 5000 }).catch(() => undefined);
  // ... and the server ends up with both, once each, in the order they were written
  await expect.poll(() => serverOrder(outbox), { timeout: 30_000 }).toEqual(["2026-11-01", "2026-11-03", "2026-11-04"]);
  await expect(page.getByTestId("pending-section")).toHaveCount(0);
  expect((await diaryTitles(outbox)).filter((t) => /2026-11-0[34]$/.test(t)).sort()).toEqual(["Matrix@2026-11-03", "Matrix@2026-11-04"]);
  await ctx.unroute("**/api/logs");
});

test("outbox: the first request REACHED the server but its answer was lost: no duplicate is created (re-read heuristic)", async () => {
  const { page, ctx } = outbox;
  let posts = 0;
  await ctx.route("**/api/logs", async (r) => {
    if (r.request().method() !== "POST") return r.continue();
    posts++;
    if (posts === 1) {
      await r.fetch(); // the server really creates it ...
      return r.abort("connectionreset"); // ... and the client never hears
    }
    return r.continue();
  });
  await pickMatrix(page, "2026-11-05");
  await page.getByTestId("submit-log").click();
  await page.waitForURL("**/it/diary");
  // the viewing is on the server already, and in the outbox as "maybe sent"
  await expect.poll(async () => (await diaryTitles(outbox)).filter((t) => t === "Matrix@2026-11-05").length).toBe(1);
  await expect(page.getByTestId("pending-section")).toBeVisible();
  await page.getByTestId(/^pending-retry-/).first().click();
  await expect(page.getByTestId("pending-section")).toHaveCount(0, { timeout: 15_000 });
  expect((await diaryTitles(outbox)).filter((t) => t === "Matrix@2026-11-05"), "exactly one, not two").toHaveLength(1);
  expect(posts, "the second POST was never sent: the diary check found the first").toBe(1);
  await ctx.unroute("**/api/logs");
});

test("outbox: a request that never left is sent once on retry; a refused one is 'not sent' with a reason, retry and discard are named after the viewing", async () => {
  const { page, ctx } = outbox;
  let mode: "drop" | "refuse" | "ok" = "drop";
  await ctx.route("**/api/logs", (r) => {
    if (r.request().method() !== "POST") return r.continue();
    if (mode === "drop") return r.abort("connectionrefused");
    if (mode === "refuse") return r.fulfill({ status: 400, contentType: "application/json", body: '{"code":"invalid","retryAfter":null}' });
    return r.continue();
  });
  await pickMatrix(page, "2026-11-07");
  await page.getByTestId("submit-log").click();
  await page.waitForURL("**/it/diary");
  await expect(page.getByTestId("pending-section")).toBeVisible();
  mode = "refuse";
  await page.getByRole("button", { name: "Riprova a inviare Matrix" }).click();
  await expect(page.getByText(/Non inviata/)).toBeVisible();
  await expect(page.getByText("Controlla i dati e riprova.")).toBeVisible(); // the server's reason, in words
  mode = "ok";
  await page.getByRole("button", { name: "Riprova a inviare Matrix" }).click();
  await expect(page.getByTestId("pending-section")).toHaveCount(0, { timeout: 15_000 });
  expect((await diaryTitles(outbox)).filter((t) => t === "Matrix@2026-11-07")).toHaveLength(1);
  // discard: two presses, then it is gone and nothing is sent
  mode = "drop";
  await pickMatrix(page, "2026-11-09");
  await page.getByTestId("submit-log").click();
  await page.waitForURL("**/it/diary");
  await page.getByRole("button", { name: "Scarta Matrix" }).click();
  await page.getByRole("button", { name: "Scarta davvero" }).click();
  await expect(page.getByTestId("pending-section")).toHaveCount(0);
  mode = "ok";
  await page.reload();
  await expect(page.getByTestId("pending-section")).toHaveCount(0);
  expect((await diaryTitles(outbox)).filter((t) => t === "Matrix@2026-11-09")).toEqual([]);
  await ctx.unroute("**/api/logs");
  await outbox.ctx.close();
  await u?.ctx.close();
});
