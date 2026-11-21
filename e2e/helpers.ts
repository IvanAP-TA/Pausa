import { expect, type Page } from "@playwright/test";

/** Signs in as one of the seeded people through the development-only shortcut (no email). */
export async function signInAs(page: Page, who: "giulia" | "marco" | "sofi" | "luca", next = "/it/home") {
  await page.goto(`/api/dev/login?email=${who}@pausa.test&next=${encodeURIComponent(next)}`);
  await expect(page).not.toHaveURL(/sign-in|api\/dev/);
}

export const CIRCLE = "c-divano";
