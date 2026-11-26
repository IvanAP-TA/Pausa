// The desktop sidebar: every label starts at the same x, Profilo (avatar slot) included.
import { expect, test } from "@playwright/test";
import { circleWith, it, person, signIn } from "./support-diary";

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

test("sidebar labels start at the same x, Profilo included", async ({ browser }) => {
  const ann = await person(browser, "align", { width: 1280 });
  await ann.page.setViewportSize({ width: 1280, height: 900 });
  await signIn(ann);
  const cid = await circleWith(ann, [], "Cineforum");
  await ann.page.goto(`/it/c/${cid}`);
  const nav = ann.page.getByRole("navigation", { name: "Pausa" });
  const xs: number[] = [];
  for (const name of [it.tabs.diary, it.tabs.serata, it.tabs.ranking, it.tabs.profile]) {
    const label = nav.getByRole("link").filter({ hasText: name }).first().getByText(name, { exact: true });
    const box = await label.boundingBox();
    xs.push(Math.round(box!.x));
  }
  expect(new Set(xs).size, JSON.stringify(xs)).toBe(1);
  await ann.ctx.close();
});
