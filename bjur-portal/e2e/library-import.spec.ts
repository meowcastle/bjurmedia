import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test("library import: browse, pick a folder, preview, and register", async ({ page }) => {
  await page.goto("/admin/library");

  // Expand into the seeded archive fixture: 57NYC_old_dump/2024/*.jpg
  await page.getByRole("button", { name: "▸" }).first().click();
  await expect(page.getByText("2024")).toBeVisible();
  // 57NYC_old_dump's own caret is now "▾", so "2024"'s is the only "▸" left.
  await page.getByRole("button", { name: "▸" }).first().click();
  await expect(page.getByText("IG_Archive_Still_01.jpg")).toBeVisible();
  await expect(page.getByText("IG_Archive_Still_02.jpg")).toBeVisible();

  // Pick the whole 2024 folder — both files at once.
  await page.getByRole("checkbox", { name: "2024" }).click();
  await expect(page.getByText("2 file(s) selected")).toBeVisible();

  await page.getByRole("combobox").selectOption({ label: "SSH — Spring Campaign 2026" });
  await page.getByRole("button", { name: "Preview import" }).click();

  // Auto-classified as Still from the actual JPEG content, not a guess.
  const dialog = page.locator("div.bjrise");
  await expect(dialog.getByText("Confirm import")).toBeVisible();
  await expect(dialog.getByText("IG_Archive_Still_01.jpg")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Still" }).first()).toBeVisible();

  await dialog.getByRole("button", { name: /Register 2 file\(s\)/ }).click();
  await expect(page.getByText("Confirm import")).not.toBeVisible();

  // Selection resets after a successful import.
  await expect(page.getByText("0 file(s) selected")).toBeVisible();
});
