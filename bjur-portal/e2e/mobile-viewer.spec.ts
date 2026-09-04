import { test, expect } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  storageState: "e2e/.auth/sasha.json",
});

async function openFirstReel(page: import("@playwright/test").Page) {
  await page.goto("/p/p1");
  await page.getByRole("button", { name: /^REELS/i }).click();
  await page.locator("main img, [style*='aspect-ratio']").first().click();
  // Attached, not visible: the chrome is aria-hidden while concealed, so a role query
  // finds nothing at all — which is the point.
  await page.waitForTimeout(300);
}

/**
 * The viewer chrome used to mount hidden, so opening a clip on a phone gave you a
 * full-screen video with no close button, no download, and nothing indicating either
 * existed — you had to already know to tap the screen.
 */
test("opening a clip shows the controls straight away", async ({ page }) => {
  await openFirstReel(page);

  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Master/i })).toBeVisible();
});

test("the download control fits the screen and states a size", async ({ page }) => {
  await openFirstReel(page);

  const download = page.getByRole("link", { name: /Master/i });
  await expect(download).toBeVisible();

  // "↓ Download master" was wider than the row could give it, so it ran off the right
  // edge — the one control for saving a single clip, off-screen.
  const box = (await download.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);

  // Every download control states its size, per the handoff's global rule.
  await expect(download).toHaveText(/\d+(\.\d+)? (MB|GB|TB)/);
});

test("a tap hides the controls, and another brings them back", async ({ page }) => {
  await openFirstReel(page);

  const close = page.getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();

  // Tap-to-hide is there for anyone who wants the frame clear. Nothing hides them on a
  // timer: controls that vanish while you are reaching for them are the same complaint
  // in a quieter form.
  await page.locator("body").click({ position: { x: 195, y: 400 } });
  await expect(close).toBeHidden();

  await page.locator("body").click({ position: { x: 195, y: 400 } });
  await expect(close).toBeVisible();
});

test("the controls do not disappear on their own", async ({ page }) => {
  test.slow();
  await openFirstReel(page);
  const close = page.getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();

  await page.waitForTimeout(6000);
  await expect(close).toBeVisible();
});

test("the download link points at this clip's master", async ({ page }) => {
  await openFirstReel(page);
  await expect(page.getByRole("link", { name: /Master/i })).toHaveAttribute(
    "href",
    /^\/api\/assets\/[^/]+\/download$/
  );
});
