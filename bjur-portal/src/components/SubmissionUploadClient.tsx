"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB
const MAX_CHUNK_RETRIES = 3;

const JUNK_BASENAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const JUNK_DIR_SEGMENTS = new Set([".Spotlight-V100", ".Trashes", ".fseventsd", ".TemporaryItems"]);

function isJunkPath(relativePath: string) {
  const segments = relativePath.split("/");
  if (JUNK_BASENAMES.has(segments[segments.length - 1])) return true;
  return segments.some((s) => JUNK_DIR_SEGMENTS.has(s));
}

type QueueItem = {
  file: File;
  relativePath: string;
  submissionId: string | null;
  receivedBytes: number;
  sizeBytes: number;
  progress: number; // 0-100
  status: "pending" | "uploading" | "done" | "error";
  note?: string;
};

type Resumable = { id: string; batchId: string; relativePath: string; sizeBytes: number; receivedBytes: number };

type DroppedEntry = { file: File; relativePath: string };

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// webkitGetAsEntry() is a de-facto standard (Chrome/Safari/Firefox) but isn't part of
// the DataTransferItem DOM typings.
type ChromeDataTransferItem = DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null };

function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

// FileSystemDirectoryReader.readEntries() does NOT guarantee the full listing in one
// call for larger directories (a documented Chrome quirk) — it must be called
// repeatedly until it returns an empty array.
function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
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

async function walkEntry(entry: FileSystemEntry, prefix: string, out: DroppedEntry[]) {
  const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    out.push({ file, relativePath });
  } else if (entry.isDirectory) {
    const entries = await readAllDirectoryEntries((entry as FileSystemDirectoryEntry).createReader());
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
async function entriesFromDataTransfer(dataTransfer: DataTransfer): Promise<DroppedEntry[]> {
  const topLevel: FileSystemEntry[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file") continue;
    const entry = (item as ChromeDataTransferItem).webkitGetAsEntry?.();
    if (entry) topLevel.push(entry);
  }
  if (topLevel.length === 0) {
    // Fallback for a browser without webkitGetAsEntry — flat files only.
    return Array.from(dataTransfer.files).map((file) => ({ file, relativePath: file.name }));
  }
  const out: DroppedEntry[] = [];
  for (const entry of topLevel) await walkEntry(entry, "", out);
  return out;
}

/** Files picked via a webkitdirectory input carry the picked folder's own name as the
 * first path segment — strip it so re-picking the same folder matches by content
 * (name + nested path), not by whatever the OS happened to call the top folder. */
function entriesFromFileList(files: FileList): DroppedEntry[] {
  return Array.from(files).map((file) => {
    const withRelPath = file as File & { webkitRelativePath?: string };
    const rel = withRelPath.webkitRelativePath;
    const relativePath = rel ? rel.split("/").slice(1).join("/") || file.name : file.name;
    return { file, relativePath };
  });
}

async function createSubmission(projectId: string, batchId: string, relativePath: string, sizeBytes: number) {
  const res = await fetch(`/api/projects/${projectId}/submissions`, {
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
function putChunk(
  projectId: string,
  submissionId: string,
  chunk: Blob,
  start: number,
  totalBytes: number,
  onProgress: (loadedInChunk: number) => void
) {
  return new Promise<{ receivedBytes: number; complete: boolean } | { error: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/projects/${projectId}/submissions/${submissionId}/chunk`);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${start + chunk.size - 1}/${totalBytes}`);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      let body: { receivedBytes?: number; complete?: boolean; error?: string } = {};
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
        resolve({ receivedBytes: body.receivedBytes ?? start, complete: body.complete ?? false });
      } else if (xhr.status === 409 && typeof body.receivedBytes === "number") {
        resolve({ receivedBytes: body.receivedBytes, complete: body.complete ?? false });
      } else {
        resolve({ error: body.error ?? `Upload failed (${xhr.status})` });
      }
    };
    xhr.onerror = () => resolve({ error: "Network error" });
    xhr.send(chunk);
  });
}

async function uploadFile(
  projectId: string,
  batchId: string,
  item: QueueItem,
  onProgress: (receivedBytes: number) => void
): Promise<{ ok: boolean; note?: string }> {
  let submissionId = item.submissionId;
  if (!submissionId) {
    try {
      submissionId = await createSubmission(projectId, batchId, item.relativePath, item.sizeBytes);
    } catch (err) {
      return { ok: false, note: (err as Error).message };
    }
  }

  let start = item.receivedBytes;
  while (start < item.sizeBytes) {
    const chunk = item.file.slice(start, Math.min(start + CHUNK_SIZE, item.sizeBytes));
    let result: Awaited<ReturnType<typeof putChunk>> | null = null;
    for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt++) {
      result = await putChunk(projectId, submissionId, chunk, start, item.sizeBytes, (loaded) =>
        onProgress(start + loaded)
      );
      if (!("error" in result)) break;
      if (attempt < MAX_CHUNK_RETRIES - 1) await sleep(1000 * 2 ** attempt);
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

export function SubmissionUploadClient({
  project,
  expired,
}: {
  project: { id: string; title: string };
  expired: boolean;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [resumable, setResumable] = useState<Resumable[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/projects/${project.id}/submissions`)
      .then((res) => (res.ok ? res.json() : { submissions: [] }))
      .then((data) => {
        setResumable(
          (
            data.submissions ?? []
          ).map(
            (s: { id: string; batchId: string; relativePath: string; sizeBytes: string; receivedBytes: string }) => ({
              id: s.id,
              batchId: s.batchId,
              relativePath: s.relativePath,
              sizeBytes: Number(s.sizeBytes),
              receivedBytes: Number(s.receivedBytes),
            })
          )
        );
      })
      .catch(() => {});
  }, [project.id]);

  // Resolves the batch this upload session's files belong to: reuse one already
  // established this visit, adopt a matching in-progress batch if we're resuming a
  // dropped folder from before a reload, or start a fresh dated bin otherwise.
  async function ensureBatch(entries: DroppedEntry[]): Promise<string> {
    if (batchId) return batchId;
    for (const e of entries) {
      const match = resumable.find((r) => r.relativePath === e.relativePath && r.sizeBytes === e.file.size);
      if (match) {
        setBatchId(match.batchId);
        return match.batchId;
      }
    }
    const res = await fetch(`/api/projects/${project.id}/upload-batches`, { method: "POST" });
    if (!res.ok) throw new Error(`Couldn't start an upload session (${res.status})`);
    const data = await res.json();
    setBatchId(data.id);
    return data.id as string;
  }

  async function addEntries(rawEntries: DroppedEntry[]) {
    const entries = rawEntries.filter((e) => !isJunkPath(e.relativePath));
    if (entries.length === 0) return;

    try {
      await ensureBatch(entries);
    } catch (err) {
      setBatchError((err as Error).message);
      return;
    }
    setBatchError(null);

    setQueue((q) => {
      const existing = new Set(q.map((item) => `${item.relativePath}:${item.file.size}`));
      const additions: QueueItem[] = [];
      let nextResumable = resumable;
      for (const { file, relativePath } of entries) {
        const key = `${relativePath}:${file.size}`;
        if (existing.has(key)) continue;
        const match = nextResumable.find((r) => r.relativePath === relativePath && r.sizeBytes === file.size);
        if (match) nextResumable = nextResumable.filter((r) => r.id !== match.id);
        additions.push({
          file,
          relativePath,
          submissionId: match?.id ?? null,
          receivedBytes: match?.receivedBytes ?? 0,
          sizeBytes: file.size,
          progress: match ? Math.round((match.receivedBytes / file.size) * 100) : 0,
          status: "pending",
        });
      }
      setResumable(nextResumable);
      return [...q, ...additions];
    });
    requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ block: "nearest" }));
  }

  async function startUpload() {
    if (!batchId) return;
    setUploading(true);
    for (const item of queue) {
      if (item.status !== "pending") continue;
      setQueue((q) => q.map((qi) => (qi.file === item.file ? { ...qi, status: "uploading" } : qi)));
      const result = await uploadFile(project.id, batchId, item, (receivedBytes) => {
        setQueue((q) =>
          q.map((qi) =>
            qi.file === item.file ? { ...qi, progress: Math.round((receivedBytes / qi.sizeBytes) * 100) } : qi
          )
        );
      });
      setQueue((q) =>
        q.map((qi) =>
          qi.file === item.file
            ? { ...qi, status: result.ok ? "done" : "error", note: result.note, progress: result.ok ? 100 : qi.progress }
            : qi
        )
      );
    }
    setUploading(false);
  }

  const hasPending = queue.some((q) => q.status === "pending");

  if (expired) {
    return (
      <div className="px-4 sm:px-6 md:px-10 py-12 max-w-[640px] mx-auto text-center">
        <div className="text-lg font-black mb-2">This project has expired</div>
        <div className="text-sm text-muted">
          Get in touch if you still need to send footage over — we can extend it.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 pt-6 md:pt-8 pb-32 max-w-[720px] mx-auto bjfade">
      <Link
        href={`/p/${project.id}`}
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-text mb-6"
      >
        ← {project.title}
      </Link>

      <div className="border-b-2 border-line2 pb-6 mb-6">
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-3">Send us footage</div>
        <h1 className="text-[28px] sm:text-4xl tracking-tight font-black mb-3">Upload to &ldquo;{project.title}&rdquo;</h1>
        <div className="text-[13px] text-muted">
          Camera originals, audio, a project file — drag in whole folders and we&apos;ll keep them organized
          exactly as you dropped them. Large files upload in chunks, so if this page reloads or your
          connection drops mid-upload, just re-drop the same folder or file and it&apos;ll pick up where it
          left off.
        </div>
      </div>

      {batchError && (
        <div className="mb-4 border border-accent/40 bg-accent/5 px-4 py-3 text-[13px] text-accentb">
          {batchError}
        </div>
      )}

      {resumable.length > 0 && (
        <div className="mb-4 border border-accent/40 bg-accent/5 px-4 py-3 text-[13px]">
          <div className="font-bold text-accentb mb-1">Unfinished upload{resumable.length > 1 ? "s" : ""}</div>
          {resumable.map((r) => (
            <div key={r.id} className="text-muted">
              {r.relativePath} — {Math.round((r.receivedBytes / r.sizeBytes) * 100)}% ({formatBytes(r.receivedBytes)}{" "}
              of {formatBytes(r.sizeBytes)}). Re-drop the same file or folder below to resume.
            </div>
          ))}
        </div>
      )}

      <label
        htmlFor="submission-dropzone-input"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          entriesFromDataTransfer(e.dataTransfer).then(addEntries);
        }}
        className="block cursor-pointer border border-dashed border-line2 hover:border-accent px-5 py-14 text-center text-sm text-muted mb-1"
      >
        Drop files or folders here or click to browse
      </label>
      <div className="text-center mb-4">
        <label htmlFor="submission-folder-input" className="text-xs font-semibold text-muted hover:text-text cursor-pointer">
          or choose a folder
        </label>
      </div>
      <input
        id="submission-dropzone-input"
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addEntries(entriesFromFileList(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        id="submission-folder-input"
        type="file"
        multiple
        className="hidden"
        // webkitdirectory isn't in React's input typings but is supported by every
        // major browser for picking a whole folder.
        // @ts-expect-error -- see comment above
        webkitdirectory=""
        onChange={(e) => {
          if (e.target.files) addEntries(entriesFromFileList(e.target.files));
          e.target.value = "";
        }}
      />

      {queue.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {queue.map((item, i) => (
            <div key={i}>
              <div className="flex justify-between gap-3 mb-1 text-xs">
                <span className="truncate text-text">{item.relativePath}</span>
                <span className="flex-none text-dim">
                  {item.status === "done" ? "✓" : item.status === "error" ? item.note : `${item.progress}%`}
                </span>
              </div>
              <div className="h-1 bg-bg border border-line2">
                <div
                  className={`h-full ${item.status === "error" ? "bg-accentb" : "bg-accent"}`}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
          <div ref={listEndRef} />
        </div>
      )}

      {queue.length > 0 && (
        <Button onClick={startUpload} disabled={uploading || !hasPending}>
          {uploading ? "Uploading…" : `Upload ${queue.filter((q) => q.status === "pending").length || queue.length}`}
        </Button>
      )}
    </div>
  );
}
