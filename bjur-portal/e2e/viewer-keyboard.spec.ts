import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/sasha.json" });

const PROJECT = "/p/p1";

/**
 * §4. Both viewers were keyboard-inert: no Escape, no arrows, no Space. On desktop
 * that meant the only way out of a full-screen overlay was finding a small ✕, and no
 * way to move between files without the mouse.
 *
 * Keyboard handling lives in useMediaCarousel rather than in each viewer, so photo and
 * video cannot drift apart — these cover both to keep that honest.
 */
async function openFirstPhoto(page: import("@playwright/test").Page, hideChrome = false) {
  await page.goto(PROJECT);
  await page.getByRole("button", { name: /^Stills\b/ }).click();
  await page.getByText("SSH_Still_012.jpg").click();
  await expect(page.getByTestId("active-photo")).toBeVisible();
  // The chrome is up on open now, so a tap is what takes it away. The parameter was
  // called revealChrome and did the reverse once that changed.
  if (hideChrome) await page.getByTestId("photo-gesture-surface").click();
}

test("Escape closes the photo viewer", async ({ page }) => {
  // Deliberately with the chrome tapped away: Escape must work when no control is on
  // screen, which is the state you are in after clearing the frame to look at a still.
  await openFirstPhoto(page, true);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("active-photo")).toHaveCount(0);
});

test("arrow keys move between photos", async ({ page }) => {
  await openFirstPhoto(page);

  // The counter is the readable statement of position.
  const counter = page.getByText(/^\d+ \/ \d+$/);
  await expect(counter).toBeVisible();
  const first = await counter.textContent();

  await page.keyboard.press("ArrowRight");
  await expect(counter).not.toHaveText(first!);

  await page.keyboard.press("ArrowLeft");
  await expect(counter).toHaveText(first!);
});

test("arrows do not run past the ends", async ({ page }) => {
  await openFirstPhoto(page);
  const counter = page.getByText(/^\d+ \/ \d+$/);

  // Already at the first item: left must be a no-op, not an index of 0 or -1.
  await expect(counter).toHaveText(/^1 \/ /);
  await page.keyboard.press("ArrowLeft");
  await expect(counter).toHaveText(/^1 \/ /);
});
