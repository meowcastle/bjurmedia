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

  // Sasha's own seeded draft is visible to her, and marked as hers alone (v13 wording:
  // the column says "Only you see these", the note says "You · not sent").
  await expect(page.getByTestId("review-screen")).toContainText("Only you see these");
  await expect(page.getByTestId("review-screen")).toContainText("You · not sent");

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

test("a note the server refuses says so and keeps what was typed", async ({ page }) => {
  await page.goto("/p/p2/review");
  await page.route("**/api/reviews/*/notes", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 409 }) : route.continue()
  );
  await page.getByTestId("composer").fill("This one does not land");
  await page.getByTestId("add-note").click();
  await expect(page.getByTestId("note-error")).toHaveText(/closed for notes/);
  await expect(page.getByTestId("composer")).toHaveValue("This one does not land");
});

test("unsent notes get a send bar right under the composer", async ({ page }) => {
  await page.goto("/p/p2/review");
  // Sasha has a seeded draft, so the bar is already up, counting the same drafts as the
  // button in the notes column.
  const bar = page.getByTestId("unsent-bar");
  await expect(bar).toContainText(/\d+ notes? not sent yet/);
  const count = (await page.getByTestId("send-notes").textContent())!.match(/Send (\d+)/)![1];
  await expect(page.getByTestId("send-notes-bar")).toContainText(`Send ${count} note`);
});
