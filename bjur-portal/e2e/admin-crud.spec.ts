import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test("create a new client end-to-end", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByRole("button", { name: "+ New client" }).click();

  await page.getByLabel("Client name").fill("Northbound Studio");
  await page.getByLabel("Owner name").fill("Priya Shah");
  await page.getByLabel("Owner email").fill("priya@northbound.studio");
  await page.getByRole("button", { name: "Create client" }).click();

  // Temp-password reveal screen — the only time it's ever shown.
  await expect(page.getByText("Client created")).toBeVisible();
  await expect(page.locator("div.font-mono.bg-bg")).toHaveText(/.{8,}/);
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("Northbound Studio")).toBeVisible();
  await expect(page.getByText("@northboundstudio")).toBeVisible();
});

test("rejects a duplicate username", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByRole("button", { name: "+ New client" }).click();

  await page.getByLabel("Client name").fill("Dup Test");
  await page.getByLabel("Username").fill("ssh"); // already taken by the seeded client
  await page.getByLabel("Owner name").fill("Someone");
  await page.getByLabel("Owner email").fill("someone@dup.test");
  await page.getByRole("button", { name: "Create client" }).click();

  await expect(page.getByText(/already taken/i)).toBeVisible();
});

// Project creation moved from a standalone /admin/projects list to each client's own
// detail page (/admin/clients/[id]) — browsing starts from Clients now, and the "New
// project" dialog there is pre-scoped to that one client (no client picker to fill in).
test("create a new project and see its inbox path", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByText("SSH", { exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clients\/.+/);

  await page.getByRole("button", { name: "+ New project" }).click();
  await page.getByLabel("Project title").fill("Fall Lookbook 2026");
  await page.getByRole("button", { name: "Create project" }).click();

  // Scoped to the dialog overlay: router.refresh() (triggered by onCreated()) can make
  // the client detail page's own project list show this same new project's inbox path
  // underneath the still-open "Project created" dialog, so an unscoped text locator
  // matches both and violates Playwright's strict mode.
  const dialog = page.locator(".fixed.inset-0.z-50");
  await expect(dialog.getByText("Project created")).toBeVisible();
  await expect(dialog.getByText(/_inbox\/ssh\/fall-lookbook-2026/)).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  // Scoped to the new project's own row. getByText("DRAFT") is a case-insensitive
  // substring match, so it caught every other draft project on the page — and anything
  // else that happens to contain the word.
  const row = page.locator('[data-testid^="project-row-"]').filter({ hasText: "Fall Lookbook 2026" });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("DRAFT", { exact: true })).toBeVisible(); // hidden from the client until first delivery
});

test("any project can be given an expiry", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByText("SSH", { exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clients\/.+/);

  await page.getByRole("button", { name: "+ New project" }).click();
  // Expiry used to be refused for "retainer" clients, on the theory that a client is
  // permanently one shape. A client can now have a permanent library and a delivery
  // that closes, so the date is offered on every project and simply left blank when
  // it does not apply.
  await expect(page.getByLabel("Expires (optional)")).toBeVisible();
  await expect(page.getByText(/permanent library/i)).toHaveCount(0);
});
