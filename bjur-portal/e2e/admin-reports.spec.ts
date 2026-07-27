import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test("client attribution report: renders correct seeded counts and handles the zero-social-data case", async ({
  page,
}) => {
  await page.goto("/admin/reports");
  await expect(page.getByText("Select a client to generate an attribution report.")).toBeVisible();

  // Wide explicit range (not the default trailing-90-days) so this doesn't silently
  // drift as real time moves further from the seed script's fixed 2026 dates.
  await page.getByLabel("Client", { exact: true }).selectOption({ label: "Halcyon Films" });
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("To", { exact: true }).fill("2026-12-31");
  await page.getByLabel("To", { exact: true }).blur();

  await expect(page).toHaveURL(/\/admin\/reports\?client=.+/);
  await expect(page.getByRole("heading", { name: "Halcyon Films" })).toBeVisible();

  // Halcyon Films' seeded assets, confirmed directly against the DB: exactly one
  // each of Reel/Film/Still. Stat tiles are `.bg-s1.border.border-line` — specific
  // enough to only ever match the leaf tile divs, never an ancestor grid wrapper.
  const tile = (label: string) => page.locator("div.bg-s1.border.border-line").filter({ hasText: label });
  await expect(tile("Reels delivered")).toHaveText(/^1/);
  await expect(tile("Films delivered")).toHaveText(/^1/);
  await expect(tile("Stills delivered")).toHaveText(/^1/);
  await expect(tile("Publish rate")).toHaveText(/^0%/); // no SocialPost rows in seed data

  // No linked social posts anywhere in seed data — these sections must not render at all.
  await expect(page.getByText("Performance by platform")).not.toBeVisible();
  await expect(page.getByText("Top performing content")).not.toBeVisible();
});
