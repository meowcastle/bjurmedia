import { test, expect } from "@playwright/test";
import { createReadStream, statSync } from "fs";
import path from "path";
import crypto from "crypto";

test.use({ storageState: "e2e/.auth/sasha.json" });

const PROJECT_ID = "p1";
const SUBMISSIONS_ROOT = path.resolve(__dirname, "..", "media-e2e", "_submissions");
const CHUNK_SIZE = 16 * 1024 * 1024;

function sha256File(p: string) {
  return new Promise<string>((resolve, reject) => {
    const h = crypto.createHash("sha256");
    createReadStream(p)
      .on("data", (c) => h.update(c))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

/**
 * What a client actually sends back is not only video.
 *
 * An editor returning a project sends the .prproj or .aep, the auto-save folder beside
 * it, and whatever cache and asset files the app scattered around — none of which are
 * media, several of which have no extension the portal has ever heard of.
 *
 * Nothing filters by type and nothing transcodes a submission: the proxy watcher looks
 * at INBOX_ROOT, and client uploads land in SUBMISSIONS_ROOT. These pin that, because a
 * type allowlist is exactly the kind of thing that gets added later "for safety" and
 * quietly breaks the delivery-back workflow.
 */
async function upload(
  request: import("@playwright/test").APIRequestContext,
  relativePath: string,
  bytes: Buffer
) {
  const batch = (await (await request.post(`/api/projects/${PROJECT_ID}/upload-batches`)).json()) as {
    id: string;
    label: string;
  };
  const created = await request.post(`/api/projects/${PROJECT_ID}/submissions`, {
    data: { batchId: batch.id, relativePath, sizeBytes: bytes.length },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };

  let offset = 0;
  while (offset < bytes.length) {
    const end = Math.min(offset + CHUNK_SIZE, bytes.length);
    const res = await request.put(`/api/projects/${PROJECT_ID}/submissions/${id}/chunk`, {
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${bytes.length}` },
      data: bytes.subarray(offset, end),
    });
    expect(res.ok(), `chunk at ${offset} of ${relativePath}`).toBeTruthy();
    offset = ((await res.json()) as { receivedBytes: number }).receivedBytes;
  }

  return path.join(SUBMISSIONS_ROOT, "ssh", PROJECT_ID, batch.label, relativePath);
}

test("an Adobe project file lands byte-identical", async ({ request }) => {
  // Not media, and larger than one chunk, so it walks the resume loop too.
  const bytes = crypto.randomBytes(CHUNK_SIZE + 3 * 1024 * 1024);
  const onDisk = await upload(request, `Cutdown_v4.prproj`, bytes);

  expect(statSync(onDisk).size).toBe(bytes.length);
  expect(await sha256File(onDisk)).toBe(crypto.createHash("sha256").update(bytes).digest("hex"));
});

test("an After Effects project inside a nested folder keeps its path", async ({ request }) => {
  // An editor drags a folder; the auto-save subfolder comes with it.
  const bytes = crypto.randomBytes(256 * 1024);
  const rel = "Titles/Adobe After Effects Auto-Save/Titles_v2.aep";
  const onDisk = await upload(request, rel, bytes);

  expect(onDisk.endsWith(rel), onDisk).toBe(true);
  expect(statSync(onDisk).size).toBe(bytes.length);
});

test("a file with no extension at all is accepted", async ({ request }) => {
  const bytes = crypto.randomBytes(64 * 1024);
  const onDisk = await upload(request, "CACHE_DATA", bytes);
  expect(statSync(onDisk).size).toBe(bytes.length);
});

test("nothing tries to transcode what a client sends", async ({ request, page }) => {
  // A .prproj reaching the proxy pipeline would fail ffmpeg and sit there marked
  // FAILED. Submissions are not assets: the watcher looks at INBOX_ROOT, and these land
  // in SUBMISSIONS_ROOT.
  const bytes = crypto.randomBytes(32 * 1024);
  const onDisk = await upload(request, "Timeline.prproj", bytes);

  // It is on disk, intact, where submissions belong.
  expect(onDisk.startsWith(SUBMISSIONS_ROOT), onDisk).toBe(true);
  expect(statSync(onDisk).size).toBe(bytes.length);

  // And it has not become a deliverable in the client's own gallery — sending work back
  // must not put it in front of the client as something the studio delivered.
  await page.goto(`/p/${PROJECT_ID}`);
  await expect(page.getByText("Timeline.prproj")).toHaveCount(0);
});
