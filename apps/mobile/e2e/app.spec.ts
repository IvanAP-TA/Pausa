// The private app in a real browser, against the static export and a real API (wrangler dev --local on :8798, same-origin through
// scripts/serve-dist.mjs, so the HttpOnly cookie behaves as in production). Skipped, loudly, when the API is not running.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const it = JSON.parse(readFileSync(path.join(root, "packages/messages/it.json"), "utf8"));
const en = JSON.parse(readFileSync(path.join(root, "packages/messages/en.json"), "utf8"));
const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8798";
const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 4173}`;

let apiUp = false;
test.beforeAll(async () => {
  try {
    apiUp = (await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    apiUp = false;
  }
});
test.beforeEach(() => test.skip(!apiUp, `API not running on ${API}: start wrangler dev --local (see README.md). These tests did NOT run.`));

let ipCounter = Math.floor(Math.random() * 200) + 20;
const run = Date.now().toString(36);

/** Every person gets their own context and a distinct client IP (Cloudflare sets cf-connecting-ip in production; here we set it). */
async function person(browser: Browser, name: string): Promise<{ ctx: BrowserContext; page: Page; email: string }> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 390, height: 844 },
    locale: "it-IT",
    extraHTTPHeaders: { "cf-connecting-ip": `10.7.${ipCounter++ % 250}.${Math.floor(Math.random() * 250)}` },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  return { ctx, page, email: `${name}-${run}@pausa.test` };
}

async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/it/sign-in?next=${encodeURIComponent(next)}` : "/it/sign-in");
  await page.getByLabel(it.auth.email).fill(email);
  await page.getByRole("button", { name: it.auth.sendLink }).click();
  await page.getByTestId("dev-link").click();
}

test.describe.configure({ mode: "serial" });

test.describe("sign-in", () => {
  test("a bad email is refused before any request, with a message", async ({ browser }) => {
    const { page, ctx } = await person(browser, "bad");
    let calls = 0;
    page.on("request", (r) => r.url().includes("/api/auth/magic-link") && calls++);
    await page.goto("/it/sign-in");
    await page.getByLabel(it.auth.email).fill("not-an-email");
    await page.getByRole("button", { name: it.auth.sendLink }).click();
    await expect(page.getByText(it.app.signIn.invalidEmail)).toBeVisible();
    expect(calls).toBe(0);
    await ctx.close();
  });

  test("the dev link is offered only when the API returns one", async ({ browser }) => {
    const { page, ctx, email } = await person(browser, "nodev");
    await page.route("**/api/auth/magic-link", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
    await page.goto("/it/sign-in");
    await page.getByLabel(it.auth.email).fill(email);
    await page.getByRole("button", { name: it.auth.sendLink }).click();
    await expect(page.getByText(it.auth.linkSent)).toBeVisible();
    await expect(page.getByTestId("dev-link")).toHaveCount(0);
    await expect(page.getByText(it.app.signIn.devHint)).toHaveCount(0);
    await ctx.close();
  });

  test("a rate-limited answer shows the wait, translated", async ({ browser }) => {
    const { page, ctx, email } = await person(browser, "slow");
    await page.route("**/api/auth/magic-link", (route) => route.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "42" }, body: '{"code":"rate_limited","retryAfter":42}' }));
    await page.goto("/it/sign-in");
    await page.getByLabel(it.auth.email).fill(email);
    await page.getByRole("button", { name: it.auth.sendLink }).click();
    await expect(page.getByText("42 secondi")).toBeVisible();
    await ctx.close();
  });

  test("a private page without a session sends you to sign-in and remembers where you were going", async ({ browser }) => {
    const { page, ctx } = await person(browser, "anon");
    await page.goto("/it/home");
    await page.waitForURL(/\/it\/sign-in\?next=%2Fit%2Fhome/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(it.auth.title);
    await ctx.close();
  });

  test("an off-site `next` is ignored: you land on the home, never on another site", async ({ browser }) => {
    const { page, ctx, email } = await person(browser, "evil");
    await signIn(page, email, "https://evil.example/");
    await page.waitForURL("**/it/home");
    expect(new URL(page.url()).host).toBe(new URL(BASE).host);
    await ctx.close();
  });
});

test.describe("a Cerchia from creation to deletion, with two people", () => {
  let owner: Awaited<ReturnType<typeof person>>;
  let member: Awaited<ReturnType<typeof person>>;
  let circleUrl = "";
  let code = "";

  test("sign in, see the empty state, create a Cerchia", async ({ browser }) => {
    owner = await person(browser, "owner");
    const { page } = owner;
    await signIn(page, owner.email);
    await page.waitForURL("**/it/home");
    await expect(page.getByText(it.home.noCircleTitle)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(it.circles.title);
    // the create button waits for a name
    await expect(page.getByRole("button", { name: it.home.createCta })).toBeDisabled();
    await page.getByLabel(it.home.createLabel).fill("Divano Club");
    await page.getByRole("button", { name: it.home.createCta }).click();
    await page.waitForURL(/\/it\/c\/[^/]+$/);
    circleUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Divano Club");
    await expect(page.getByTestId(/^member-/)).toHaveCount(1);
    await expect(page.getByText(it.app.role.owner).first()).toBeVisible();
  });

  test("the first invite exists; a new one with limits can be made; the link is copied", async () => {
    const { page } = owner;
    await expect(page.getByText(/^[A-HJ-NP-Z2-9]{8}$/)).toHaveCount(1);
    code = (await page.getByText(/^[A-HJ-NP-Z2-9]{8}$/).first().textContent())!.trim();
    await page.getByRole("radio", { name: it.circle.invites.expiryChoices["30d"] }).click();
    await page.getByRole("radio", { name: "10", exact: true }).click();
    await page.getByRole("button", { name: it.circle.invites.create }).click();
    await expect(page.getByText(/^[A-HJ-NP-Z2-9]{8}$/)).toHaveCount(2);
    await page.getByRole("button", { name: it.circle.copy }).first().click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/it\/join\/[A-HJ-NP-Z2-9]{8}$/);
    await expect(page.getByText(it.circle.copied).first()).toBeVisible();
  });

  test("a stranger opens the invite link signed out: the invite page, then sign-in, then they are in", async ({ browser }) => {
    member = await person(browser, "member");
    const { page } = member;
    await page.goto(`/it/join/${code}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(it.app.join.title);
    await expect(page.getByText(code).first()).toBeVisible();
    await page.getByRole("link", { name: it.landing.nav.login }).click();
    await page.waitForURL(/sign-in\?next=/);
    await page.getByLabel(it.auth.email).fill(member.email);
    await page.getByRole("button", { name: it.auth.sendLink }).click();
    await page.getByTestId("dev-link").click();
    await page.waitForURL(/\/it\/c\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Divano Club");
    await expect(page.getByTestId(/^member-/)).toHaveCount(2);
    // a plain member cannot manage anyone, create invites or see group settings
    await expect(page.getByRole("button", { name: it.circle.invites.create })).toHaveCount(0);
    await expect(page.getByRole("button", { name: it.circle.actions.manageShort })).toHaveCount(0);
  });

  test("a code the Cerchia no longer accepts is explained, not a blank page", async ({ browser }) => {
    const { page, ctx } = await person(browser, "late");
    await signIn(page, `late-${run}@pausa.test`, "/it/join/ZZZZZZZZ");
    await expect(page.getByText(it.app.apiErrors.not_found)).toBeVisible();
    await ctx.close();
  });

  test("the owner makes the member an admin; the member sees the new role and the admin tools", async () => {
    await owner.page.reload();
    await owner.page.getByRole("button", { name: /Gestisci/ }).first().click();
    await owner.page.getByRole("button", { name: it.circle.actions.makeAdmin }).click();
    await expect(owner.page.getByText(it.app.role.admin).first()).toBeVisible();
    await member.page.reload();
    await expect(member.page.getByRole("button", { name: it.circle.invites.create })).toBeVisible();
  });

  test("an admin edits the settings and they stick", async () => {
    const { page } = member;
    await page.getByRole("link", { name: it.app.circle.settings }).click();
    await page.waitForURL(/\/settings$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(it.settings.title);
    await page.getByLabel(it.manage.renameCircle).fill("Sala Grande");
    await page.getByLabel(it.settings.description).fill("Giovedì sera");
    await page.getByRole("radio", { name: it.settings.covers.sofa }).click();
    await page.getByRole("button", { name: it.settings.save }).click();
    await expect(page.getByText(it.settings.saved)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(it.manage.renameCircle)).toHaveValue("Sala Grande");
    await expect(page.getByLabel(it.settings.description)).toHaveValue("Giovedì sera");
    // an admin cannot delete the Cerchia nor hand it over
    await expect(page.getByRole("button", { name: it.manage.deleteCircleGo })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: it.app.circle.transferTitle })).toHaveCount(0);
  });

  test("the owner hands the Cerchia over, in two presses, and loses the owner tools", async () => {
    const { page } = owner;
    await page.goto(`${circleUrl}/settings`);
    await expect(page.getByRole("heading", { name: it.app.circle.transferTitle })).toBeVisible();
    const memberName = member.email.split("@")[0];
    await page.getByRole("radio", { name: memberName }).click();
    await page.getByRole("button", { name: it.app.circle.transferGo.replace("{name}", memberName) }).click(); // asks
    await expect(page.getByRole("button", { name: it.app.cancel })).toBeVisible();
    await page.getByRole("button", { name: it.app.circle.transferGo.replace("{name}", memberName) }).click(); // does
    await expect(page.getByRole("heading", { name: it.app.circle.transferTitle })).toHaveCount(0);
    await expect(page.getByRole("button", { name: it.manage.deleteCircleGo })).toHaveCount(0);
  });

  test("the old owner can now leave; the new owner cannot until they hand over", async () => {
    await member.page.goto(`${circleUrl}/settings`);
    await expect(member.page.getByText(it.app.circle.ownerCannotLeave)).toBeVisible();
    await expect(member.page.getByRole("button", { name: it.circle.leave.confirm })).toHaveCount(0);

    await owner.page.goto(`${circleUrl}/settings`);
    await owner.page.getByRole("button", { name: it.circle.leave.confirm }).click(); // asks
    await owner.page.getByRole("button", { name: it.circle.leave.confirm }).click(); // does
    await owner.page.waitForURL("**/it/home");
    await expect(owner.page.getByText(it.home.noCircleTitle)).toBeVisible();
    // out for good: the circle is a 404-like state now
    await owner.page.goto(circleUrl);
    await expect(owner.page.getByText(it.app.apiErrors.not_found)).toBeVisible();
  });

  test("deleting the Cerchia needs its exact name", async () => {
    const { page } = member;
    await page.goto(`${circleUrl}/settings`);
    const go = page.getByRole("button", { name: it.manage.deleteCircleGo });
    await expect(go).toBeDisabled();
    await page.getByLabel(it.app.circle.deleteType).fill("sala grande");
    await expect(go).toBeDisabled();
    await page.getByLabel(it.app.circle.deleteType).fill("Sala Grande");
    await expect(go).toBeEnabled();
    await go.click();
    await page.waitForURL("**/it/home");
    await expect(page.getByText(it.home.noCircleTitle)).toBeVisible();
  });

  test("the account page: this device, the data export, a language switch, then sign out", async () => {
    const { page } = member;
    await page.goto("/it/account");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(it.account.title);
    await expect(page.getByText(it.app.account.current)).toHaveCount(1);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: it.account.export }).click()]);
    expect(download.suggestedFilename()).toBe("pausa-data.json");
    const data = JSON.parse(readFileSync((await download.path())!, "utf8"));
    expect(data.profile.email).toBe(member.email);
    expect(data).toHaveProperty("exportedAt");

    await page.getByRole("radio", { name: it.app.languages.en }).click();
    await page.waitForURL("**/en/me/account");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(en.account.title);
    await page.getByRole("radio", { name: it.app.languages.it }).click();
    await page.waitForURL("**/it/me/account");

    await page.getByRole("button", { name: it.account.logout }).click();
    await page.waitForURL(/\/it$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Cosa guardiamo stasera/i);
    await page.goto("/it/home");
    await page.waitForURL(/sign-in/);
  });

  test("deleting the account needs the name, and ends the session", async ({ browser }) => {
    const { page, ctx, email } = await person(browser, "gone");
    await signIn(page, email);
    await page.waitForURL("**/it/home");
    await page.goto("/it/account");
    await page.getByRole("button", { name: it.account.deleteOpen }).click();
    const name = email.split("@")[0];
    await page.getByLabel(it.app.account.deleteConfirmName.replace("{name}", name)).fill("someone else");
    await page.getByRole("button", { name: it.account.deleteGo }).click();
    await expect(page.getByText(it.app.account.deleteMismatchName)).toBeVisible();
    await page.getByLabel(it.app.account.deleteConfirmName.replace("{name}", name)).fill(name);
    await page.getByRole("button", { name: it.account.deleteGo }).click();
    await page.waitForURL(/\/it$/);
    const me = await ctx.request.get("/api/me");
    expect(me.status()).toBe(401);
    await ctx.close();
    await owner.ctx.close();
    await member.ctx.close();
  });
});

test.describe("accessibility and motion", () => {
  test("on a phone, every control on the home screen is at least 44 points and has a name", async ({ browser }) => {
    const { page, ctx, email } = await person(browser, "a11y");
    await signIn(page, email);
    await page.waitForURL("**/it/home");
    await page.getByLabel(it.home.createLabel).waitFor();
    const tooSmall = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('[role="button"],[role="link"],[role="radio"],input,textarea,a[href]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const name = el.getAttribute("aria-label") || el.textContent?.trim() || el.getAttribute("placeholder") || "";
        if (!name) out.push(`unnamed ${el.tagName}`);
        if (Math.min(r.width, r.height) < 43.5) out.push(`${name} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    expect(tooSmall).toEqual([]);
    await ctx.close();
  });

  test("the tab bar: Cerchie, Diario, the centred Registra, Serata, Profilo; the bell is in the header", async ({ browser }) => {
    const { page, ctx, email } = await person(browser, "tabs");
    await signIn(page, email);
    await page.waitForURL("**/it/home");
    const nav = page.getByRole("navigation", { name: it.app.nav.label });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveCount(5);
    await expect(nav.getByRole("button")).toHaveCount(0); // nothing is a placeholder any more
    const log = nav.getByRole("link", { name: it.tabs.log });
    await expect(log).toHaveAttribute("href", "/it/log");
    await expect(nav.getByRole("link", { name: it.tabs.diary })).toHaveAttribute("href", "/it/diary");
    // no Cerchia yet: the Serata tab has nowhere to go but the list of Cerchie
    await expect(nav.getByRole("link", { name: it.tabs.serata })).toHaveAttribute("href", "/it/home");
    // Registra sits on the centre line of the screen
    const box = await log.boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - 390 / 2)).toBeLessThan(3);
    // and the bar is on screen, at the bottom
    const nb = (await nav.boundingBox())!;
    expect(nb.y + nb.height).toBeGreaterThan(844 - 2);
    await expect(page.getByTestId("bell")).toBeVisible();
    await nav.getByRole("link", { name: it.tabs.profile }).click();
    await page.waitForURL("**/it/me");
    await expect(nav.getByRole("link", { name: it.tabs.profile })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: it.tabs.diary }).click();
    await page.waitForURL("**/it/diary");
    await expect(nav.getByRole("link", { name: it.tabs.diary })).toHaveAttribute("aria-current", "page");
    await ctx.close();
  });

  test("animations: the Reanimated chunk is fetched for people who allow motion, and never for reduced motion", async ({ browser }) => {
    const dist = path.resolve(__dirname, "../dist/_expo/static/js/web");
    const chunk = readdirSync(dist).find((f) => f.startsWith("motion-impl"));
    expect(chunk, "the motion chunk must exist in the export").toBeTruthy();

    const seen = async (reduced: boolean) => {
      const ctx = await browser.newContext({ baseURL: BASE, reducedMotion: reduced ? "reduce" : "no-preference", viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      const hits: string[] = [];
      page.on("request", (r) => r.url().includes("motion-impl") && hits.push(r.url()));
      await page.goto("/it/sign-in", { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await ctx.close();
      return hits;
    };
    expect((await seen(false)).length).toBeGreaterThan(0);
    expect(await seen(true)).toEqual([]);
  });

  test("the e2e build has the chunk files it needs", () => {
    expect(existsSync(path.resolve(__dirname, "../dist/it/index.html"))).toBe(true);
  });
});
