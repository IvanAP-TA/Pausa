// Keyboard pass, by script, on the key screens: Tab reaches every control (and nothing that is hidden), each focused control shows a
// focus indicator, a sheet traps focus, Escape closes it and focus goes back to the control that opened it.
// This is not a screen-reader session (docs/rebuild/A11Y.md says what it does and does not prove).
import { expect, test, type Page } from "@playwright/test";
import { api, circleWith, logApi, person, signIn, type Person } from "./support-diary";

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

let u: Person;
let cid = "";
let logId = "";

test("scene: a Cerchia, two viewings, a comment", async ({ browser }) => {
  u = await person(browser, "kbd");
  const friend = await person(browser, "kbdfriend");
  await signIn(u);
  await signIn(friend);
  cid = await circleWith(u, [friend], "Tastiera");
  const a = await logApi(friend, { mediaKey: "tmdb:movie:603", rating: 9, review: "Una recensione.", circles: [cid] });
  logId = a.json.id;
  await logApi(u, { mediaKey: "tmdb:movie:27205", rating: 7, circles: [cid] });
  await api(u, "POST", `/api/circles/${cid}/logs/${logId}/comments`, { body: "Un commento" });
  await friend.ctx.close();
});

const CONTROLS = 'a[href], button, input:not([type=hidden]), textarea, select, [role="button"], [role="link"], [role="radio"], [role="checkbox"], [role="switch"], [role="slider"], [role="tab"], [role="menuitem"], [tabindex]';

/** Every control the person can reach: visible, not disabled, not inside aria-hidden. Marks each with data-kb so Tab can be matched to it. */
async function mark(page: Page): Promise<number> {
  return page.evaluate((sel) => {
    let n = 0;
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      el.removeAttribute("data-kb");
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      const disabled = (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";
      const tab = el.getAttribute("tabindex");
      if (r.width === 0 || r.height === 0 || st.visibility === "hidden" || st.display === "none" || el.closest("[aria-hidden='true']") || disabled || tab === "-1") continue;
      // only the tab stops: an element with a role but no tabindex that is not natively focusable is not one
      const native = /^(A|BUTTON|INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || tab === "0";
      if (!native) continue;
      el.setAttribute("data-kb", String(n++));
    }
    return n;
  }, CONTROLS);
}

type Stop = { kb: string | null; name: string; focusRing: boolean; tag: string };

/** Presses Tab `count` times; at each stop reports which marked control has focus, its name and whether a focus indicator is drawn. */
async function tabThrough(page: Page, count: number): Promise<Stop[]> {
  const stops: Stop[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { kb: null, name: "(body)", focusRing: false, tag: "BODY" };
        const st = getComputedStyle(el);
        const ring = (parseFloat(st.outlineWidth) > 0 && st.outlineStyle !== "none") || (st.boxShadow !== "none" && st.boxShadow !== "") || false;
        // a control whose parent draws the ring (the star slider outlines itself with outlineWidth) is covered by the checks above
        const name = el.getAttribute("aria-label") || (el as HTMLInputElement).placeholder || el.textContent?.trim().slice(0, 40) || el.getAttribute("data-testid") || el.tagName;
        return { kb: el.getAttribute("data-kb"), name, focusRing: ring, tag: el.tagName };
      }),
    );
  }
  return stops;
}

const screens: Array<[string, () => string]> = [
  ["home", () => "/it/home"],
  ["feed", () => `/it/c/${cid}/feed`],
  ["thread", () => `/it/c/${cid}/log/${logId}`],
  ["log form (Registra)", () => "/it/log"],
  ["log form with a title picked", () => "/it/log?media=PICK"],
  ["settings", () => "/it/me/settings"],
];

for (const [name, url] of screens) {
  test(`${name}: Tab reaches every control, in order, each with a visible focus indicator`, async () => {
    const { page } = u;
    if (url().includes("PICK")) {
      // Registra with a title chosen: the star slider, its helper buttons, the date, the Cerchie chips ...
      await page.goto("/it/log");
      await page.getByLabel("Cerca un film, una serie, un anime…").fill("matrix");
      await page.getByRole("button", { name: /^Matrix/ }).first().click();
      await page.getByRole("slider", { name: "Voto" }).waitFor();
    } else await page.goto(url());
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("progressbar")).toHaveCount(0, { timeout: 10_000 });
    // parts that load on their own (the thread's "add to a list") may still arrive: count the controls once they stop changing
    let total = await mark(page);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(400);
      const again = await mark(page);
      if (again === total) break;
      total = again;
    }
    expect(total, "the screen has controls").toBeGreaterThan(3);
    const stops = await tabThrough(page, total + 4);
    const reached = new Set(stops.map((s) => s.kb).filter((k): k is string => k !== null));
    const missed = [];
    for (let i = 0; i < total; i++) if (!reached.has(String(i))) missed.push(i);
    const names = await page.evaluate((missedList) => missedList.map((i) => { const el = document.querySelector(`[data-kb="${i}"]`); return el ? `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30)}` : String(i); }), missed);
    expect(names, `controls Tab never reached on ${name}`).toEqual([]);
    // a stop that is not one of the marked controls is a tab stop the person cannot see or name (hidden from the tree, or off screen)
    const stray = stops.filter((st) => st.kb === null && st.tag !== "BODY").map((st) => `${st.tag} ${st.name}`);
    expect(stray, `Tab stops that are not controls on ${name}`).toEqual([]);
    const noRing = stops.filter((s) => s.kb !== null && !s.focusRing).map((s) => `${s.tag} ${s.name}`);
    expect(noRing, `focused controls with no visible indicator on ${name}`).toEqual([]);
    // Shift+Tab walks back to the first stop (nothing traps focus on a plain screen)
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  });
}

test("a sheet traps focus, Escape closes it, and focus returns to the control that opened it", async () => {
  const { page } = u;
  // the ranking's filter sheet (the diary's filters are a panel in the page, as in v1)
  await page.goto(`/it/c/${cid}/ranking`);
  await page.waitForLoadState("networkidle");
  const opener = page.getByTestId("open-filters");
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  // focus is moved into the sheet when it opens (or the first Tab takes it there)
  if (!(await inside())) await page.keyboard.press("Tab");
  expect(await inside(), "focus is inside the dialog after it opens").toBe(true);
  // many more Tabs than the sheet has controls: focus never leaves it
  const n = await dialog.locator('a[href], button, input, textarea, select, [tabindex="0"]').count();
  for (let i = 0; i < n + 6; i++) {
    await page.keyboard.press("Tab");
    expect(await inside(), `Tab ${i + 1}: focus still inside the dialog`).toBe(true);
  }
  for (let i = 0; i < n + 6; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await inside(), `Shift+Tab ${i + 1}: focus still inside the dialog`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "focus goes back to the opener").toBe("open-filters");
});

test("the report sheet in a thread: same rules", async () => {
  const { page } = u;
  await page.goto(`/it/c/${cid}/log/${logId}`);
  await page.waitForLoadState("networkidle");
  const opener = page.getByRole("button", { name: "Segnala" }).first();
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  if (!(await inside())) await page.keyboard.press("Tab");
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await inside(), `Tab ${i + 1}`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.textContent?.includes("Segnala"))).toBe(true);
  await u.ctx.close();
});
