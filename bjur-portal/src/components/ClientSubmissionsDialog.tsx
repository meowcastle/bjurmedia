"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";

type FileStatus = "UPLOADING" | "COMPLETE" | "FAILED";

type BatchFile = {
  id: string;
  relativePath: string;
  sizeBytes: string;
  receivedBytes: string;
  status: FileStatus;
  completedAt: string | null;
};

type Batch = {
  id: string;
  label: string;
  dirPath: string;
  uploaderName: string;
  createdAt: string;
  files: BatchFile[];
};

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

const STATUS_LABEL: Record<FileStatus, string> = {
  UPLOADING: "Uploading",
  COMPLETE: "Ready",
  FAILED: "Failed",
};

function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        // Fire-and-forget: some browser/permission configurations leave this promise
        // pending indefinitely (e.g. a clipboard permission prompt with nowhere to
        // resolve) rather than rejecting quickly, so the "Copied" feedback must not
        // wait on it — the path text itself is already visible/selectable as a
        // fallback either way.
        navigator.clipboard?.writeText(path).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[10.5px] font-mono text-dim hover:text-text truncate text-left cursor-pointer"
      title="Copy path"
    >
      {copied ? "Copied ✓" : path}
    </button>
  );
}

export function ClientSubmissionsDialog({
  projectId,
  projectTitle,
  onClose,
}: {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
}) {
  const [batches, setBatches] = useState<Batch[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/projects/${projectId}/upload-batches`)
      .then((res) => res.json())
      .then((data) => setBatches(data.batches ?? []));
  }, [projectId]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[640px] bg-s2 border border-line2 p-7 bjrise">
          <div className="text-xl font-black tracking-tight mb-1.5">Client uploads</div>
          <div className="text-[13px] text-muted mb-6">
            Raw footage &amp; files sent in for &ldquo;{projectTitle}&rdquo; — each bin below is already
            browsable at that path over SMB, no download needed on the LAN.
          </div>

          <div className="flex flex-col gap-4 max-h-[480px] overflow-y-auto mb-6">
            {batches === null && <div className="text-sm text-muted">Loading…</div>}
            {batches?.length === 0 && <div className="text-sm text-muted">No uploads yet.</div>}
            {batches?.map((b) => {
              const totalBytes = b.files.reduce((sum, f) => sum + Number(f.sizeBytes), 0);
              const allComplete = b.files.every((f) => f.status === "COMPLETE");
              return (
                <div key={b.id} className="border border-line2">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line2 bg-bg/40">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{b.label}</div>
                      <CopyPathButton path={b.dirPath} />
                      <div className="text-[11px] text-dim mt-0.5">
                        {b.files.length} file{b.files.length !== 1 ? "s" : ""} · {formatBytes(totalBytes)} ·{" "}
                        {b.uploaderName} · {fmtDate(b.createdAt)}
                      </div>
                    </div>
                    {allComplete && (
                      <a
                        href={`/api/admin/upload-batches/${b.id}/zip`}
                        className="flex-none text-[11px] font-semibold text-accentb hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
                      >
                        Download ZIP
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col">
                    {b.files.map((f) => {
                      const received = Number(f.receivedBytes);
                      const total = Number(f.sizeBytes);
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-3 px-4 py-2 border-b border-line last:border-b-0"
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] truncate">{f.relativePath}</div>
                            <div className="text-[10.5px] text-dim mt-0.5">
                              {f.status === "UPLOADING" ? `${formatBytes(received)} of ${formatBytes(total)}` : formatBytes(total)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 flex-none">
                            <span
                              className={`text-[10.5px] font-bold uppercase tracking-wide ${
                                f.status === "COMPLETE" ? "text-success" : f.status === "FAILED" ? "text-accent" : "text-muted"
                              }`}
                            >
                              {STATUS_LABEL[f.status]}
                            </span>
                            {f.status === "COMPLETE" && (
                              <a
                                href={`/api/admin/submissions/${f.id}/download`}
                                className="text-[10.5px] font-semibold text-accentb hover:text-text border border-line2 hover:border-text px-2 py-1"
                              >
                                Download
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
