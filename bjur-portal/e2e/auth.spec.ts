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

    // Sign out sits behind the account menu now, so signing out is two steps.
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/admin/login");
  });

  // A staff login has no clientId, so there is no client portal to render for it.
  // This used to assert a 404, which is what the app did until the bare hostname
  // turned out to hit it: signing in as admin and then typing "portal.justinbjur.com"
  // returned a 404 page, invisible in a private window where middleware redirects to
  // /login instead. Staff now get sent to the surface they actually have.
  test("admin session is redirected to /admin, not the client surface", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");
    await expect(page).toHaveURL("/admin");
  });
});
