"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";

type QueueItem = {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "warning" | "error";
  note?: string;
};

type UploadResult = { ok: boolean; ingested?: boolean; note?: string };

function uploadOne(projectId: string, item: QueueItem, onProgress: (pct: number) => void) {
  return new Promise<UploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/projects/${projectId}/upload`);
    xhr.setRequestHeader("X-Filename", encodeURIComponent(item.file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { error?: string; ingested?: boolean; note?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // fall through with an empty body
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true, ingested: body.ingested, note: body.note });
      } else {
        resolve({ ok: false, note: body.error ?? `Upload failed (${xhr.status})` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, note: "Network error" });
    xhr.send(item.file);
  });
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
      setQueue((q) =>
        q.map((qi) =>
          qi.file === item.file
            ? { ...qi, status, note: result.note, progress: result.ok ? 100 : qi.progress }
            : qi
        )
      );
    }
    setUploading(false);
    onUploaded();
  }

  const allDone = queue.length > 0 && queue.every((q) => q.status === "done" || q.status === "warning");
  const hasPending = queue.some((q) => q.status === "pending");

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade"
        onClick={uploading ? undefined : onClose}
      >
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
                </div>
              ))}
              <div ref={listEndRef} />
            </div>
          )}

          <div className="flex justify-end gap-2.5 mt-2">
            <Button variant="secondary" onClick={onClose} disabled={uploading}>
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
