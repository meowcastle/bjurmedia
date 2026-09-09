import { test, expect } from "@playwright/test";

/**
 * Double-tap to favourite, in the viewer.
 *
 * The viewer is swipe-only now — no arrow buttons — so taps carry two meanings and the
 * pair have to be told apart. A double tap must not also flash the chrome on its way
 * past, and a single tap must not favourite anything.
 */
test.use({ storageState: "e2e/.auth/sasha.json" });

async function openFirstVideo(page: import("@playwright/test").Page) {
  await page.goto("/p/p1");
  await page.getByText("SSH_Reel_Hero.mp4").click();
  await expect(page.getByTestId("video-gesture-surface")).toBeVisible();
}

test("the viewer has no arrow buttons", async ({ page }) => {
  await openFirstVideo(page);
  await expect(page.getByRole("button", { name: "Next video" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous video" })).toHaveCount(0);
});

test("double tap favourites and shows the burst", async ({ page }) => {
  await openFirstVideo(page);
  const state = page.getByTestId("viewer-favorite-state");
  const before = await state.getAttribute("data-favorite");

  const surface = page.getByTestId("video-gesture-surface");
  await surface.click();
  await surface.click({ delay: 0 });

  await expect(page.getByTestId("heart-burst")).toBeVisible();
  await expect(state).not.toHaveAttribute("data-favorite", before!);
});

test("the favourite survives closing the viewer", async ({ page }) => {
  await openFirstVideo(page);
  const state = page.getByTestId("viewer-favorite-state");
  const surface = page.getByTestId("video-gesture-surface");

  // Wait for the write, not just the optimistic flip. Navigating away while the POST
  // is still in flight loses it, and that timing differs between running this file
  // alone and running it inside the full suite.
  const saved = page.waitForResponse(
    (r) => r.url().includes("/favorite") && r.request().method() === "POST",
  );
  await surface.click();
  await surface.click({ delay: 0 });
  await saved;
  const after = await state.getAttribute("data-favorite");

  await page.keyboard.press("Escape");
  await openFirstVideo(page);
  // Reopened from the page's own state, so this is the server's answer, not the
  // viewer remembering its own click.
  await expect(page.getByTestId("viewer-favorite-state")).toHaveAttribute("data-favorite", after!);
});

test("a single tap toggles chrome without favouriting", async ({ page }) => {
  await openFirstVideo(page);
  const state = page.getByTestId("viewer-favorite-state");
  const before = await state.getAttribute("data-favorite");

  await page.getByTestId("video-gesture-surface").click();
  await page.waitForTimeout(600); // past the double-tap window

  await expect(page.getByTestId("heart-burst")).toHaveCount(0);
  await expect(state).toHaveAttribute("data-favorite", before!);
});
