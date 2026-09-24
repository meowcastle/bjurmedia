import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * The admin project page.
 *
 * It replaced the Edit dialog, so the thing to pin is that editing in place actually
 * commits — a field that looks editable and silently discards what you typed is worse
 * than no field — and that Escape puts it back rather than saving the half-typed value.
 *
 * Also covers the footage-request lifecycle, which is the page's other job: ask, close,
 * reopen. The anonymous upload through the link belongs with the send page (D7).
 */
test.use({ storageState: "e2e/.auth/admin.json" });

async function makeProject(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post("/api/admin/projects", {
    data: { clientId: "c1", title: `Page Spec ${Date.now()}`, type: "DELIVERY", ...over },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).project as { id: string; title: string };
}

test("the title edits in place, and Escape puts it back", async ({ page, request }) => {
  const project = await makeProject(request);
  await page.goto(`/admin/projects/${project.id}`);

  const title = page.getByTestId("project-title");
  await expect(title).toHaveValue(project.title);

  // Escape abandons the edit rather than committing it.
  await title.fill("Abandoned name");
  await title.press("Escape");
  await expect(title).toHaveValue(project.title);

  // Enter commits.
  await title.fill("Renamed by spec");
  await title.press("Enter");
  await expect(page.getByText("Title saved")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("project-title")).toHaveValue("Renamed by spec");

  await request.delete(`/api/admin/projects/${project.id}`);
});

test("the shape is stated, not offered", async ({ page, request }) => {
  const project = await makeProject(request, { review: true });
  await page.goto(`/admin/projects/${project.id}`);

  await expect(page.getByTestId("project-type")).toHaveText(/delivery/i);
  await expect(page.getByText("set at creation")).toBeVisible();
  // No control anywhere on the page offers to change either.
  await expect(page.getByRole("button", { name: /social calendar/i })).toHaveCount(0);

  await request.delete(`/api/admin/projects/${project.id}`);
});

test("payment holds and releases from the page", async ({ page, request }) => {
  const project = await makeProject(request);
  await page.goto(`/admin/projects/${project.id}`);

  const toggle = page.getByTestId("payment-toggle");
  await expect(toggle).toHaveText(/hold for payment/i);
  await toggle.click();
  await expect(page.getByText(/downloads watermarked/i)).toBeVisible();
  await expect(toggle).toHaveText(/release/i);

  await toggle.click();
  await expect(page.getByText(/clean downloads/i)).toBeVisible();

  await request.delete(`/api/admin/projects/${project.id}`);
});

test("a project holding files says so instead of offering delete", async ({ page, request }) => {
  const project = await makeProject(request);

  await page.goto(`/admin/projects/${project.id}`);
  await expect(page.getByTestId("delete-project")).toBeVisible();

  // p1 is the seeded gallery with real assets in it.
  await page.goto("/admin/projects/p1");
  await expect(page.getByTestId("delete-project")).toHaveCount(0);
  await expect(page.getByText(/empty it to delete/i)).toBeVisible();

  await request.delete(`/api/admin/projects/${project.id}`);
});

test("the project page shows what is in it and what state it is in", async ({ page }) => {
  // p1 is the seeded gallery with real assets and posters.
  await page.goto("/admin/projects/p1");

  const grid = page.locator('[data-testid^="file-"]');
  await expect(grid.first()).toBeVisible();
  // The pipeline state is stated, not left to be inferred from a blank thumbnail.
  await expect(page.getByTestId("proxy-progress")).toContainText(/ready|encoding|failed/i);

  // A file with a proxy opens the viewer; the page behind it stays put.
  await grid.first().click();
  await expect(page.getByTestId("admin-proxy-viewer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("admin-proxy-viewer")).toHaveCount(0);
});
