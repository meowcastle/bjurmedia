import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * §8. Sign-out moves behind an initials avatar, and search gets the ⌘K the badge
 * claims. The badge was the point of writing the shortcut rather than the other way
 * round: advertising a key combination that does nothing is worse than no badge.
 */
test("sign out lives behind the account menu, not loose in the header", async ({ page }) => {
  await page.goto("/admin");

  // Not on screen until the menu is opened.
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  await page.getByRole("button", { name: /Account menu/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
});

test("the account menu closes on Escape and on an outside click", async ({ page }) => {
  await page.goto("/admin");
  const trigger = page.getByRole("button", { name: /Account menu/ });

  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.locator("h1").first().click();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("⌘K focuses the search box from anywhere on the page", async ({ page }) => {
  await page.goto("/admin");

  const search = page.getByLabel("Search clients, projects and files");
  await expect(search).not.toBeFocused();

  // Meta on darwin, Control elsewhere — the handler accepts either.
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await expect(search).toBeFocused();

  // And Escape lets go again, rather than trapping focus in the box.
  await page.keyboard.press("Escape");
  await expect(search).not.toBeFocused();
});
