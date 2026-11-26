// The static client under its real security headers (dist/_headers, applied by scripts/serve-dist.mjs the way Cloudflare applies it).
// Asserts the headers themselves, that the policy is ENFORCED (an inline script and eval are refused and reported), and that the key
// screens, including the Serata WebSocket, the result-card canvas, the file import and the service worker, produce NO violation.
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
test.use({ serviceWorkers: "allow" });
test.describe.configure({ mode: "serial" });

/** Everything the browser reports about the policy: `securitypolicyviolation` events and console messages that name it. */
async function watch(page: Page) {
  const seen: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"} at ${e.sourceFile || e.documentURI}`));
  });
  page.on("console", (m) => /content security policy|refused to/i.test(m.text()) && seen.push(`console: ${m.text().slice(0, 200)}`));
  return {
    seen,
    all: async () => [...seen, ...(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []))],
  };
}

test("the headers: CSP, HSTS, nosniff, referrer, permissions; HTML and the worker revalidate, hashed assets are immutable", async ({ request }) => {
  const html = await request.get("/it/home");
  const h = html.headers();
  const csp = h["content-security-policy"];
  expect(csp, "a CSP on HTML").toBeTruthy();
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "worker-src 'self'"]) expect(csp).toContain(d);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  expect(h["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["cache-control"]).toBe("no-cache");
  for (const p of ["/sw.js", "/manifest-it.webmanifest", "/offline.html", "/it", "/404.html"]) expect((await request.get(p)).headers()["cache-control"], p).toBe("no-cache");
  const js = (await html.text()).match(/\/_expo\/static\/js\/web\/entry-[^"]+\.js/)![0];
  const asset = await request.get(js);
  expect(asset.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect(asset.headers()["content-security-policy"]).toBeTruthy();
  // the hash in the policy is the hash of the one inline script of the page
  const inline = (await html.text()).match(/<script id="_R_">([\s\S]*?)<\/script>/)![1];
  const { createHash } = await import("node:crypto");
  expect(csp).toContain(`'sha256-${createHash("sha256").update(inline).digest("base64")}'`);
});

test("the policy is enforced: an injected inline script and eval are refused and reported", async ({ page }) => {
  const w = await watch(page);
  // A same-origin script file (allowed by 'self') that tries eval: CDP-evaluated code is exempt from the page's CSP, so the test cannot
  // call eval itself; a real script file can.
  await page.route("**/zz-eval-probe.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: 'try { eval("1"); window.__eval = "allowed"; } catch (e) { window.__eval = "blocked"; }' }));
  await page.goto("/it/sign-in");
  await page.waitForLoadState("networkidle");
  const ran = await page.evaluate(async () => {
    const s = document.createElement("script");
    s.textContent = "window.__injected = 1";
    document.head.appendChild(s);
    const probe = document.createElement("script");
    probe.src = "/zz-eval-probe.js";
    await new Promise((res) => {
      probe.onload = probe.onerror = () => res(undefined);
      document.head.appendChild(probe);
    });
    const w = window as unknown as { __injected?: number; __eval?: string };
    return { inline: w.__injected ?? "refused", evalInAScriptFile: w.__eval };
  });
  expect(ran).toEqual({ inline: "refused", evalInAScriptFile: "blocked" });
  expect((await w.all()).join(" | ")).toMatch(/script-src/);
});

let u: Person;
let cid = "";
let logId = "";
let code = "";

test("scene", async ({ browser }) => {
  u = await person(browser, "csp");
  const friend = await person(browser, "cspfriend");
  await signIn(u);
  await signIn(friend);
  cid = await circleWith(u, [friend], "Politica");
  logId = (await logApi(friend, { mediaKey: "tmdb:movie:603", rating: 8, review: "Una recensione.", circles: [cid] })).json.id;
  const made = await api<{ code: string }>(u, "POST", "/api/serate", { circleId: cid, mode: "bracket", mediaKeys: ["tmdb:movie:603", "tmdb:movie:27205"] });
  code = made.json.code;
  await friend.ctx.close();
});

test("public pages, sign-in and the whole signed-in app run with no policy violation", async () => {
  const { page } = u;
  const w = await watch(page);
  // posters come from TMDB / AniList: the mock catalogue's paths are made up, so answer with a real tiny PNG instead of the internet
  const px = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.route("https://image.tmdb.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: px }));
  for (const url of ["/", "/it", "/it/guide", "/it/guide/choose-a-movie-with-friends", "/it/privacy", "/it/terms", "/it/sign-in"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/it/me/circles");
  await expect(page.getByTestId(`circle-${cid}`)).toBeVisible();
  for (const url of [`/it/c/${cid}`, `/it/c/${cid}/feed`, `/it/c/${cid}/log/${logId}`, `/it/c/${cid}/ranking`, `/it/c/${cid}/insights`, "/it/diary", "/it/log", "/it/notifications", "/it/lists", "/it/imports", "/it/me", "/it/me/profile", "/it/me/settings", "/it/account", `/it/c/${cid}/settings`, `/it/c/${cid}/serate`]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
  }
  // the file import (reads the file in the browser, and would call AniList / Jikan for those sources)
  await page.goto("/it/import");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("pick-file").click();
  await (await chooser).setFiles([{ name: "diary.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-05,Matrix,1999,https://boxd.it/aaa,4.5,,,2024-01-04\n") }]);
  await page.getByTestId("found").waitFor();
  expect(await w.all()).toEqual([]);
});

test("the Serata room (a WebSocket on the same origin), the result card and the service worker run with no policy violation", async ({ browser }) => {
  const { page } = u;
  const w = await watch(page);
  const sockets: string[] = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  await page.goto(`/it/s/${code}`);
  await page.getByTestId("room-code").waitFor();
  await page.getByTestId("start").waitFor();
  await expect.poll(() => sockets.length, { message: "the room opened its socket under connect-src" }).toBeGreaterThan(0);
  expect(sockets[0]).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/api\/serate\/.+\/ws/);
  // a second person votes so the room finishes and the result card (canvas + blob/data images) is drawn
  const other = await person(browser, "cspother");
  await signIn(other);
  await api(other, "POST", "/api/circles/join", { code: (await api<{ invites: Array<{ code: string }> }>(u, "GET", `/api/circles/${cid}`)).json.invites[0].code });
  await api(other, "POST", `/api/serate/${code}/join`, {});
  await page.getByTestId("start").click();
  await page.getByTestId("round-name").waitFor();
  await page.getByRole("radio").first().click();
  const view = (await api<{ bracket: { match: { a: { id: string } } } }>(other, "GET", `/api/serate/${code}`)).json;
  void view;
  await api(other, "POST", `/api/serate/${code}/force`, {}).catch(() => undefined);
  await api(u, "POST", `/api/serate/${code}/force`, {}).catch(() => undefined);
  await page.getByTestId("winner-title").waitFor({ timeout: 60_000 });
  await page.getByTestId("open-card").click();
  await page.getByTestId("card-preview").waitFor();
  // the worker was registered and installed under worker-src 'self'
  await page.goto("/it/home");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  expect(await w.all()).toEqual([]);
  await other.ctx.close();
  await u.ctx.close();
});
