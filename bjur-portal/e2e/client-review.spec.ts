import { test, expect } from "@playwright/test";

/**
 * The client's side of the review loop, on p2 — the seeded review project.
 *
 * Every seat can answer. The approval flow this replaces was owner-only because it
 * published to the client's own channels; a review is the studio asking "is this
 * right", which is a question anyone with a login can answer.
 */
test.describe("as the client", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("a pending cut asks to be answered, and a past one shows what was said", async ({ page }) => {
    await page.goto("/p/p2");

    const panel = page.getByTestId("review-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/needs your review/i)).toBeVisible();

    // The studio's note travels with the cut.
    await expect(panel.getByText(/Tightened the intro/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Approve" })).toBeVisible();

    // The answered round still shows the note the client sent, so a reply is not
    // swallowed the moment it is made.
    await expect(panel.getByText(/hold the logo a beat longer/)).toBeVisible();
  });

  test("approving records it and offers a way back", async ({ page }) => {
    await page.goto("/p/p2");
    const panel = page.getByTestId("review-panel");

    await panel.getByRole("button", { name: "Approve" }).first().click();
    await expect(panel.getByText("Approved", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Undo" })).toBeVisible();

    // Undo puts it back to pending — a mis-click is not a decision.
    await panel.getByRole("button", { name: "Undo" }).click();
    await expect(panel.getByRole("button", { name: "Approve" })).toBeVisible();
  });

  test("notes cannot be sent empty", async ({ page }) => {
    await page.goto("/p/p2");
    const panel = page.getByTestId("review-panel");

    await panel.getByRole("button", { name: "Send notes" }).first().click();
    const send = panel.getByRole("button", { name: "Send to Bjur" });
    await expect(send).toBeDisabled();

    await panel.getByRole("textbox").first().fill("Lose the last crowd shot.");
    await expect(send).toBeEnabled();
    await send.click();

    await expect(panel.getByText("Notes sent")).toBeVisible();
    await expect(panel.getByText("Lose the last crowd shot.")).toBeVisible();

    // Put the round back. Global setup reseeds per run, so this passes either way today
    // — but a test that depends on running before another one is a flake waiting for
    // someone to reorder the file.
    await panel.getByRole("button", { name: "Undo" }).click();
    await expect(panel.getByRole("button", { name: "Approve" })).toBeVisible();
  });

  test("a delivery-only project shows no review panel at all", async ({ page }) => {
    await page.goto("/p/p1");
    await expect(page.getByTestId("review-panel")).toHaveCount(0);
  });
});

test.describe("access", () => {
  test("the response route refuses a signed-out request", async ({ request }) => {
    const res = await request.post("/api/reviews/whatever/respond", {
      data: { state: "APPROVED" },
    });
    expect(res.status()).toBe(401);
  });
});
