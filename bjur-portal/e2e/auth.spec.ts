import { test, expect } from "@playwright/test";
import { loginAsClient, loginAsAdmin } from "./helpers";

test.describe("client auth", () => {
  test("logs in and out", async ({ page }) => {
    await loginAsClient(page);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[autocomplete="username"]').fill("sasha@ssh.studio");
    await page.locator('input[autocomplete="current-password"]').fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/invalid/i)).toBeVisible();
  });

  test("unauthenticated visitor is redirected to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("client session can't reach the admin surface", async ({ page }) => {
    await loginAsClient(page);
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
  });
});

test.describe("admin auth", () => {
  test("logs in and out", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/admin/login");
  });

  test("admin session can't reach the client surface", async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.goto("/");
    expect(res?.status()).toBe(404);
  });
});
