import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test("create a new client end-to-end", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByRole("button", { name: "+ New client" }).click();

  await page.getByLabel("Client name").fill("Northbound Studio");
  await page.getByLabel("Owner name").fill("Priya Shah");
  await page.getByLabel("Owner email").fill("priya@northbound.studio");
  await page.getByRole("button", { name: "Create client" }).click();

  // Temp-password reveal screen — the only time it's ever shown. No mail is configured
  // under test, so the screen has to say so rather than imply the owner was emailed.
  await expect(page.getByText("Client created")).toBeVisible();
  await expect(page.getByTestId("client-created-note")).toContainText("Email not sent");
  await expect(page.locator("div.font-mono.bg-bg")).toHaveText(/.{8,}/);
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("Northbound Studio")).toBeVisible();
  await expect(page.getByText("@northboundstudio")).toBeVisible();
});

/**
 * The username is a folder name nobody creating a client should have to think about. It
 * is derived from the name, and a clash takes the next free suffix instead of an error
 * the dialog no longer has a field to fix.
 */
test("a name whose username is taken gets the next free one", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByRole("button", { name: "+ New client" }).click();
  await expect(page.getByLabel("Username")).toHaveCount(0);

  await page.getByLabel("Client name").fill("S.S.H."); // slugs to "ssh", which the seeded client has
  await page.getByLabel("Owner name").fill("Someone");
  await page.getByLabel("Owner email").fill(`someone+${Date.now()}@dup.test`);
  await page.getByRole("button", { name: "Create client" }).click();

  await expect(page.getByText("Client created")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(/^@ssh\d+$/).first()).toBeVisible();
});

// Project creation moved from a standalone /admin/projects list to each client's own
// detail page (/admin/clients/[id]) — browsing starts from Clients now, and the "New
// project" dialog there is pre-scoped to that one client (no client picker to fill in).
test("create a new project and see its inbox path", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByText("SSH", { exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clients\/.+/);

  await page.getByRole("button", { name: "+ New project" }).click();
  await page.getByLabel("Title").fill("Fall Lookbook 2026");
  await page.getByRole("button", { name: "Create project" }).click();

  // Scoped to the dialog overlay: router.refresh() (triggered by onCreated()) can make
  // the client detail page's own project list show this same new project's inbox path
  // underneath the still-open "Created." dialog, so an unscoped text locator
  // matches both and violates Playwright's strict mode.
  const dialog = page.locator(".fixed.inset-0.z-50");
  await expect(dialog.getByText("Created.")).toBeVisible();
  await expect(dialog.getByText(/_inbox\/ssh\/fall-lookbook-2026/)).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  // Scoped to the new project's own row. getByText("DRAFT") is a case-insensitive
  // substring match, so it caught every other draft project on the page — and anything
  // else that happens to contain the word.
  const row = page.locator('[data-testid^="project-row-"]').filter({ hasText: "Fall Lookbook 2026" });
  await expect(row).toHaveCount(1);
});

/**
 * Expiry and payment are set on the project page, which owns them; the create sheet
 * asks only for client, title and type. Any project can still be given an expiry.
 */
test("expiry and payment live on the project page, not the create sheet", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByText("SSH", { exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clients\/.+/);

  await page.getByRole("button", { name: "+ New project" }).click();
  await expect(page.getByLabel("Expires (optional)")).toHaveCount(0);
  await expect(page.getByText("Payment", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/admin/projects/p1");
  await expect(page.locator('input[type="date"]').first()).toBeVisible();
  await expect(page.getByTestId("payment-toggle")).toBeVisible();
});
