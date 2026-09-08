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
    await expect(page.getByRole("link", { name: /Upload footage/ })).toBeVisible();

    await page.goto("/p/p2");
    await expect(page.getByRole("link", { name: /Upload footage/ })).toHaveCount(0);
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
