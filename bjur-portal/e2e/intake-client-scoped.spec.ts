import { test, expect, request as pwRequest } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Intake belongs to the client.
 *
 * The rules worth defending: a seat can send without anyone having made a link first, a
 * client can never read back what it sent, and deleting a project cannot reach footage.
 * The last one is why this exists — a review project used to be undeletable because
 * somebody else's rushes had been filed under it.
 */
const DB = path.join(__dirname, "..", "prisma", "data", "e2e.db");
const sql = (q: string) => execFileSync("sqlite3", [DB, q], { encoding: "utf-8" }).trim();

async function adminApi(baseURL: string) {
  return pwRequest.newContext({ baseURL, storageState: "e2e/.auth/admin.json" });
}

test.describe("seat", () => {
  test.use({ storageState: "e2e/.auth/sasha.json" });

  test("a seat sends with no link and no project", async ({ request }) => {
    // The old gate demanded an open SubmissionRequest on a specific project, which locked
    // a client out whenever nobody had remembered to make one.
    const batch = await request.post("/api/intake/upload-batches", {
      data: { name: "Straight from the portal" },
    });
    expect(batch.ok(), await batch.text()).toBeTruthy();
    const id = (await batch.json()).id as string;

    try {
      expect(sql(`SELECT name FROM UploadBatch WHERE id='${id}';`)).toBe("Straight from the portal");
      // Filed under the client, with no project anywhere near it.
      expect(sql(`SELECT c.username FROM UploadBatch b JOIN Client c ON c.id=b.clientId WHERE b.id='${id}';`)).toBe("ssh");
    } finally {
      sql(`DELETE FROM UploadBatch WHERE id='${id}';`);
    }
  });

  test("the sender's own words name the folder", async ({ request }) => {
    const batch = await request.post("/api/intake/upload-batches", {
      data: { name: "Hurt — mirror shot, take 4" },
    });
    const id = (await batch.json()).id as string;
    try {
      const sub = await request.post("/api/intake/submissions", {
        data: { batchId: id, relativePath: "A001.R3D", sizeBytes: 1024 },
      });
      expect(sub.ok()).toBeTruthy();
      const relPath = sql(`SELECT relPath FROM Submission WHERE id='${(await sub.json()).id}';`);
      // client / batch — the project id used to sit in the middle.
      expect(relPath).toMatch(/^ssh\/Hurt/);
      expect(relPath).not.toContain("p1");
    } finally {
      sql(`DELETE FROM UploadBatch WHERE id='${id}';`);
    }
  });

  test("a client cannot read back what it sent", async ({ request }) => {
    // Working material on our server, not a library. Enforced by there being no route,
    // not by a screen declining to link.
    const subId = sql("SELECT id FROM Submission LIMIT 1;");
    const batchId = sql("SELECT id FROM UploadBatch LIMIT 1;");
    for (const url of [
      `/api/admin/submissions/${subId}/download`,
      `/api/admin/upload-batches/${batchId}/zip`,
      `/api/admin/clients/c1/upload-batches`,
    ]) {
      const res = await request.get(url);
      expect([401, 403, 404], `${url} answered ${res.status()}`).toContain(res.status());
    }
  });
});

test.describe("admin", () => {
  test("deleting a project no longer asks about footage", async ({ baseURL }) => {
    const api = await adminApi(baseURL!);
    const made = await api.post("/api/admin/projects", {
      data: { clientId: "c1", title: `Delete Spec ${Date.now()}`, type: "DELIVERY" },
    });
    const { project } = await made.json();

    // Footage exists for this client, and plenty of it — it simply is not the project's.
    expect(Number(sql("SELECT COUNT(*) FROM Submission WHERE clientId='c1';"))).toBeGreaterThan(0);

    const del = await api.delete(`/api/admin/projects/${project.id}`);
    expect(del.ok(), await del.text()).toBeTruthy();
    // And the footage is still there afterwards.
    expect(Number(sql("SELECT COUNT(*) FROM Submission WHERE clientId='c1';"))).toBeGreaterThan(0);
    await api.dispose();
  });

  test("a batch's files can be deleted while the record stays", async ({ baseURL }) => {
    const api = await adminApi(baseURL!);

    // Its own batch, sent for real through a link, so there are actual bytes on disk to
    // remove. Depending on the seed's shape made this skip itself, which is a test that
    // reports success while checking nothing.
    const made = await api.post("/api/admin/projects", {
      data: { clientId: "c1", title: `Retention ${Date.now()}`, type: "DELIVERY", startRequest: "Rushes" },
    });
    const { project, sendPath } = await made.json();
    const token = sendPath.slice(sendPath.lastIndexOf("-") + 1);

    const anon = await pwRequest.newContext({ baseURL: baseURL! });
    const body = Buffer.alloc(2048, 7);
    const batchId = (await (await anon.post(`/api/send/${token}/upload-batches`, {
      data: { name: `Retention batch ${Date.now()}` },
    })).json()).id as string;
    const subId = (await (await anon.post(`/api/send/${token}/submissions`, {
      data: { batchId, relativePath: "RDC/B001.R3D", sizeBytes: body.length },
    })).json()).id as string;
    const put = await anon.put(`/api/send/${token}/submissions/${subId}/chunk`, {
      headers: { "content-range": `bytes 0-${body.length - 1}/${body.length}` },
      data: body,
    });
    expect((await put.json()).complete).toBe(true);

    try {
      const res = await api.delete(`/api/admin/upload-batches/${batchId}/files`);
      expect(res.ok(), await res.text()).toBeTruthy();

      // The rows survive: what arrived, from whom and when is the permanent half, and
      // reclaiming the space used to mean erasing that too.
      expect(sql(`SELECT COUNT(*) FROM Submission WHERE batchId='${batchId}';`)).toBe("1");
      expect(sql(`SELECT filesDeletedAt IS NOT NULL FROM UploadBatch WHERE id='${batchId}';`)).toBe("1");

      // And it refuses a second time rather than pretending.
      expect((await api.delete(`/api/admin/upload-batches/${batchId}/files`)).status()).toBe(409);
    } finally {
      sql(`DELETE FROM UploadBatch WHERE id='${batchId}';`);
      await api.delete(`/api/admin/projects/${project.id}`);
      await anon.dispose();
      await api.dispose();
    }
  });
});
