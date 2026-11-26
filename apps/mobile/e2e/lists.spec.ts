// Lists in a real browser against the local API: create (personal and group), add by search, note and priority, reorder by drag AND by
// buttons (one request for the whole order), rename, duplicate, delete with confirmation, the 200-title cap, and the `?add=` mode.
import { expect, test } from "@playwright/test";
import { api, API, circleOf, it, person, signIn, type Person } from "./clientb-helpers";

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

type Detail = { list: { name: string; description: string | null; circleId: string | null }; items: Array<{ media: { id: string; title: string }; note: string | null; priority: number | bigint; position: number | bigint }>; canEdit: boolean; canDelete: boolean };

test.describe("lists", () => {
  let owner: Person;
  let mate: Person;
  let circleId = "";
  let listId = "";

  const order = async () => (await api<Detail>(owner, "GET", `/api/lists/${listId}?locale=it`)).json.items.map((i) => i.media.title);

  test("a watchlist for the Cerchia is created from the overview and opens", async ({ browser }) => {
    owner = await person(browser, "lsown");
    mate = await person(browser, "lsmate");
    await signIn(owner.page, owner.email);
    const c = await circleOf(owner, "Liste di prova");
    circleId = c.id;
    await signIn(mate.page, mate.email);
    await api(mate, "POST", "/api/circles/join", { code: c.inviteCode });

    const { page } = owner;
    await page.goto(`/it/lists?circle=${circleId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(it.lists.title);
    await expect(page.getByText(it.lists.emptyPersonal)).toBeVisible();
    await expect(page.getByTestId("create-list")).toBeDisabled(); // a name first
    await page.getByLabel(it.lists.name).fill("Da vedere insieme");
    await page.getByRole("radio", { name: "Per Liste di prova" }).click();
    await page.getByRole("radio", { name: it.lists.kind.watchlist }).click();
    await page.getByTestId("create-list").click();
    await page.waitForURL(/\/it\/lists\/[^/?]+$/);
    listId = page.url().split("/").pop()!;
    await expect(page.getByTestId("list-name")).toHaveText("Da vedere insieme");
    await expect(page.getByTestId("list-count")).toContainText("0 su 200");
  });

  test("titles are added by search, once each; the same title again is 'already in'", async () => {
    const { page } = owner;
    for (const [q, title] of [["matrix", "Matrix"], ["breaking", "Breaking Bad"], ["one piece", "One Piece"]] as const) {
      await page.getByLabel("Cerca un titolo da aggiungere").fill(q);
      await page.getByRole("button", { name: `Aggiungi ${title} alla lista` }).click();
      await expect(page.getByText(`${title} è nella lista.`)).toBeVisible();
      await expect(page.getByTestId("items").getByText(title, { exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("list-count")).toContainText("3 su 200");
    await page.getByLabel("Cerca un titolo da aggiungere").fill("matrix");
    await expect(page.getByRole("button", { name: "Matrix è già nella lista" })).toBeDisabled();
    expect(await order()).toEqual(["Matrix", "Breaking Bad", "One Piece"]);
  });

  test("a note and a priority (0..3, watchlist) are kept; a note is cut at 280", async () => {
    const { page } = owner;
    await page.getByRole("button", { name: "Modifica nota e priorità di Breaking Bad" }).click();
    await page.getByTestId(/^note-/).fill("x".repeat(300));
    await expect(page.getByText("te ne restano 0")).toBeVisible();
    await page.getByTestId(/^note-/).fill("per sabato sera");
    await page.getByRole("radio", { name: "3", exact: true }).click();
    await page.getByTestId(/^save-/).click();
    await expect(page.getByText("per sabato sera")).toBeVisible();
    await expect(page.getByText("Priorità 3")).toBeVisible();
    const d = (await api<Detail>(owner, "GET", `/api/lists/${listId}?locale=it`)).json;
    const bb = d.items.find((i) => i.media.title === "Breaking Bad")!;
    expect([bb.note, Number(bb.priority)]).toEqual(["per sabato sera", 3]);
  });

  test("reorder: the buttons move a title, 'Fatto' sends the whole order in ONE request", async () => {
    const { page } = owner;
    const puts: string[] = [];
    page.on("request", (r) => r.method() === "PUT" && r.url().includes(`/api/lists/${listId}/order`) && puts.push(r.postData() ?? ""));
    await page.getByTestId("reorder-start").click();
    const rows = page.getByTestId("reorder-list").getByRole("listitem");
    await expect(rows.nth(0)).toContainText("Matrix");
    await page.getByRole("button", { name: "Sposta One Piece più in alto" }).click();
    await page.getByRole("button", { name: "Sposta One Piece più in alto" }).click();
    await expect(rows.nth(0)).toContainText("One Piece");
    await expect(page.getByText("One Piece ora è in posizione 1.")).toBeVisible();
    expect(puts).toHaveLength(0); // nothing sent while moving
    await page.getByTestId("reorder-done").click();
    await expect(page.getByTestId("reorder")).toHaveCount(0);
    expect(puts).toHaveLength(1);
    expect(JSON.parse(puts[0]).mediaIds).toHaveLength(3);
    expect(await order()).toEqual(["One Piece", "Matrix", "Breaking Bad"]);
    await expect(page.getByTestId("items").getByTestId(/^item-/).first()).toContainText("One Piece");
  });

  test("reorder by dragging the handle with the mouse", async () => {
    const { page } = owner;
    await page.getByTestId("reorder-start").click();
    const handle = page.getByTestId("drag-0");
    const box = (await handle.boundingBox())!;
    // drag the first row two rows down (rows are 76 high)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 5 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 160, { steps: 8 });
    await page.mouse.up();
    const rows = page.getByTestId("reorder-list").getByRole("listitem");
    await expect(rows.nth(2)).toContainText("One Piece");
    await page.getByTestId("reorder-done").click();
    expect(await order()).toEqual(["Matrix", "Breaking Bad", "One Piece"]);
  });

  test("rename, duplicate as a personal copy, then delete the copy with a confirmation", async () => {
    const { page } = owner;
    await page.getByTestId("rename").click();
    await page.getByTestId("rename-name").fill("Stasera o mai più");
    await page.getByTestId("rename-description").fill("Giovedì");
    await page.getByTestId("rename-save").click();
    await expect(page.getByTestId("list-name")).toHaveText("Stasera o mai più");
    await page.getByTestId("duplicate").click();
    await page.getByRole("radio", { name: it.lists.scopePersonal }).click();
    await page.getByTestId("duplicate-go").click();
    await page.waitForURL((u) => /\/it\/lists\/[^/?]+$/.test(u.pathname) && !u.pathname.endsWith(listId));
    await expect(page.getByTestId("list-name")).toHaveText("Stasera o mai più (copia)");
    await expect(page.getByTestId("items").getByTestId(/^item-/)).toHaveCount(3);
    // delete takes two presses: the first only asks
    await page.getByRole("button", { name: "Elimina la lista" }).click();
    await expect(page.getByRole("button", { name: /^Elimina «.*» per sempre$/ })).toBeVisible();
    await page.getByRole("button", { name: it.app.cancel }).click();
    await expect(page.getByTestId("list-name")).toBeVisible();
    await page.getByRole("button", { name: "Elimina la lista" }).click();
    await page.getByRole("button", { name: /^Elimina «.*» per sempre$/ }).click();
    await page.waitForURL(/\/it\/lists$/);
  });

  test("a plain member edits the group list but cannot delete it; an outsider gets 'not here'", async ({ browser }) => {
    await mate.page.goto(`/it/lists/${listId}`);
    await expect(mate.page.getByTestId("list-name")).toHaveText("Stasera o mai più");
    await expect(mate.page.getByTestId("rename")).toBeVisible();
    await expect(mate.page.getByRole("button", { name: "Elimina la lista" })).toHaveCount(0);
    const out = await person(browser, "lsout");
    await signIn(out.page, out.email);
    await out.page.goto(`/it/lists/${listId}`);
    await expect(out.page.getByText("Questa lista non c'è.")).toBeVisible();
    await out.ctx.close();
  });

  test("the 200-title cap: the screen says so, adding is off, and a refused add (409) says so too", async () => {
    const { page } = owner;
    const items = Array.from({ length: 200 }, (_, i) => ({ media: { id: `m${i}`, kind: "movie", title: `Titolo ${i}`, year: 2000, posterPath: null }, note: null, priority: 0, addedBy: null, position: i }));
    await page.route(`**/api/lists/${listId}?*`, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ list: { id: listId, name: "Piena", kind: "list", description: null, circleId, ownerId: "x", items: 200, posters: [] }, canEdit: true, canDelete: true, items }) }));
    await page.goto(`/it/lists/${listId}`);
    await expect(page.getByTestId("cap-message")).toContainText("tiene al massimo 200 titoli");
    await expect(page.getByTestId("list-count")).toContainText("200 su 200");
    await page.getByLabel("Cerca un titolo da aggiungere").fill("matrix");
    await expect(page.getByRole("button", { name: "Aggiungi Matrix alla lista" })).toBeDisabled();
    await page.unroute(`**/api/lists/${listId}?*`);
    // the server's own refusal, as it answers when the list filled up meanwhile
    const empty = (await api<{ id: string }>(owner, "POST", "/api/lists", { name: "Vuota" })).json.id;
    await page.route(`**/api/lists/${empty}/items`, (r) => r.fulfill({ status: 409, contentType: "application/json", body: '{"code":"conflict","retryAfter":null}' }));
    await page.goto(`/it/lists/${empty}`);
    await page.getByLabel("Cerca un titolo da aggiungere").fill("matrix");
    await page.getByRole("button", { name: "Aggiungi Matrix alla lista" }).click();
    await expect(page.getByText("tiene al massimo 200 titoli").last()).toBeVisible();
  });

  test("?add=<title>: the overview becomes a chooser, adds the title to the list I pick and says so", async () => {
    const { page } = owner;
    const found = await api<Array<{ key: string; title: string }>>(owner, "GET", "/api/media/search?q=one%20piece&locale=it");
    const added = await api<{ mediaId: string }>(owner, "POST", `/api/lists`, { name: "Per l'aggiunta", circleId });
    const target = (added.json as unknown as { id: string }).id;
    // a title Pausa already stores: the id of One Piece from the group list
    const d = (await api<Detail>(owner, "GET", `/api/lists/${listId}?locale=it`)).json;
    const mediaId = d.items.find((i) => i.media.title === "One Piece")!.media.id;
    void found;
    await page.goto(`/it/lists?circle=${circleId}&add=${mediaId}`);
    await expect(page.getByTestId("add-mode")).toContainText("Aggiungi «One Piece» a una lista");
    await expect(page.getByTestId("create-list")).toHaveCount(0); // no create form in this mode
    await page.getByTestId(`add-to-${target}`).click();
    await expect(page.getByTestId(`add-to-${target}`)).toHaveText(/Aggiunto/i);
    expect((await api<Detail>(owner, "GET", `/api/lists/${target}?locale=it`)).json.items.map((i) => i.media.title)).toEqual(["One Piece"]);
  });

  test("a ranking card: strip with numbers and owner, then reorder, remove and delete in place", async () => {
    const { page } = owner;
    const ids = (await api<Detail>(owner, "GET", `/api/lists/${listId}?locale=it`)).json.items.map((x) => ({ id: x.media.id, title: x.media.title }));
    const made = (await api<{ id: string }>(owner, "POST", "/api/lists", { name: "Top tre", kind: "ranking", circleId })).json.id;
    for (const m of ids) await api(owner, "POST", `/api/lists/${made}/items`, { mediaId: m.id });
    const first = ids[0].title;
    const second = ids[1].title;
    await page.goto(`/it/lists?circle=${circleId}`);
    const card = page.getByTestId(`list-${made}`);
    await expect(card).toContainText("Classifica, 3 titoli, di ");
    await expect(card.getByTestId(`strip-${made}`).getByText(first, { exact: true })).toBeVisible();
    await expect(card.getByTestId(`strip-${made}`).getByLabel("Posizione 3")).toBeVisible();
    // manage in place: the second title goes up one place (ONE request), then the first one is taken out
    await card.getByTestId(`manage-toggle-${made}`).click();
    await card.getByRole("button", { name: `Sposta ${second} più in alto` }).click();
    await expect.poll(async () => (await api<Detail>(owner, "GET", `/api/lists/${made}?locale=it`)).json.items[0].media.title).toBe(second);
    await card.getByRole("button", { name: `Togli ${second} dalla lista` }).click();
    await expect.poll(async () => (await api<Detail>(owner, "GET", `/api/lists/${made}?locale=it`)).json.items.length).toBe(2);
    // the bin asks first
    await card.getByRole("button", { name: "Elimina la lista Top tre" }).click();
    await card.getByRole("button", { name: it.app.cancel }).click();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Elimina la lista Top tre" }).click();
    await card.getByRole("button", { name: /^Elimina «Top tre» per sempre$/ }).click();
    await expect(page.getByTestId(`list-${made}`)).toHaveCount(0);
  });
});
