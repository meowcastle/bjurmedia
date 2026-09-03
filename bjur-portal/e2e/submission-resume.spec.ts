import { test, expect } from "@playwright/test";
import { appendFileSync, readFileSync } from "fs";
import path from "path";
import crypto from "crypto";

// Pre-authenticated as the client (not admin) — client submissions are the only
// surface that uses the chunked resume protocol.
test.use({ storageState: "e2e/.auth/sasha.json" });

const PROJECT_ID = "p1"; // Spring Campaign 2026, owned by client "ssh"
const SUBMISSIONS_ROOT = path.resolve(__dirname, "..", "media-e2e", "_submissions");

/**
 * Regression coverage for the torn-write duplication bug.
 *
 * The chunk route appends with flags:"a", which writes to the END of the file
 * regardless of the offset the client asked for. That is only safe while the file
 * on disk and Submission.receivedBytes agree. They can disagree: pumpToFile()
 * completing and db.submission.update() landing are two separate steps, and this
 * NAS stops containers unprompted, so the gap does get hit in practice.
 *
 * When disk is ahead, the old code appended the next chunk past bytes it already
 * held — duplicating that range, pushing the file beyond sizeBytes, and wedging the
 * upload permanently, because `complete` is `receivedBytes === totalBytes` and the
 * file could now only ever be too big. The fix truncates back to the committed
 * offset first. These tests assert the recovered file is byte-identical to the
 * source, which is the only check that actually distinguishes the two behaviours.
 */
test("resumes correctly when disk is ahead of receivedBytes (crash between write and DB update)", async ({
  request,
}) => {
  const HALF = 512 * 1024;
  const source = crypto.randomBytes(HALF * 2);
  const total = source.length;

  const batchRes = await request.post(`/api/projects/${PROJECT_ID}/upload-batches`);
  expect(batchRes.ok()).toBeTruthy();
  const batch = (await batchRes.json()) as { id: string; label: string };

  const filename = `torn-write-${Date.now()}.bin`;
  const createRes = await request.post(`/api/projects/${PROJECT_ID}/submissions`, {
    data: { batchId: batch.id, relativePath: filename, sizeBytes: total },
  });
  expect(createRes.ok()).toBeTruthy();
  const { id: submissionId } = (await createRes.json()) as { id: string };

  const onDisk = path.join(SUBMISSIONS_ROOT, "ssh", PROJECT_ID, batch.label, filename);

  // Chunk 1 lands normally: disk and DB both reach HALF.
  const first = await request.put(
    `/api/projects/${PROJECT_ID}/submissions/${submissionId}/chunk`,
    {
      headers: { "Content-Range": `bytes 0-${HALF - 1}/${total}` },
      data: source.subarray(0, HALF),
    }
  );
  expect(first.ok()).toBeTruthy();
  expect(await first.json()).toMatchObject({ receivedBytes: HALF, complete: false });

  // Simulate the crash window by hand: the second chunk's bytes reach disk, but the
  // DB never hears about it. This is the exact state a container kill between
  // pumpToFile() and db.submission.update() leaves behind.
  appendFileSync(onDisk, source.subarray(HALF));
  expect(readFileSync(onDisk).length).toBe(total); // disk ahead, DB still says HALF

  // The client resumes from the DB's number, as the protocol tells it to. The server
  // must reconcile rather than blindly append: before the fix this produced a
  // total + HALF byte file and complete:false forever.
  const second = await request.put(
    `/api/projects/${PROJECT_ID}/submissions/${submissionId}/chunk`,
    {
      headers: { "Content-Range": `bytes ${HALF}-${total - 1}/${total}` },
      data: source.subarray(HALF),
    }
  );
  expect(second.ok()).toBeTruthy();
  expect(await second.json()).toMatchObject({ receivedBytes: total, complete: true });

  // The assertion that matters: not just the right length, but the right bytes.
  // A duplicated range could coincidentally hit the right size on other splits.
  expect(readFileSync(onDisk).equals(source)).toBe(true);
});

test("a re-sent chunk is rejected with the real offset instead of being appended twice", async ({
  request,
}) => {
  const CHUNK = 256 * 1024;
  const source = crypto.randomBytes(CHUNK * 2);
  const total = source.length;

  const batchRes = await request.post(`/api/projects/${PROJECT_ID}/upload-batches`);
  const batch = (await batchRes.json()) as { id: string; label: string };

  const filename = `replay-${Date.now()}.bin`;
  const createRes = await request.post(`/api/projects/${PROJECT_ID}/submissions`, {
    data: { batchId: batch.id, relativePath: filename, sizeBytes: total },
  });
  const { id: submissionId } = (await createRes.json()) as { id: string };
  const onDisk = path.join(SUBMISSIONS_ROOT, "ssh", PROJECT_ID, batch.label, filename);

  const url = `/api/projects/${PROJECT_ID}/submissions/${submissionId}/chunk`;
  const range = { "Content-Range": `bytes 0-${CHUNK - 1}/${total}` };

  const first = await request.put(url, { headers: range, data: source.subarray(0, CHUNK) });
  expect(await first.json()).toMatchObject({ receivedBytes: CHUNK, complete: false });

  // Same range again — what a retry after a lost response looks like. The offset
  // guard should refuse it and hand back the true count so the client realigns.
  const replay = await request.put(url, { headers: range, data: source.subarray(0, CHUNK) });
  expect(replay.status()).toBe(409);
  expect(await replay.json()).toMatchObject({ receivedBytes: CHUNK, complete: false });

  // The refused replay must not have grown the file.
  expect(readFileSync(onDisk).length).toBe(CHUNK);

  const second = await request.put(url, {
    headers: { "Content-Range": `bytes ${CHUNK}-${total - 1}/${total}` },
    data: source.subarray(CHUNK),
  });
  expect(await second.json()).toMatchObject({ receivedBytes: total, complete: true });
  expect(readFileSync(onDisk).equals(source)).toBe(true);
});
