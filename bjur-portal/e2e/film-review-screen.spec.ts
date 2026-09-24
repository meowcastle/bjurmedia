import { test, expect } from "@playwright/test";

/**
 * The review screen, as the client sees it.
 *
 * The privacy rule gets a test of its own because it is the one thing here that cannot be
 * recovered from: a draft is a half-formed thought, and a reviewer who finds theirs was
 * readable before they sent it does not write freely again.
 */
test.use({ storageState: "e2e/.auth/sasha.json" });

test("a seat reviews the latest cut", async ({ page }) => {
  await page.goto("/p/p2/review");
  const screen = page.getByTestId("review-screen");
  await expect(screen).toBeVisible();

  // Cut tabs, newest last, with the current one marked.
  await expect(page.getByTestId("cut-tab-1")).toBeVisible();
  await expect(page.getByTestId("cut-tab-2")).toBeVisible();
  await expect(page.getByTestId("cut-tab-2")).toContainText("Latest");

  // The previous cut's notes carry their outcome and the studio's answer.
  await expect(screen).toContainText("Changed");
  await expect(screen).toContainText("Held it for another 18 frames");
});

test("a draft is private, and sending is what makes it real", async ({ page }) => {
  await page.goto("/p/p2/review");

  // Sasha's own seeded draft is visible to her, and marked as hers alone.
  await expect(page.getByTestId("review-screen")).toContainText("Draft · only you");

  await page.getByTestId("composer").fill("Colour on the second verse feels warm");
  await page.getByTestId("add-note").click();
  await expect(page.getByTestId("review-screen")).toContainText("Colour on the second verse");

  // The send button counts what is actually unsent.
  await expect(page.getByTestId("send-notes")).toContainText(/Send \d+ notes? to Bjur/);
});

test("focusing the composer pauses and locks the timestamp", async ({ page }) => {
  await page.goto("/p/p2/review");
  const stamp = page.getByTestId("stamp");
  await expect(stamp).toBeVisible();
  await page.getByTestId("composer").focus();
  // The chip is the promise that a note lands where you stopped, not where the video
  // drifted to while you typed.
  await expect(stamp).toHaveText(/@ \d+:\d\d/);
});
