import { test, expect } from "@playwright/test";

/**
 * Caption sign-off and the Slack push, on p8 — the seeded board project.
 *
 * The gate is the point: a caption can be written and still be a draft nobody read,
 * which is exactly what the model drafting them makes possible. Posting refuses until
 * a person has signed each one off.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

test("posting refuses while a caption is unreviewed, and says so", async ({ request }) => {
  const res = await request.post("/api/admin/slack/post-week", {
    data: { projectId: "p8", weekStart: "2026-07-13" },
  });
  // Either nothing is scheduled that week or a caption is unapproved — both are
  // refusals with a reason, never a silent success.
  expect([409, 404]).toContain(res.status());
  const body = await res.json();
  expect(body.error, JSON.stringify(body)).toBeTruthy();
});

test("a project not on the board cannot post at all", async ({ request }) => {
  const res = await request.post("/api/admin/slack/post-week", {
    data: { projectId: "p1", weekStart: "2026-07-13" },
  });
  expect(res.status()).toBe(404);
});

test("the week needs a real date", async ({ request }) => {
  const res = await request.post("/api/admin/slack/post-week", {
    data: { projectId: "p8", weekStart: "not-a-date" },
  });
  expect(res.status()).toBe(400);
});

test("caption sign-off is offered on a board project and records", async ({ page }) => {
  await page.goto("/admin/media?project=p8");
  await page.getByRole("button", { name: /Calendar/i }).first().click();

  // The seeded board week is July 13 2026; the calendar opens on the current week, so
  // step back to the one that actually holds posts rather than skipping the test.
  const card = page.getByTestId("calendar-card").first();
  for (let i = 0; i < 60 && (await card.count()) === 0; i++) {
    await page.getByRole("button", { name: "Previous week" }).click();
  }
  await expect(card).toBeVisible();
  await card.click();

  // Write the copy first. Approving is only offered once there is something to
  // approve, and other specs in the suite edit these captions — so this test supplies
  // its own rather than depending on whatever state it inherits.
  await page.getByPlaceholder("TOVA (FAM ONLY)").fill("BOARD TEST");
  await page.getByPlaceholder("Caption + hashtags").fill("Copy written by the spec.");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Saving closes the drawer. Re-opening before that lands reopens it and then the
  // close fires underneath, which looks exactly like a disabled Approve button.
  await expect(page.getByText("Pick a day to see and edit")).toBeVisible();

  await card.click();
  const approve = page.getByTestId("approve-caption");
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByText("Caption approved")).toBeVisible();

  // Reload before believing it. The panel updates optimistically, so without this the
  // test passes even when the server stored nothing — which is exactly what it did
  // when the write was mutated to a no-op.
  await page.reload();
  await page.getByRole("button", { name: /Calendar/i }).first().click();
  for (let i = 0; i < 60 && (await card.count()) === 0; i++) {
    await page.getByRole("button", { name: "Previous week" }).click();
  }
  await card.click();
  await expect(page.getByText("Caption approved")).toBeVisible();
});

test("the post button exists only on a board project", async ({ page }) => {
  await page.goto("/admin/media?project=p8");
  await page.getByRole("button", { name: /Calendar/i }).first().click();
  await expect(page.getByTestId("post-week")).toBeVisible();

  await page.goto("/admin/media?project=p1");
  await page.getByRole("button", { name: /Calendar/i }).first().click();
  await expect(page.getByTestId("post-week")).toHaveCount(0);
});
