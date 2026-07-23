"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";

type QueueItem = {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "warning" | "error";
  note?: string;
  assetId?: string;
  weekOfDraft?: string;
};

type UploadResult = { ok: boolean; ingested?: boolean; note?: string; assetId?: string; capturedAt?: string | null };

function uploadOne(projectId: string, item: QueueItem, onProgress: (pct: number) => void) {
  return new Promise<UploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/projects/${projectId}/upload`);
    xhr.setRequestHeader("X-Filename", encodeURIComponent(item.file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { error?: string; ingested?: boolean; note?: string; assetId?: string; capturedAt?: string | null } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // fall through with an empty body
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true, ingested: body.ingested, note: body.note, assetId: body.assetId, capturedAt: body.capturedAt });
      } else {
        resolve({ ok: false, note: body.error ?? `Upload failed (${xhr.status})` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, note: "Network error" });
    xhr.send(item.file);
  });
}

// capturedAt is a UTC ISO string (ffprobe's creation_time); format it in UTC so the
// label always matches the calendar date the (timezone-less) date input below it shows.
function fmtDetected(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function UploadDialog({
  projectId,
  projectTitle,
  onClose,
  onUploaded,
}: {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [justAdded, setJustAdded] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Guard against picking the same batch twice (e.g. re-opening the picker in the
    // same folder) — same name + size is close enough to certain for a duplicate.
    setQueue((q) => {
      const existing = new Set(q.map((item) => `${item.file.name}:${item.file.size}`));
      const additions = Array.from(files)
        .filter((file) => !existing.has(`${file.name}:${file.size}`))
        .map((file) => ({ file, progress: 0, status: "pending" as const }));
      setJustAdded(additions.length);
      return [...q, ...additions];
    });
    requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ block: "nearest" }));
  }

  async function startUpload() {
    setUploading(true);
    for (const item of queue) {
      if (item.status !== "pending") continue;
      setQueue((q) => q.map((qi) => (qi.file === item.file ? { ...qi, status: "uploading" } : qi)));
      const result = await uploadOne(projectId, item, (pct) => {
        setQueue((q) => q.map((qi) => (qi.file === item.file ? { ...qi, progress: pct } : qi)));
      });
      const status = !result.ok ? "error" : result.ingested === false ? "warning" : "done";
      // Only ingested uploads get an assetId back — that's what the date field below
      // is keyed on, so warning/error rows never render one.
      const dateFields = result.assetId
        ? { assetId: result.assetId, weekOfDraft: result.capturedAt ? result.capturedAt.slice(0, 10) : "" }
        : {};
      setQueue((q) =>
        q.map((qi) =>
          qi.file === item.file
            ? { ...qi, status, note: result.note, progress: result.ok ? 100 : qi.progress, ...dateFields }
            : qi
        )
      );
    }
    setUploading(false);
    onUploaded();
  }

  function setWeekOfDraft(item: QueueItem, value: string) {
    setQueue((q) => q.map((qi) => (qi.file === item.file ? { ...qi, weekOfDraft: value } : qi)));
  }

  async function saveWeekOf(item: QueueItem) {
    if (!item.assetId) return;
    const weekOf = item.weekOfDraft ? new Date(item.weekOfDraft).toISOString() : null;
    await fetch(`/api/admin/assets/${item.assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekOf }),
    });
  }

  // The date field is prefilled but may never be focused (an admin who agrees with a
  // detected date has no reason to click into it), so onBlur alone would never fire —
  // flushing every ingested item's current draft here is what actually confirms it.
  async function finishAndClose() {
    await Promise.all(queue.filter((qi) => qi.assetId).map(saveWeekOf));
    onClose();
  }

  const allDone = queue.length > 0 && queue.every((q) => q.status === "done" || q.status === "warning");
  const hasPending = queue.some((q) => q.status === "pending");
  const handleDismiss = uploading ? undefined : allDone ? finishAndClose : onClose;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade" onClick={handleDismiss}>
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] bg-s2 border border-line2 p-7 bjrise">
          <div className="text-xl font-black tracking-tight mb-1.5">Upload deliverables</div>
          <div className="text-[13px] text-muted mb-6">
            Goes straight into &ldquo;{projectTitle}&rdquo;&apos;s inbox — auto-ingested exactly like a NAS drop.
          </div>

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            className="cursor-pointer border border-dashed border-line2 hover:border-accent px-5 py-8 text-center text-sm text-muted mb-4"
          >
            Drop files here or click to browse
          </div>
          {queue.length > 0 && (
            <div className="text-xs text-muted mb-3">
              <span className="font-bold text-text">{queue.length}</span> file{queue.length === 1 ? "" : "s"} queued
              {justAdded > 0 && <span className="text-success"> (+{justAdded} just added)</span>}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {queue.length > 0 && (
            <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto mb-4">
              {queue.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between gap-3 mb-1 text-xs">
                    <span className="truncate text-text">{item.file.name}</span>
                    <span className={`flex-none ${item.status === "warning" ? "text-accentb" : "text-dim"}`}>
                      {item.status === "done"
                        ? "✓"
                        : item.status === "warning"
                          ? "⚠ not ingested"
                          : item.status === "error"
                            ? item.note
                            : `${item.progress}%`}
                    </span>
                  </div>
                  {item.status === "warning" && item.note && (
                    <div className="text-[11px] text-accentb mb-1">{item.note}</div>
                  )}
                  <div className="h-1 bg-bg border border-line2">
                    <div
                      className={`h-full ${item.status === "error" || item.status === "warning" ? "bg-accentb" : "bg-accent"}`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  {item.assetId && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-dim uppercase tracking-wide">
                        {item.weekOfDraft ? `Detected ${fmtDetected(item.weekOfDraft)} — correct?` : "No date detected"}
                      </span>
                      <input
                        type="date"
                        value={item.weekOfDraft ?? ""}
                        onChange={(e) => setWeekOfDraft(item, e.target.value)}
                        onBlur={() => saveWeekOf(item)}
                        className={`bg-bg border text-[11px] px-1.5 py-1 outline-none focus:border-accent ${
                          item.weekOfDraft ? "border-line2 text-text" : "border-accent/50 text-accentb"
                        }`}
                      />
                    </div>
                  )}
                </div>
              ))}
              <div ref={listEndRef} />
            </div>
          )}

          <div className="flex justify-end gap-2.5 mt-2">
            <Button variant="secondary" onClick={handleDismiss} disabled={uploading}>
              {allDone ? "Done" : "Cancel"}
            </Button>
            {!allDone && (
              <Button onClick={startUpload} disabled={uploading || !hasPending}>
                {uploading ? "Uploading…" : `Upload ${queue.length || ""}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
