import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * Footage arriving through a send link has to reach the person who asked for it.
 *
 * Slack already pings per file, which is the wrong shape for "what needs me" — a 40-clip
 * drop is forty pings and one job. Today carries one row per batch instead, and it names
 * the request and the sender because "an upload landed" is not actionable on its own.
 */
test.use({ storageState: "e2e/.auth/admin.json" });

test("a batch sent through a link shows up on Today, named", async ({ page, baseURL }) => {
  const api = await pwRequest.newContext({ baseURL: baseURL!, storageState: "e2e/.auth/admin.json" });
  // A name of its own: other specs also send footage, and Today lists every batch.
  const requestName = `Rushes ${Date.now()}`;
  const created = await api.post("/api/admin/projects", {
    data: { clientId: "c1", title: `Today Spec ${Date.now()}`, type: "DELIVERY", startRequest: requestName },
  });
  const { project, sendPath } = await created.json();
  const token = sendPath.slice(sendPath.lastIndexOf("-") + 1);

  // Send a file the way a stranger would — no session on this context.
  const anon = await pwRequest.newContext({ baseURL: baseURL! });
  const batch = await anon.post(`/api/send/${token}/upload-batches`, {
    data: { senderName: "Marcus" },
  });
  const batchId = (await batch.json()).id as string;

  const body = Buffer.alloc(1024, 9);
  const sub = await anon.post(`/api/send/${token}/submissions`, {
    data: { batchId, relativePath: "A001_C001.mov", sizeBytes: body.length },
  });
  const submissionId = (await sub.json()).id as string;

  const put = await anon.put(`/api/send/${token}/submissions/${submissionId}/chunk`, {
    headers: { "content-range": `bytes 0-${body.length - 1}/${body.length}` },
    data: body,
  });
  expect(put.ok(), await put.text()).toBeTruthy();
  expect((await put.json()).complete).toBe(true);

  await page.goto("/admin");
  const row = page.getByTestId("attention-landed").filter({ hasText: requestName });
  await expect(row).toContainText(`Upload landed · ${requestName} · from Marcus`);
  await expect(row).toContainText("1 file");

  await api.delete(`/api/admin/projects/${project.id}`);
  await anon.dispose();
  await api.dispose();
});
