import { test, expect } from "@playwright/test";

/**
 * Client answers on review cuts have to survive past the email.
 *
 * The studio gets a mail when a client approves or sends notes, but email is read once
 * and lost. A note asking for a change should still be findable tomorrow morning, so it
 * lands in Needs attention with the note quoted in full.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

test("a client's notes appear with the note quoted", async ({ page }) => {
  await page.goto("/admin");

  const row = page.getByTestId("attention-feedback").first();
  await expect(row).toBeVisible();
  // The seeded round: sasha asked for a change on p2's second cut.
  await expect(row).toContainText(/hold the logo a beat longer/);
  await expect(row.getByRole("link", { name: "Open reel" })).toBeVisible();
});

test("the note is not clipped to one line", async ({ page }) => {
  await page.goto("/admin");
  const body = page.getByTestId("attention-feedback").first().locator("span.leading-relaxed");
  await expect(body).toBeVisible();
  // truncate would hide the tail of a note, which is the part that says what to change.
  await expect(body).not.toHaveClass(/truncate/);
});
