import { test, expect } from "@playwright/test";

/**
 * Camera segments from one shot share a long folder path and differ only in the last
 * few characters of the filename. The dialog truncated from the end, so a bin of ARRI
 * clips rendered as five identical-looking rows.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

test("a submission row leads with the filename, not the folder", async ({ page }) => {
  await page.goto("/admin/clients/c1");

  const uploads = page.getByRole("button", { name: /Client uploads \(\d+\)/ }).first();
  if ((await uploads.count()) === 0) test.skip(true, "no seeded client uploads");
  await uploads.click();

  const dialog = page.getByText("Client uploads").first();
  await expect(dialog).toBeVisible();

  // The distinguishing part of a deep path is its tail, so that is what must survive.
  const rows = page.locator("[title*='/']");
  if ((await rows.count()) === 0) test.skip(true, "no nested paths in this bin");

  const first = rows.first();
  const full = (await first.getAttribute("title"))!;
  const basename = full.split("/").pop()!;
  await expect(first).toContainText(basename);
});

test("an upload that stopped hours ago is called stalled, not uploading", async ({ page }) => {
  await page.goto("/admin/clients/c1");
  await page.getByRole("button", { name: /Client uploads \(\d+\)/ }).first().click();

  // A progress line that will never advance reads as work in flight. It is not.
  const stalled = page.getByTestId("submission-stalled").first();
  await expect(stalled).toBeVisible();
  await expect(stalled).toHaveText(/stalled/i);
  await expect(page.getByText(/stopped \d+h ago/)).toBeVisible();
});
