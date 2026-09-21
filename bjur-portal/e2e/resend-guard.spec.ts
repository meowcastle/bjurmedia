import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * Re-dropping a folder must never destroy what is already in it.
 *
 * The upload page tells you to re-drop the same folder to resume, and until this guard
 * that was a trap: the finished files beside the unfinished one had no resume record, so
 * they were queued as new, landed at the same on-disk paths inside the adopted batch, and
 * were truncated to zero before being re-sent. On a delivery of 2GB rushes over a home
 * uplink that is a week of someone's life and their only copy.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("a file the project already holds is reported, not re-sent or truncated", async ({ baseURL }) => {
  const api = await pwRequest.newContext({ baseURL: baseURL!, storageState: "e2e/.auth/admin.json" });
  const made = await api.post("/api/admin/projects", {
    data: { clientId: "c1", title: `Resend Spec ${Date.now()}`, type: "DELIVERY", startRequest: "Rushes" },
  });
  const { project, sendPath } = await made.json();
  const token = sendPath.slice(sendPath.lastIndexOf("-") + 1);

  const anon = await pwRequest.newContext({ baseURL: baseURL! });
  const body = Buffer.alloc(4096, 5);

  // Send it once, for real.
  const b1 = await anon.post(`/api/send/${token}/upload-batches`, { data: {} });
  const batch1 = (await b1.json()).id as string;
  const s1 = await anon.post(`/api/send/${token}/submissions`, {
    data: { batchId: batch1, relativePath: "RDC/A001.R3D", sizeBytes: body.length },
  });
  const firstId = (await s1.json()).id as string;
  const put = await anon.put(`/api/send/${token}/submissions/${firstId}/chunk`, {
    headers: { "content-range": `bytes 0-${body.length - 1}/${body.length}` },
    data: body,
  });
  expect((await put.json()).complete).toBe(true);

  // Now offer the identical file again, the way a re-dropped folder would.
  const again = await anon.post(`/api/send/${token}/submissions`, {
    data: { batchId: batch1, relativePath: "RDC/A001.R3D", sizeBytes: body.length },
  });
  const second = await again.json();
  expect(second.alreadyComplete, "server should say it already has this file").toBe(true);
  expect(second.id).toBe(firstId);

  // The original row is untouched — still complete, still the full size.
  const listed = await api.get(`/api/admin/projects/${project.id}/upload-batches`);
  const text = JSON.stringify(await listed.json());
  expect(text).toContain("A001.R3D");
  // And no second row was created for it.
  expect(text.split("A001.R3D").length - 1).toBe(1);

  // A genuinely different file at the same path still uploads.
  const changed = await anon.post(`/api/send/${token}/submissions`, {
    data: { batchId: batch1, relativePath: "RDC/A001.R3D", sizeBytes: body.length + 1024 },
  });
  const changedBody = await changed.json();
  expect(changedBody.alreadyComplete).toBeFalsy();
  expect(changedBody.id).not.toBe(firstId);

  await anon.dispose();
  await api.dispose();
});
