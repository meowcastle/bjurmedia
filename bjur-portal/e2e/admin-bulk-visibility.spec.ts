import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

const PROJECT = "/admin/media?project=p3";

/**
 * §10 bulk bar: hide a set of files from the client, or put them back.
 *
 * An explicit value rather than a toggle. Toggling a mixed selection is the operation
 * nobody means — half the files come back the wrong way round and nothing on screen
 * predicted which half.
 */
test("hiding a selection takes effect and survives a reload", async ({ page }) => {
  await page.goto(PROJECT);

  const rows = page.locator('[data-testid^="asset-row-"]');
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);

  const before = await page.getByText("INTERNAL", { exact: true }).count();

  await page.locator('input[type="checkbox"]').nth(1).check();
  await page.locator('input[type="checkbox"]').nth(2).check();
  const bar = page.getByTestId("bulk-bar");
  await expect(bar.getByText("2 selected")).toBeVisible();

  await bar.getByRole("button", { name: "Hide from client" }).click();

  // Selection clears on success, which is how the bar says the write landed.
  await expect(bar).toHaveCount(0);

  // Reload rather than trusting the optimistic update: the point is that it persisted.
  await page.reload();
  await expect
    .poll(() => page.getByText("INTERNAL", { exact: true }).count())
    .toBeGreaterThan(before);
});

test("showing a selection puts it back, leaving the project as it was", async ({ page }) => {
  await page.goto(PROJECT);

  const rows = page.locator('[data-testid^="asset-row-"]');
  const total = await rows.count();

  // Select every row and make them all visible — self-contained, and returns p3 to the
  // state the seed left it in whatever the test above did.
  for (let i = 1; i <= total; i++) {
    await page.locator('input[type="checkbox"]').nth(i).check();
  }
  const bar = page.getByTestId("bulk-bar");
  await expect(bar.getByText(`${total} selected`)).toBeVisible();

  await bar.getByRole("button", { name: "Show to client" }).click();
  await expect(bar).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("INTERNAL", { exact: true })).toHaveCount(0);
});

test("the endpoint refuses an empty selection and a non-boolean value", async ({ request }) => {
  const empty = await request.patch("/api/admin/assets/bulk-internal", {
    data: { assetIds: [], internal: true },
  });
  expect(empty.status()).toBe(400);

  const bad = await request.patch("/api/admin/assets/bulk-internal", {
    data: { assetIds: ["whatever"], internal: "yes" },
  });
  expect(bad.status()).toBe(400);
});

test("the endpoint rejects the whole batch if any id is unknown", async ({ request }) => {
  const res = await request.patch("/api/admin/assets/bulk-internal", {
    data: { assetIds: ["definitely-not-an-asset"], internal: true },
  });
  expect(res.status()).toBe(404);
});

// Deliberately outside the admin storageState: this endpoint decides what clients can
// see, so a signed-out caller must not reach it at all.
test.describe("without an admin session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a signed-out caller cannot change visibility", async ({ request }) => {
    const res = await request.patch("/api/admin/assets/bulk-internal", {
      data: { assetIds: ["anything"], internal: true },
    });
    expect(res.status()).toBe(401);
  });
});
