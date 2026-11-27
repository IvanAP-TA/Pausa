// The curtain (ui/Safelight) lies on the ground: it is wider than the page column, and must not be drawn over the side
// columns (it was, as stripes across "Registra una visione" that came and went with the scroll).
import { expect, test } from "@playwright/test";
import { circleWith, person, signIn } from "./support-diary";

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

test("the curtain stays behind the sidebar", async ({ browser }) => {
  const ann = await person(browser, "curtain", { width: 1440 });
  await ann.page.setViewportSize({ width: 1440, height: 900 });
  await signIn(ann);
  const cid = await circleWith(ann, [], "Cineforum");
  await ann.page.goto(`/it/c/${cid}`);
  const nav = ann.page.getByRole("navigation", { name: "Pausa" });
  await expect(nav).toBeVisible();
  const covered = await nav.evaluate((rail) => {
    // The curtain takes no pointer events, so hit testing would skip it: let it, just for this measure.
    const curtains = [...document.querySelectorAll<HTMLElement>("div[aria-hidden]")].filter((e) => getComputedStyle(e).backgroundImage.includes("repeating-linear"));
    curtains.forEach((e) => e.style.setProperty("pointer-events", "auto", "important"));
    const over = [...rail.querySelectorAll("a")].filter((a) => {
      const b = a.getBoundingClientRect();
      const top = document.elementFromPoint(b.x + 8, b.y + 8);
      return curtains.some((c) => c === top);
    }).length;
    return { curtains: curtains.length, over };
  });
  expect(covered.curtains).toBeGreaterThan(0);
  expect(covered.over).toBe(0);
  await ann.ctx.close();
});
