// The landing with JavaScript OFF: the interactive pieces are CSS and native HTML (theme checkbox, radio demo, <details>).
import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("the Serata demo plays through with radios, and Ricomincia resets it", async ({ page }) => {
  await page.goto("/it#try");
  const form = page.locator("#try form");
  await expect(form.locator("fieldset.lp-p1")).toBeVisible();
  await form.locator("label.lp-pick", { has: page.locator(".lp-g1-a") }).click();
  await expect(form.locator("fieldset.lp-p2")).toBeVisible();
  await form.locator("label.lp-pick", { has: page.locator(".lp-g2-d") }).click();
  await expect(form.locator("fieldset.lp-p3")).toBeVisible();
  await form.locator("label.lp-pick", { has: page.locator(".lp-f-d") }).click();
  await expect(form.locator(".lp-c-d")).toBeVisible();
  await form.getByRole("button").click();
  await expect(form.locator("fieldset.lp-p1")).toBeVisible();
});

test("the theme checkbox switches to the light palette for this page", async ({ page }) => {
  await page.goto("/it");
  const paper = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-paper").trim());
  const dark = await paper();
  await page.locator("label.lp-theme-btn").click();
  expect(await paper()).not.toBe(dark);
});

test("the FAQ opens with <details>", async ({ page }) => {
  await page.goto("/it");
  const first = page.locator("#faq details").first();
  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
});
