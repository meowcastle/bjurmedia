/**
 * The resumable chunked upload, as a set of plain functions.
 *
 * Two screens drive it now — a client seat's upload page and the public send link — and
 * they look nothing alike, so the engine lives apart from either. Every call takes an
 * `apiBase` instead of a project id: `/api/projects/<id>` for a seat, `/api/send/<token>`
 * for a stranger with a link. The routes behind both call the same handlers, so the whole
 * path from a dropped file to bytes on the NAS has exactly one implementation.
 */
export type QueueItem = {
  file: File;
  relativePath: string;
  submissionId: string | null;
  receivedBytes: number;
  sizeBytes: number;
  progress: number; // 0-100
  status: "pending" | "uploading" | "done" | "error";
  note?: string;
};

export type Resumable = {
  id: string;
  batchId: string;
  relativePath: string;
  sizeBytes: number;
  receivedBytes: number;
};

export type DroppedEntry = { file: File; relativePath: string };

const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB
// A 300GB delivery is ~19,200 chunks. Three attempts with a 2s ceiling is plenty for a
// 2GB file and far too thin for a transfer that runs for hours over a client's home
// uplink: any single chunk that exhausts its budget fails the whole file, and the
// client is the one sitting there watching it die at 60%. Budget enough wall-clock to
// ride out a brief WAN drop or a container restart on the NAS (which does stop
// containers on its own) instead of just a momentary burst of packet loss.
const MAX_CHUNK_RETRIES = 8;
const MAX_RETRY_BACKOFF_MS = 30_000;

const JUNK_BASENAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const JUNK_DIR_SEGMENTS = new Set([
  ".Spotlight-V100",
  ".Trashes",
  ".fseventsd",
  ".TemporaryItems",
]);

export function isJunkPath(relativePath: string) {
  const segments = relativePath.split("/");
  if (JUNK_BASENAMES.has(segments[segments.length - 1])) return true;
  return segments.some((s) => JUNK_DIR_SEGMENTS.has(s));
}


export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// webkitGetAsEntry() is a de-facto standard (Chrome/Safari/Firefox) but isn't part of
// the DataTransferItem DOM typings.
type ChromeDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

export function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

// FileSystemDirectoryReader.readEntries() does NOT guarantee the full listing in one
// call for larger directories (a documented Chrome quirk) — it must be called
// repeatedly until it returns an empty array.
export function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    function readBatch() {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readBatch();
      }, reject);
    }
    readBatch();
  });
}

export async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: DroppedEntry[],
) {
  const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    out.push({ file, relativePath });
  } else if (entry.isDirectory) {
    const entries = await readAllDirectoryEntries(
      (entry as FileSystemDirectoryEntry).createReader(),
    );
    for (const child of entries) await walkEntry(child, relativePath, out);
  }
}

/**
 * Extracts { file, relativePath } for every file dropped, walking into any dropped
 * folders recursively so a client can just drag a card's whole folder in. Every
 * webkitGetAsEntry() call happens synchronously here, in the same tick as the drop
 * event — DataTransferItems are invalidated the moment the event handler that
 * received them returns, so the entry references must be captured up front; only the
 * actual directory walk below is async.
 */
export async function entriesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<DroppedEntry[]> {
  const topLevel: FileSystemEntry[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file") continue;
    const entry = (item as ChromeDataTransferItem).webkitGetAsEntry?.();
    if (entry) topLevel.push(entry);
  }
  if (topLevel.length === 0) {
    // Fallback for a browser without webkitGetAsEntry — flat files only.
    return Array.from(dataTransfer.files).map((file) => ({
      file,
      relativePath: file.name,
    }));
  }
  const out: DroppedEntry[] = [];
  for (const entry of topLevel) await walkEntry(entry, "", out);
  return out;
}

/** Files picked via a webkitdirectory input carry the picked folder's own name as the
 * first path segment — strip it so re-picking the same folder matches by content
 * (name + nested path), not by whatever the OS happened to call the top folder. */
export function entriesFromFileList(files: FileList): DroppedEntry[] {
  return Array.from(files).map((file) => {
    const withRelPath = file as File & { webkitRelativePath?: string };
    const rel = withRelPath.webkitRelativePath;
    const relativePath = rel
      ? rel.split("/").slice(1).join("/") || file.name
      : file.name;
    return { file, relativePath };
  });
}

export async function createSubmission(
  apiBase: string,
  batchId: string,
  relativePath: string,
  sizeBytes: number,
) {
  const res = await fetch(`${apiBase}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batchId, relativePath, sizeBytes }),
  });
  if (!res.ok) throw new Error(`Couldn't start upload (${res.status})`);
  const data = await res.json();
  return data.id as string;
}

/** PUTs one chunk via XHR (for real upload-progress events) and resolves with the
 * server's view of the world — never the client's own guess. */
export function putChunk(
  apiBase: string,
  submissionId: string,
  chunk: Blob,
  start: number,
  totalBytes: number,
  onProgress: (loadedInChunk: number) => void,
) {
  return new Promise<
    | { receivedBytes: number; complete: boolean }
    | { error: string; retryable: boolean }
  >((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "PUT",
      `${apiBase}/submissions/${submissionId}/chunk`,
    );
    xhr.setRequestHeader(
      "Content-Range",
      `bytes ${start}-${start + chunk.size - 1}/${totalBytes}`,
    );
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      let body: { receivedBytes?: number; complete?: boolean; error?: string } =
        {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // fall through with an empty body
      }
      // A 409 with a receivedBytes body is the offset-mismatch realign case (this
      // chunk was already received on a retried request) — treat it like success and
      // continue from the server's number. A 409 with only `error` means the
      // submission itself is no longer accepting chunks (already COMPLETE/FAILED),
      // which is a real failure, not something to silently loop on.
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          receivedBytes: body.receivedBytes ?? start,
          complete: body.complete ?? false,
        });
      } else if (xhr.status === 409 && typeof body.receivedBytes === "number") {
        resolve({
          receivedBytes: body.receivedBytes,
          complete: body.complete ?? false,
        });
      } else {
        // 5xx/408/429 are worth another attempt. Any other 4xx is a decision the server
        // won't reverse on a retry (submission already COMPLETE, gone, or not ours), so
        // spending the retry budget on it only delays the error the client needs to see.
        const retryable =
          xhr.status >= 500 || xhr.status === 408 || xhr.status === 429;
        resolve({
          error: body.error ?? `Upload failed (${xhr.status})`,
          retryable,
        });
      }
    };
    xhr.onerror = () => resolve({ error: "Network error", retryable: true });
    xhr.send(chunk);
  });
}

export async function uploadFile(
  apiBase: string,
  batchId: string,
  item: QueueItem,
  onProgress: (receivedBytes: number) => void,
  /** Checked between chunks. Pausing mid-chunk would throw away work already on the
   *  wire; the server resumes from receivedBytes either way. */
  shouldPause: () => boolean,
  /** Hands the new submission's id back to the queue immediately. Without this the id
   *  lived only in this function, so a pause returned the item to the queue still
   *  looking brand new — and resuming created a second submission, which truncates the
   *  partial file at the same path and starts the whole upload again from zero. */
  onSubmission: (submissionId: string) => void,
): Promise<{ ok: boolean; note?: string; paused?: boolean }> {
  let submissionId = item.submissionId;
  if (!submissionId) {
    try {
      submissionId = await createSubmission(
        apiBase,
        batchId,
        item.relativePath,
        item.sizeBytes,
      );
      onSubmission(submissionId);
    } catch (err) {
      return { ok: false, note: (err as Error).message };
    }
  }

  let start = item.receivedBytes;
  while (start < item.sizeBytes) {
    if (shouldPause()) return { ok: false, paused: true };
    const chunk = item.file.slice(
      start,
      Math.min(start + CHUNK_SIZE, item.sizeBytes),
    );
    let result: Awaited<ReturnType<typeof putChunk>> | null = null;
    for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt++) {
      result = await putChunk(
        apiBase,
        submissionId,
        chunk,
        start,
        item.sizeBytes,
        (loaded) => onProgress(start + loaded),
      );
      if (!("error" in result)) break;
      if (!result.retryable) break;
      // Exponential, but capped — an uncapped 2**attempt would reach ~2min by the last
      // try and read as a hang rather than a retry.
      if (attempt < MAX_CHUNK_RETRIES - 1) {
        await sleep(Math.min(1000 * 2 ** attempt, MAX_RETRY_BACKOFF_MS));
      }
    }
    if (!result || "error" in result) {
      return { ok: false, note: result?.error ?? "Chunk failed after retries" };
    }
    // Trust the server's number — a 409 hands back where it actually is (e.g. this
    // chunk was already received on a retried request) so we just realign and continue.
    start = result.receivedBytes;
    onProgress(start);
    if (result.complete) break;
  }

  return { ok: true };
}

