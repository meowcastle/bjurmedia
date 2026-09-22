import { test, expect } from "@playwright/test";

/**
 * Team and Library are out of the top bar and into the account menu.
 *
 * Worth a spec because the failure mode is silent: neither screen is linked from anywhere
 * else in the shell — Library was reachable only from a contextual link on Media — so if
 * the menu stops rendering them, two working pages become URL-only and nobody notices
 * until someone needs to add a staff login.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

test("Team and Library live in the account menu, not the nav", async ({ page }) => {
  await page.goto("/admin");

  const nav = page.locator("nav").first();
  await expect(nav.getByRole("link", { name: "Clients" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Team" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Library" })).toHaveCount(0);

  await page.getByRole("button", { name: /Account menu/ }).click();
  const menu = page.getByTestId("admin-account-menu");
  await expect(menu.getByRole("menuitem", { name: /Team/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Library/ })).toBeVisible();
});

test("the menu navigates and closes behind itself", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByTestId("admin-account-menu").getByRole("menuitem", { name: /Team/ }).click();

  await page.waitForURL("**/admin/team");
  // An open menu left hanging over the page it just navigated to is the whole reason
  // the pathname effect exists.
  await expect(page.getByTestId("admin-account-menu")).toHaveCount(0);
});

test("Library reaches the archive registrar", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByTestId("admin-account-menu").getByRole("menuitem", { name: /Library/ }).click();

  await page.waitForURL("**/admin/library");
  await expect(page.locator("body")).not.toContainText("404");
});
