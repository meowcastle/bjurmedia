import { test, expect } from "@playwright/test";
import { appendFileSync, createReadStream, statSync } from "fs";
import path from "path";
import crypto from "crypto";

test.use({ storageState: "e2e/.auth/sasha.json" });

const PROJECT_ID = "p1"; // Spring Campaign 2026, owned by client "ssh"
const SUBMISSIONS_ROOT = path.resolve(__dirname, "..", "media-e2e", "_submissions");

// The real client chunk size, so this drives the same boundaries production does.
const CHUNK_SIZE = 16 * 1024 * 1024;
// Deliberately NOT a multiple of CHUNK_SIZE: 10 full chunks plus a 5MB remainder, so
// the short final chunk is covered too. submission-resume.spec.ts uses a 1MB file,
// which is *smaller than a single chunk* — it pins the torn-write logic but never
// walks the multi-chunk loop. A 300GB delivery is ~19,200 iterations of that loop.
const TOTAL_BYTES = CHUNK_SIZE * 10 + 5 * 1024 * 1024;

function sha256File(p: string) {
  return new Promise<string>((resolve, reject) => {
    const h = crypto.createHash("sha256");
    createReadStream(p)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

/**
 * End-to-end proof for the shape of transfer a real client delivery has: many chunks,
 * a short final chunk, and a process death partway through.
 *
 * The failure this guards against is specific. The chunk route appends with flags:"a",
 * so it writes to the END of the file no matter what offset was asked for. That is only
 * safe while disk and Submission.receivedBytes agree, and they stop agreeing whenever
 * pumpToFile() lands but db.submission.update() doesn't — a window this NAS reaches on
 * its own, because it stops containers unprompted. Before the truncate fix the next
 * chunk was appended past bytes already held: the range duplicated, the file overshot
 * sizeBytes, and since `complete` is `receivedBytes === totalBytes` the upload could
 * never finish. On a 300GB transfer that is hours of a client's time and a corrupt file.
 *
 * Hashing (not just length) is the assertion that matters — a duplicated range can land
 * on the correct total length depending on where the split falls.
 */
test("multi-chunk upload survives a mid-transfer crash and lands byte-identical", async ({
  request,
}) => {
  test.setTimeout(180_000);

  const source = crypto.randomBytes(TOTAL_BYTES);
  const sourceHash = crypto.createHash("sha256").update(source).digest("hex");

  const batchRes = await request.post(`/api/projects/${PROJECT_ID}/upload-batches`);
  expect(batchRes.ok()).toBeTruthy();
  const batch = (await batchRes.json()) as { id: string; label: string };

  const filename = `scale-${Date.now()}.bin`;
  const createRes = await request.post(`/api/projects/${PROJECT_ID}/submissions`, {
    data: { batchId: batch.id, relativePath: filename, sizeBytes: TOTAL_BYTES },
  });
  expect(createRes.ok()).toBeTruthy();
  const { id: submissionId } = (await createRes.json()) as { id: string };

  const onDisk = path.join(SUBMISSIONS_ROOT, "ssh", PROJECT_ID, batch.label, filename);
  const url = `/api/projects/${PROJECT_ID}/submissions/${submissionId}/chunk`;

  // Inject the crash deep enough in that plenty of chunks have already committed.
  const CRASH_AFTER_CHUNK = 6;

  let offset = 0;
  let chunkIndex = 0;
  let injectedCrash = false;

  // Drive the loop exactly as the client does: always advance from the server's
  // receivedBytes, never from a locally-kept counter.
  while (offset < TOTAL_BYTES) {
    const end = Math.min(offset + CHUNK_SIZE, TOTAL_BYTES);
    const body = source.subarray(offset, end);

    const res = await request.put(url, {
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${TOTAL_BYTES}` },
      data: body,
    });
    expect(res.ok(), `chunk ${chunkIndex} at offset ${offset}`).toBeTruthy();
    const json = (await res.json()) as { receivedBytes: number; complete: boolean };

    // Server must never report more than the file actually holds.
    expect(json.receivedBytes).toBe(statSync(onDisk).size);

    offset = json.receivedBytes;
    chunkIndex++;

    if (chunkIndex === CRASH_AFTER_CHUNK && !injectedCrash && offset < TOTAL_BYTES) {
      injectedCrash = true;
      // The crash window, reproduced exactly: the NEXT chunk's bytes reach disk, but
      // the process dies before the DB is told. Disk is now ahead of receivedBytes.
      const nextEnd = Math.min(offset + CHUNK_SIZE, TOTAL_BYTES);
      appendFileSync(onDisk, source.subarray(offset, nextEnd));
      expect(statSync(onDisk).size).toBe(nextEnd);
      // The client knows nothing about this and resumes from `offset` regardless.
    }
  }

  expect(injectedCrash, "crash injection must have run").toBe(true);
  expect(offset).toBe(TOTAL_BYTES);
  expect(statSync(onDisk).size).toBe(TOTAL_BYTES);
  expect(await sha256File(onDisk)).toBe(sourceHash);

  // And the submission must actually be marked finished, not stuck UPLOADING.
  const listRes = await request.get(`/api/projects/${PROJECT_ID}/submissions`);
  const { submissions } = (await listRes.json()) as {
    submissions: { id: string }[];
  };
  // The resume feed only carries UPLOADING rows, so a completed upload drops off it.
  expect(submissions.find((s) => s.id === submissionId)).toBeUndefined();
});
