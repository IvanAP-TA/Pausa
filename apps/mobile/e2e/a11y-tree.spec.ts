// What a screen reader would be given, read from the browser's accessibility tree (Chromium's Accessibility.getFullAXTree): roles,
// names, states, values and live regions of the key flows. THIS IS NOT A SCREEN-READER SESSION: it shows that the information is
// exposed correctly; it cannot show how TalkBack or VoiceOver speak it, in what order, or how it feels. See docs/rebuild/A11Y.md.
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { api, circleWith, it, logApi, person, signIn, type Person } from "./support-diary";

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
test.describe.configure({ mode: "serial" });

type AxNode = { role: string; name: string; value?: unknown; props: Record<string, unknown>; ignored: boolean };

/** The whole tree, flattened, with the properties that matter (live, busy, checked, pressed, expanded, disabled, valuenow...). */
async function ax(page: Page): Promise<AxNode[]> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as { nodes: Array<{ ignored?: boolean; role?: { value: string }; name?: { value: string }; value?: { value: unknown }; properties?: Array<{ name: string; value: { value: unknown } }> }> };
  await cdp.detach();
  return nodes.map((n) => ({
    role: n.role?.value ?? "",
    name: String(n.name?.value ?? ""),
    value: n.value?.value,
    ignored: !!n.ignored,
    props: Object.fromEntries((n.properties ?? []).map((p) => [p.name, p.value.value])),
  }));
}
/** CDP reports state properties as true / "true" / 1 depending on the property. */
const on = (v: unknown) => v === true || v === "true" || v === 1;
const off = (v: unknown) => v === false || v === "false" || v === 0;
const live = (nodes: AxNode[]) => nodes.filter((n) => !n.ignored && (n.props.live === "polite" || n.props.live === "assertive") && n.props.live !== "off");
const find = (nodes: AxNode[], role: string, name?: string | RegExp) =>
  nodes.filter((n) => !n.ignored && n.role === role && (name === undefined || (typeof name === "string" ? n.name === name : name.test(n.name))));

let u: Person;
let friend: Person;
let cid = "";
let logId = "";

test("scene", async ({ browser }) => {
  u = await person(browser, "tree");
  friend = await person(browser, "treefriend");
  await signIn(u);
  await signIn(friend);
  cid = await circleWith(u, [friend], "Albero");
  logId = (await logApi(friend, { mediaKey: "tmdb:movie:603", rating: 9, review: "Spoiler del finale.", containsSpoilers: true, circles: [cid] })).json.id;
  await logApi(friend, { mediaKey: "tmdb:movie:27205", rating: 7, review: "Bello.", circles: [cid] });
});

test("flow 1, sign-in: a refused email is an alert, the sent link is a status, the field is labelled and required", async ({ browser }) => {
  const p = await person(browser, "treesign");
  await p.page.goto("/it/sign-in");
  await p.page.waitForLoadState("networkidle");
  const before = await ax(p.page);
  const email = find(before, "textbox", it.auth.email)[0];
  expect(email, "the email field has a name").toBeTruthy();
  expect(on(email.props.required), "it is announced as required").toBe(true);
  // the API refuses an address that is not one: the message is announced at once
  await p.page.route("**/api/auth/magic-link", (r) => r.fulfill({ status: 429, contentType: "application/json", body: '{"code":"rate_limited","retryAfter":120}' }));
  await p.page.getByLabel(it.auth.email).fill("someone@pausa.test");
  await p.page.getByRole("button", { name: it.auth.sendLink }).click();
  await p.page.getByRole("alert").first().waitFor();
  const after = await ax(p.page);
  const alerts = find(after, "alert");
  expect(alerts.length, "an alert").toBeGreaterThan(0);
  expect(alerts[0].props.live).toBe("assertive");
  expect(alerts[0].name || JSON.stringify(after.filter((n) => n.role === "StaticText" && !n.ignored).map((n) => n.name))).toMatch(/120|aspett|tropp|riprova/i);
  await p.ctx.close();
});

test("flow 2, loading: a loading screen is a busy progressbar with a name; it is gone when the content is there", async () => {
  const { page } = u;
  await page.route("**/api/circles/*/feed**", async (r) => {
    await new Promise((res) => setTimeout(res, 900));
    await r.continue().catch(() => undefined);
  });
  await page.goto(`/it/c/${cid}/feed`);
  await expect.poll(async () => find(await ax(page), "progressbar", it.app.loading).length, { timeout: 5000 }).toBeGreaterThan(0);
  const bar = find(await ax(page), "progressbar", it.app.loading)[0];
  expect(on(bar.props.busy)).toBe(true);
  await page.unroute("**/api/circles/*/feed**");
  await expect.poll(async () => find(await ax(page), "progressbar", it.app.loading).length, { timeout: 10_000 }).toBe(0);
});

test("flow 3, Registra: the rating is a slider with a value and a spoken value, its text is polite, errors are alerts tied to the field", async () => {
  const { page } = u;
  await page.goto("/it/log");
  await page.getByLabel("Cerca un film, una serie, un anime…").fill("matrix");
  await page.getByRole("button", { name: /^Matrix/ }).first().click();
  const slider = page.getByRole("slider", { name: "Voto" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const tree = await ax(page);
  const s = find(tree, "slider", "Voto")[0];
  expect(s, "slider").toBeTruthy();
  expect([s.value, s.props.valuemin, s.props.valuemax]).toEqual([3, 0, 10]);
  expect(await slider.getAttribute("aria-valuetext"), "the spoken value (aria-valuetext is not in the CDP property list: read from the DOM)").toMatch(/1,5|1.5/);
  // the "1,5 stelle su 5" text next to it is a polite live region
  expect(live(tree).length, "the tree has a live region").toBeGreaterThan(0);
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: /stelle su 5/ }), "and the rating phrase is inside one").toHaveCount(1);
  // a future date (only an existing viewing can change its date): the edit form, where the field says why, and the submit is an alert-free, named button
  const own = (await logApi(u, { mediaKey: "tmdb:movie:603", rating: 5, circles: [cid] })).json.id;
  await page.goto(`/it/log/${own}`);
  await page.getByTestId("log-details").waitFor();
  const disclosure = page.getByTestId("log-details");
  expect(await disclosure.getAttribute("aria-expanded"), "an edit starts with the details open").toBe("true");
  await disclosure.click();
  expect(await disclosure.getAttribute("aria-expanded"), "and the disclosure closes").toBe("false");
  await disclosure.click();
  expect(await disclosure.getAttribute("aria-expanded")).toBe("true");
  const date = page.getByTestId("watched-on");
  await date.fill("2099-01-01");
  await page.getByTestId("submit-log").click();
  // the browser's date input has its own role in the tree (not a textbox): the invalid state is read from the DOM, where the error is its description
  expect(await date.getAttribute("aria-invalid"), "the date field is marked invalid").toBe("true");
  await expect(page.getByLabel("Visto il")).toHaveAttribute("aria-describedby", /-err$/);
  const after = await ax(page);
  expect(find(after, "button", /Registra|Salva/).length).toBeGreaterThan(0);
});

test("flow 4, the thread: reactions announce pressed / not pressed, a hidden spoiler is a named button, the report sheet is a named dialog", async () => {
  const { page } = u;
  await page.goto(`/it/c/${cid}/log/${logId}`);
  await page.waitForLoadState("networkidle");
  const tree0 = await ax(page);
  const reactions = tree0.filter((n) => !n.ignored && n.role === "button" && /^Reagisci con/.test(n.name));
  expect(reactions.length, "five reaction buttons").toBe(5);
  expect(reactions.every((r) => off(r.props.pressed)), "all start not pressed").toBe(true);
  await page.getByTestId("react-🍿").click();
  const reactionButtons = async () => (await ax(page)).filter((n) => !n.ignored && n.role === "button" && /^Reagisci con/.test(n.name));
  await expect.poll(async () => (await reactionButtons()).map((n) => on(n.props.pressed)), { message: "the second reaction (popcorn) is announced as pressed, the others are not" }).toEqual([false, true, false, false, false]);
  // the spoiler: one button, its name is its visible text
  const reveal = find(await ax(page), "button", /spoiler/i);
  expect(reveal.length, "the reveal control is a named button").toBeGreaterThan(0);
  await page.getByRole("button", { name: "Segnala" }).first().click();
  await page.getByRole("dialog").waitFor();
  const dialogs = find(await ax(page), "dialog");
  expect(dialogs.map((d) => d.name), "one dialog, named after what it does").toHaveLength(1);
  expect(dialogs[0].name.length, "its name: " + dialogs[0].name).toBeGreaterThan(3);
  await page.keyboard.press("Escape");
});

test("flow 5, settings and Cerchia: switches announce their state; saving and failing are announced", async () => {
  const { page } = u;
  await page.goto("/it/me/settings");
  await page.waitForLoadState("networkidle");
  const tree = await ax(page);
  const switches = tree.filter((n) => !n.ignored && (n.role === "switch" || n.role === "checkbox"));
  expect(switches.length, "settings has switches").toBeGreaterThan(0);
  expect(switches.every((s) => s.name !== "" && (on(s.props.checked) || off(s.props.checked))), "every switch has a name and a state").toBe(true);
  // a failing save is an alert
  await page.route("**/api/me/settings", (r) => (r.request().method() === "PUT" ? r.fulfill({ status: 500, contentType: "application/json", body: '{"code":"internal","retryAfter":null}' }) : r.continue()));
  await page.getByRole("switch").first().click();
  await page.getByTestId("save-settings").click();
  await expect.poll(async () => find(await ax(page), "alert").length, { timeout: 5000 }).toBeGreaterThan(0);
  await page.unroute("**/api/me/settings");
  await page.getByTestId("save-settings").click(); // now it works: the confirmation is a polite status
  await expect.poll(async () => live(await ax(page)).length).toBeGreaterThan(0);
});

test("flow 6, the Serata room: the vote options are radios with a checked state, the countdown is a timer that does not chatter, the count is a status", async ({ browser }) => {
  const host = await person(browser, "treehost");
  await signIn(host);
  const c = (await api<{ id: string; inviteCode: string }>(host, "POST", "/api/circles", { name: "Sala" })).json;
  await api(u, "POST", "/api/circles/join", { code: c.inviteCode });
  const keys = ["tmdb:movie:603", "tmdb:movie:27205", "tmdb:tv:1396"];
  const made = await api<{ code: string }>(host, "POST", "/api/serate", { circleId: c.id, mode: "bracket", mediaKeys: keys });
  await api(u, "POST", `/api/serate/${made.json.code}/join`, {});
  await host.page.goto(`/it/s/${made.json.code}`);
  await host.page.getByTestId("start").click();
  await host.page.getByTestId("round-name").waitFor();
  const tree = await ax(host.page);
  const radios = find(tree, "radio");
  expect(radios.length, "one radio per candidate in the match").toBeGreaterThanOrEqual(2);
  expect(radios.every((r) => off(r.props.checked)), "none is chosen yet").toBe(true);
  await host.page.getByRole("radio").first().click();
  await expect.poll(async () => find(await ax(host.page), "radio").filter((r) => on(r.props.checked)).length).toBe(1);
  // the countdown: a timer (live=off by definition), with its phrase as the name; the ticking digits and the bar are hidden from the tree
  const timers = find(await ax(host.page), "timer");
  expect(timers.length).toBe(1);
  expect(timers[0].name).toMatch(/\d/);
  expect(timers[0].props.live === undefined || timers[0].props.live === "off", "the timer is not a live region").toBe(true);
  const before = JSON.stringify(live(await ax(host.page)).map((n) => n.name));
  await host.page.waitForTimeout(2200);
  const afterLive = live(await ax(host.page));
  expect(JSON.stringify(afterLive.map((n) => n.name)), "no live region changed its text just because time passed").toBe(before);
  expect(find(await ax(host.page), "progressbar").length, "the decorative bar is not in the tree").toBe(0);
  await expect(host.page.getByTestId("voted-count"), "the vote count is a polite live status (it changes when somebody votes, not with the clock)").toHaveAttribute("role", "status");
  await host.ctx.close();
});

test("flow 7, import: the progress bar has a name and a value; the end of the import is a status", async () => {
  const { page } = u;
  await page.goto("/it/import");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("pick-file").click();
  await (await chooser).setFiles([{ name: "diary.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-05,Matrix,1999,https://boxd.it/aaa,4.5,,,2024-01-04\n") }]);
  await page.getByTestId("found").waitFor();
  const dests = find(await ax(page), "radio");
  expect(dests.length, "the destinations are radios").toBeGreaterThanOrEqual(1);
  expect(dests.filter((d) => on(d.props.checked)).length, "one is chosen").toBe(1);
  // slow the chunk so the running state can be read
  await page.route("**/api/imports/**", async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    await r.continue();
  });
  await page.getByTestId("run").click();
  await page.getByTestId("progress-text").waitFor({ timeout: 10_000 });
  const run = await ax(page);
  const bar = find(run, "progressbar").find((b) => /import|importa|progress|avanz|%/i.test(b.name) || b.value !== undefined);
  expect(bar, "a progressbar with a name").toBeTruthy();
  expect(bar!.props.valuemax, "with a maximum").toBeDefined();
  await page.unroute("**/api/imports/**");
  await expect(page.getByTestId("ended")).toBeVisible({ timeout: 60_000 });
  expect(find(await ax(page), "status").length, "the end is a status").toBeGreaterThan(0);
});

test("flow 8, offline: the diary's outbox says a viewing is waiting, politely, with retry and discard named after it", async () => {
  const { page, ctx } = u;
  await page.goto("/it/diary"); // opened once online, so its code chunk is in the HTTP cache when the connection goes (the service worker is covered in pwa.spec.ts)
  await page.waitForLoadState("networkidle");
  await page.goto("/it/log");
  await page.getByLabel("Cerca un film, una serie, un anime…").fill("matrix");
  await page.getByRole("button", { name: /^Matrix/ }).first().click();
  await ctx.setOffline(true);
  await page.getByTestId("submit-log").click();
  await page.waitForURL("**/it/diary");
  await expect(page.getByTestId("pending-section").getByRole("status"), "the outbox line is a status (polite live region)").toContainText(/da inviare/);
  const tree = await ax(page);
  expect(live(tree).length, "and the tree exposes it as a live region").toBeGreaterThan(0);
  expect(find(tree, "button", /^Riprova a inviare/).length, "retry is named after the viewing").toBeGreaterThan(0);
  expect(find(tree, "button", /^Scarta/).length, "discard is named after the viewing").toBeGreaterThan(0);
  await ctx.setOffline(false);
  // back online it goes out by itself (the "online" event), nobody has to press retry
  await expect(page.getByTestId("pending-section")).toHaveCount(0, { timeout: 15_000 });
  await u.ctx.close();
  await friend.ctx.close();
});
