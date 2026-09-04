import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/** Opens a client's page and returns its id — waiting for the navigation first, since
 *  page.url() otherwise still reads /admin/clients and yields an empty id. */
async function openClient(page: import("@playwright/test").Page, name: string) {
  await page.goto("/admin/clients");
  await page.getByText(name, { exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clients\/.+/);
  return page.url().split("/admin/clients/")[1];
}

/**
 * §13 staff side. The interesting logic is the auto-approve deadline: it has to be the
 * earlier of the client's window and the post's own publish time.
 */
test("a post cannot be sent for approval without a time and a platform", async ({ page, request }) => {
  await page.goto("/admin/media?project=p1");
  const rowId = (await page
    .locator('[data-testid^="asset-row-"]')
    .first()
    .getAttribute("data-testid"))!;
  const assetId = rowId.replace("asset-row-", "");

  const noDate = await request.post(`/api/admin/assets/${assetId}/publish`, {
    data: { action: "request-approval" },
  });
  expect(noDate.status()).toBe(400);
  expect((await noDate.json()).error).toMatch(/publish time/i);

  // Now give it a date but no platform.
  const scheduled = await request.post(`/api/admin/assets/${assetId}/publish`, {
    data: { action: "schedule", publishAt: new Date(Date.now() + 86_400_000).toISOString() },
  });
  expect(scheduled.ok()).toBe(true);
  expect((await scheduled.json()).publishState).toBe("DRAFT");

  const noPlatform = await request.post(`/api/admin/assets/${assetId}/publish`, {
    data: { action: "request-approval" },
  });
  expect(noPlatform.status()).toBe(400);
  expect((await noPlatform.json()).error).toMatch(/platform/i);

  // Clean up so the next run starts where this one did.
  await request.post(`/api/admin/assets/${assetId}/publish`, { data: { action: "unschedule" } });
});

test("the approval deadline never lands after the post was due to go out", async ({ page, request }) => {
  await page.goto("/admin/media?project=p1");
  const rowId = (await page
    .locator('[data-testid^="asset-row-"]')
    .first()
    .getAttribute("data-testid"))!;
  const assetId = rowId.replace("asset-row-", "");

  // Two hours out, against a 24-hour approval window: the window must not win, or the
  // post would auto-approve twenty-two hours after it already published.
  const publishAt = new Date(Date.now() + 2 * 3_600_000);
  await request.post(`/api/admin/assets/${assetId}/publish`, {
    data: { action: "schedule", publishAt: publishAt.toISOString(), publishIg: true },
  });

  const res = await request.post(`/api/admin/assets/${assetId}/publish`, {
    data: { action: "request-approval" },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { publishState: string; approvalDueAt: string };
  expect(body.publishState).toBe("AWAITING");
  expect(new Date(body.approvalDueAt).getTime()).toBe(publishAt.getTime());

  await request.post(`/api/admin/assets/${assetId}/publish`, { data: { action: "unschedule" } });
});

test("a client who does not require approval skips the loop entirely", async ({ page, request }) => {
  // Halcyon Films — turn approval off for this test and put it back at the end.
  const clientId = await openClient(page, "Halcyon Films");

  const off = await request.patch(`/api/admin/clients/${clientId}`, {
    data: { approvalRequired: false },
  });
  expect(off.ok()).toBe(true);

  await page.goto("/admin/media?project=p7");
  const rowId = (await page
    .locator('[data-testid^="asset-row-"]')
    .first()
    .getAttribute("data-testid"))!;
  const assetId = rowId.replace("asset-row-", "");

  await request.post(`/api/admin/assets/${assetId}/publish`, {
    data: { action: "schedule", publishAt: new Date(Date.now() + 86_400_000).toISOString(), publishIg: true },
  });
  const res = await request.post(`/api/admin/assets/${assetId}/publish`, {
    data: { action: "request-approval" },
  });
  const body = (await res.json()) as { publishState: string; skippedApproval: boolean };

  // Straight to APPROVED rather than sitting in AWAITING for someone who was never asked.
  expect(body.publishState).toBe("APPROVED");
  expect(body.skippedApproval).toBe(true);

  await request.post(`/api/admin/assets/${assetId}/publish`, { data: { action: "unschedule" } });
  await request.patch(`/api/admin/clients/${clientId}`, { data: { approvalRequired: true } });
});

test("the approval window is bounded, not free text", async ({ page, request }) => {
  const clientId = await openClient(page, "Halcyon Films");

  for (const hours of [0, 200, 1.5]) {
    const res = await request.patch(`/api/admin/clients/${clientId}`, {
      data: { approvalAutoHours: hours },
    });
    expect(res.status(), `approvalAutoHours=${hours}`).toBe(400);
  }

  const ok = await request.patch(`/api/admin/clients/${clientId}`, { data: { approvalAutoHours: 48 } });
  expect(ok.ok()).toBe(true);
  await request.patch(`/api/admin/clients/${clientId}`, { data: { approvalAutoHours: 24 } });
});

test("the policy is editable from the client page, not just the API", async ({ page }) => {
  await openClient(page, "Halcyon Films");

  const panel = page.getByTestId("approval-policy");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Ask before publishing")).toBeVisible();

  const hours = panel.getByLabel("Auto-approve after (hours)");
  await expect(hours).toBeEnabled();

  // The window is meaningless when nothing is ever asked, so it follows the toggle.
  await panel.getByRole("checkbox").uncheck();
  await expect(hours).toBeDisabled();
  await panel.getByRole("checkbox").check();
  await expect(hours).toBeEnabled();
});

test("YouTube connect refuses cleanly when OAuth isn't configured", async ({ request }) => {
  const clientId = "c1";
  const res = await request.get(`/api/admin/clients/${clientId}/youtube/connect`, {
    maxRedirects: 0,
  });

  // Without credentials this must say so rather than redirecting to a Google URL built
  // from `undefined`, which is what an unguarded consent-URL builder would produce.
  if (res.status() === 501) {
    expect((await res.json()).error).toMatch(/GOOGLE_OAUTH_CLIENT_ID/);
  } else {
    // Configured in this environment — then it must be a redirect to Google, carrying a
    // state parameter, and it must set the cookie that state is checked against.
    expect(res.status()).toBe(307);
    const location = res.headers()["location"];
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("state=");
    expect(location).toContain("access_type=offline");
    expect(res.headers()["set-cookie"]).toContain("yt_oauth=");
  }
});

test("the OAuth callback rejects a mismatched state", async ({ request }) => {
  // No cookie was ever set for this, so the state cannot match — the request must be
  // turned away rather than trusted.
  const res = await request.get("/api/admin/youtube/callback?code=whatever&state=forged", {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(307);
  expect(decodeURIComponent(res.headers()["location"])).toMatch(/expired|start again/i);
});

test("a signed-out caller cannot start or finish the OAuth flow", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const anon = ctx.request;

  expect((await anon.get("/api/admin/clients/c1/youtube/connect", { maxRedirects: 0 })).status()).toBe(401);
  expect((await anon.get("/api/admin/youtube/callback?code=x&state=y", { maxRedirects: 0 })).status()).toBe(401);

  await ctx.close();
});
