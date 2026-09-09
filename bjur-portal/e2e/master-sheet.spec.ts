import { test, expect } from "@playwright/test";

/**
 * The master sheet.
 *
 * The download used to be a button in the bottom bar, which meant the only place to
 * see what you were about to download was the button that downloaded it. The facts sit
 * above the action now.
 */
test.use({ storageState: "e2e/.auth/sasha.json" });

async function openViewer(page: import("@playwright/test").Page) {
  await page.goto("/p/p1");
  await page.getByText("SSH_Reel_Hero.mp4").click();
  await expect(page.getByTestId("video-gesture-surface")).toBeVisible();
}

test("the chip opens the sheet and it carries the file's facts", async ({ page }) => {
  await openViewer(page);
  const sheet = page.getByTestId("master-sheet");
  await expect(sheet).toHaveAttribute("data-open", "0");

  await page.getByTestId("master-chip").click();
  await expect(sheet).toHaveAttribute("data-open", "1");

  await expect(sheet).toContainText("SSH_Reel_Hero.mp4");
  await expect(sheet).toContainText("Format");
  await expect(sheet).toContainText("Size");
  await expect(sheet.getByTestId("sheet-download")).toBeVisible();
});

test("the arrow key opens it too", async ({ page }) => {
  await openViewer(page);
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("master-sheet")).toHaveAttribute("data-open", "1");
});

test("Escape closes the sheet, not the whole viewer", async ({ page }) => {
  await openViewer(page);
  await page.getByTestId("master-chip").click();
  await expect(page.getByTestId("master-sheet")).toHaveAttribute("data-open", "1");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("master-sheet")).toHaveAttribute("data-open", "0");
  // The clip is still up — closing a drawer should not close what is behind it.
  await expect(page.getByTestId("video-gesture-surface")).toBeVisible();
});

test("the download points at the master", async ({ page }) => {
  await openViewer(page);
  await page.getByTestId("master-chip").click();
  const href = await page.getByTestId("sheet-download").getAttribute("href");
  expect(href).toMatch(/^\/api\/assets\/[^/]+\/download$/);
});
