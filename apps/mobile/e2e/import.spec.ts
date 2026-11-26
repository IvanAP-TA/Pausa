// Import in a real browser against the local API and the mock catalogue: one small real-shaped file per source goes through the file
// picker, the summary, the chunk loop and ends as rows in the diary. Also: the Cerchia destination and its warning, stop and resume
// from the server's cursor, the 429 stop, the refused rows, and the manage page (take out of the Cerchia, delete).
import { expect, test, type Page } from "@playwright/test";
import { gzipSync, strToU8, zipSync } from "fflate";
import { api, API, circleOf, it, person, signIn, type Person } from "./clientb-helpers";

let apiUp = false;
test.beforeAll(async () => {
  try {
    apiUp = (await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(8000) })).ok;
  } catch {
    apiUp = false;
  }
});
test.beforeEach(() => test.skip(!apiUp, `API not running on ${API}: start it (see README.md). These tests did NOT run.`));
test.describe.configure({ mode: "serial" });

type Log = { id: string; media: { title: string; kind: string }; watchedOn: string; rating: number | null; review: string | null; isRewatch: boolean };
const diary = async (p: Person) => {
  const out: Log[] = [];
  let before: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r: { json: { items: Log[]; next: string | null } } = await api(p, "GET", `/api/me/diary?locale=it${before ? `&before=${encodeURIComponent(before)}` : ""}`);
    out.push(...r.json.items);
    if (!r.json.next) break;
    before = r.json.next;
  }
  return out;
};

async function pickFile(page: Page, files: Array<{ name: string; buffer: Buffer }>) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("pick-file").click();
  await (await chooser).setFiles(files);
}
const buf = (u: Uint8Array) => Buffer.from(u);

const CSV_DIARY = "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-05,Matrix,1999,https://boxd.it/aaa,4.5,,,2024-01-04\n2024-03-02,Se7en,1995,https://boxd.it/bbb,4,Yes,,2024-03-02\n";
const CSV_REVIEWS = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2024-01-05,Matrix,1999,https://boxd.it/aaa,4.5,,"Capolavoro, davvero.",,2024-01-04\n';
const WATCHLIST = "Date,Name,Year,Letterboxd URI\n2026-08-12,Inception,2010,https://boxd.it/inc\n";
const IMDB = "Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors\ntt0133093,10,2025-03-01,Matrix,The Matrix,https://x,Movie,8.7,136,1999,Action,1,1999-03-31,W\ntt0903747,9,2024-06-10,Breaking Bad,Breaking Bad,https://x,TV Series,9.5,49,2008,Crime,1,2008-01-20,\ntt7654321,6,2024-08-02,A Game,A Game,https://x,Video Game,7.0,0,2015,Action,1,2015-01-01,\n";
const TRAKT_WATCHED = JSON.stringify([{ plays: 2, last_watched_at: "2025-05-05T20:00:00.000Z", movie: { title: "Inception", year: 2010, ids: { tmdb: 27205 } } }, { plays: 1, last_watched_at: "2024-01-02T20:00:00.000Z", movie: { title: "Amélie", year: 2001, ids: { tmdb: 194 } } }]);
const TRAKT_RATINGS = JSON.stringify([{ rated_at: "2025-05-06T00:00:00Z", rating: 9, movie: { title: "Inception", year: 2010, ids: { tmdb: 27205 } } }]);
const CINEMANIAC = JSON.stringify({ app: "Cinemaniac", movies: [{ id_movie: 603, title: "Matrix", year: 1999, date: Date.UTC(2023, 4, 2), seen: 1, note: "Visto al cinema" }, { id_movie: 194, title: "Amélie", year: 2001, date: Date.UTC(2023, 5, 3), seen: 1, note: "" }, { id_movie: 27205, title: "Inception", year: 2010, seen: 0 }], shows: [{ id_tv: 1396, title: "Breaking Bad", first_air_date: Date.UTC(2008, 0, 20), date: Date.UTC(2022, 7, 29), episodes_seen: 4 }], ratings: [{ id: 603, r: 8.5 }] });
const MAL_XML = "<myanimelist><anime><series_animedb_id>1535</series_animedb_id><series_title><![CDATA[Death Note]]></series_title><my_score>9</my_score><my_status>Completed</my_status><my_finish_date>2020-02-01</my_finish_date></anime><anime><series_animedb_id>5</series_animedb_id><series_title>Planned</series_title><my_status>Plan to Watch</my_status></anime></myanimelist>";

/** Runs the import on the open screen and waits for its end. */
async function runToEnd(page: Page) {
  await page.getByTestId("run").click();
  await expect(page.getByTestId("ended")).toBeVisible({ timeout: 45_000 });
}

test.describe("each source, end to end", () => {
  let p: Person;
  test("Letterboxd: a ZIP with diary, reviews and a watchlist becomes viewings (with the review and the rewatch) and a list", async ({ browser }) => {
    p = await person(browser, "implb");
    await signIn(p.page, p.email);
    await p.page.goto("/it/import");
    await expect(p.page.getByRole("heading", { level: 1 })).toHaveText(it.import.title);
    await expect(p.page.getByRole("tab")).toHaveCount(6);
    // the instructions of the source are there, step by step
    await expect(p.page.getByRole("listitem").filter({ hasText: "Export your data" })).toBeVisible();
    const zip = zipSync({ "diary.csv": strToU8(CSV_DIARY), "reviews.csv": strToU8(CSV_REVIEWS), "watchlist.csv": strToU8(WATCHLIST), "deleted/diary.csv": strToU8(CSV_DIARY.replace(/Matrix/g, "Fantasma")) });
    await pickFile(p.page, [{ name: "letterboxd-export.zip", buffer: buf(zip) }]);
    await expect(p.page.getByTestId("found")).toContainText("2 film, 2 visioni");
    await expect(p.page.getByRole("switch", { name: /Importa anche 1 lista/ })).toBeVisible();
    // my own diary is the default destination, with no warning
    await expect(p.page.getByRole("radio", { name: it.import.dest.private })).toHaveAttribute("aria-checked", "true");
    await expect(p.page.getByTestId("dest-warning")).toHaveCount(0);
    await runToEnd(p.page);
    await expect(p.page.getByTestId("ended-title")).toHaveText("2 visioni aggiunte");
    await expect(p.page.getByTestId("line-lists")).toContainText("1");
    const rows = await diary(p);
    expect(rows.map((r) => r.media.title).sort()).toEqual(["Matrix", "Se7en"]);
    const m = rows.find((r) => r.media.title === "Matrix")!;
    expect([m.watchedOn, m.rating, m.review]).toEqual(["2024-01-04", 9, "Capolavoro, davvero."]);
    expect(rows.find((r) => r.media.title === "Se7en")!.isRewatch).toBe(true);
    expect((await api<Array<{ kind: string; items: number }>>(p, "GET", "/api/lists")).json.find((l) => l.kind === "watchlist")!.items).toBe(1);
  });

  test("Letterboxd again: the same file adds nothing (they were already there)", async () => {
    await p.page.goto("/it/import");
    await pickFile(p.page, [{ name: "diary.csv", buffer: Buffer.from(CSV_DIARY) }, { name: "reviews.csv", buffer: Buffer.from(CSV_REVIEWS) }]);
    await runToEnd(p.page);
    await expect(p.page.getByTestId("ended-title")).toHaveText("Nessuna nuova visione");
    await expect(p.page.getByTestId("line-already")).toContainText("2");
    expect((await diary(p)).length).toBe(2);
  });

  test("IMDb: a CSV; the game is left out and said so; a ZIP gets its own message", async ({ browser }) => {
    const q = await person(browser, "impimdb");
    await signIn(q.page, q.email);
    await q.page.goto("/it/import");
    await q.page.getByTestId("tab-imdb").click();
    await pickFile(q.page, [{ name: "x.zip", buffer: buf(zipSync({ "a.csv": strToU8(IMDB) })) }]);
    await expect(q.page.getByTestId("read-error")).toHaveText(it.import.errors.imdbZip);
    await pickFile(q.page, [{ name: "ratings.csv", buffer: Buffer.from(IMDB) }]);
    await expect(q.page.getByText("1 altro elemento")).toBeVisible();
    await runToEnd(q.page);
    const rows = await diary(q);
    expect(rows.map((r) => [r.media.title, r.media.kind, r.rating, r.watchedOn]).sort()).toEqual([["Breaking Bad", "tv", 9, "2024-06-10"], ["Matrix", "movie", 10, "2025-03-01"]]);
    await q.ctx.close();
  });

  test("Trakt: a ZIP with watched and ratings JSON in folders", async ({ browser }) => {
    const q = await person(browser, "imptrakt");
    await signIn(q.page, q.email);
    await q.page.goto("/it/import");
    await q.page.getByTestId("tab-trakt").click();
    await pickFile(q.page, [{ name: "trakt.zip", buffer: buf(zipSync({ "watched/watched-movies.json": strToU8(TRAKT_WATCHED), "ratings/ratings-movies.json": strToU8(TRAKT_RATINGS) })) }]);
    await expect(q.page.getByTestId("found")).toContainText("2 titoli");
    await runToEnd(q.page);
    const rows = await diary(q);
    const inc = rows.find((r) => r.media.title === "Inception")!;
    expect([inc.watchedOn, inc.rating, inc.isRewatch]).toEqual(["2025-05-05", 9, true]);
    expect(rows).toHaveLength(2);
    await q.ctx.close();
  });

  test("Cinemaniac: a .bak with films, a series and a watchlist", async ({ browser }) => {
    const q = await person(browser, "impcine");
    await signIn(q.page, q.email);
    await q.page.goto("/it/import");
    await q.page.getByTestId("tab-cinemaniac").click();
    await pickFile(q.page, [{ name: "Cinemaniac.bak", buffer: Buffer.from(CINEMANIAC) }]);
    await expect(q.page.getByTestId("found")).toContainText("3 titoli");
    await runToEnd(q.page);
    const rows = await diary(q);
    expect(rows.map((r) => r.media.title).sort()).toEqual(["Amélie", "Breaking Bad", "Matrix"]);
    expect(rows.find((r) => r.media.title === "Matrix")!.review).toBe("Visto al cinema");
    expect((await api<Array<{ kind: string; items: number }>>(q, "GET", "/api/lists")).json.find((l) => l.kind === "watchlist")!.items).toBe(1);
    await q.ctx.close();
  });

  test("MyAnimeList: a .xml.gz (unpacked on the device); the planned one is left out", async ({ browser }) => {
    const q = await person(browser, "impmal");
    await signIn(q.page, q.email);
    await q.page.goto("/it/import");
    await q.page.getByTestId("tab-mal").click();
    await q.page.getByRole("radio", { name: it.import.mal.mode_file }).click();
    await pickFile(q.page, [{ name: "animelist.xml.gz", buffer: buf(gzipSync(strToU8(MAL_XML))) }]);
    await expect(q.page.getByTestId("found")).toContainText("1 anime completato");
    await runToEnd(q.page);
    const rows = await diary(q);
    expect(rows.map((r) => [r.media.title, r.media.kind, r.rating, r.watchedOn])).toEqual([["Death Note", "anime", 9, "2020-02-01"]]);
    await q.ctx.close();
  });

  test("MyAnimeList by user name and AniList by user name: the lists are fetched FROM THE DEVICE (Jikan, graphql.anilist.co)", async ({ browser }) => {
    const q = await person(browser, "impuser");
    await signIn(q.page, q.email);
    const calls: string[] = [];
    await q.ctx.route("https://api.jikan.moe/**", (r) => {
      calls.push(r.request().url());
      return r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ data: [{ watching_status: 2, score: 8, finish_date: "2021-05-05T00:00:00+00:00", anime: { mal_id: 1535, title: "Death Note", year: 2006 } }], pagination: { has_next_page: false } }) });
    });
    await q.ctx.route("https://graphql.anilist.co/**", (r) => {
      calls.push(r.request().url());
      return r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ data: { MediaListCollection: { hasNextChunk: false, lists: [{ entries: [{ score: 7, completedAt: { year: 2022, month: 2, day: 3 }, startedAt: null, media: { id: 21, idMal: 21, title: { romaji: "ONE PIECE", english: "One Piece" }, coverImage: { large: "https://s4.anilist.co/file/op.jpg" }, seasonYear: 1999, startDate: { year: 1999 }, duration: 24 } }] }] } } }) });
    });
    await q.page.goto("/it/import");
    await q.page.getByTestId("tab-mal").click();
    await q.page.getByTestId("username").fill("giulia");
    await q.page.getByTestId("find").click();
    await expect(q.page.getByTestId("found")).toContainText("1 anime completato");
    await runToEnd(q.page);
    await q.page.getByRole("button", { name: it.import.done.again }).click();
    await q.page.getByTestId("tab-anilist").click();
    await q.page.getByTestId("username").fill("giulia");
    await q.page.getByTestId("find").click();
    await runToEnd(q.page);
    expect(calls.some((c) => c.startsWith("https://api.jikan.moe/v4/users/giulia/animelist"))).toBe(true);
    expect(calls.some((c) => c.startsWith("https://graphql.anilist.co"))).toBe(true);
    expect((await diary(q)).map((r) => r.media.title).sort()).toEqual(["Death Note", "One Piece"]);
    // a user that does not exist is a sentence, not a crash
    await q.ctx.route("https://graphql.anilist.co/**", (r) => r.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, body: "{}" }));
    await q.page.getByRole("button", { name: it.import.done.again }).click();
    await q.page.getByTestId("username").fill("nessuno");
    await q.page.getByTestId("find").click();
    await expect(q.page.getByTestId("read-error")).toHaveText(it.import.errors.anilistNotFound);
    await q.ctx.close();
  });
});

const imdbOf = (n: number) => {
  const head = "Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors\n";
  return head + Array.from({ length: n }, (_, i) => `tt${String(2000000 + i)},7,2024-02-${String((i % 27) + 1).padStart(2, "0")},Prova ${i},Prova ${i},https://x,Movie,5,90,${1980 + (i % 30)},Drama,1,,`).join("\n") + "\n";
};

test.describe("destination, stop and resume, limits, refused rows", () => {
  test("into a Cerchia: a clear warning first; the viewings are shared there and the feed shows them; then taken out and deleted from the manage page", async ({ browser }) => {
    const a = await person(browser, "impca");
    const b = await person(browser, "impcb");
    await signIn(a.page, a.email);
    const c = await circleOf(a, "Archivio e basta");
    await signIn(b.page, b.email);
    await api(b, "POST", "/api/circles/join", { code: c.inviteCode });
    const { page } = a;
    await page.goto("/it/import");
    await page.getByTestId("tab-imdb").click();
    await pickFile(page, [{ name: "ratings.csv", buffer: Buffer.from(IMDB) }]);
    await page.getByRole("radio", { name: "Nella Cerchia «Archivio e basta»" }).click();
    await expect(page.getByTestId("dest-warning")).toContainText("Tutti i 2 elementi compariranno nella Cerchia «Archivio e basta»");
    await runToEnd(page);
    await expect(page.getByTestId("ended-title")).toHaveText("2 visioni aggiunte");
    const feed = await api<{ items: Array<{ media: { title: string } }> }>(b, "GET", `/api/circles/${c.id}/feed?locale=it`);
    expect(feed.json.items.map((i) => i.media.title).sort()).toEqual(["Breaking Bad", "Matrix"]);

    await page.goto("/it/imports");
    const card = page.locator('[data-testid^="import-"]').first();
    await expect(card).toContainText("2 visioni aggiunte");
    await expect(card).toContainText("Nella Cerchia «Archivio e basta»: 2 visioni");
    await card.getByRole("button", { name: "Togli da «Archivio e basta»" }).click();
    await expect(page.getByText("Togliere questa importazione da «Archivio e basta»?")).toBeVisible();
    await page.getByRole("button", { name: it.imports.cancel }).click(); // asked, not done
    expect((await api<{ items: unknown[] }>(b, "GET", `/api/circles/${c.id}/feed?locale=it`)).json.items).toHaveLength(2);
    await card.getByRole("button", { name: "Togli da «Archivio e basta»" }).click();
    await page.getByTestId("confirm-remove").click();
    await expect(page.getByText(/2 visioni tolte dal gruppo/)).toBeVisible();
    expect((await api<{ items: unknown[] }>(b, "GET", `/api/circles/${c.id}/feed?locale=it`)).json.items).toHaveLength(0);
    expect(await diary(a)).toHaveLength(2); // still mine
    await page.locator('[data-testid^="delete-"]').first().click();
    await page.getByTestId("confirm-delete").click();
    await expect(page.getByText("2 visioni eliminate.")).toBeVisible();
    expect(await diary(a)).toHaveLength(0);
    await a.ctx.close();
    await b.ctx.close();
  });

  test("stop, then resume: a stopped import keeps its place on the server; choosing the same file again offers to resume from the cursor, and nothing is duplicated", async ({ browser }) => {
    const p = await person(browser, "impres");
    await signIn(p.page, p.email);
    const { page } = p;
    const file = { name: "ratings.csv", buffer: Buffer.from(imdbOf(40)) };
    // slow each call so there is time to press Stop after the first one
    let calls = 0;
    await page.route("**/api/imports/*/rows", async (r) => {
      calls++;
      await new Promise((ok) => setTimeout(ok, 700));
      await r.continue();
    });
    await page.goto("/it/import");
    await page.getByTestId("tab-imdb").click();
    await pickFile(page, [file]);
    await page.getByTestId("run").click();
    await expect(page.getByTestId("running")).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "40");
    await page.getByTestId("stop").click();
    await expect(page.getByTestId("ended")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("ended-title")).toContainText(/Fermata a \d+ di 40/);
    const done = (await diary(p)).length;
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(40);
    const callsAtStop = calls;

    // the person leaves and comes back: same file, and the page offers to resume
    await page.unroute("**/api/imports/*/rows");
    await page.goto("/it/import");
    await expect(page.getByTestId("open-imports")).toContainText(`${done} di 40`);
    await page.getByTestId("tab-imdb").click();
    await pickFile(page, [file]);
    await expect(page.getByTestId("resume-banner")).toContainText(`${done} di 40`);
    const sent: number[] = [];
    page.on("request", (r) => r.url().includes("/rows") && sent.push(JSON.parse(r.postData() ?? "{}").offset));
    await page.getByTestId("resume").click();
    await expect(page.getByTestId("ended")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("ended-title")).toContainText("aggiunte");
    expect(sent[0]).toBe(done); // it restarted exactly at the server's cursor
    expect(Math.min(...sent)).toBeGreaterThanOrEqual(done);
    expect((await diary(p)).length).toBe(40); // each exactly once
    expect(callsAtStop).toBeGreaterThan(0);
    await p.ctx.close();
  });

  test("a 429 stops at once with 'try again in an hour', keeps what was done and sends nothing more", async ({ browser }) => {
    const p = await person(browser, "implim");
    await signIn(p.page, p.email);
    const { page } = p;
    let n = 0;
    await page.route("**/api/imports/*/rows", (r) => {
      n++;
      if (n >= 2) return r.fulfill({ status: 429, headers: { "retry-after": "3600" }, contentType: "application/json", body: '{"code":"rate_limited","retryAfter":3600}' });
      return r.continue();
    });
    await page.goto("/it/import");
    await page.getByTestId("tab-imdb").click();
    await pickFile(page, [{ name: "r.csv", buffer: Buffer.from(imdbOf(80)) }]);
    await page.getByTestId("run").click();
    await expect(page.getByTestId("ended-title")).toHaveText("Riprova tra un'ora", { timeout: 30_000 });
    await expect(page.getByText(it.import.errors.limit).first()).toBeVisible();
    expect(n).toBe(2); // the second call was the refused one; no retry, no third
    expect((await diary(p)).length).toBeGreaterThan(0);
    await p.ctx.close();
  });

  test("three failed calls in a row stop with an error and offer to resume", async ({ browser }) => {
    const p = await person(browser, "impfail");
    await signIn(p.page, p.email);
    const { page } = p;
    let n = 0;
    await page.route("**/api/imports/*/rows", (r) => {
      n++;
      return r.fulfill({ status: 500, contentType: "application/json", body: '{"code":"internal","retryAfter":null}' });
    });
    await page.goto("/it/import");
    await page.getByTestId("tab-imdb").click();
    await pickFile(page, [{ name: "r.csv", buffer: Buffer.from(imdbOf(10)) }]);
    await page.getByTestId("run").click();
    await expect(page.getByText(it.import.errors.chunk)).toBeVisible({ timeout: 30_000 });
    expect(n).toBe(3);
    await expect(page.getByTestId("resume-after")).toBeVisible();
    await p.ctx.close();
  });

  test("rows the server refuses are listed with their place in the file and the reason", async ({ browser }) => {
    const p = await person(browser, "imprej");
    await signIn(p.page, p.email);
    const { page } = p;
    await page.route("**/api/imports/*/rows", async (r) => {
      const res = await r.fetch();
      const j = await res.json();
      await r.fulfill({ response: res, json: { ...j, rejected: [{ index: 2, reason: "title" }] } });
    });
    await page.goto("/it/import");
    await page.getByTestId("tab-imdb").click();
    await pickFile(page, [{ name: "r.csv", buffer: Buffer.from(imdbOf(5)) }]);
    await runToEnd(page);
    await expect(page.getByTestId("rejected")).toContainText("Riga 3: Prova 2 (titolo mancante o troppo lungo)");
    await expect(page.getByTestId("line-rejected")).toContainText("1");
    await p.ctx.close();
  });

  test("not a file of this source, or empty: the message names the problem", async ({ browser }) => {
    const p = await person(browser, "impbad");
    await signIn(p.page, p.email);
    await p.page.goto("/it/import");
    await pickFile(p.page, [{ name: "notes.csv", buffer: Buffer.from("a,b\n1,2\n") }]);
    await expect(p.page.getByTestId("read-error")).toHaveText(it.import.errors.letterboxdFormat);
    await p.page.getByTestId("tab-cinemaniac").click();
    await pickFile(p.page, [{ name: "x.bak", buffer: Buffer.from("not json") }]);
    await expect(p.page.getByTestId("read-error")).toHaveText(it.import.errors.cinemaniacFormat);
    await p.ctx.close();
  });
});

test.describe("drop zone and the way back", () => {
  test("a file dropped on the zone is read like a picked one; a private import ends on the diary's 'Only private' tab", async ({ browser }) => {
    const p = await person(browser, "impdrop");
    await signIn(p.page, p.email);
    const { page } = p;
    await page.goto("/it/import");
    await expect(page.getByRole("link", { name: it.common.back })).toBeVisible();
    await expect(page.getByTestId("drop-zone")).toBeVisible();
    const dt = await page.evaluateHandle((csv) => {
      const d = new DataTransfer();
      d.items.add(new File([csv], "diary.csv", { type: "text/csv" }));
      return d;
    }, CSV_DIARY);
    await page.getByTestId("drop-zone").dispatchEvent("drop", { dataTransfer: dt });
    await expect(page.getByTestId("summary")).toBeVisible();
    await runToEnd(page);
    await page.getByRole("link", { name: it.import.done.toSpace }).click();
    await page.waitForURL(/\/it\/diary\?only=private/);
    await expect(page.getByTestId("tab-private")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("tab-private")).toContainText("(2)");
    await p.ctx.close();
  });
});

test.describe("older imports: a day with many viewings and no run", () => {
  test("they are listed as a day; hide them from the Cerchie, then delete them; a small day is not offered", async ({ browser }) => {
    const p = await person(browser, "impold");
    await signIn(p.page, p.email);
    const c = await circleOf(p, "Vecchie importazioni");
    for (let i = 0; i < 11; i++) {
      const day = String(i + 1).padStart(2, "0");
      expect((await api(p, "POST", "/api/logs", { mediaKey: "tmdb:movie:603", watchedOn: `2025-01-${day}`, locale: "it", circles: i < 3 ? [c.id] : [] })).status).toBe(201);
    }
    const today = new Date().toISOString().slice(0, 10);
    const days = (await api<Array<{ day: string; logs: number; inCircles: number }>>(p, "GET", "/api/imports/bulk-days")).json;
    expect(days).toEqual([{ day: today, logs: 11, inCircles: 3 }]);
    expect((await api(p, "POST", "/api/imports/bulk-days/2020-01-01/hide", {})).status).toBe(404); // not a block
    expect((await api(p, "DELETE", "/api/imports/bulk-days/not-a-day")).status).toBe(404);

    const { page } = p;
    await page.goto("/it/imports");
    await expect(page.getByRole("link", { name: it.common.back })).toBeVisible();
    const card = page.getByTestId(`day-${today}`);
    await expect(card).toContainText("11 visioni aggiunte quel giorno");
    await expect(page.getByTestId(`day-where-${today}`)).toContainText("3 visibili nelle tue Cerchie");
    await page.getByTestId(`hide-${today}`).click();
    await page.getByRole("button", { name: it.imports.cancel }).click(); // asked, not done
    expect((await api<Array<{ inCircles: number }>>(p, "GET", "/api/imports/bulk-days")).json[0]!.inCircles).toBe(3);
    await page.getByTestId(`hide-${today}`).click();
    await page.getByTestId("confirm-hide-day").click();
    await expect(page.getByText(/3 visioni tolte dal gruppo/)).toBeVisible();
    await expect(page.getByTestId(`hide-${today}`)).toHaveCount(0);
    expect((await api<{ all: number; private: number }>(p, "GET", "/api/me/diary/counts")).json).toEqual({ all: 11, private: 11 });

    await page.getByTestId(`delete-day-${today}`).click();
    await page.getByTestId("confirm-delete-day").click();
    await expect(page.getByText("11 visioni eliminate.")).toBeVisible();
    await expect(page.getByTestId(`day-${today}`)).toHaveCount(0);
    expect((await api<{ all: number }>(p, "GET", "/api/me/diary/counts")).json.all).toBe(0);
    await p.ctx.close();
  });
});

test.describe("looks", () => {
  test("the import and manage screens at 390x844 dark and light, and wide", async ({ browser }) => {
    test.skip(!process.env.CLIENTB_SHOTS, "set CLIENTB_SHOTS to a folder to write the screenshots");
    const dir = process.env.CLIENTB_SHOTS!;
    for (const [scheme, w, h] of [["dark", 390, 844], ["light", 390, 844], ["dark", 1280, 800]] as const) {
      const p = await person(browser, `implook${scheme}${w}`, { colorScheme: scheme, width: w, height: h });
      await signIn(p.page, p.email);
      const c = await circleOf(p, "Aspetto import");
      await p.page.goto("/it/import");
      await p.page.screenshot({ path: `${dir}/import-pick-${scheme}-${w}.png`, fullPage: true });
      await pickFile(p.page, [{ name: "diary.csv", buffer: Buffer.from(CSV_DIARY) }, { name: "watchlist.csv", buffer: Buffer.from(WATCHLIST) }]);
      await p.page.getByRole("radio", { name: "Nella Cerchia «Aspetto import»" }).click();
      await p.page.screenshot({ path: `${dir}/import-summary-${scheme}-${w}.png`, fullPage: true });
      await runToEnd(p.page);
      await p.page.screenshot({ path: `${dir}/import-done-${scheme}-${w}.png`, fullPage: true });
      await p.page.goto("/it/imports");
      await expect(p.page.getByTestId("imports")).toBeVisible();
      await p.page.screenshot({ path: `${dir}/imports-${scheme}-${w}.png`, fullPage: true });
      void c;
      await p.ctx.close();
    }
  });
});
