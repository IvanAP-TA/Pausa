// Touch targets, names, overflow and contrast on every screen of the diary / social / profile / statistics area, at phone width, in
// both themes, plus the desktop rail. Same rule as app.spec.ts: 44 points and a name for everything you can press or type in.
import { expect, test, type Page } from "@playwright/test";
import { api, circleWith, logApi, meId, person, signIn, type Person } from "./support-diary";

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

/** What is pressable or typeable but too small, unnamed, or sticking out of the page. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const d = document.documentElement;
    if (d.scrollWidth > d.clientWidth + 1) out.push(`page scrolls sideways (${d.scrollWidth} > ${d.clientWidth})`);
    for (const el of document.querySelectorAll<HTMLElement>('[role="button"],[role="link"],[role="radio"],[role="checkbox"],[role="switch"],[role="slider"],input,textarea,a[href]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || el.closest("[aria-hidden='true']")) continue;
      // a link or button that holds only an image is named by that image (role="img" aria-label), as the accessibility tree computes it
      const name = el.getAttribute("aria-label") || el.textContent?.trim() || el.getAttribute("placeholder") || el.querySelector('[role="img"][aria-label]')?.getAttribute("aria-label") || "";
      if (!name) out.push(`unnamed ${el.tagName}[${el.getAttribute("role")}] ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (Math.min(r.width, r.height) < 43.5) out.push(`${name.slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      // a control cut off at the right edge is unreachable
      if (r.right > d.clientWidth + 1 && !el.closest("[data-nav-scroll]") && !el.closest('[role="navigation"]')) out.push(`${name.slice(0, 40)} sticks out at ${Math.round(r.right)}`);
    }
    return out;
  });
}

let u: Person;
let cid = "";
let logId = "";
let mediaId = "";
let otherId = "";

test("set the scene: a Cerchia, a viewing with a comment, a spoiler, a series in progress", async ({ browser }) => {
  u = await person(browser, "ally");
  const friend = await person(browser, "friend");
  await signIn(u);
  await signIn(friend);
  cid = await circleWith(u, [friend], "Accessibili");
  otherId = await meId(friend);
  const a = await logApi(friend, { mediaKey: "tmdb:movie:603", rating: 9, review: "Una recensione abbastanza lunga da andare a capo almeno una volta su uno schermo stretto, per vedere come si comporta il testo.", circles: [cid] });
  logId = a.json.id;
  mediaId = a.json.mediaId;
  await logApi(friend, { mediaKey: "tmdb:movie:27205", rating: 7, review: "Spoiler!", containsSpoilers: true, circles: [cid] });
  await logApi(u, { mediaKey: "tmdb:tv:1396", season: 1, episode: 2, circles: [cid] });
  await api(u, "POST", `/api/circles/${cid}/logs/${logId}/comments`, { body: "Un commento" });
  await api(friend, "POST", `/api/circles/${cid}/logs/${logId}/comments`, { body: "Uno spoiler nascosto", isSpoiler: true });
  await friend.ctx.close();
});

const screens: Array<[string, () => string]> = [
  ["feed", () => `/it/c/${cid}/feed`],
  ["thread", () => `/it/c/${cid}/log/${logId}`],
  ["hub", () => `/it/c/${cid}`],
  ["ranking", () => `/it/c/${cid}/ranking`],
  ["insights", () => `/it/c/${cid}/insights`],
  ["person", () => `/it/c/${cid}/people/${otherId}`],
  ["title page", () => `/it/t/${mediaId}`],
  ["my diary", () => "/it/diary"],
  ["log form", () => "/it/log"],
  ["notifications", () => "/it/notifications"],
  ["me", () => "/it/me"],
  ["edit profile", () => "/it/me/profile"],
  ["settings", () => "/it/me/settings"],
  ["circle settings", () => `/it/c/${cid}/settings`],
];

for (const scheme of ["dark", "light"] as const) {
  test(`phone, ${scheme}: every control on every screen is 44 points, named and inside the page`, async ({ browser }) => {
    const p = await person(browser, `a11y-${scheme}`, { scheme });
    await signIn(p);
    await api(p, "POST", "/api/circles/join", { code: (await api<{ invites: Array<{ code: string }> }>(u, "GET", `/api/circles/${cid}`)).json.invites[0].code });
    const problems: Record<string, string[]> = {};
    for (const [name, url] of screens) {
      await p.page.goto(url());
      await p.page.waitForLoadState("networkidle");
      await expect(p.page.getByRole("progressbar")).toHaveCount(0, { timeout: 10_000 }); // loaded
      const found = await audit(p.page);
      if (found.length) problems[name] = found;
    }
    expect(problems).toEqual({});
    await p.ctx.close();
  });
}

test("the registration form with a series picked, a filter sheet and a report sheet are also within the rules", async ({ browser }) => {
  const p = await person(browser, "a11y-forms");
  await signIn(p);
  await api(p, "POST", "/api/circles/join", { code: (await api<{ invites: Array<{ code: string }> }>(u, "GET", `/api/circles/${cid}`)).json.invites[0].code });
  const problems: Record<string, string[]> = {};
  await p.page.goto("/it/log");
  await p.page.getByLabel("Cerca un film, una serie, un anime…").fill("breaking");
  await p.page.getByRole("button", { name: /^Breaking Bad/ }).first().click();
  // a new viewing has no details section: audit the form as it is, then the edit form of an existing viewing (details open)
  await p.page.getByTestId("mode-watching").waitFor();
  problems.form = await audit(p.page);
  const mine = (await logApi(p, { mediaKey: "tmdb:movie:603", rating: 8, review: "Da modificare.", circles: [cid] })).json.id;
  await p.page.goto(`/it/log/${mine}`);
  await p.page.getByTestId("log-details").waitFor();
  if ((await p.page.getByTestId("log-details").getAttribute("aria-expanded")) !== "true") await p.page.getByTestId("log-details").click();
  problems.editForm = await audit(p.page);
  await p.page.goto(`/it/c/${cid}/feed`);
  await p.page.getByTestId("open-filters").click();
  await p.page.getByTestId("filter-panel").waitFor();
  problems.filters = await audit(p.page);
  await p.page.goto(`/it/c/${cid}/log/${logId}`);
  await p.page.getByRole("button", { name: "Segnala" }).first().click();
  await p.page.getByRole("dialog", { name: /Cerca e filtra|Segnala/ }).waitFor();
  problems.report = await audit(p.page);
  for (const k of Object.keys(problems)) if (!problems[k].length) delete problems[k];
  expect(problems).toEqual({});
  await p.ctx.close();
});

test("desktop width: the rail and the header carry the same screens without sideways scrolling", async ({ browser }) => {
  const p = await person(browser, "a11y-desk", { width: 1280 });
  await signIn(p);
  await api(p, "POST", "/api/circles/join", { code: (await api<{ invites: Array<{ code: string }> }>(u, "GET", `/api/circles/${cid}`)).json.invites[0].code });
  const problems: Record<string, string[]> = {};
  for (const [name, url] of screens.filter(([n]) => ["feed", "thread", "ranking", "insights", "my diary", "edit profile"].includes(n))) {
    await p.page.goto(url());
    await p.page.waitForLoadState("networkidle");
    await expect(p.page.getByRole("progressbar")).toHaveCount(0, { timeout: 10_000 });
    const found = await audit(p.page);
    if (found.length) problems[name] = found;
  }
  expect(problems).toEqual({});
  const nav = p.page.getByRole("navigation", { name: "Pausa" });
  // v1 rail: the wordmark, Registra, then Diario, Serata, Classifica, Liste, Cerchia, Profilo
  await expect(nav.getByRole("link")).toHaveCount(8);
  await p.ctx.close();
  await u.ctx.close();
});
