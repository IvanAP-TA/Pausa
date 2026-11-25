// Cerchia hub, profile, preferences, person page, ranking, insights (with the "my year" image) and "withdraw", in a real browser
// against the static export and the dev API. Three people share a Cerchia; scenes are set up through the API, the screens are what is tested.
import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { api, circleWith, it, logApi, meId, person, run, signIn, type Person } from "./support-diary";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8798";
const persist = process.env.PAUSA_PERSIST ?? path.resolve(__dirname, "../../..", ".dev", "8798", "d1");
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

let ann: Person;
let bob: Person;
let cara: Person;
let cid = "";
let annId = "";
let bobId = "";
const ANN_NOW = "Ann Lee"; // ann renames herself in the profile test; later tests see the new name

test.describe("the Cerchia hub", () => {
  test("links to every part of the Cerchia, shows the latest viewings and opens a person", async ({ browser }) => {
    ann = await person(browser, "ann");
    bob = await person(browser, "bob");
    cara = await person(browser, "cara");
    await signIn(ann);
    await signIn(bob);
    await signIn(cara);
    cid = await circleWith(ann, [bob, cara], "Gruppo Prova");
    annId = await meId(ann);
    bobId = await meId(bob);
    // ann: Matrix 9, Inception 8; bob: Matrix 7, Inception 8, Se7en 10; cara: Matrix 9 (three people on Matrix)
    await logApi(ann, { mediaKey: "tmdb:movie:603", rating: 9, circles: [cid], platform: "Netflix" });
    await logApi(ann, { mediaKey: "tmdb:movie:27205", rating: 8, circles: [cid], platform: "Netflix" });
    await logApi(bob, { mediaKey: "tmdb:movie:603", rating: 7, circles: [cid] });
    await logApi(bob, { mediaKey: "tmdb:movie:27205", rating: 8, circles: [cid] });
    await logApi(bob, { mediaKey: "tmdb:movie:807", rating: 10, circles: [cid] });
    await logApi(cara, { mediaKey: "tmdb:movie:603", rating: 9, circles: [cid] });

    const { page } = ann;
    await page.goto(`/it/c/${cid}`);
    const nav = page.getByRole("navigation", { name: "Sezioni della Cerchia" });
    await expect(nav.getByRole("link", { name: "Feed" })).toHaveAttribute("href", `/it/c/${cid}/feed`);
    await expect(nav.getByRole("link", { name: it.tabs.ranking })).toHaveAttribute("href", `/it/c/${cid}/ranking`);
    await expect(nav.getByRole("link", { name: it.insights.title })).toHaveAttribute("href", `/it/c/${cid}/insights`);
    await expect(nav.getByRole("link", { name: "Persone" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: it.tabs.lists })).toHaveAttribute("href", `/it/lists?circle=${cid}`);
    await expect(nav.getByRole("link", { name: it.tabs.serata })).toHaveAttribute("href", `/it/c/${cid}/serate`);
    await expect(nav.getByRole("link", { name: it.app.circle.settings })).toHaveAttribute("href", `/it/c/${cid}/settings`);
    await expect(page.getByTestId(/^log-/)).toHaveCount(3); // the three latest
    await page.getByTestId(`member-${bobId}`).getByRole("link").click();
    await page.waitForURL(new RegExp(`/it/c/${cid}/people/${bobId}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(bob.name);
  });

  test("the tab bar's Serata follows the Cerchia you opened last", async () => {
    const { page } = ann;
    const second = await circleWith(ann, [], "Altro Gruppo");
    await page.goto(`/it/c/${second}`);
    const nav = page.getByRole("navigation", { name: it.app.nav.label });
    await expect(nav.getByRole("link", { name: it.tabs.serata })).toHaveAttribute("href", `/it/c/${second}/serate`);
    await page.goto(`/it/c/${cid}/feed`);
    await expect(nav.getByRole("link", { name: it.tabs.serata })).toHaveAttribute("href", `/it/c/${cid}/serate`);
    await page.reload(); // remembered on this device, not only in memory
    await expect(nav.getByRole("link", { name: it.tabs.serata })).toHaveAttribute("href", `/it/c/${cid}/serate`);
  });
});

test.describe("profile and preferences", () => {
  test("name, bio, five genres at most, an emoji avatar; saved, and what the others see", async () => {
    const { page } = ann;
    await page.goto("/it/me/profile");
    await page.getByTestId("profile-name").fill("Ann Lee");
    await page.getByTestId("profile-bio").fill("Amo il noir e i finali aperti.");
    for (const g of ["horror", "anime", "drama", "comedy", "war", "western"]) await page.getByTestId(`genre-${g}`).click();
    await expect(page.getByTestId("genre-war")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("genre-western")).toHaveAttribute("aria-checked", "false"); // the sixth is refused
    await expect(page.getByText("Hai scelto 5 generi")).toBeVisible();
    await page.getByRole("radio", { name: "Immagine 🍿" }).click();
    await expect(page.getByRole("radio", { name: "Immagine 🍿" })).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("save-profile").click();
    await expect(page.getByText(it.profile.saved)).toBeVisible();
    const s = (await api<{ name: string; bio: string; genres: string[]; image: string }>(ann, "GET", "/api/me/settings")).json;
    expect(s).toMatchObject({ name: "Ann Lee", bio: "Amo il noir e i finali aperti.", genres: ["horror", "anime", "drama", "comedy", "war"], image: "emoji:🍿" });

    await bob.page.goto(`/it/c/${cid}/people/${annId}`);
    await expect(bob.page.getByRole("heading", { level: 1 })).toContainText("Ann Lee");
    await expect(bob.page.getByText("Amo il noir e i finali aperti.")).toBeVisible();
    await expect(bob.page.getByText(it.profile.genres.horror, { exact: true })).toBeVisible();
  });

  test("a bio is cut at 280 and the counter says so", async () => {
    const { page } = ann;
    await page.goto("/it/me/profile");
    await page.getByTestId("profile-bio").fill("x".repeat(400));
    await expect(page.getByTestId("profile-bio")).toHaveValue("x".repeat(280));
    await expect(page.getByText("280/280")).toBeVisible();
  });

  test("favourites: only titles Pausa already holds can be picked; five at most; remove makes room", async () => {
    const { page } = ann;
    await page.goto("/it/me/profile");
    const local = page.getByTestId(/^candidate-local:/);
    // a title that is only in the external catalogue is not offered: favourites need a title Pausa holds
    // (answered by the page itself: whether a given title is still new to this database depends on what earlier runs logged)
    await page.route("**/api/media/search*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ key: "tmdb:movie:424242", kind: "movie", title: "Solo nel catalogo", year: 2020, posterPath: null }]) }));
    await page.getByLabel(it.log.search).fill("solo nel catalogo");
    await expect(page.getByText("Qui trovi solo i titoli che sono già in Pausa")).toBeVisible();
    await expect(page.getByTestId(/^candidate-/)).toHaveCount(0);

    await page.unroute("**/api/media/search*");
    await page.getByLabel(it.log.search).fill("matrix");
    await expect(local).toHaveCount(1);
    await local.click();
    await expect(page.getByTestId(/^fav-/)).toHaveCount(1);
    await expect(page.getByLabel(it.log.search)).toHaveValue(""); // ready for the next one
    await expect(page.getByText("1 di 5")).toBeVisible();
    await page.getByLabel(it.log.search).fill("inception");
    await local.click();
    await expect(page.getByTestId(/^fav-/)).toHaveCount(2);
    expect((await api<{ favorites: unknown[] }>(ann, "GET", "/api/me/settings")).json.favorites).toHaveLength(2);
    await page.getByRole("button", { name: "Togli Matrix dai preferiti" }).click();
    await expect(page.getByTestId(/^fav-/)).toHaveCount(1);
    expect((await api<{ favorites: unknown[] }>(ann, "GET", "/api/me/settings")).json.favorites).toHaveLength(1);
  });

  test("notification types, the digest and the country are saved and survive a reload", async () => {
    const { page } = ann;
    await page.goto("/it/me/settings");
    await expect(page.getByTestId("notify-reaction")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("notify-reaction").click();
    await page.getByTestId("notify-mention").click();
    await page.getByTestId("digest").click();
    await page.getByRole("radio", { name: "Italia", exact: true }).click();
    await page.getByTestId("save-settings").click();
    await expect(page.getByText(it.settings.saved)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("notify-reaction")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("notify-mention")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("notify-comment")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("digest")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Italia", exact: true })).toHaveAttribute("aria-checked", "true");
    const s = (await api<{ notifyOff: string[]; country: string; emailDigest: boolean }>(ann, "GET", "/api/me/settings")).json;
    expect(s.notifyOff.sort()).toEqual(["mention", "reaction"]);
    expect(s).toMatchObject({ country: "IT", emailDigest: true });
  });

  test("silence and 'hide who is watching' per Cerchia: flipped at once, put back if the server says no", async () => {
    const { page } = ann;
    await page.goto("/it/me/settings");
    await page.getByTestId(`mute-${cid}`).click();
    await expect(page.getByTestId(`mute-${cid}`)).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await api<{ circles: Array<{ circleId: string; muted: boolean }> }>(ann, "GET", "/api/me/settings")).json.circles.find((c) => c.circleId === cid)?.muted).toBe(true);
    await page.route("**/api/circles/*/me", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"code":"internal"}' }));
    await page.getByTestId(`hide-${cid}`).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByTestId(`hide-${cid}`)).toHaveAttribute("aria-checked", "false");
    await page.unroute("**/api/circles/*/me");
    // the same switches live in the Cerchia's own settings
    await page.goto(`/it/c/${cid}/settings`);
    await expect(page.getByTestId(`mute-${cid}`)).toHaveAttribute("aria-checked", "true");
    await page.getByTestId(`mute-${cid}`).click();
    await expect.poll(async () => (await api<{ circles: Array<{ circleId: string; muted: boolean }> }>(ann, "GET", "/api/me/settings")).json.circles.find((c) => c.circleId === cid)?.muted).toBe(false);
  });

  test("the account page moved under the profile and the old address still works", async () => {
    const { page } = ann;
    await page.goto("/it/account");
    await page.waitForURL("**/it/me/account");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(it.account.title);
    await page.goto("/it/me");
    await expect(page.getByTestId("me-account")).toBeVisible();
    await expect(page.getByTestId("me-lists")).toHaveAttribute("href", "/it/lists");
    await expect(page.getByTestId("me-import")).toHaveAttribute("href", "/it/import");
  });
});

test.describe("the person page", () => {
  test("viewings shared here, average, taste match with you, loved titles", async () => {
    const { page } = ann;
    await page.goto(`/it/c/${cid}/people/${bobId}`);
    await expect(page.getByTestId("person-stats")).toContainText("3"); // three viewings
    await expect(page.getByTestId("person-stats")).toContainText("4,2"); // (7 + 8 + 10) / 3 = 8.33 half stars = 4.2 stars
    // ann and bob rated Matrix 9/7 and Inception 8/8: only two titles in common, not enough to compare
    await expect(page.getByTestId("taste")).toContainText("Avete 2 titoli in comune");
    await page.getByRole("link", { name: "Se7en" }).first().waitFor();
    await page.getByRole("link", { name: it.person.all }).click();
    await page.waitForURL(new RegExp(`/feed\\?person=${bobId}`));
    for (const t of await page.getByTestId(/^log-/).allInnerTexts()) expect(t).toContain(bob.name);
    await expect(page.getByTestId(/^log-/)).toHaveCount(3);
  });
});

test.describe("ranking", () => {
  test("average, votes, sort, filters and the per-person ratings on expand", async () => {
    const { page } = bob;
    await page.goto(`/it/c/${cid}/ranking`);
    const rows = page.getByTestId(/^rank-/);
    await expect(rows).toHaveCount(3);
    // default: best average first: Se7en 5 (one vote), Inception 4 (two), Matrix (9+7+9)/3 = 8.33 half stars = 4.2
    await expect(rows.first()).toContainText(/se7en/i);
    await expect(rows.first()).toContainText("5");
    await rows.filter({ hasText: /matrix/i }).getByRole("button").first().click();
    await expect(page.getByText(it.ranking.who)).toBeVisible();
    for (const n of [ANN_NOW, bob.name, cara.name]) await expect(page.getByText(n, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("img", { name: "4,5 stelle su 5" }).first()).toBeVisible(); // ann and cara gave 9

    await page.getByRole("radio", { name: it.ranking.sort.votes }).click();
    await expect(rows.first()).toContainText(/matrix/i); // three votes
    await page.getByRole("radio", { name: it.ranking.sort.title }).click();
    await expect(rows.first()).toContainText(/inception/i);

    await page.getByTestId("open-filters").click();
    await page.getByTestId("rank-q").fill("MATR");
    await page.getByTestId("apply-filters").click();
    await expect(rows).toHaveCount(1);
    await page.getByTestId("open-filters").click();
    await page.getByTestId("rank-q").fill("");
    await page.getByRole("radio", { name: ANN_NOW }).click(); // watched by ann
    await page.getByTestId("apply-filters").click();
    await expect(rows).toHaveCount(2);
    // everyone watched: ann, bob and cara all saw Matrix; Inception only two of them
    await page.getByRole("button", { name: it.ranking.filters.reset }).first().click();
    await page.getByTestId("open-filters").click();
    await page.getByRole("switch", { name: it.ranking.filters.everyoneSaw }).click();
    await page.getByTestId("apply-filters").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(/matrix/i);
    // at least three votes: Matrix only
    await page.getByRole("button", { name: it.ranking.filters.reset }).first().click();
    await page.getByTestId("open-filters").click();
    await page.getByRole("radio", { name: "Almeno 3" }).click();
    await page.getByTestId("apply-filters").click();
    await expect(rows).toHaveCount(1);
    await page.getByRole("button", { name: it.ranking.filters.reset }).first().click();
    await expect(rows).toHaveCount(3);

    await page.getByTestId("open-filters").click();
    await page.getByRole("radio", { name: it.kind.tv }).click();
    await page.getByTestId("apply-filters").click();
    await expect(page.getByText(it.ranking.empty)).toBeVisible();
    await page.getByRole("button", { name: it.ranking.filters.reset }).first().click();
    await expect(rows).toHaveCount(3);
  });

  test("pages of forty, with the page counter", async () => {
    test.skip(!existsSync(persist), `local D1 not found at ${persist}: the 45 extra titles are written straight to it (dev stack on 8798)`);
    process.env.PAUSA_PERSIST = persist;
    const { sql } = await import("../../../tools/smoke-lib.mjs");
    const ids = Array.from({ length: 45 }, (_, i) => `e2e-${run}-${String(i).padStart(2, "0")}`);
    sql(`INSERT INTO media_entity(id,kind,original_title,year) VALUES ${ids.map((id, i) => `('${id}','movie','Zeta ${String(i).padStart(2, "0")}',2000)`).join(",")}`);
    sql(`INSERT INTO log(id,user_id,media_id,watched_on,rating,created_at) VALUES ${ids.map((id, i) => `('l-${id}','${bobId}','${id}','2026-06-01',5,${1700000000000 + i})`).join(",")}`);
    sql(`INSERT INTO log_share(log_id,circle_id,created_at) VALUES ${ids.map((id) => `('l-${id}','${cid}',1800000000000)`).join(",")}`);
    sql(`INSERT INTO rating_current(circle_id,user_id,media_id,rating,rated_at) VALUES ${ids.map((id) => `('${cid}','${bobId}','${id}',5,1)`).join(",")}`);
    const { page } = bob;
    await page.goto(`/it/c/${cid}/ranking`);
    await expect(page.getByTestId(/^rank-/)).toHaveCount(40);
    await expect(page.getByText("Pagina 1 di 2")).toBeVisible();
    await expect(page.getByTestId("prev-page")).toBeDisabled();
    await page.getByTestId("next-page").click();
    await expect(page.getByText("Pagina 2 di 2")).toBeVisible();
    await expect(page.getByTestId(/^rank-/)).toHaveCount(8); // 48 titles in all
    await expect(page.getByTestId("next-page")).toBeDisabled();
    const second = await page.getByTestId(/^rank-/).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    await page.getByTestId("prev-page").click();
    await expect(page.getByText("Pagina 1 di 2")).toBeVisible();
    await expect(page.getByTestId(/^rank-/)).toHaveCount(40);
    const first = await page.getByTestId(/^rank-/).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(first.filter((x) => second.includes(x))).toEqual([]); // pages do not overlap
    // clean up the rows so a later run of the ranking test sees three titles
    sql(`DELETE FROM rating_current WHERE media_id LIKE 'e2e-${run}-%'`);
    sql(`DELETE FROM log_share WHERE log_id LIKE 'l-e2e-${run}-%'`);
  });
});

test.describe("insights and the year image", () => {
  test("the year in numbers, agree / split, taste pairs with percentages, recommendations", async () => {
    // cara and ann agree on Matrix (9, 9); bob 7. Give them two more shared titles so a pair has a score.
    const { page } = bob;
    await page.goto(`/it/c/${cid}/insights`);
    await expect(page.getByLabel("6 visioni")).toBeVisible(); // six viewings logged this year by the three
    await expect(page.getByText(it.insights.agree.title)).toBeVisible();
    await expect(page.getByTestId("pair")).toHaveCount(3); // three people, three pairs
    await expect(page.getByText(/titoli in comune su 3: votatene altri/)).toHaveCount(3); // nobody shares three rated titles yet: no percentage, and it says why
    await expect(page.getByText(it.insights.recs.title)).toBeVisible();
  });

  test("another year can be picked once there is more than one", async () => {
    const { page } = bob;
    await expect(page.getByRole("radio", { name: "2025" })).toHaveCount(0); // only one year so far
    await logApi(bob, { mediaKey: "tmdb:movie:807", watchedOn: "2025-03-01", rating: 6, circles: [cid] });
    await page.reload();
    await expect(page.getByRole("radio", { name: "2025" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "2026" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "2025" }).click();
    await expect(page.getByText("Il vostro 2025", { exact: false }).first()).toBeVisible();
    await expect(page.getByLabel("1 visione")).toBeVisible();
    await page.getByRole("radio", { name: "2026" }).click();
    await expect(page.getByLabel("6 visioni")).toBeVisible();
  });

  test("'share my year' draws a real image: a PNG file, 1080 by 1350, with something drawn on it", async () => {
    const { page } = bob;
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("share-year").click()]);
    expect(download.suggestedFilename()).toMatch(/^pausa-\d{4}\.png$/);
    const bytes = readFileSync((await download.path())!);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBe(1350);
    expect(bytes.length, "a blank canvas compresses to a few hundred bytes").toBeGreaterThan(15_000);
    await expect(page.getByText(it.app.apiErrors.internal)).toHaveCount(0);
    await expect(page.getByText("Immagine salvata")).toBeVisible();
  });

  test("a Cerchia with nothing in the chosen year says so instead of showing zeros", async () => {
    const empty = await circleWith(cara, [], "Vuoto");
    await cara.page.goto(`/it/c/${empty}/insights`);
    await expect(cara.page.getByText(/Ancora niente nel \d{4}/)).toBeVisible();
    await expect(cara.page.getByTestId("share-year")).toHaveCount(0);
  });
});

test.describe("take all my films out of a Cerchia", () => {
  test("the word PAUSA is needed; then the films leave the Cerchia and stay in the diary", async () => {
    const { page } = bob;
    await page.goto(`/it/c/${cid}/settings`);
    await page.getByTestId("withdraw-word").fill("ciao");
    await page.getByTestId("withdraw-go").click();
    await expect(page.getByText("Serve proprio la parola PAUSA")).toBeVisible();
    expect((await api<{ items: Array<{ author: { id: string } }> }>(cara, "GET", `/api/circles/${cid}/feed`)).json.items.some((i) => i.author.id === bobId)).toBe(true); // nothing was removed

    await page.getByTestId("withdraw-word").fill("pausa");
    await page.getByTestId("withdraw-go").click();
    await expect(page.getByText(/Fatto: 4 visioni tolte/)).toBeVisible();
    expect((await api<{ items: Array<{ author: { id: string } }> }>(cara, "GET", `/api/circles/${cid}/feed`)).json.items.some((i) => i.author.id === bobId)).toBe(false);
    const diary = (await api<{ items: unknown[] }>(bob, "GET", "/api/me/diary")).json.items;
    expect(diary.length).toBeGreaterThanOrEqual(4); // still his
    await page.goto(`/it/c/${cid}/feed`);
    await expect(page.getByTestId(/^log-/).filter({ hasText: bob.name })).toHaveCount(0);
    for (const p of [ann, bob, cara]) await p.ctx.close();
  });
});

