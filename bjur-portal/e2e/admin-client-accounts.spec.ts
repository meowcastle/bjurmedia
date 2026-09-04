import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * §10b. Integrations configured the studio-wide YouTube key and the weekly sync but
 * never said which clients were actually connected — and nothing publishes or reports
 * views for a client whose account is missing.
 */
test("the roll-up counts connected clients out of the total", async ({ page }) => {
  await page.goto("/admin/integrations");

  const panel = page.getByTestId("client-accounts");
  await expect(panel).toBeVisible();

  const summary = panel.getByText(/^\d+ of \d+ clients connected$/);
  await expect(summary).toBeVisible();

  const [connected, total] = (await summary.textContent())!.match(/\d+/g)!.map(Number);
  expect(total).toBeGreaterThan(0);
  expect(connected).toBeGreaterThan(0);
  expect(connected).toBeLessThanOrEqual(total);

  // The count has to equal the rows that actually show a connection.
  const rowsWithAccount = await panel
    .locator('[data-testid^="account-row-"]')
    .filter({ hasText: /@/ })
    .count();
  expect(rowsWithAccount).toBe(connected);
});

test("an account whose token has expired is called out, not shown as healthy", async ({ page }) => {
  await page.goto("/admin/integrations");
  const panel = page.getByTestId("client-accounts");

  // SUYINSAMA is seeded connected with a lastSyncError — the case that is otherwise
  // completely silent, since the account still reads as connected.
  const row = panel.locator('[data-testid^="account-row-"]').filter({ hasText: "SUYINSAMA" });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("sync failing")).toBeVisible();

  await expect(panel.getByText(/\d+ needs reconnecting/)).toBeVisible();
});

test("a client with no account reads as not connected and offers a way to fix it", async ({ page }) => {
  await page.goto("/admin/integrations");
  const panel = page.getByTestId("client-accounts");

  const row = panel.locator('[data-testid^="account-row-"]').filter({ hasText: "Halcyon Films" });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Not connected")).toHaveCount(2); // IG and YT both

  // Connecting happens on the client's own page, where the credentials belong.
  await expect(row.getByRole("link", { name: "Connect" })).toHaveAttribute("href", /\/admin\/clients\/.+/);
});

test("a connected client links through to manage rather than connect", async ({ page }) => {
  await page.goto("/admin/integrations");
  const panel = page.getByTestId("client-accounts");

  const row = panel.locator('[data-testid^="account-row-"]').filter({ hasText: "57.NYC" });
  await expect(row.getByText("@57nyc")).toBeVisible();
  await expect(row.getByRole("link", { name: "Manage" })).toBeVisible();
});
