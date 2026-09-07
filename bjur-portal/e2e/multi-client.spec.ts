import { test, expect } from "@playwright/test";

/**
 * One email, several clients.
 *
 * User.clientId used to be the authority on who could see whose work, so an email was
 * locked to exactly one account. Memberships replace it: an agency producer — or staff
 * wanting the client's own view — can hold several, with a role per membership.
 */
const SASHA = "sasha@ssh.studio";

test.describe("granting a second client", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("an existing email is a link, not a collision", async ({ page, request }) => {
    // Halcyon Films — sasha already has a seat on SSH.
    await page.goto("/admin/clients");
    await page.getByText("Halcyon Films", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/clients\/.+/);
    const clientId = page.url().split("/admin/clients/")[1];

    const res = await request.post(`/api/admin/clients/${clientId}/users`, {
      data: { name: "Sasha", email: SASHA, role: "VIEWER" },
    });
    // Used to be a 409 "that email is already in use".
    expect(res.status(), await res.text()).toBe(200);

    const body = (await res.json()) as { tempPassword: string | null };
    // No new password: they already sign in, they are gaining a second account.
    expect(body.tempPassword).toBeNull();

    // And they show up as a seat on the new client.
    await page.reload();
    await expect(page.getByText(SASHA)).toBeVisible();
  });

  test("adding the same person twice to one client is refused", async ({ page, request }) => {
    await page.goto("/admin/clients");
    await page.getByText("Halcyon Films", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/clients\/.+/);
    const clientId = page.url().split("/admin/clients/")[1];

    const res = await request.post(`/api/admin/clients/${clientId}/users`, {
      data: { name: "Sasha", email: SASHA, role: "VIEWER" },
    });
    expect(res.status()).toBe(409);
  });
});

test.describe("the switcher", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("a seat with two clients can switch between them", async ({ page }) => {
    await page.goto("/");

    const switcher = page.getByTestId("client-switcher");
    await expect(switcher).toBeVisible();

    await switcher.getByRole("button", { name: /Switch client/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: /SSH/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Halcyon/ })).toBeVisible();

    await menu.getByRole("menuitem", { name: /Halcyon/ }).click();

    // The portal is now showing the other client's work, and it stuck.
    await expect(page.getByRole("button", { name: /Switch client — currently Halcyon/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /Switch client — currently Halcyon/ })).toBeVisible();
  });

  test("the switched-to client's projects are the ones listed", async ({ page }) => {
    await page.goto("/");
    // Left on Halcyon by the previous test; its project is Brand Anthem.
    await expect(page.getByText("Brand Anthem — Delivery")).toBeVisible();
    await expect(page.getByText("Spring Campaign 2026")).toHaveCount(0);
  });

  test("switching to a client you don't belong to is refused", async ({ request }) => {
    // 57.NYC — sasha is not a member. The switcher only offers memberships, so this is
    // the hand-rolled POST that must not widen access.
    const res = await request.post("/api/auth/active-client", { data: { clientId: "c2" } });
    expect(res.status()).toBe(404);
  });
});

test.describe("removing one client", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("takes the client away without killing the login", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.getByText("Halcyon Films", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/clients\/.+/);

    // Sasha was linked to Halcyon by the first test in this file.
    const row = page.locator('[data-testid^="seat-row-"]').filter({ hasText: SASHA });
    await expect(row).toHaveCount(1);

    await row.getByRole("button", { name: "Remove" }).click();
    await expect(row.getByText("Revoke access?")).toBeVisible();
    await row.getByRole("button", { name: "Confirm remove" }).click();

    await expect(page.locator('[data-testid^="seat-row-"]').filter({ hasText: SASHA })).toHaveCount(0);

    // Halcyon's own owner is untouched — this removed one membership, not the client.
    await expect(page.getByText("ivy@halcyon.film")).toBeVisible();
  });
});

test.describe("after being removed from one client", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("the login still works and falls back to the remaining client", async ({ page }) => {
    await page.goto("/");

    // Her session was pointed at Halcyon when the membership was revoked. It must not
    // strand her on a client she can no longer see, and it must not sign her out —
    // deactivating the account would have cut her off from SSH too.
    await expect(page.getByText("Spring Campaign 2026")).toBeVisible();
    await expect(page.getByText("Brand Anthem — Delivery")).toHaveCount(0);

    // One client left, so the switcher stops offering a choice it cannot honour.
    await expect(page.getByTestId("client-switcher")).toHaveCount(0);
  });
});
