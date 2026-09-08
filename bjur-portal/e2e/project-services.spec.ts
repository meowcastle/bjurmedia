import { test, expect } from "@playwright/test";

/**
 * The three per-project service switches: uploads, board, review.
 *
 * These replace what client type used to decide. A client is no longer one shape — the
 * same client can have a scheduled social project and a one-off delivery at once — so
 * each project carries its own switches and the dialog is where they get flipped.
 *
 * Client uploads have their own spec covering what the flag actually gates;
 * this one is about staff being able to set all three and see what is on.
 */
test.describe("as staff", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("all three flags are booleans, not free text", async ({ request }) => {
    for (const flag of ["clientUploads", "calendar", "review"]) {
      const res = await request.patch("/api/admin/projects/p2", { data: { [flag]: "yes" } });
      expect(res.status(), `${flag} should be rejected`).toBe(400);
    }
  });

  test("the switches survive a round trip through the dialog", async ({ page }) => {
    await page.goto("/admin/clients/c1");

    const row = page.getByTestId("project-row-p3");
    await row.getByRole("button", { name: /Edit/ }).first().click();

    // p3 rather than p2: p2 is the seeded review project, so it does not start from
    // the plain-delivery state this test is about.
    const calendar = page.getByTestId("calendar-toggle");
    const review = page.getByTestId("review-toggle");
    await expect(calendar.getByRole("checkbox")).not.toBeChecked();
    await expect(review.getByRole("checkbox")).not.toBeChecked();

    await calendar.click();
    await review.click();
    await page.getByRole("button", { name: /Save changes/ }).click();

    // The list says what the project now does, without opening it again.
    await expect(row.getByText("Board", { exact: true })).toBeVisible();
    await expect(row.getByText("Review", { exact: true })).toBeVisible();

    // And the state is real, not just painted on: reopen and confirm.
    await row.getByRole("button", { name: /Edit/ }).first().click();
    await expect(page.getByTestId("calendar-toggle").getByRole("checkbox")).toBeChecked();
    await expect(page.getByTestId("review-toggle").getByRole("checkbox")).toBeChecked();

    // Put it back, so the rest of the suite sees the project it expects.
    await page.getByTestId("calendar-toggle").click();
    await page.getByTestId("review-toggle").click();
    await page.getByRole("button", { name: /Save changes/ }).click();
    await expect(row.getByText("Board", { exact: true })).toHaveCount(0);
  });
});
