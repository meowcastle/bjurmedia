"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";

type QueueItem = {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

function uploadOne(projectId: string, item: QueueItem, onProgress: (pct: number) => void) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/projects/${projectId}/upload`);
    xhr.setRequestHeader("X-Filename", encodeURIComponent(item.file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true });
      } else {
        const msg = (() => {
          try {
            return JSON.parse(xhr.responseText).error as string;
          } catch {
            return `Upload failed (${xhr.status})`;
          }
        })();
        resolve({ ok: false, error: msg });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error" });
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
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setQueue((q) => [
      ...q,
      ...Array.from(files).map((file) => ({ file, progress: 0, status: "pending" as const })),
    ]);
  }

  async function startUpload() {
    setUploading(true);
    for (const item of queue) {
      if (item.status !== "pending") continue;
      setQueue((q) => q.map((qi) => (qi.file === item.file ? { ...qi, status: "uploading" } : qi)));
      const result = await uploadOne(projectId, item, (pct) => {
        setQueue((q) => q.map((qi) => (qi.file === item.file ? { ...qi, progress: pct } : qi)));
      });
      setQueue((q) =>
        q.map((qi) =>
          qi.file === item.file
            ? { ...qi, status: result.ok ? "done" : "error", error: result.error, progress: result.ok ? 100 : qi.progress }
            : qi
        )
      );
    }
    setUploading(false);
    onUploaded();
  }

  const allDone = queue.length > 0 && queue.every((q) => q.status === "done");
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
                    <span className="text-dim flex-none">
                      {item.status === "done"
                        ? "✓"
                        : item.status === "error"
                          ? item.error
                          : `${item.progress}%`}
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
