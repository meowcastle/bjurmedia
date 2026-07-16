import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/ivy.json" });

test("BRAW licensing: unlock a master via the purchase flow", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Brand Anthem — Delivery").click();
  await expect(page).toHaveURL(/\/p\/.+/);

  await page.getByRole("button", { name: "Masters", exact: true }).click();

  const tile = page.getByText("Halcyon_Anthem_MASTER.braw");
  await expect(tile).toBeVisible();
  await expect(page.getByText(/from \$500/)).toBeVisible();

  // Locked master opens the video preview with an unlock CTA, not a download link.
  await tile.click();
  await expect(page.locator("video")).toBeVisible();
  const unlockBtn = page.getByRole("button", { name: /unlock master/i });
  await expect(unlockBtn).toBeVisible();
  await unlockBtn.click();

  // Licensing dialog: three tiers derived from the $500 base price.
  await expect(page.getByText("Unlock master · BRAW")).toBeVisible();
  await expect(page.getByText("Social & Digital")).toBeVisible();
  await expect(page.getByText("$500", { exact: true })).toBeVisible();
  await expect(page.getByText("Commercial & Broadcast")).toBeVisible();
  await expect(page.getByText("$1000", { exact: true })).toBeVisible();
  await expect(page.getByText("Full Buyout")).toBeVisible();
  await expect(page.getByText("$2000", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Confirm/ }).click();
  await expect(page.getByText("Unlock master · BRAW")).not.toBeVisible();

  // Reopening the same asset now offers a real download instead of the unlock CTA.
  await tile.click();
  await expect(page.getByRole("link", { name: /download master/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /unlock master/i })).not.toBeVisible();
});
