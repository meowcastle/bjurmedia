import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * §13, the client's side of the publish approval loop. 57.NYC's IG Posting project is
 * seeded with one post in each state, because each shows a different set of controls.
 */
const PROJECT = "/p/p8";

test.describe("as the account owner", () => {
  test.use({ storageState: "e2e/.auth/studio57.json" });

  test("a post waiting on the client announces itself and says when it goes anyway", async ({ page }) => {
    await page.goto(PROJECT);

    const banner = page.getByTestId("approval-banner");
    await expect(banner).toBeVisible();
    await expect(banner.getByText(/post needs your OK/i)).toBeVisible();
    // The deadline is the part that matters: silence publishes it.
    await expect(banner.getByText(/Auto-publishes .* unless you hold it/)).toBeVisible();
  });

  test("Review switches to the posts view from the gallery", async ({ page }) => {
    await page.goto(PROJECT);

    // The gallery is still the landing view — someone here to download should get it.
    await expect(page.getByRole("button", { name: "All files" })).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("approval-banner").getByRole("button", { name: "Review" }).click();
    await expect(page.getByRole("button", { name: "This week" })).toHaveAttribute("aria-pressed", "true");
    // Scoped to a row: the banner also says "needs your OK", so an unscoped match is
    // ambiguous and would pass on the banner alone without the list ever rendering.
    await expect(
      page.locator('[data-testid^="post-row-"]').filter({ hasText: "Needs your OK" }).first()
    ).toBeVisible();
  });

  test("approving clears the banner and sticks after a reload", async ({ page }) => {
    await page.goto(PROJECT);
    await page.getByTestId("approval-banner").getByRole("button", { name: "Review" }).click();

    // Pin the row by id first. Filtering on "Needs your OK" is what found it, but that
    // filter re-evaluates — the moment the state changes the locator matches nothing,
    // and the assertion below would fail for the wrong reason.
    const awaitingId = (await page
      .locator('[data-testid^="post-row-"]')
      .filter({ hasText: "Needs your OK" })
      .first()
      .getAttribute("data-testid"))!;
    const row = page.getByTestId(awaitingId.replace("post-row-", "post-row-"));

    await row.getByRole("button", { name: "Approve" }).click();

    await expect(row.getByText("Approved")).toBeVisible();
    await expect(page.getByTestId("approval-banner")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("approval-banner")).toHaveCount(0);

    // Put it back. This spec's other tests need a post still waiting, and a test that
    // silently consumes the fixture it shares only passes while it happens to run last.
    const assetId = awaitingId.replace("post-row-", "");
    const admin = await pwRequest.newContext({ storageState: "e2e/.auth/admin.json" });
    const restored = await admin.post(`/api/admin/assets/${assetId}/publish`, {
      data: { action: "request-approval" },
    });
    expect(restored.ok()).toBe(true);
    await admin.dispose();
  });

  test("published posts live behind their own tab and report views", async ({ page }) => {
    await page.goto(PROJECT);
    await page.getByRole("button", { name: "Published" }).click();

    const rows = page.locator('[data-testid^="post-row-"]');
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first().getByText("Published")).toBeVisible();
    await expect(rows.first().getByText(/views so far/)).toBeVisible();
  });
});

test.describe("as a downloader on the same account", () => {
  test.use({ storageState: "e2e/.auth/dana57.json" });

  test("can see the schedule but cannot approve or hold", async ({ page }) => {
    await page.goto(PROJECT);
    await page.getByRole("button", { name: "This week" }).click();

    // Seeing what is queued is useful to anyone on the account.
    await expect(page.locator('[data-testid^="post-row-"]').first()).toBeVisible();

    // Clearing a post to go out on the client's own channels is the owner's call.
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hold" })).toHaveCount(0);
  });

  test("the API refuses a downloader, not just the buttons", async ({ page, request }) => {
    // Hiding the buttons is presentation; the endpoint is the thing that has to say no.
    await page.goto(PROJECT);
    await page.getByRole("button", { name: "This week" }).click();
    const rowId = await page
      .locator('[data-testid^="post-row-"]')
      .first()
      .getAttribute("data-testid");
    const assetId = rowId!.replace("post-row-", "");

    const res = await request.post(`/api/projects/p8/posts/${assetId}`, {
      data: { action: "approve" },
    });
    expect(res.status()).toBe(403);
  });
});
