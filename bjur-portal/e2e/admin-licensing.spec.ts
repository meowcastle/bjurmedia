import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

// Deliberately NOT using Halcyon_Anthem_MASTER.braw (the only other seeded licensable
// Master) — e2e/licensing.spec.ts depends on that exact asset starting unlicensed for
// the ivy@halcyon.film client, and granting a custom license here would leave a
// License row that makes that unrelated test see it as already unlocked. SSH's
// SSH_HeroCut_MASTER.braw already has a basePrice seeded but starts non-licensable
// (an internal-only master) and isn't referenced by any other spec, so this test makes
// it licensable itself and reverts that at the end — fully self-contained either way.
test("admin grants a custom enterprise license", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByText("SSH", { exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clients\/.+/);

  await page.getByText("Spring Campaign 2026").click();
  await expect(page).toHaveURL(/\/admin\/media\?project=.+/);

  // Asset rows aren't otherwise distinguishable in the DOM (no unique class per row),
  // hence the data-testid — scoping every interaction below to this one row avoids
  // colliding with the identical "License off" button other Master rows also have.
  const row = page.locator('[data-testid^="asset-row-"]').filter({ hasText: "SSH_HeroCut_MASTER.braw" });
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { name: "License off" }).click();
  await expect(row.getByRole("button", { name: "Licensable" })).toBeVisible();

  await row.getByRole("button", { name: "Grant custom license" }).click();

  const dialog = page.locator(".fixed.inset-0.z-50");
  await expect(dialog.getByText("Grant custom license")).toBeVisible();

  await dialog.getByLabel("Term (months)").fill("12");
  await dialog.getByLabel("Territory").fill("North America");
  await dialog.getByRole("button", { name: "Paid Social" }).click();
  await dialog.getByLabel("Exclusive").check();
  await dialog.getByLabel("Amount ($)").fill("5000");

  // The doc's own acceptance example — composed live before submit, not just after.
  await expect(dialog.getByText("12 months · North America · Paid Social · Exclusive")).toBeVisible();

  await dialog.getByRole("button", { name: "Grant license" }).click();
  await expect(dialog).not.toBeVisible();

  // "License expired" badge must NOT appear for a fresh, unexpired license.
  await expect(page.getByText("LICENSE EXPIRED")).not.toBeVisible();

  // Confirm the history + composed scope + expiry render on the client detail page.
  await page.goto("/admin/clients");
  await page.getByText("SSH", { exact: true }).click();
  const licensesSection = page.getByRole("heading", { name: "Licenses" }).locator("xpath=following-sibling::div[1]");
  await expect(licensesSection.getByText("SSH_HeroCut_MASTER.braw")).toBeVisible();
  await expect(
    licensesSection.getByText("Custom · $5000 · 12 months · North America · Paid Social · Exclusive")
  ).toBeVisible();
  await expect(licensesSection.getByText(/expires/)).toBeVisible();
  await expect(licensesSection.getByText("Active", { exact: true })).toBeVisible();

  // Revert the licensable toggle — leaves this fixture as this test found it.
  await page.getByText("Spring Campaign 2026").click();
  await expect(page).toHaveURL(/\/admin\/media\?project=.+/);
  const rowAgain = page.locator('[data-testid^="asset-row-"]').filter({ hasText: "SSH_HeroCut_MASTER.braw" });
  await rowAgain.scrollIntoViewIfNeeded();
  await rowAgain.getByRole("button", { name: "Licensable" }).click();
  await expect(rowAgain.getByRole("button", { name: "License off" })).toBeVisible();
});
