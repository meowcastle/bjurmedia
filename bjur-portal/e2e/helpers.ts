import { Page, expect } from "@playwright/test";

export const CLIENT_PASSWORD = "bjurmedia2026";
export const ADMIN_PASSWORD = "bjurmedia2026";

export async function loginAsClient(page: Page, email = "sasha@ssh.studio") {
  await page.goto("/login");
  await page.locator('input[autocomplete="username"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(CLIENT_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("/");
}

export async function loginAsAdmin(page: Page, email = "admin@bjurmedia.nyc") {
  await page.goto("/admin/login");
  await page.locator('input[autocomplete="username"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("/admin");
}
