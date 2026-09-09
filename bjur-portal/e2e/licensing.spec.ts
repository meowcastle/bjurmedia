import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/ivy.json" });

test("BRAW licensing: unlock a master via the purchase flow", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Brand Anthem — Delivery").click();
  await expect(page).toHaveURL(/\/p\/.+/);

  await page.getByRole("button", { name: /^Masters\b/ }).click();

  const tile = page.getByText("Halcyon_Anthem_MASTER.braw");
  await expect(tile).toBeVisible();
  await expect(page.getByText(/from \$500/)).toBeVisible();

  // Locked master opens the video preview with an unlock CTA, not a download link.
  // The CTA is visible as soon as the viewer opens.
  await tile.click();
  const video = page.getByTestId("active-video");
  await expect(video).toBeVisible();
  // Unlock lives in the master sheet now, alongside the facts about what is being
  // licensed — the chip states which of the two it is before you open it.
  const chip = page.getByTestId("master-chip");
  await expect(chip).toHaveText(/unlock master/i);
  await chip.click();

  const unlockBtn = page.getByTestId("sheet-unlock");
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
  await expect(video).toBeVisible();
  const chipAfter = page.getByTestId("master-chip");
  await expect(chipAfter).not.toHaveText(/unlock/i);
  await chipAfter.click();

  // The sheet states the size, per the rule that every download control says what it
  // will cost you to take.
  await expect(page.getByTestId("sheet-download")).toContainText(/\d+(\.\d+)? (MB|GB|TB)/);
  await expect(page.getByTestId("sheet-unlock")).toHaveCount(0);
});
