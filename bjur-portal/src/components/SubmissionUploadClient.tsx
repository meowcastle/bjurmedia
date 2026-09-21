"use client";

import { useEffect, useRef, useState } from "react";
import {
  entriesFromDataTransfer,
  formatBytes,
  entriesFromFileList,
  isJunkPath,
  uploadFile,
  type DroppedEntry,
  type QueueItem,
  type Resumable,
} from "@/lib/uploadEngine";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { IconCheck, IconUpload } from "@/components/ui/Icon";

function fmtBytes(n: number) {
  const mb = n / (1024 * 1024);
  if (mb < 1000) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function fmtEta(secs: number) {
  if (!isFinite(secs) || secs <= 0) return null;
  if (secs < 90) return `~${Math.round(secs)}s left`;
  const mins = Math.round(secs / 60);
  if (mins < 90) return `~${mins} min left`;
  return `~${(mins / 60).toFixed(1)} hr left`;
}

export function SubmissionUploadClient({
  project,
  expired,
  apiBase,
}: {
  project: { id: string; title: string };
  expired: boolean;
  /** `/api/projects/<id>` for a seat. The send page passes `/api/send/<token>`. */
  apiBase?: string;
}) {
  const base = apiBase ?? `/api/projects/${project.id}`;
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [resumable, setResumable] = useState<Resumable[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  // (timestamp, total bytes sent) samples for the rolling throughput estimate. A ref,
  // not state: it updates on every chunk progress event and must not drive a render.
  const samplesRef = useRef<{ t: number; bytes: number }[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;
  const [rate, setRate] = useState(0); // bytes/sec, rolling

  useEffect(() => {
    fetch(`${base}/submissions`)
      .then((res) => (res.ok ? res.json() : { submissions: [] }))
      .then((data) => {
        setResumable(
          (data.submissions ?? []).map(
            (s: {
              id: string;
              batchId: string;
              relativePath: string;
              sizeBytes: string;
              receivedBytes: string;
            }) => ({
              id: s.id,
              batchId: s.batchId,
              relativePath: s.relativePath,
              sizeBytes: Number(s.sizeBytes),
              receivedBytes: Number(s.receivedBytes),
            }),
          ),
        );
      })
      .catch(() => {});
  }, [base]);

  // Resolves the batch this upload session's files belong to: reuse one already
  // established this visit, adopt a matching in-progress batch if we're resuming a
  // dropped folder from before a reload, or start a fresh dated bin otherwise.
  async function ensureBatch(entries: DroppedEntry[]): Promise<string> {
    if (batchId) return batchId;
    for (const e of entries) {
      const match = resumable.find(
        (r) => r.relativePath === e.relativePath && r.sizeBytes === e.file.size,
      );
      if (match) {
        setBatchId(match.batchId);
        return match.batchId;
      }
    }
    const res = await fetch(`${base}/upload-batches`, {
      method: "POST",
    });
    if (!res.ok)
      throw new Error(`Couldn't start an upload session (${res.status})`);
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
      const existing = new Set(
        q.map((item) => `${item.relativePath}:${item.file.size}`),
      );
      const additions: QueueItem[] = [];
      let nextResumable = resumable;
      for (const { file, relativePath } of entries) {
        const key = `${relativePath}:${file.size}`;
        if (existing.has(key)) continue;
        const match = nextResumable.find(
          (r) => r.relativePath === relativePath && r.sizeBytes === file.size,
        );
        if (match)
          nextResumable = nextResumable.filter((r) => r.id !== match.id);
        additions.push({
          file,
          relativePath,
          submissionId: match?.id ?? null,
          receivedBytes: match?.receivedBytes ?? 0,
          sizeBytes: file.size,
          progress: match
            ? Math.round((match.receivedBytes / file.size) * 100)
            : 0,
          status: "pending",
        });
      }
      setResumable(nextResumable);
      return [...q, ...additions];
    });
    requestAnimationFrame(() =>
      listEndRef.current?.scrollIntoView({ block: "nearest" }),
    );
  }

  async function startUpload() {
    if (!batchId) return;
    pausedRef.current = false;
    setPaused(false);
    setUploading(true);

    // Snapshot rather than iterating `queue`: the array is replaced on every progress
    // update, and a stale closure would upload the wrong set on resume.
    const pending = () =>
      queueRef.current.filter((q) => q.status === "pending");

    for (let item = pending()[0]; item; item = pending()[0]) {
      if (pausedRef.current) break;
      setQueue((q) =>
        q.map((qi) =>
          qi.file === item.file ? { ...qi, status: "uploading" } : qi,
        ),
      );

      const result = await uploadFile(
        base,
        batchId,
        item,
        (receivedBytes) => {
          setQueue((q) =>
            q.map((qi) =>
              qi.file === item.file
                ? {
                    ...qi,
                    receivedBytes,
                    progress: Math.round((receivedBytes / qi.sizeBytes) * 100),
                  }
                : qi,
            ),
          );
          noteThroughput();
        },
        () => pausedRef.current,
        (submissionId) => {
          setQueue((q) =>
            q.map((qi) => (qi.file === item.file ? { ...qi, submissionId } : qi)),
          );
        },
      );

      setQueue((q) =>
        q.map((qi) =>
          qi.file === item.file
            ? result.paused
              ? { ...qi, status: "pending" }
              : {
                  ...qi,
                  status: result.ok ? "done" : "error",
                  note: result.note,
                  progress: result.ok ? 100 : qi.progress,
                }
            : qi,
        ),
      );
      if (result.paused) break;
    }

    setUploading(false);
  }

  function pause() {
    pausedRef.current = true;
    setPaused(true);
  }

  function retry(file: File) {
    setQueue((q) =>
      q.map((qi) =>
        qi.file === file ? { ...qi, status: "pending", note: undefined } : qi,
      ),
    );
  }

  /** Rolling 10s average, so the estimate settles instead of chasing each chunk. */
  function noteThroughput() {
    const now = Date.now();
    const bytes = queueRef.current.reduce(
      (n, q) => n + (q.status === "done" ? q.sizeBytes : q.receivedBytes),
      0,
    );
    const s = samplesRef.current;
    s.push({ t: now, bytes });
    while (s.length > 1 && now - s[0].t > 10_000) s.shift();
    const first = s[0];
    const secs = (now - first.t) / 1000;
    if (secs >= 1) setRate((bytes - first.bytes) / secs);
  }

  const hasPending = queue.some((q) => q.status === "pending");
  const doneCount = queue.filter((q) => q.status === "done").length;
  const errorCount = queue.filter((q) => q.status === "error").length;
  const totalBytes = queue.reduce((n, q) => n + q.sizeBytes, 0);
  // A finished file counts whole; an in-flight one counts what the server has
  // acknowledged, which is what resume would start from.
  const uploadedBytes = queue.reduce(
    (n, q) => n + (q.status === "done" ? q.sizeBytes : q.receivedBytes),
    0,
  );

  if (expired) {
    return (
      <div className="px-4 sm:px-6 md:px-10 py-12 max-w-[640px] mx-auto text-center">
        <div className="text-lg font-black mb-2">This project has expired</div>
        <div className="text-sm text-muted">
          Get in touch if you still need to send footage over — we can extend
          it.
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
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-3">
          Send us footage
        </div>
        <h1 className="bj-serif text-[28px] sm:text-4xl font-normal mb-3">
          Upload to &ldquo;{project.title}&rdquo;
        </h1>
        <div className="text-[13px] text-muted">
          Camera originals, audio, a project file — drag in whole folders and
          we&apos;ll keep them organized exactly as you dropped them. Large
          files upload in chunks, so if this page reloads or your connection
          drops mid-upload, just re-drop the same folder or file and it&apos;ll
          pick up where it left off.
        </div>
      </div>

      {batchError && (
        <div className="mb-4 border border-accent/40 bg-accent/5 px-4 py-3 text-[13px] text-accentb">
          {batchError}
        </div>
      )}

      {resumable.length > 0 && (
        <div className="mb-4 border border-accent/40 bg-accent/5 px-4 py-3 text-[13px]">
          <div className="font-bold text-accentb mb-1">
            Unfinished upload{resumable.length > 1 ? "s" : ""}
          </div>
          {resumable.map((r) => (
            <div key={r.id} className="text-muted">
              {r.relativePath} —{" "}
              {Math.round((r.receivedBytes / r.sizeBytes) * 100)}% (
              {formatBytes(r.receivedBytes)} of {formatBytes(r.sizeBytes)}).
              Re-drop the same file or folder below to resume.
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
        <span className="block text-[15px] font-bold text-text mb-1">
          Drop files or folders here
        </span>
        <span className="block text-[13px] text-muted">
          Drag in whole folders; we keep your structure. If the page reloads or
          the connection drops, re-drop the same folder to resume.
        </span>
      </label>
      <div className="text-center mb-4">
        <label
          htmlFor="submission-folder-input"
          className="text-xs font-semibold text-muted hover:text-text cursor-pointer"
        >
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
        <div className="sticky top-[70px] z-20 bg-s1 border border-line2 px-5 py-4 mb-4">
          <div className="text-[11px] tracking-wide uppercase font-bold text-muted mb-1">
            {errorCount > 0 && !uploading
              ? "Finished with errors"
              : uploading
                ? "Uploading"
                : paused
                  ? "Paused"
                  : doneCount === queue.length
                    ? "Complete"
                    : "Ready"}
          </div>
          <div className="text-[22px] font-black tabular-nums mb-2">
            {doneCount} of {queue.length} files
          </div>
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted mb-2 flex-wrap">
            <span className="tabular-nums">
              {fmtBytes(uploadedBytes)} of {fmtBytes(totalBytes)}
            </span>
            {uploading && rate > 0 && (
              <span className="tabular-nums">
                {[
                  fmtEta((totalBytes - uploadedBytes) / rate),
                  `${fmtBytes(rate)}/s`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </div>
          <div className="h-1.5 bg-bg border border-line2 mb-3">
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{
                width: `${totalBytes ? (uploadedBytes / totalBytes) * 100 : 0}%`,
              }}
            />
          </div>

          {uploading ? (
            <button
              onClick={pause}
              className="cursor-pointer border border-line2 hover:border-text text-[11px] uppercase font-bold text-muted hover:text-text px-4 py-2.5"
            >
              Pause
            </button>
          ) : hasPending ? (
            <Button onClick={startUpload}>
              {paused
                ? "Resume"
                : `Upload ${queue.filter((q) => q.status === "pending").length}`}
            </Button>
          ) : (
            <Link
              href={`/p/${project.id}`}
              className="inline-block bg-text hover:bg-accent text-bg text-[11px] uppercase font-bold px-4 py-2.5"
            >
              Back to project
            </Link>
          )}
        </div>
      )}

      {queue.length > 0 && (
        <div className="border border-line mb-6">
          {queue.map((item, i) => (
            <div
              key={i}
              className="relative grid grid-cols-[20px_1fr_auto_auto] gap-3.5 items-center px-4 py-3 border-t border-line first:border-t-0"
            >
              {/* Progress reads as a faint fill behind the row rather than a separate bar. */}
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-accent/[.08] pointer-events-none transition-[width] duration-300"
                style={{ width: `${item.progress}%` }}
              />
              <span
                className={`relative text-sm leading-none ${
                  item.status === "done"
                    ? "text-success"
                    : item.status === "error"
                      ? "text-accentb"
                      : item.status === "uploading"
                        ? "text-accentb"
                        : "text-dim"
                }`}
              >
                {item.status === "done" ? (
                  <IconCheck />
                ) : item.status === "error" ? (
                  "!"
                ) : item.status === "uploading" ? (
                  <IconUpload />
                ) : (
                  "·"
                )}
              </span>
              <span className="relative min-w-0">
                <span className="block text-xs font-semibold truncate">
                  {item.relativePath}
                </span>
                {item.note && (
                  <span className="block text-[11px] text-accentb truncate">
                    {item.note}
                  </span>
                )}
              </span>
              <span className="relative text-xs text-dim tabular-nums">
                {fmtBytes(item.sizeBytes)}
              </span>
              <span className="relative text-xs font-semibold tabular-nums">
                {item.status === "done" ? (
                  <span className="text-success">Done</span>
                ) : item.status === "error" ? (
                  <button
                    onClick={() => retry(item.file)}
                    className="cursor-pointer text-accentb hover:text-accent uppercase text-[11px] font-bold"
                  >
                    Retry
                  </button>
                ) : item.status === "uploading" ? (
                  <span className="text-muted">{item.progress}%</span>
                ) : (
                  <span className="text-dim">Queued</span>
                )}
              </span>
            </div>
          ))}
          <div ref={listEndRef} />
        </div>
      )}
    </div>
  );
}
