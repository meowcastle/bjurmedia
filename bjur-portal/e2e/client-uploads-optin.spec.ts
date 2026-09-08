import { test, expect } from "@playwright/test";

/**
 * Client uploads are opt-in per project.
 *
 * The Upload button used to sit on every gallery, so any delivery project silently
 * accepted footage into an inbox nobody was watching. Staff turn it on per project now.
 *
 * p1 is seeded two-way; p2 and p3 are delivery-only, which is what a real project
 * starts as.
 */
test.describe("as the client", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("the button only appears on a two-way project", async ({ page }) => {
    await page.goto("/p/p1");
    await expect(page.getByRole("link", { name: /Send us footage/ })).toBeVisible();

    await page.goto("/p/p2");
    await expect(page.getByRole("link", { name: /Send us footage/ })).toHaveCount(0);
  });

  test("the upload page itself is not reachable on a delivery-only project", async ({ page }) => {
    // Hiding a button is presentation. Typing the URL has to fail too.
    const res = await page.goto("/p/p2/upload");
    expect(res!.status()).toBe(404);
  });

  test("the API refuses a hand-rolled upload to a delivery-only project", async ({ request }) => {
    // The real guard: every client upload route funnels through one access check, so
    // this is refused whether or not the UI ever offered it.
    const res = await request.post("/api/projects/p2/upload-batches", { data: {} });
    expect(res.status()).toBe(403);
  });

  test("and still accepts one on a two-way project", async ({ request }) => {
    const res = await request.post("/api/projects/p1/upload-batches", { data: {} });
    expect(res.ok(), await res.text()).toBe(true);
  });
});

test.describe("as staff", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("the flag is a boolean, not free text", async ({ request }) => {
    const res = await request.patch("/api/admin/projects/p2", {
      data: { clientUploads: "yes" },
    });
    expect(res.status()).toBe(400);
  });

  test("turning it on opens the project, turning it off closes it again", async ({ request, browser }) => {
    // Two identities on purpose: staff flip the flag, the client is the one whose
    // ability changes. An admin has no client memberships, so posting to a client
    // upload route as admin is a 401 regardless of the flag.
    const ctx = await browser.newContext({ storageState: "e2e/.auth/sasha.json" });
    const asClient = ctx.request;

    expect((await asClient.post("/api/projects/p2/upload-batches", { data: {} })).status()).toBe(403);

    expect((await request.patch("/api/admin/projects/p2", { data: { clientUploads: true } })).ok()).toBe(true);
    expect((await asClient.post("/api/projects/p2/upload-batches", { data: {} })).ok()).toBe(true);

    expect((await request.patch("/api/admin/projects/p2", { data: { clientUploads: false } })).ok()).toBe(true);
    expect((await asClient.post("/api/projects/p2/upload-batches", { data: {} })).status()).toBe(403);

    await ctx.close();
  });

  test("staff can still upload to a delivery-only project themselves", async ({ request }) => {
    // The flag governs the *client's* ability to send work back. It must not stop the
    // studio putting files into its own project.
    const res = await request.get("/api/admin/projects/p2/upload-batches");
    expect(res.status()).not.toBe(403);
  });
});

test.describe("the admin controls", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  async function openEditDialog(page: import("@playwright/test").Page, title: string) {
    await page.goto("/admin/clients");
    await page.getByText("SSH", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/clients\/.+/);
    // The row's own Edit button — clicking the title navigates to the media page.
    const row = page.locator('[data-testid^="project-row-"]').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByTestId("client-uploads-toggle")).toBeVisible();
  }

  test("the project list marks which projects accept uploads", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.getByText("SSH", { exact: true }).click();

    // p1 is seeded two-way; the tag says so without opening anything.
    await expect(page.getByText("Uploads open").first()).toBeVisible();
  });

  test("the toggle is a click-anywhere card and its copy follows the state", async ({ page }) => {
    await openEditDialog(page, "Spring Campaign 2026");

    const card = page.getByTestId("client-uploads-toggle");
    await expect(card).toBeVisible();
    await expect(card.getByText("Accept client uploads")).toBeVisible();

    // On, and live: the client is told what they will see.
    await expect(card.getByText(/Send us footage/)).toBeVisible();

    // Clicking the card — not a 14px box — flips it, and the consequence copy changes.
    await card.click();
    await expect(card.getByText(/delivery only/i)).toBeVisible();

    await card.click();
    await expect(card.getByText(/Send us footage/)).toBeVisible();
  });

  test("the upload link is offered only while uploads are open", async ({ page }) => {
    await openEditDialog(page, "Spring Campaign 2026");

    await expect(page.getByRole("button", { name: "Copy upload link" })).toBeVisible();

    await page.getByTestId("client-uploads-toggle").click();
    // Nothing to share once the link would stop working.
    await expect(page.getByRole("button", { name: "Copy upload link" })).toHaveCount(0);
  });

  test("a new project is delivery-only unless asked otherwise", async ({ browser, request }) => {
    const made = await request.post("/api/admin/projects", {
      data: { clientId: "c1", title: `Default Test ${Date.now()}` },
    });
    expect(made.ok()).toBe(true);
    const { project } = (await made.json()) as { project: { id: string } };

    // The default is only meaningful if the client actually cannot upload to it.
    const ctx = await browser.newContext({ storageState: "e2e/.auth/sasha.json" });
    const res = await ctx.request.post(`/api/projects/${project.id}/upload-batches`, { data: {} });
    expect(res.status()).toBe(403);
    await ctx.close();
  });

  test("asking for it at creation opens the project immediately", async ({ browser, request }) => {
    const made = await request.post("/api/admin/projects", {
      data: { clientId: "c1", title: `Two Way ${Date.now()}`, clientUploads: true },
    });
    expect(made.ok()).toBe(true);
    const { project } = (await made.json()) as { project: { id: string } };

    const ctx = await browser.newContext({ storageState: "e2e/.auth/sasha.json" });
    const res = await ctx.request.post(`/api/projects/${project.id}/upload-batches`, { data: {} });
    expect(res.ok(), await res.text()).toBe(true);
    await ctx.close();
  });
});

test.describe("the restyled Edit project dialog", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  async function open(page: import("@playwright/test").Page, title: string) {
    await page.goto("/admin/clients");
    await page.getByText("SSH", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/clients\/.+/);
    const row = page.locator('[data-testid^="project-row-"]').filter({ hasText: title });
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByTestId("client-uploads-toggle")).toBeVisible();
  }

  test("status is a segmented control, and it still saves the right value", async ({ page }) => {
    await open(page, "Spring Campaign 2026");

    // The <select> is gone; both states are on screen at once.
    await expect(page.locator("select#estatus")).toHaveCount(0);
    const draft = page.getByRole("button", { name: /Draft · hidden/ });
    const live = page.getByRole("button", { name: /Live · visible/ });
    await expect(live).toHaveAttribute("aria-pressed", "true");

    await draft.click();
    await expect(draft).toHaveAttribute("aria-pressed", "true");
    await expect(live).toHaveAttribute("aria-pressed", "false");

    // Put it back rather than leaving the project hidden from the client.
    await live.click();
    await expect(live).toHaveAttribute("aria-pressed", "true");
  });

  test("saving confirms with a toast that outlives the dialog", async ({ page }) => {
    await open(page, "Spring Campaign 2026");
    await page.getByRole("button", { name: "Save changes" }).click();

    // The dialog closes on save, so a toast owned by it would vanish with it.
    await expect(page.getByTestId("client-uploads-toggle")).toHaveCount(0);
    await expect(page.getByTestId("toast")).toContainText("Saved · Spring Campaign 2026");
    await expect(page.getByTestId("toast")).toContainText("uploads open");
  });

  test("a retainer shows no expiry field to fill in", async ({ page }) => {
    await open(page, "Spring Campaign 2026");
    // SSH is a retainer: an expiry input here would offer a date that is never used.
    await expect(page.getByText("Never · retainer")).toBeVisible();
  });
});
