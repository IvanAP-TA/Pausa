import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { CIRCLE, signInAs } from "./helpers";

/* WCAG 2.1 A/AA with axe on the main screens, in the light and the dark theme. Serious or critical findings fail the test;
 * lesser ones are printed so they are not forgotten. */

const PUBLIC = ["/it", "/en", "/es", "/it/sign-in", "/it/guide", "/it/guide/movie-night-guide", "/it/privacy", "/it/terms"];
const PRIVATE = [`/it/c/${CIRCLE}`, `/it/c/${CIRCLE}/serata`, `/it/c/${CIRCLE}/lists`, `/it/c/${CIRCLE}/members`, `/it/c/${CIRCLE}/insights`, `/it/c/${CIRCLE}/log`, `/it/c/${CIRCLE}/notifications`, `/it/account`];

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = (v: (typeof results.violations)[number]) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`;
  const minor = results.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical");
  if (minor.length) console.log(`[axe minor] ${label}\n  ${minor.map(summary).join("\n  ")}`);
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map(summary), label).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`axe, ${theme} theme`, () => {
    test.use({ colorScheme: theme, reducedMotion: "reduce" }); // no fade-in while axe measures contrast

    for (const path of PUBLIC) {
      test(`public ${path}`, async ({ page, context }) => {
        await context.addCookies([{ name: "pausa-theme", value: theme, url: "http://localhost:3000" }]);
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await audit(page, `${theme} ${path}`);
      });
    }

    for (const path of PRIVATE) {
      test(`signed in ${path}`, async ({ page, context }) => {
        await context.addCookies([{ name: "pausa-theme", value: theme, url: "http://localhost:3000" }]);
        await signInAs(page, "giulia", path);
        await page.waitForLoadState("networkidle");
        await audit(page, `${theme} ${path}`);
      });
    }
  });
}
