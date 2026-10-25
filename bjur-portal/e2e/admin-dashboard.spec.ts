import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * §9. The dashboard reported state — counts, activity, worker health — but never said
 * what wanted doing. "Needs attention" answers that, from two sources that clear
 * themselves once acted on: galleries expiring inside a fortnight, and retainer files
 * with no delivery week (invisible to both the calendar and the weekly Slack post).
 *
 * Self-clearing is the point. The handoff lists a third source, upload batches "not
 * yet reviewed", which is left out because UploadBatch has no reviewed flag and
 * nothing would set one — those rows would never go away, and a card that cannot go
 * quiet is one people stop reading.
 */
test("the worker's state reads as a stat rather than its own bar", async ({ page }) => {
  await page.goto("/admin");

  // v13: the queue and the worker are two of Today's four numbers.
  await expect(page.getByText("In the queue", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Worker · (online|offline)$/)).toBeVisible();
  // The old standalone bar said this; it should not survive alongside the stat.
  await expect(page.getByText(/ffmpeg worker/)).toHaveCount(0);
});

test("needs attention lists retainer files with no delivery week", async ({ page }) => {
  await page.goto("/admin");

  // v13 calls the section "Needs you" (PortalAdmin13); the stat above it shares the words.
  const card = page.locator(".bj-lab", { hasText: "Needs you" });
  await expect(card).toBeVisible();

  // 57.NYC is the seeded RETAINER client, and its IG Posting project has assets
  // without a weekOf — exactly the case this row exists for.
  const row = page.getByText(/files with no delivery week/).first();
  await expect(row).toBeVisible();

  // The action has to lead somewhere that can fix it, which is the media calendar.
  const action = page.getByRole("link", { name: "Schedule" }).first();
  await expect(action).toHaveAttribute("href", /\/admin\/media\?project=/);
});

test("each attention row offers an action, not just a description", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator(".bj-lab", { hasText: "Needs you" })).toBeVisible();

  // Every row is actionable — a list of problems with no next step is just anxiety.
  // v13 buttons carry the nudging arrow: "Schedule →".
  const rows = page.locator("a", { hasText: /^(Open|Schedule)\s*→?$/ });
  expect(await rows.count()).toBeGreaterThan(0);
});
