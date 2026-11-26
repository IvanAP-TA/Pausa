// Registra: search by director/author shows only people and opens the director page (needs the API and a mock catalogue; skipped when the API is down).
import { expect, test } from "@playwright/test";
import { circleWith, logApi, person, signIn } from "./support-diary";

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

test("search by director opens the director page", async ({ browser }) => {
  const ann = await person(browser, "auth");
  await signIn(ann);
  const { page } = ann;
  await page.goto("/it/log");
  await page.getByTestId("search-mode").selectOption("people");
  await page.getByTestId("media-search").fill("wachowski");
  await expect(page.getByTestId("person-tmdb:9339")).toBeVisible();
  await expect(page.getByTestId(/^candidate-/)).toHaveCount(0); // only people
  await page.getByTestId("person-tmdb:9339").click();
  await expect(page).toHaveURL(/\/person\/tmdb%3A9339|\/person\/tmdb:9339/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Lana Wachowski/);
});

test("title page names the directors, linked to their page", async ({ browser }) => {
  const ann = await person(browser, "authors-title");
  await signIn(ann);
  const cid = await circleWith(ann, [], "Registi");
  const matrixId = (await logApi(ann, { mediaKey: "tmdb:movie:603", rating: 8, circles: [cid] })).json.mediaId;
  const { page } = ann;
  await page.goto(`/it/c/${cid}/m/${matrixId}`);
  const lana = page.getByRole("link", { name: "Lana Wachowski" });
  await expect(lana).toBeVisible();
  await expect(page.getByText(/^Regia/)).toBeVisible();
  await lana.click();
  await expect(page).toHaveURL(new RegExp(`/c/${cid}/person/tmdb`));
});

test("director page: photo, facts, works by type with circle votes, click opens the title", async ({ browser }) => {
  const ann = await person(browser, "authann");
  const bea = await person(browser, "authbea");
  await signIn(ann);
  await signIn(bea); // the API calls below go through their own session
  const cid = await circleWith(ann, [bea], "Autori");
  await logApi(ann, { mediaKey: "tmdb:movie:603", rating: 9, circles: [cid] });
  await logApi(bea, { mediaKey: "tmdb:movie:603", rating: 7, circles: [cid] });
  const { page } = ann;
  await page.goto(`/it/c/${cid}/person/tmdb:9339`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Lana Wachowski/);
  await expect(page.getByRole("heading", { level: 2, name: "Film" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Serie" })).toHaveCount(0); // no series for them in the mock
  const matrix = page.getByTestId("work-tmdb:movie:603");
  await expect(matrix.getByRole("listitem")).toHaveCount(2); // two circle votes
  await matrix.getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/c/${cid}/m/`));
  await page.goBack();
  await page.getByTestId("work-tmdb:movie:604").getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/c/${cid}/m/`)); // resolved on click, then opened
});
