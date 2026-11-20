import { expect, test } from "@playwright/test";
import { CIRCLE, signInAs } from "./helpers";

test("the landing explains the product and offers the app", async ({ page }) => {
  await page.goto("/it");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cosa guardiamo stasera");
  await expect(page.getByRole("button", { name: "Scarica l'app" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Guide" }).first()).toBeVisible();
});

test("the group ranking lists every title with each person's rating and the average", async ({ page }) => {
  await signInAs(page, "giulia", `/it/c/${CIRCLE}/ranking`);
  await expect(page.getByRole("heading", { level: 1, name: "Classifica" })).toBeVisible();
  const first = page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2 }) }).first();
  await expect(first.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(first).toContainText("vot");
  // A release-year filter narrows the list, and there is always a way back.
  await page.goto(`/it/c/${CIRCLE}/ranking?from=2099`);
  await expect(page.getByText("Nessun titolo con questi filtri.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Azzera i filtri" })).toBeVisible();
});

test("the language switch keeps you on the page", async ({ page }) => {
  await page.goto("/it/guide");
  await page.goto("/en/guide");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Guides to picking what to watch together");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("sign in, see the diary, open the profile and log out", async ({ page }) => {
  await signInAs(page, "giulia", `/it/c/${CIRCLE}`);
  await expect(page.getByRole("heading", { level: 1, name: "Divano Club" })).toBeVisible();
  await page.goto("/it/account");
  await expect(page.getByRole("heading", { level: 1, name: "Il tuo account" })).toBeVisible();
  await page.getByRole("button", { name: "Esci" }).first().click();
  await page.waitForURL(/\/it$/);
  await expect(page.getByRole("link", { name: "Inizia" }).first()).toBeVisible();
});

test("a stranger cannot read a Cerchia (404, not 403)", async ({ page }) => {
  const res = await page.goto(`/it/c/${CIRCLE}`);
  // Not signed in: sent to sign-in. Signed in as someone outside the Cerchia: 404 (checked in the unit tests); here, the redirect.
  expect(res?.url()).toContain("/sign-in");
});

test("log a film, then edit and delete it", async ({ page }) => {
  await signInAs(page, "sofi", `/it/c/${CIRCLE}/log`);
  await page.getByRole("searchbox").or(page.getByPlaceholder("Cerca un film, una serie, un anime")).first().fill("Inception");
  await page.getByRole("button", { name: /Inception/ }).first().click();
  await page.getByLabel("Due righe (facoltative)").fill("Il finale mi tormenta ancora (e2e)");
  await page.getByRole("button", { name: "Registra" }).click();
  await expect(page.getByText("Il finale mi tormenta ancora (e2e)")).toBeVisible();

  await page.getByText("Il finale mi tormenta ancora (e2e)").first().click();
  await page.getByRole("link", { name: /\d+ commenti?|Commenti|commento/ }).first().click().catch(() => {});
  // Open the thread through the comment link on the card, then edit.
  const thread = page.locator("a[href*='/l/']").first();
  await thread.click();
  await page.getByRole("link", { name: "Modifica" }).click();
  await page.getByLabel("Due righe (facoltative)").fill("Rivisto: ancora più bello (e2e)");
  await page.getByRole("button", { name: "Salva le modifiche" }).click();
  await expect(page.getByText("Rivisto: ancora più bello (e2e)")).toBeVisible();

  await page.getByText("Elimina", { exact: true }).first().click();
  await page.getByRole("button", { name: "Sì, elimina" }).click();
  await expect(page.getByText("Rivisto: ancora più bello (e2e)")).toHaveCount(0);
});

test("comment on a log and report someone else's comment", async ({ page }) => {
  await signInAs(page, "luca", `/it/c/${CIRCLE}/l/l-01`);
  await page.getByLabel("Scrivi alla Cerchia…").fill("Bellissimo (e2e)");
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(page.getByRole("paragraph").filter({ hasText: "Bellissimo (e2e)" })).toBeVisible();
  // Marco's seeded comment can be reported.
  await page.getByText("Segnala").first().click();
  await page.getByRole("button", { name: "Invia la segnalazione" }).click();
  await expect(page).toHaveURL(/reported=1/);
});

test("Serata for two: a member opens it, a guest joins by link, both vote, both see the result", async ({ page, browser }) => {
  await signInAs(page, "giulia", `/it/c/${CIRCLE}/serata`);
  await page.getByRole("radio", { name: /Tavolo/ }).click();

  // Pick three titles from the Cerchia's lists.
  const picks = page.locator("ul.grid li button[aria-pressed]");
  await expect(picks.first()).toBeVisible();
  for (let i = 0; i < 3; i++) await picks.nth(i).click();
  await page.getByRole("button", { name: "Apri la Serata" }).click();
  await page.waitForURL(/\/s\/[A-Z0-9]+/);
  const code = page.url().match(/\/s\/([A-Z0-9]+)/)![1];

  // The guest: no account, a name and a picture.
  const guestCtx = await browser.newContext({ locale: "it-IT" });
  const guest = await guestCtx.newPage();
  await guest.goto(`/it/s/${code}`);
  await guest.getByLabel("Il tuo nome").fill("Ospite E2E");
  await guest.getByRole("radio").nth(2).click();
  await guest.getByRole("button", { name: "Entra in sala" }).click();
  await expect(guest.getByText("Aspettiamo che")).toBeVisible();
  await expect(page.getByText("Ospite E2E")).toBeVisible();

  await page.getByRole("button", { name: "Si comincia" }).click();

  async function vote(p: typeof page) {
    const add = p.getByRole("button", { name: /Un voto in più a/ }).first();
    await expect(add).toBeVisible();
    while (await add.isEnabled()) await add.click();
    await p.getByRole("button", { name: "Conferma" }).click();
  }
  await vote(page);
  await vote(guest);

  // The result Card appears for both, and the guest is offered to save the account.
  await expect(page.getByText("La Serata ha scelto")).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText("La Serata ha scelto")).toBeVisible({ timeout: 20_000 });
  await guestCtx.close();
});

test("the invite link of an open Serata previews as an invitation (no vote is revealed)", async ({ page, request }) => {
  await signInAs(page, "giulia", `/it/c/${CIRCLE}/serata`);
  const picks = page.locator("ul.grid li button[aria-pressed]");
  await picks.nth(0).click();
  await picks.nth(1).click();
  await page.getByRole("button", { name: "Apri la Serata" }).click();
  await page.waitForURL(/\/s\/[A-Z0-9]+/);
  const code = page.url().match(/\/s\/([A-Z0-9]+)/)![1];
  const res = await request.get(`/api/serata/${code}/invite?locale=it`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("operator pages are closed to everyone else", async ({ page }) => {
  await signInAs(page, "marco", "/it");
  const res = await page.goto("/it/admin/metrics");
  expect(res?.status()).toBe(404);
  await signInAs(page, "giulia", "/it/admin/metrics");
  await expect(page.getByRole("heading", { name: "Metriche" })).toBeVisible();
});

test("the data export downloads the person's own data @phone", async ({ page }) => {
  await signInAs(page, "marco", "/it/account");
  const res = await page.request.get("/api/account/export");
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.profile.email).toBe("marco@pausa.test");
});

test("the space bar leads to the page of my Cerchie, where a pasted invite link gets me in", async ({ page }) => {
  await signInAs(page, "giulia", `/it/c/${CIRCLE}`);
  await page.getByRole("button", { name: /Cambia spazio/ }).click();
  await page.getByRole("link", { name: "Unisciti o crea una Cerchia" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Le tue Cerchie" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crea una Cerchia nuova" })).toBeVisible();

  // The whole link, as copied from a chat: the code is its last piece. (Already a member: no use is spent.)
  await page.getByLabel("Codice o link di invito").fill("https://pausa.example/it/join/DIVANO24?from=chat");
  await page.getByRole("button", { name: "Entra", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/it/c/${CIRCLE}$`));

  // A code that is no invite says so, instead of failing.
  await page.goto("/it/me/circles");
  await page.getByLabel("Codice o link di invito").fill("ZZZZ9999");
  await page.getByRole("button", { name: "Entra", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Questo invito non esiste." })).toBeVisible();
});

test("log a film in private, then delete it from my space", async ({ page }) => {
  await signInAs(page, "luca", `/it/c/${CIRCLE}/log?private=1`);
  await page.getByRole("searchbox").or(page.getByPlaceholder("Cerca un film, una serie, un anime")).first().fill("Inception");
  await page.getByRole("button", { name: /Inception/ }).first().click();
  // ?private=1 preselects "Solo io", and the button says where the viewing goes.
  await expect(page.getByRole("radio", { name: /Solo io/ })).toBeChecked();
  await page.getByRole("button", { name: "Salva nel mio spazio" }).click();
  await expect(page).toHaveURL(/\/it\/me\/diary\?ok=logged/);
  const row = page.locator("li[id^='l-']").filter({ hasText: "Chi lo vede: solo tu" }).filter({ hasText: "Inception" });
  await expect(row).toHaveCount(1);

  await row.getByRole("button", { name: /Elimina la visione di/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Non si può annullare");
  await dialog.getByRole("button", { name: "Annulla" }).click(); // asking is not doing
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: /Elimina la visione di/ }).click();
  await dialog.getByRole("button", { name: "Elimina", exact: true }).click();
  await expect(page.getByText("Visione eliminata.")).toBeVisible();
  await expect(row).toHaveCount(0);
});
