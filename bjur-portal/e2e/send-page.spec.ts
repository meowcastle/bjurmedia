import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

/**
 * The public send page.
 *
 * The only screen in the product with no session behind it, so the things worth pinning
 * are the ones a stranger can reach: that a live link takes files without a login, that a
 * closed one says so rather than 404ing at whoever was sent it, and that the token is the
 * whole credential — nothing else gates it, so nothing else may be required.
 */

// No storageState: these run signed out, which is the point.
test.use({ storageState: { cookies: [], origins: [] } });

async function adminApi(baseURL: string) {
  return pwRequest.newContext({ baseURL, storageState: "e2e/.auth/admin.json" });
}

async function makeLink(api: APIRequestContext, name = "Berlin raws") {
  const res = await api.post("/api/admin/projects", {
    data: { clientId: "c1", title: `Send Spec ${Date.now()}`, type: "DELIVERY", startRequest: name },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return { sendPath: body.sendPath as string, projectId: body.project.id as string, clientId: "c1" };
}

test("a live link takes files with no login at all", async ({ page, baseURL }) => {
  const api = await adminApi(baseURL!);
  const { sendPath, projectId, clientId } = await makeLink(api);

  await page.goto(sendPath);
  await expect(page.getByText("BJUR", { exact: true })).toBeVisible();
  await expect(page.getByText("SSH", { exact: true })).toBeVisible();
  // No portal chrome: this is not part of the portal.
  await expect(page.getByRole("link", { name: /^projects$/i })).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "A001_C001.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.alloc(2048, 7),
  });

  await expect(page.getByTestId("send-list")).toContainText("A001_C001.mov");
  await page.getByTestId("send-sender").fill("Marcus");
  await page.getByTestId("send-submit").click();

  await expect(page.getByTestId("send-done")).toContainText("Bjur has it. Sent as Marcus.");
  await expect(page.getByTestId("send-list")).toContainText("Sent");
  // The dropzone never goes away — the page keeps accepting files.
  await expect(page.getByTestId("send-dropzone")).toBeVisible();

  // And it really landed, attributed to the name they gave.
  const batches = await api.get(`/api/admin/clients/${clientId}/upload-batches`);
  const data = await batches.json();
  expect(JSON.stringify(data)).toContain("Marcus");

  await api.delete(`/api/admin/projects/${projectId}`);
  await api.dispose();
});

test("a closed link says so rather than 404ing at whoever was sent it", async ({ page, baseURL }) => {
  const api = await adminApi(baseURL!);
  const { sendPath, projectId, clientId } = await makeLink(api);
  const token = sendPath.slice(sendPath.lastIndexOf("-") + 1);

  await page.goto(sendPath);
  await expect(page.getByTestId("send-dropzone")).toBeVisible();

  const listed = await api.get(`/api/admin/clients/${clientId}/requests`);
  const requestId = (await listed.json()).requests[0].id as string;
  await api.patch(`/api/admin/requests/${requestId}`, { data: { open: false } });

  await page.reload();
  await expect(page.getByTestId("send-closed")).toContainText("This link is closed.");
  await expect(page.getByText("hello@bjurmedia.nyc")).toBeVisible();
  await expect(page.getByTestId("send-dropzone")).toHaveCount(0);

  // The API refuses too, not just the page — the shell is a courtesy, not the gate.
  const refused = await page.request.post(`/api/send/${token}/upload-batches`, { data: {} });
  expect(refused.status()).toBe(410);

  await api.delete(`/api/admin/projects/${projectId}`);
  await api.dispose();
});

test("a token that never existed is a plain 404", async ({ page }) => {
  const res = await page.request.post("/api/send/not-a-real-token/upload-batches", { data: {} });
  expect(res.status()).toBe(404);
});
