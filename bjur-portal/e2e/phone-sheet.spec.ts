import { test, expect } from "@playwright/test";

/**
 * On a phone the header menus are sheets from the bottom edge (PORTAL-POLISH §4): in
 * thumb reach, 44px rows, and they close the way a phone sheet does.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.describe("client", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("the menu is a bottom sheet with full-size rows", async ({ page }) => {
    await page.goto("/");
    const sheet = page.getByTestId("bottom-sheet");
    await expect(sheet).toHaveAttribute("data-open", "0");

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(sheet).toHaveAttribute("data-open", "1");

    // Let the slide (--dur-4) finish before measuring where things are.
    await expect
      .poll(async () => {
        const b = await sheet.getByText("Sign out", { exact: true }).boundingBox();
        return b ? b.y + b.height : Infinity;
      })
      .toBeLessThanOrEqual(844);

    for (const name of ["Settings", "Sign out"]) {
      const box = (await sheet.getByText(name, { exact: true }).boundingBox())!;
      const row = (await sheet.getByText(name, { exact: true }).locator("xpath=ancestor-or-self::*[self::a or self::button][1]").boundingBox())!;
      expect(row.height, `${name} row`).toBeGreaterThanOrEqual(44);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }

    // The backdrop closes it.
    await page.mouse.click(195, 100);
    await expect(sheet).toHaveAttribute("data-open", "0");

    // And a row does what it says.
    await page.getByRole("button", { name: "Open menu" }).click();
    await sheet.getByText("Settings", { exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });
});

test.describe("admin", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("the account menu is a sheet too, and its items work", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: /^Menu for / }).click();
    const sheet = page.getByTestId("bottom-sheet");
    await expect(sheet).toHaveAttribute("data-open", "1");
    await sheet.getByRole("menuitem", { name: /Library/ }).click();
    await expect(page).toHaveURL(/\/admin\/library$/);
  });
});
