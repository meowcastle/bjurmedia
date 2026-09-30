import { test, expect, type Page } from "@playwright/test";

/**
 * A client edits a drafted caption where they watch the reel. Editing is the check: no
 * button press, the draft pill turns to CHECKED, and the tile line follows.
 */
test.use({ storageState: "e2e/.auth/studio57.json" });

function tile(page: Page, name: string) {
  return page.locator('[data-testid^="asset-tile-"]').filter({ hasText: name });
}

test("editing the Instagram caption saves, checks it, and survives a reload", async ({ page }) => {
  await page.goto("/p/p9");
  const card = tile(page, "WR_Draft_A.mp4");
  await expect(card.locator('[data-testid^="caption-line-"]')).toHaveAttribute("data-state", "DRAFT");

  await card.locator('[data-testid^="caption-line-"]').click();
  const panel = page.getByTestId("caption-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("caption-pill")).toHaveAttribute("data-state", "DRAFT");

  const text = `Rewritten by the client ${Date.now()}`;
  await panel.getByTestId("caption-ig").fill(text);
  await expect(panel.getByTestId("caption-saved")).toHaveClass(/opacity-100/);
  await expect(panel.getByTestId("caption-pill")).toHaveAttribute("data-state", "CHECKED");

  await page.keyboard.press("Escape"); // focus is in the textarea: Esc must not close
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(card.locator('[data-testid^="caption-line-"]')).toHaveAttribute("data-state", "CHECKED");

  await page.reload();
  await expect(tile(page, "WR_Draft_A.mp4").locator('[data-testid^="caption-line-"]')).toHaveAttribute(
    "data-state",
    "CHECKED",
  );
  await tile(page, "WR_Draft_A.mp4").locator('[data-testid^="caption-line-"]').click();
  await expect(page.getByTestId("caption-panel").getByTestId("caption-ig")).toHaveValue(text);
});

test("the transcript tab lists timed lines", async ({ page }) => {
  await page.goto("/p/p9");
  await tile(page, "WR_Draft_C.mp4").locator('[data-testid^="caption-line-"]').click();
  const panel = page.getByTestId("caption-panel");
  await panel.getByTestId("caption-tab-transcript").click();
  await expect(panel.getByText("Click a line to jump there.")).toBeVisible();
  await expect(panel.getByText("0:04")).toBeVisible();
});

// Last in this file on purpose: it checks every remaining draft on p9.
test("the check filter lists only drafts, then says when none are left", async ({ page }) => {
  await page.goto("/p/p9");
  await page.getByRole("button", { name: /Captions to check/i }).click();
  const lines = page.locator('[data-testid^="caption-line-"]');
  const n = await lines.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(lines.nth(i)).toHaveAttribute("data-state", "DRAFT");

  // Check each draft from the viewer; the list empties and says so.
  await lines.first().click();
  const panel = page.getByTestId("caption-panel");
  for (let i = 0; i < n; i++) {
    await panel.getByTestId("caption-looks-good").click();
    await expect(panel.getByTestId("caption-pill")).toHaveAttribute("data-state", "CHECKED");
    if (i < n - 1) await page.getByRole("button", { name: "Next reel" }).click();
  }
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByTestId("captions-all-checked")).toBeVisible();
});
