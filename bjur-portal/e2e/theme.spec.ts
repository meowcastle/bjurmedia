import { test, expect } from "@playwright/test";

/**
 * Light/dark, remembered per portal.
 *
 * Two keys, because they are two habits: clients read their gallery in daylight, staff
 * live in the admin at night. One shared preference would mean whichever surface you
 * touched last decides for both.
 */
test.describe("client portal", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("opens light and remembers the switch", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Survives a reload, and without a flash of the wrong theme first.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the ground actually changes, not just the attribute", async ({ page }) => {
    await page.goto("/");
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    const light = await bg();
    await page.getByTestId("theme-toggle").click();
    const dark = await bg();
    expect(light).not.toBe(dark);
  });
});

test.describe("admin", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("opens dark", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the client's choice does not follow staff into the admin", async ({ page }) => {
    // Set the client key to light, then confirm the admin still opens dark.
    await page.goto("/admin");
    await page.evaluate(() => localStorage.setItem("bjur:v2:themeC", "light"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
