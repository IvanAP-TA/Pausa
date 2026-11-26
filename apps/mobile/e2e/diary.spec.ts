// Registra, feed, thread, my diary and notifications in a real browser, against the static export and a real API (see app.spec.ts).
// Two people share a Cerchia; most scenes are set up through the API and the screens are what is exercised.
import { expect, test } from "@playwright/test";
import { api, circleWith, it, logApi, meId, person, signIn, type Person } from "./support-diary";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8798";
let apiUp = false;
test.beforeAll(async () => {
  try {
    apiUp = (await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    apiUp = false;
  }
});
test.beforeEach(() => test.skip(!apiUp, `API not running on ${API}: start the dev stack (see README.md). These tests did NOT run.`));
test.describe.configure({ mode: "serial" });

const NEW = {
  rateLess: "Mezza stella in meno",
  needTwo: "Scrivi almeno due lettere.",
  future: "La data non può essere nel futuro.",
  dateRequired: "Scegli la data.",
  spoilerGate: "Contiene spoiler · tocca per leggere",
  commentGate: "Commento con spoiler: apri per leggerlo",
};
/** Registra folds date, platform, episode and the rest behind "Aggiungi dettagli": open it (an edit starts open). */
const openDetails = async (page: import("@playwright/test").Page) => {
  const d = page.getByTestId("log-details");
  if ((await d.getAttribute("aria-expanded")) !== "true") await d.click();
};
const ymd = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let ann: Person;
let bob: Person;
let cid = "";
let bobId = "";
let annId = "";
let threadUrl = "";
let seriesMedia = "";

test.describe("Registra", () => {
  test("search waits 350 ms and two letters, then one request; the picked title opens the form", async ({ browser }) => {
    ann = await person(browser, "ann");
    bob = await person(browser, "bob");
    await signIn(ann);
    await signIn(bob);
    cid = await circleWith(ann, [bob], "Cineforum");
    bobId = await meId(bob);
    annId = await meId(ann);

    const { page } = ann;
    const searches: string[] = [];
    page.on("request", (r) => r.url().includes("/api/media/search") && searches.push(r.url()));
    await page.goto("/it/log");
    const q = page.getByLabel(it.log.search);
    await q.pressSequentially("b");
    await expect(page.getByText(NEW.needTwo)).toBeVisible();
    await page.waitForTimeout(700);
    expect(searches, "one letter must not search").toEqual([]);
    await q.pressSequentially("reaking", { delay: 60 }); // each key is well under 350 ms after the last
    // the seeded Pausa already holds the title (local) and the catalogue lists it too: one row, not two
    await expect(page.getByRole("button", { name: "Breaking Bad (2008)" })).toHaveCount(1);
    expect(searches).toHaveLength(1);
    expect(searches[0]).toContain("q=breaking");
    await page.getByRole("button", { name: "Breaking Bad (2008)" }).click();
    await expect(page.getByTestId("picked-title")).toContainText("Breaking Bad");
    await expect(page.getByTestId(`share-${cid}`)).toHaveAttribute("aria-checked", "true"); // the Cerchia in use is pre-selected
  });

  test("a half-star rating from the keyboard, a season from the catalogue and an episode, shared with the Cerchia", async () => {
    const { page } = ann;
    const slider = page.getByRole("slider", { name: it.log.rating });
    await slider.focus();
    for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "7");
    await expect(slider).toHaveAttribute("aria-valuetext", "3,5 stelle su 5");
    await page.getByRole("button", { name: NEW.rateLess }).click();
    await expect(slider).toHaveAttribute("aria-valuenow", "6");
    await page.getByRole("button", { name: "Mezza stella in più" }).click();
    await expect(slider).toHaveAttribute("aria-valuenow", "7");

    await openDetails(page);
    await page.getByLabel(it.log.seasonLogged).selectOption("2");
    await page.getByLabel(it.log.episode, { exact: true }).fill("5");
    await page.getByLabel(it.log.review).fill("Bellissima stagione");
    await page.getByRole("checkbox", { name: "Netflix" }).click();
    await page.getByTestId("submit-log").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/log/[^/?]+$`));
    threadUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Breaking Bad");
    await expect(page.locator('[data-testid^="review-"]')).toHaveText("Bellissima stagione");
    await expect(page.getByText("S2·E5")).toBeVisible(); // the card says the facts on one line: "Serie, 2008, S2·E5, su Netflix"
    await expect(page.getByText("su Netflix")).toBeVisible();
    await expect(page.getByRole("img", { name: "3,5 stelle su 5" })).toBeVisible();
  });

  test("seasons come from the catalogue: an episode past the end is refused, so is a future date; the last platform is remembered", async () => {
    const { page } = ann;
    await page.goto("/it/log");
    await page.getByLabel(it.log.search).fill("breaking");
    await page.getByRole("button", { name: /^Breaking Bad/ }).first().click();
    await openDetails(page);
    const seasonSelect = page.getByLabel(it.log.seasonLogged);
    await expect(seasonSelect.locator("option")).toHaveCount(3); // the season menu, from GET /api/media/:id: the whole show, 1 and 2 (the mock series has two seasons)
    await expect(seasonSelect.locator("option").nth(2)).toHaveText("Stagione 2 (13 ep.)");
    await seasonSelect.selectOption("2");
    await expect(page.getByLabel(it.log.episode, { exact: true })).toHaveAttribute("placeholder", "1 / 13");
    await page.getByLabel(it.log.episode, { exact: true }).fill("14");
    await expect(page.getByText("Un numero da 1 a 13.")).toBeVisible();
    await page.getByTestId("submit-log").click();
    await expect(page).toHaveURL(/\/it\/log$/); // refused before any request

    await page.getByLabel(it.log.episode, { exact: true }).fill("3");
    await page.getByLabel(it.log.watchedOn).fill(ymd(2));
    await expect(page.getByText(NEW.future)).toBeVisible();
    await page.getByLabel(it.log.watchedOn).fill(""); // the browser's date picker cannot hold an impossible day, only an empty one
    await expect(page.getByText(NEW.dateRequired)).toBeVisible();
    await page.getByRole("button", { name: "Ieri" }).click();
    await expect(page.getByText(NEW.future)).toHaveCount(0);
    await page.getByTestId("submit-log").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/log/`));
    // the platform used last time is remembered for the next form
    await page.goto("/it/log");
    await page.getByLabel(it.log.search).fill("breaking");
    await page.getByRole("button", { name: /^Breaking Bad/ }).first().click();
    await openDetails(page);
    await expect(page.getByRole("checkbox", { name: "Netflix" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Un'altra piattaforma")).toHaveValue("Netflix");
  });

  test("a title Pausa does not hold yet has free numbers for season and episode", async () => {
    const { page } = ann;
    await page.goto("/it/log");
    await page.getByLabel(it.log.search).fill("death note");
    await page.getByRole("button", { name: /^Death Note/ }).click();
    await openDetails(page);
    await expect(page.getByLabel(it.log.seasonLogged)).toHaveCount(0); // no season menu before the title exists
    await page.getByLabel(it.log.season, { exact: true }).fill("1");
    await page.getByLabel(it.log.episode, { exact: true }).fill("2");
    await page.getByTestId("submit-log").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/log/`));
    await expect(page.getByText("S1·E2")).toBeVisible();
    await expect(page.getByText(it.kind.anime)).toBeVisible();
  });

  test("'Sto guardando' writes the position and no viewing; the synopsis shows; the way to the import is there", async () => {
    const { page } = ann;
    type Prog = Array<{ media: { id: string; title: string }; season: number | null; episode: number | null; status: string }>;
    const before = (await api<Prog>(ann, "GET", "/api/me/progress")).json.find((x) => x.media.title === "Breaking Bad");
    const logsBefore = (await api<{ items: unknown[] }>(ann, "GET", "/api/me/diary?locale=it")).json.items.length;
    await page.goto("/it/log");
    await expect(page.getByTestId("log-import")).toHaveAttribute("href", "/it/import");
    await page.getByLabel(it.log.search).fill("breaking");
    await page.getByRole("button", { name: /^Breaking Bad/ }).first().click();
    await expect(page.getByTestId("overview")).toContainText("chimica"); // the synopsis of the catalogue, folded to two lines
    await page.getByRole("radio", { name: it.log.modeWatching }).click();
    await page.getByLabel(it.log.seasonLogged).selectOption("1");
    await page.getByLabel(it.log.episode, { exact: true }).fill("4");
    await page.getByTestId("submit-log").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}$`));
    const after = (await api<Prog>(ann, "GET", "/api/me/progress")).json.find((x) => x.media.title === "Breaking Bad");
    expect([after?.season, after?.episode, after?.status]).toEqual([1, 4, "watching"]);
    expect((await api<{ items: unknown[] }>(ann, "GET", "/api/me/diary?locale=it")).json.items.length, "no viewing is written").toBe(logsBefore);
    if (before && after) await api(ann, "PUT", `/api/media/${after.media.id}/progress`, { season: before.season ?? undefined, episode: before.episode ?? undefined, status: before.status }); // leave the scene as it was
  });

  test("the server's refusal is shown in words and the form keeps what was typed", async () => {
    const { page } = ann;
    await page.goto("/it/log");
    await page.getByLabel(it.log.search).fill("breaking");
    await page.getByRole("button", { name: /^Breaking Bad/ }).first().click();
    await page.route("**/api/logs",(route) => (route.request().method() === "POST" ? route.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "30" }, body: '{"code":"rate_limited","retryAfter":30}' }) : route.continue()));
    await page.getByLabel(it.log.review).fill("Non perdere questo testo");
    await page.getByTestId("submit-log").click();
    await expect(page.getByText("30 secondi")).toBeVisible();
    await expect(page.getByLabel(it.log.review)).toHaveValue("Non perdere questo testo");
    await page.unroute("**/api/logs");
  });
});

test.describe("feed, spoilers, reactions, comments", () => {
  let spoilerLog = "";
  let matrixLog = "";

  test("a spoiler review does not travel to the other person; tapping it opens it in place (v1)", async () => {
    const s = await logApi(ann, { mediaKey: "tmdb:movie:603", rating: 9, review: "Neo è l'eletto SEGRETO", containsSpoilers: true, circles: [cid] });
    spoilerLog = s.json.id;
    const m = await logApi(ann, { mediaKey: "tmdb:movie:603", watchedOn: "2026-10-20", rating: 8, review: "Un classico", circles: [cid] });
    matrixLog = m.json.id;
    const { page } = bob;
    await page.goto(`/it/c/${cid}/feed`);
    await expect(page.getByTestId(`log-${spoilerLog}`)).toBeVisible();
    await expect(page.getByTestId(`spoiler-${spoilerLog}`)).toBeVisible();
    expect(await page.content(), "the spoiler text must not be in the page").not.toContain("SEGRETO");
    await page.getByTestId(`spoiler-${spoilerLog}`).click();
    await expect(page.getByTestId(`review-${spoilerLog}`)).toContainText("SEGRETO");
    expect(page.url(), "it stays on the diary").toMatch(new RegExp(`/c/${cid}(/feed)?$`));
  });

  test("reactions: toggled at once, kept after a reload, put back when the server refuses", async () => {
    const { page } = bob;
    await page.goto(`/it/c/${cid}/log/${matrixLog}`);
    const pop = page.getByTestId("react-🍿");
    await expect(pop).toHaveAttribute("aria-pressed", "false");
    await pop.click();
    await expect(pop).toHaveAttribute("aria-pressed", "true");
    await expect(pop).toHaveAttribute("aria-label", /1 reazione/);
    await page.reload();
    await expect(page.getByTestId("react-🍿")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("react-🍿").click();
    await expect(page.getByTestId("react-🍿")).toHaveAttribute("aria-pressed", "false");

    await page.route("**/reactions", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"code":"internal"}' }));
    await page.getByTestId("react-😂").click();
    await expect(page.getByRole("alert")).toContainText(it.app.apiErrors.internal);
    await expect(page.getByTestId("react-😂")).toHaveAttribute("aria-pressed", "false");
    await page.unroute("**/reactions");
  });

  test("comments and one level of replies; a spoiler comment stays hidden until tapped", async () => {
    const b = bob.page;
    await b.goto(`/it/c/${cid}/log/${matrixLog}`);
    await b.getByTestId("composer-input").fill("Concordo, un classico");
    await b.getByTestId("composer-send").click();
    await expect(b.getByText("Concordo, un classico")).toBeVisible();

    const a = ann.page;
    await a.goto(`/it/c/${cid}/log/${matrixLog}`);
    await expect(a.getByText("Concordo, un classico")).toBeVisible();
    await a.getByRole("button", { name: `Rispondi a ${bob.name}` }).click();
    await expect(a.getByText(`Rispondi a ${bob.name}`).first()).toBeVisible();
    await a.getByTestId("composer-input").fill("Grazie!");
    await a.getByTestId("composer-send").click();
    await expect(a.getByText("Grazie!")).toBeVisible();
    await expect(a.getByTestId(/^comment-/)).toHaveCount(2);
    // a reply has no "Rispondi": one level only
    await expect(a.getByRole("button", { name: /^Rispondi a/ })).toHaveCount(1);

    await api(ann, "POST", `/api/circles/${cid}/logs/${matrixLog}/comments`, { body: "Il finale è FINALE-SEGRETO", isSpoiler: true });
    await b.reload();
    await expect(b.getByRole("button", { name: NEW.commentGate })).toBeVisible();
    expect(await b.content()).not.toContain("FINALE-SEGRETO");
    await b.getByRole("button", { name: NEW.commentGate }).click();
    await expect(b.getByText("Il finale è FINALE-SEGRETO")).toBeVisible();
  });

  test("who may do what: edit only your own, delete your own or anything under your viewing, report only what is not yours", async () => {
    const b = bob.page;
    const a = ann.page;
    await b.goto(`/it/c/${cid}/log/${matrixLog}`);
    const mine = b.getByTestId(/^comment-/).filter({ hasText: "Concordo, un classico" });
    await expect(mine.getByRole("button", { name: it.manage.edit })).toBeVisible();
    await expect(mine.getByRole("button", { name: it.manage.report.button })).toHaveCount(0);
    const hers = b.getByTestId(/^comment-/).filter({ hasText: "Grazie!" });
    await expect(hers.getByRole("button", { name: it.manage.edit })).toHaveCount(0);
    await expect(hers.getByRole("button", { name: it.manage.delete })).toHaveCount(0); // bob is not the author of the viewing

    await mine.getByRole("button", { name: it.manage.edit }).click();
    await b.getByLabel("Modifica il commento").fill("Concordo, davvero un classico");
    await b.getByRole("button", { name: it.manage.saveChanges }).click();
    await expect(b.getByText("Concordo, davvero un classico")).toBeVisible();

    await hers.getByRole("button", { name: it.manage.report.button }).click();
    await b.getByRole("radio", { name: it.manage.report.reasons.spam }).click();
    await b.getByLabel(it.manage.report.note).fill("Messaggio ripetuto");
    await b.getByRole("button", { name: it.manage.report.send }).click();
    await expect(b.getByText(it.manage.report.thanks)).toBeVisible();

    // ann wrote the viewing: she may delete bob's comment, and it takes its reply with it
    await a.goto(`/it/c/${cid}/log/${matrixLog}`);
    const bobs = a.getByTestId(/^comment-/).filter({ hasText: "Concordo, davvero un classico" });
    await bobs.getByRole("button", { name: it.manage.delete }).click();
    await bobs.getByRole("button", { name: it.manage.deleteConfirm }).click();
    await expect(a.getByText("Concordo, davvero un classico")).toHaveCount(0);
    await expect(a.getByText("Grazie!")).toHaveCount(0);
  });

  test("viewing's author can edit and delete; a stranger cannot", async () => {
    const b = bob.page;
    await b.goto(`/it/c/${cid}/log/${matrixLog}`);
    await expect(b.getByRole("link", { name: it.manage.edit })).toHaveCount(0);
    await expect(b.getByRole("button", { name: it.manage.report.button }).first()).toBeVisible();
    await ann.page.goto(`/it/c/${cid}/log/${matrixLog}`);
    await expect(ann.page.getByRole("link", { name: it.manage.edit })).toBeVisible();
  });

  test("the author edits inside the Cerchia (v1 l/:logId/edit); a stranger finds nothing there", async () => {
    const { page } = ann;
    await page.goto(`/it/c/${cid}/log/${matrixLog}`);
    await page.getByRole("link", { name: it.manage.edit }).click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/log/${matrixLog}/edit$`));
    await expect(page.getByLabel(it.log.review)).toBeVisible();
    await page.getByTestId("submit-log").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/log/${matrixLog}$`));
    await bob.page.goto(`/it/c/${cid}/log/${matrixLog}/edit`);
    await expect(bob.page.getByLabel(it.log.review)).toHaveCount(0);
  });
});

test.describe("the feed paginates and filters", () => {
  test("twenty a page without skips: the button and the scroll both load the next, to the end", async () => {
    // 24 more viewings of the same title on different days (60 a person an hour is allowed)
    for (let i = 0; i < 24; i++) await logApi(ann, { mediaKey: "tmdb:movie:603", watchedOn: ymd(-30 - i), rating: (i % 10) + 1, circles: [cid] });
    const everything: string[] = [];
    let before: string | null = null;
    do {
      const page: { json: { items: Array<{ id: string }>; next: string | null } } = await api(bob, "GET", `/api/circles/${cid}/feed${before ? `?before=${encodeURIComponent(before)}` : ""}`);
      everything.push(...page.json.items.map((i) => i.id));
      before = page.json.next;
    } while (before);
    expect(everything.length).toBeGreaterThan(26);
    expect(new Set(everything).size).toBe(everything.length);

    const { page } = bob;
    await page.goto(`/it/c/${cid}/feed`);
    await expect(page.getByTestId(/^log-/)).toHaveCount(20);
    await page.getByTestId("load-more").click();
    await expect(page.getByTestId(/^log-/).nth(20)).toBeVisible();
    // after the click the list continues by itself when it is scrolled to the end
    await page.reload();
    await expect(page.getByTestId(/^log-/)).toHaveCount(20);
    await page.getByTestId("load-more").scrollIntoViewIfNeeded();
    await expect(page.getByTestId(/^log-/)).toHaveCount(everything.length, { timeout: 10_000 });
    const ids = await page.getByTestId(/^log-/).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(4)));
    expect(ids).toEqual(everything); // same rows, same order, none twice
    await expect(page.getByText(it.feed.endOfFeed)).toBeVisible();
  });

  test("filters: by kind and by minimum rating; empty result says so and 'azzera' brings everything back", async () => {
    const { page } = bob;
    await page.goto(`/it/c/${cid}/feed`);
    // v1: "Cerca e filtra" is a disclosure in the page, not a sheet; type, year and stars are selects
    await page.getByTestId("open-filters").click();
    await expect(page.getByTestId("open-filters")).toHaveAttribute("aria-expanded", "true");
    await page.getByTestId("filter-kind").selectOption("tv");
    await page.getByTestId("apply-filters").click();
    await expect(page.getByTestId(/^log-/).first()).toContainText(/breaking bad/i);
    const rows = await page.getByTestId(/^log-/).count();
    expect(rows).toBeGreaterThan(0);
    for (const t of await page.getByTestId(/^log-/).allInnerTexts()) expect(t.toLowerCase()).toContain("breaking bad"); // display capitals: compare without case
    await expect(page.getByTestId("filter-count")).toHaveText(new RegExp(`^${rows}\+?$`));
    // first steps and memories are for the plain diary only
    await expect(page.getByTestId("first-steps")).toHaveCount(0);

    // the panel stays open while filters are active
    await page.getByTestId("filter-kind").selectOption("movie");
    await page.getByTestId("filter-rating").selectOption("8");
    await page.getByTestId("apply-filters").click();
    await expect(page.getByTestId(/^log-/).first()).toContainText(/matrix/i); // the list was replaced
    const films = await page.getByTestId(/^log-/).allInnerTexts();
    expect(films.length).toBeGreaterThan(0);
    expect(films.every((t) => t.toLowerCase().includes("matrix"))).toBe(true);
    const stars = await page.getByTestId(/^log-/).evaluateAll((els) => els.map((e) => Number((e.querySelector('[role="img"][aria-label$="stelle su 5"]')?.getAttribute("aria-label") ?? "0").replace(",", ".").split(" ")[0])));
    expect(stars.length).toBeGreaterThan(2);
    expect(Math.min(...stars), "every row has at least four stars").toBeGreaterThanOrEqual(4);

    await page.getByLabel(it.log.platform).fill("Piattaforma-inesistente");
    await page.getByTestId("apply-filters").click();
    await expect(page.getByTestId("filter-none")).toHaveText(it.feed.filter.none);
    await page.getByRole("button", { name: it.feed.filter.clear }).first().click();
    await expect(page.getByTestId(/^log-/).first()).toBeVisible();
    await expect(page.getByTestId("filter-count")).toHaveCount(0);
  });

  test("search by title and 'visto con'", async () => {
    const r = await logApi(bob, { mediaKey: "tmdb:movie:27205", watchedOn: ymd(-1), rating: 7, circles: [cid], watchedWith: [annId] });
    expect(r.status).toBe(201);
    const { page } = bob;
    await page.goto(`/it/c/${cid}/feed`);
    await page.getByTestId("open-filters").click();
    await page.getByTestId("filter-q").fill("INCEP");
    await page.getByTestId("apply-filters").click();
    await expect(page.getByTestId(/^log-/).first()).toContainText(/inception/i);
    for (const t of await page.getByTestId(/^log-/).allInnerTexts()) expect(t.toLowerCase()).toContain("inception");
    await page.getByTestId("filter-q").fill("");
    // "Visto con": a person chip, one of the group; the first member is ann
    const withGroup = page.getByRole("radiogroup", { name: it.feed.filter.with });
    await withGroup.getByRole("radio").nth(1).click();
    await expect(withGroup.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("apply-filters").click();
    await expect(page.getByTestId(/^log-/)).toHaveCount(1);
    await expect(page.getByTestId(/^log-/).first()).toContainText(/inception/i);
  });
});

test.describe("when the network fails", () => {
  test("the first page: an error in words and a retry that works; a later page: the list stays and only that part retries", async () => {
    const { page } = bob;
    let failing = true;
    const feedUrl = /\/api\/circles\/[^/]+\/feed/;
    await page.route(feedUrl, (route) => (failing ? route.abort("failed") : route.continue()));
    await page.goto(`/it/c/${cid}/feed`);
    await expect(page.getByRole("alert")).toContainText(it.app.apiErrors.network);
    await expect(page.getByTestId(/^log-/)).toHaveCount(0);
    failing = false;
    await page.getByRole("button", { name: it.errors.retry }).click();
    await expect(page.getByTestId(/^log-/)).toHaveCount(20);

    failing = true; // the second page fails: what is on screen stays
    // pressed without scrolling to it: scrolling near the end loads the next page by itself (and the button gives way to it)
    await page.getByTestId("load-more").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toContainText(it.app.apiErrors.network);
    await expect(page.getByTestId(/^log-/)).toHaveCount(20);
    failing = false;
    await page.getByRole("button", { name: it.errors.retry }).click();
    await expect(page.getByTestId(/^log-/).nth(20)).toBeVisible();
    await page.unroute(feedUrl);
  });
});

test.describe("the title page", () => {
  test("synopsis, seasons, cast, my viewings, a Registra that arrives with the title already chosen, and the way to a list", async () => {
    const { page } = ann;
    const diary = (await api<{ items: Array<{ media: { id: string; title: string } }> }>(ann, "GET", "/api/me/diary")).json;
    const bb = diary.items.find((l) => l.media.title === "Breaking Bad")!.media.id;
    await page.goto(`/it/t/${bb}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/breaking bad/i);
    await expect(page.getByText("Stagione 1 (7 ep.)")).toBeVisible();
    await expect(page.getByText("Stagione 2 (13 ep.)")).toBeVisible();
    await expect(page.getByText("Bryan Cranston")).toBeVisible();
    await expect(page.getByTestId(/^log-/).first()).toBeVisible(); // my own viewings of it
    await expect(page.getByRole("link", { name: it.lists.addTo })).toHaveAttribute("href", `/it/lists?add=${bb}`);
    await page.getByTestId("log-this").click();
    await page.waitForURL(new RegExp(`/it/log\\?media=${bb}`));
    await expect(page.getByTestId("picked-title")).toContainText(/breaking bad/i); // no search needed
    await openDetails(page);
    await expect(page.getByTestId("season").locator('option[value="2"]')).toHaveCount(1); // the seasons of the title came with it
  });
});

test.describe("my diary: continue watching, edit, sharing, delete", () => {
  test("the strip advances an episode and a season, and the position is the server's", async () => {
    const { page } = ann;
    const before = (await api<Array<{ media: { id: string; title: string }; season: number; episode: number }>>(ann, "GET", "/api/me/progress")).json;
    expect(before.length).toBeGreaterThan(1); // Breaking Bad and Death Note
    const p = before.find((x) => x.media.title === "Breaking Bad")!;
    seriesMedia = p.media.id;
    await page.goto("/it/diary");
    const where = page.getByTestId(`progress-where-${seriesMedia}`);
    await expect(where).toContainText(`Stagione ${p.season} · episodio ${p.episode}`);
    await page.getByRole("button", { name: /^\+1 episodio: Breaking Bad/ }).click();
    await expect(where).not.toContainText(`episodio ${p.episode}`, { timeout: 8000 });
    const after = (await api<Array<{ media: { id: string }; season: number; episode: number }>>(ann, "GET", "/api/me/progress")).json.find((x) => x.media.id === seriesMedia)!;
    expect(after.season * 1000 + after.episode).toBeGreaterThan(p.season * 1000 + p.episode);
    await expect(where).toContainText(`Stagione ${after.season} · episodio ${after.episode}`);
    await page.getByRole("button", { name: /^Nuova stagione: Breaking Bad/ }).click();
    await expect(where).toContainText(`Stagione ${after.season + 1} · episodio 1`, { timeout: 8000 });
    await page.getByRole("button", { name: /^Finito o mollato: Breaking Bad/ }).click();
    await expect(page.getByTestId(`progress-${seriesMedia}`)).toHaveCount(0);
    expect((await api<Array<{ media: { id: string } }>>(ann, "GET", "/api/me/progress")).json.some((x) => x.media.id === seriesMedia)).toBe(false);
  });

  let mine = "";
  test("edit: the form is filled from the diary, tags are kept when not touched, sharing changes in the same save", async () => {
    mine = (await logApi(ann, { mediaKey: "tmdb:movie:603", watchedOn: ymd(0), rating: 6, review: "DA-MODIFICARE", platform: "Prime Video", circles: [cid], watchedWith: [bobId] })).json.id;
    const { page } = ann;
    await page.goto("/it/diary");
    await page.getByTestId(`log-${mine}`).getByRole("link", { name: /^Modifica/ }).click();
    await page.waitForURL(new RegExp(`/it/log/${mine}$`));
    await expect(page.getByLabel(it.log.review)).toHaveValue("DA-MODIFICARE");
    await expect(page.getByRole("slider", { name: it.log.rating })).toHaveAttribute("aria-valuenow", "6");
    await expect(page.getByLabel(it.log.watchedOn)).toHaveValue(ymd(0));
    await expect(page.getByTestId(`with-${bobId}`)).toHaveAttribute("aria-checked", "true");
    await page.getByLabel(it.log.review).fill("MODIFICATO");
    await page.getByRole("slider", { name: it.log.rating }).focus();
    await page.keyboard.press("ArrowRight");
    await page.getByTestId("submit-log").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/log/${mine}`));
    await expect(page.locator('[data-testid^="review-"]')).toHaveText("MODIFICATO");
    await expect(page.getByRole("img", { name: "3,5 stelle su 5" })).toBeVisible();
    const t = (await api<{ watchedWith: Array<{ id: string }>; log: { platform: string } }>(bob, "GET", `/api/circles/${cid}/logs/${mine}`)).json;
    expect(t.watchedWith.map((p) => p.id)).toEqual([bobId]);
    expect(t.log.platform).toBe("Prime Video");
  });

  test("sharing: take it out of the Cerchia with its X (the other person stops seeing it), add it back", async () => {
    const { page } = ann;
    await page.goto("/it/diary");
    await expect(page.getByTestId(`shared-${mine}`)).toContainText("Cineforum");
    await page.getByTestId(`unshare-${mine}-${cid}`).click();
    await expect(page.getByTestId(`shared-${mine}`)).toContainText(it.space.onlyYou);
    await expect(page.getByText(it.space.notice.unshared)).toBeVisible();
    expect((await api(bob, "GET", `/api/circles/${cid}/logs/${mine}`)).status).toBe(404);
    const pick = page.getByTestId(`add-to-${mine}`); // a list when there are several Cerchie to add it to, a single button for one
    if (await pick.count()) await pick.selectOption(cid);
    await page.getByTestId(`add-${mine}`).click();
    await expect(page.getByTestId(`shared-${mine}`)).toContainText("Cineforum");
    expect((await api(bob, "GET", `/api/circles/${cid}/logs/${mine}`)).status).toBe(200);
  });

  test("the tabs: 'All (n)' and 'Only private (n)' count, and 'Only mine' makes a viewing private for good", async () => {
    const { page } = ann;
    const counts = async () => (await api<{ all: number; private: number }>(ann, "GET", "/api/me/diary/counts")).json;
    const before = await counts();
    await page.goto("/it/diary");
    await expect(page.getByTestId("tab-all")).toContainText(`(${before.all})`);
    await expect(page.getByTestId("tab-private")).toContainText(`(${before.private})`);
    await page.getByTestId(`private-${mine}`).click();
    await expect(page.getByTestId(`shared-${mine}`)).toContainText(it.space.onlyYou);
    await expect(page.getByTestId("tab-private")).toContainText(`(${before.private + 1})`);
    expect((await api(bob, "GET", `/api/circles/${cid}/logs/${mine}`)).status).toBe(404);
    await page.getByTestId("tab-private").click();
    await page.waitForURL(/\/it\/diary\?only=private/);
    await expect(page.getByTestId(`log-${mine}`)).toBeVisible();
    const priv = (await api<{ items: Array<{ id: string; sharedIn: string[] }> }>(ann, "GET", "/api/me/diary?only=private")).json.items;
    expect(priv.length).toBe(before.private + 1);
    expect(priv.every((l) => l.sharedIn.length === 0)).toBe(true);
    // put it back in the Cerchia: on the private tab it leaves the list
    const pick = page.getByTestId(`add-to-${mine}`);
    if (await pick.count()) await pick.selectOption(cid);
    await page.getByTestId(`add-${mine}`).click();
    await expect(page.getByTestId(`log-${mine}`)).toHaveCount(0);
    await page.getByTestId("tab-all").click();
    await expect(page.getByTestId(`shared-${mine}`)).toContainText("Cineforum");
  });

  test("delete asks in a dialog (cancel changes nothing), then removes the viewing everywhere", async () => {
    const { page } = ann;
    await page.getByTestId(`delete-${mine}`).click();
    await expect(page.getByRole("dialog")).toContainText(it.space.deleteBodyShared.slice(0, 30));
    await page.getByRole("button", { name: it.space.cancel }).click(); // asked, not done
    await expect(page.getByTestId(`log-${mine}`)).toBeVisible();
    await page.getByTestId(`delete-${mine}`).click();
    await page.getByTestId("confirm-delete").click();
    await expect(page.getByTestId(`log-${mine}`)).toHaveCount(0);
    expect((await api(bob, "GET", `/api/circles/${cid}/logs/${mine}`)).status).toBe(404);
  });

  test("an empty diary has one clear way forward", async ({ browser }) => {
    const fresh = await person(browser, "fresh");
    await signIn(fresh, "/it/diary");
    await expect(fresh.page.getByText(it.space.emptyTitle)).toBeVisible();
    await expect(fresh.page.getByTestId("empty-cta")).toBeVisible();
    await fresh.page.getByTestId("empty-cta").click();
    await fresh.page.waitForURL("**/it/log");
    await fresh.ctx.close();
  });
});

test.describe("notifications", () => {
  test("the bell counts unread across Cerchie; opening the inbox reads them all", async () => {
    const other = await circleWith(ann, [bob], "Secondo gruppo");
    await logApi(ann, { mediaKey: "tmdb:movie:603", watchedOn: "2026-08-08", circles: [other] });
    const sum = async () => ((await api<{ circles: Array<{ unread: number }> }>(bob, "GET", "/api/me")).json.circles.reduce((n, c) => n + c.unread, 0));
    const total = await sum();
    expect(total).toBeGreaterThan(2);
    const { page } = bob;
    await page.goto("/it/home");
    await expect(page.getByTestId("bell-badge").locator("[data-glyph]")).toHaveAttribute("data-glyph", total > 9 ? "9+" : String(total));
    await expect(page.getByTestId("bell")).toHaveAttribute("aria-label", new RegExp(`${it.notifications.title}: ${total} notifiche non lette`));
    await page.getByTestId("bell").click();
    await page.waitForURL("**/it/notifications");
    await expect(page.getByTestId(/^notice-/).first()).toHaveAccessibleName(/^Non letta/);

    // v1: opening the inbox reads everything; this visit still draws what was unread as unread, filters included
    await expect.poll(sum, { timeout: 8000 }).toBe(0);
    await expect(page.getByTestId("bell-badge")).toHaveCount(0);
    await page.getByRole("radio", { name: "Secondo gruppo" }).click();
    await expect(page.getByTestId(/^notice-/).first()).toHaveAccessibleName(/^Non letta/);
    await page.getByRole("radio", { name: it.feed.filter.any }).click();

    // the next visit sees them read
    await page.reload();
    await expect(page.getByTestId(/^notice-/).first()).not.toHaveAccessibleName(/^Non letta/);
  });

  test("a notice opens what it is about", async () => {
    const { page } = bob;
    await page.goto("/it/notifications");
    const first = page.getByTestId(/^notice-/).first();
    await first.click();
    await page.waitForURL(/\/it\/c\/[^/]+\/log\/[^/?]+/);
    await ann.ctx.close();
    await bob.ctx.close();
  });
});

test.describe("the title page inside a Cerchia", () => {
  test("a card opens it: original title, everyone's viewings, the Cerchia average, the way to log and to a list", async ({ browser }) => {
    const zed = await person(browser, "zed");
    const yan = await person(browser, "yan");
    await signIn(zed);
    await signIn(yan);
    const circle = await circleWith(zed, [yan], "Titoli");
    const a = await logApi(zed, { mediaKey: "tmdb:movie:603", rating: 8, circles: [circle] });
    await logApi(yan, { mediaKey: "tmdb:movie:603", watchedOn: "2026-11-02", rating: 6, circles: [circle] });
    const mediaId = a.json.mediaId;

    const info = await api<{ originalTitle: string; source: string; average: number; rated: number }>(zed, "GET", `/api/circles/${circle}/media/${mediaId}`);
    expect(info.json.rated).toBe(2);
    expect(info.json.average).toBe(7);

    const { page } = yan;
    await page.goto(`/it/c/${circle}/feed`);
    await page.getByTestId(/^log-/).first().getByRole("link", { name: /matrix/i }).last().click();
    await page.waitForURL(new RegExp(`/it/c/${circle}/m/${mediaId}`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/matrix/i);
    await expect(page.getByTestId("circle-average")).toBeVisible();
    await expect(page.getByTestId(/^log-(?!this$)/)).toHaveCount(2); // both members' viewings (not the "log-this" button)
    await expect(page.getByTestId("log-this")).toHaveAttribute("href", new RegExp(`/it/log\\?media=${mediaId}`));
    await expect(page.getByRole("link", { name: it.lists.addTo })).toHaveAttribute("href", `/it/lists?circle=${circle}&add=${mediaId}`);

    await zed.ctx.close();
    await yan.ctx.close();
  });
});
