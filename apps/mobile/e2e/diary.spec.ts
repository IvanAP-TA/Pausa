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
  spoilerGate: "Contiene spoiler · tocca per leggere",
  commentGate: "Commento con spoiler: apri per leggerlo",
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

    await page.getByRole("radio", { name: "2", exact: true }).click();
    await page.getByLabel(it.log.episode, { exact: true }).fill("5");
    await page.getByLabel(it.log.review).fill("Bellissima stagione");
    await page.getByRole("checkbox", { name: "Netflix" }).click();
    await page.getByTestId("submit-log").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/log/[^/?]+$`));
    threadUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Breaking Bad");
    await expect(page.getByTestId("review")).toHaveText("Bellissima stagione");
    await expect(page.getByText("Stagione 2 · episodio 5")).toBeVisible();
    await expect(page.getByText("su Netflix")).toBeVisible();
    await expect(page.getByRole("img", { name: "3,5 stelle su 5" })).toBeVisible();
  });

  test("seasons come from the catalogue: an episode past the end is refused, so is a future date; the last platform is remembered", async () => {
    const { page } = ann;
    await page.goto("/it/log");
    await page.getByLabel(it.log.search).fill("breaking");
    await page.getByRole("button", { name: /^Breaking Bad/ }).first().click();
    await expect(page.getByRole("radio", { name: "2", exact: true })).toBeVisible(); // the season picker, from GET /api/media/:id
    await expect(page.getByRole("radio", { name: "3", exact: true })).toHaveCount(0); // the mock series has two seasons
    await page.getByRole("radio", { name: "2", exact: true }).click();
    await expect(page.getByText("Stagione 2 (13 ep.)")).toBeVisible();
    await page.getByLabel(it.log.episode, { exact: true }).fill("14");
    await expect(page.getByText("Un numero da 1 a 13.")).toBeVisible();
    await page.getByTestId("submit-log").click();
    await expect(page).toHaveURL(/\/it\/log$/); // refused before any request

    await page.getByLabel(it.log.episode, { exact: true }).fill("3");
    await page.getByLabel(it.log.watchedOn).fill(ymd(2));
    await expect(page.getByText(NEW.future)).toBeVisible();
    await page.getByLabel(it.log.watchedOn).fill("2026-02-30");
    await expect(page.getByText("Scrivi la data così: 2026-11-25.")).toBeVisible();
    await page.getByRole("button", { name: "Ieri" }).click();
    await expect(page.getByText(NEW.future)).toHaveCount(0);
    await page.getByTestId("submit-log").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/log/`));
    // the platform used last time is remembered for the next form
    await page.goto("/it/log");
    await page.getByLabel(it.log.search).fill("breaking");
    await page.getByRole("button", { name: /^Breaking Bad/ }).first().click();
    await expect(page.getByRole("checkbox", { name: "Netflix" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Un'altra piattaforma")).toHaveValue("Netflix");
  });

  test("a title Pausa does not hold yet has free numbers for season and episode", async () => {
    const { page } = ann;
    await page.goto("/it/log");
    await page.getByLabel(it.log.search).fill("death note");
    await page.getByRole("button", { name: /^Death Note/ }).click();
    await expect(page.getByRole("radio", { name: "1", exact: true })).toHaveCount(0); // no season list before the title exists
    await page.getByLabel(it.log.season, { exact: true }).fill("1");
    await page.getByLabel(it.log.episode, { exact: true }).fill("2");
    await page.getByTestId("submit-log").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/log/`));
    await expect(page.getByText("Stagione 1 · episodio 2")).toBeVisible();
    await expect(page.getByText(it.kind.anime, { exact: true })).toBeVisible();
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

  test("a spoiler review does not travel to the other person; 'mostra' opens the thread with it", async () => {
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
    await page.waitForURL(/reveal=1/);
    await expect(page.getByTestId("review")).toContainText("SEGRETO");
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
    await page.getByTestId("open-filters").click();
    await page.getByRole("radio", { name: it.kind.tv }).click();
    await page.getByTestId("apply-filters").click();
    await expect(page.getByTestId(/^log-/).first()).toContainText(/breaking bad/i);
    const rows = await page.getByTestId(/^log-/).count();
    expect(rows).toBeGreaterThan(0);
    for (const t of await page.getByTestId(/^log-/).allInnerTexts()) expect(t.toLowerCase()).toContain("breaking bad"); // display capitals: compare without case
    await expect(page.getByText("1 filtro")).toBeVisible();

    await page.getByTestId("open-filters").click();
    await page.getByRole("radio", { name: it.kind.movie }).click();
    await page.getByRole("radio", { name: "4 stelle o più" }).click();
    await page.getByTestId("apply-filters").click();
    await expect(page.getByTestId(/^log-/).first()).toContainText(/matrix/i); // the list was replaced
    const films = await page.getByTestId(/^log-/).allInnerTexts();
    expect(films.length).toBeGreaterThan(0);
    expect(films.every((t) => t.toLowerCase().includes("matrix"))).toBe(true);
    const stars = await page.getByTestId(/^log-/).evaluateAll((els) => els.map((e) => Number((e.querySelector('[role="img"][aria-label$="stelle su 5"]')?.getAttribute("aria-label") ?? "0").replace(",", ".").split(" ")[0])));
    expect(stars.length).toBeGreaterThan(2);
    expect(Math.min(...stars), "every row has at least four stars").toBeGreaterThanOrEqual(4);

    await page.getByTestId("open-filters").click();
    await page.getByLabel(it.log.platform).fill("Piattaforma-inesistente");
    await page.getByTestId("apply-filters").click();
    await expect(page.getByText(it.feed.filter.none)).toBeVisible();
    await page.getByRole("button", { name: it.feed.filter.clear }).first().click();
    await expect(page.getByTestId(/^log-/).first()).toBeVisible();
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
    await page.getByTestId("load-more").click();
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
    await expect(page.getByRole("radio", { name: "2", exact: true })).toBeVisible();
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
    await expect(page.getByTestId("review")).toHaveText("MODIFICATO");
    await expect(page.getByRole("img", { name: "3,5 stelle su 5" })).toBeVisible();
    const t = (await api<{ watchedWith: Array<{ id: string }>; log: { platform: string } }>(bob, "GET", `/api/circles/${cid}/logs/${mine}`)).json;
    expect(t.watchedWith.map((p) => p.id)).toEqual([bobId]);
    expect(t.log.platform).toBe("Prime Video");
  });

  test("sharing: take it out of the Cerchia (the other person stops seeing it), put it back", async () => {
    const { page } = ann;
    await page.goto("/it/diary");
    const card = page.getByTestId(`log-${mine}`);
    await expect(page.getByTestId(`shared-${mine}`)).toContainText("Cineforum");
    await card.getByTestId(`share-toggle-${mine}`).click();
    await page.getByTestId(`share-${mine}-${cid}`).click();
    await page.getByTestId(`share-save-${mine}`).click();
    await expect(page.getByTestId(`shared-${mine}`)).toContainText(it.space.onlyYou);
    expect((await api(bob, "GET", `/api/circles/${cid}/logs/${mine}`)).status).toBe(404);
    await card.getByTestId(`share-toggle-${mine}`).click();
    await page.getByTestId(`share-${mine}-${cid}`).click();
    await page.getByTestId(`share-save-${mine}`).click();
    await expect(page.getByTestId(`shared-${mine}`)).toContainText("Cineforum");
    expect((await api(bob, "GET", `/api/circles/${cid}/logs/${mine}`)).status).toBe(200);
  });

  test("delete needs a second press and removes the viewing everywhere", async () => {
    const { page } = ann;
    const card = page.getByTestId(`log-${mine}`);
    await card.getByRole("button", { name: it.manage.delete }).click(); // asks
    await expect(page.getByTestId(`log-${mine}`)).toBeVisible();
    await card.getByRole("button", { name: it.space.deleteCta }).click(); // does
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
  test("the bell counts unread across Cerchie; the inbox reads them per Cerchia and all at once", async () => {
    const other = await circleWith(ann, [bob], "Secondo gruppo");
    await logApi(ann, { mediaKey: "tmdb:movie:603", watchedOn: "2026-08-08", circles: [other] });
    const sum = async () => ((await api<{ circles: Array<{ unread: number }> }>(bob, "GET", "/api/me")).json.circles.reduce((n, c) => n + c.unread, 0));
    const total = await sum();
    expect(total).toBeGreaterThan(2);
    const { page } = bob;
    await page.goto("/it/home");
    await expect(page.getByTestId("bell-badge")).toHaveText(total > 99 ? "99+" : String(total));
    await expect(page.getByTestId("bell")).toHaveAttribute("aria-label", new RegExp(`${it.notifications.title}: ${total} notifiche non lette`));
    await page.getByTestId("bell").click();
    await page.waitForURL("**/it/notifications");
    await expect(page.getByTestId(/^notice-/).first()).toHaveAccessibleName(/^Non letta/);

    // "Segna lette" for one Cerchia leaves the other's unread
    await page.getByRole("radio", { name: "Secondo gruppo" }).click();
    await page.getByTestId("read-circle").click();
    await expect.poll(sum, { timeout: 8000 }).toBeLessThan(total);
    await expect.poll(async () => (await api<{ circles: Array<{ id: string; unread: number }> }>(bob, "GET", "/api/me")).json.circles.find((c) => c.id === other)?.unread).toBe(0);
    expect(await sum()).toBeGreaterThan(0); // the first Cerchia still has some
    await expect(page.getByTestId("bell-badge")).toHaveText(String(await sum()));

    await page.getByRole("radio", { name: it.feed.filter.any }).click();
    await page.getByTestId("read-all").click();
    await expect.poll(sum, { timeout: 8000 }).toBe(0);
    await expect(page.getByTestId("bell-badge")).toHaveCount(0);
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
