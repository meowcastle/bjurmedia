"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";
import { IconCheck } from "@/components/ui/Icon";

const KICKER =
  "text-[11px] uppercase tracking-[.05em] font-bold text-muted mb-2";
const INPUT =
  "w-full bg-bg border border-line2 px-[14px] py-[11px] text-sm text-text outline-none focus:border-accent";

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className={KICKER}>{children}</div>;
}

/** Two-way segmented control replacing the status <select>. Same DRAFT | LIVE values. */
function StatusSegment({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: "DRAFT" | "LIVE") => void;
}) {
  const seg = (v: "DRAFT" | "LIVE", label: string, extra = "") => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      className={`flex-1 py-[11px] text-[13px] font-bold cursor-pointer ${extra} ${
        value === v ? "bg-text text-bg" : "text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex border border-line2">
      {seg("DRAFT", "Draft · hidden")}
      {seg("LIVE", "Live · visible", "border-l border-line2")}
    </div>
  );
}

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  clientUploads: boolean;
  deliveredAt: string | null;
  expiresAt: string | null;
  clientType: "RETAINER" | "ONEOFF";
  assetCount: number;
};

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function EditProjectDialog({
  project,
  onClose,
  onSaved,
  onDeleted,
  notify,
}: {
  project: ProjectRow;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  /** Raised by the page, not this dialog — saving closes it. */
  notify?: (message: string) => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [status, setStatus] = useState(project.status);
  const [clientUploads, setClientUploads] = useState(project.clientUploads);
  const [copiedLink, setCopiedLink] = useState(false);

  async function copyUploadLink() {
    const url = `${window.location.origin}/p/${project.id}/upload`;
    // Clipboard access can be refused outright, so the link is still selectable from
    // the prompt fallback rather than the button silently doing nothing.
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this upload link:", url);
      return;
    }
    setCopiedLink(true);
    notify?.(`Copied ${url.replace(/^https?:\/\//, "")}`);
    setTimeout(() => setCopiedLink(false), 1600);
  }
  const [deliveredAt, setDeliveredAt] = useState(
    toDateInput(project.deliveredAt),
  );
  const [expiresAt, setExpiresAt] = useState(toDateInput(project.expiresAt));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isRetainer = project.clientType === "RETAINER";

  async function deleteProject() {
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to delete.");
      setDeleting(false);
      setConfirmingDelete(false);
      return;
    }
    onDeleted();
  }

  async function submit() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        status,
        clientUploads,
        deliveredAt: deliveredAt || null,
        expiresAt: isRetainer ? null : expiresAt || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to save.");
      setLoading(false);
      return;
    }
    notify?.(
      `Saved · ${title.trim()}${clientUploads ? " · uploads open" : ""}`,
    );
    onSaved();
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-6 bjfade"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[460px] bg-s2 border border-line2 p-7 bjrise"
        >
          <div className="text-[22px] font-black tracking-[-.02em] mb-[22px]">
            Edit project
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <Kicker>Project title</Kicker>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={INPUT}
              />
            </div>

            <div>
              <Kicker>Status</Kicker>
              <StatusSegment value={status} onChange={setStatus} />
            </div>

            {/* Side by side: they are one decision about the window a delivery is open
                for, and stacking them made that read as two unrelated fields. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Kicker>Delivered</Kicker>
                <input
                  type="date"
                  value={deliveredAt}
                  onChange={(e) => setDeliveredAt(e.target.value)}
                  className={`${INPUT} text-[13px] font-mono`}
                />
              </div>

              <div>
                <Kicker>Expires</Kicker>
                {isRetainer ? (
                  <div className="py-[11px] text-xs text-muted">
                    Never · retainer
                  </div>
                ) : (
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className={`${INPUT} text-[13px] font-mono`}
                  />
                )}
              </div>
            </div>

            {/* A click-anywhere card rather than a bare checkbox: this decides whether a
                client can put files on the studio's storage, which deserves more weight
                than a 14px box. The helper copy changes with the state because the
                consequences differ — a draft project is reachable only by link. */}
            <label
              data-testid="client-uploads-toggle"
              className={`flex gap-[14px] items-start border px-4 py-[14px] cursor-pointer select-none ${
                clientUploads
                  ? "border-accentb/50 bg-accent/[.06]"
                  : "border-line2"
              }`}
            >
              <input
                type="checkbox"
                checked={clientUploads}
                onChange={(e) => setClientUploads(e.target.checked)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`w-[18px] h-[18px] flex-none grid place-items-center border-2 mt-0.5 ${
                  clientUploads ? "border-accent bg-accent" : "border-dim"
                }`}
              >
                {clientUploads && (
                  <IconCheck className="text-[11px] text-bg" strokeWidth={4} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">
                  Accept client uploads
                </span>
                <span className="block text-xs text-muted mt-1 leading-relaxed">
                  {!clientUploads
                    ? "Client sees this project as a delivery only. Any shared upload link stops working."
                    : status === "LIVE"
                      ? "Client sees “Send us footage” on this project. Files land in the project inbox and post to Slack."
                      : "Project is hidden, so the client reaches the upload page only by link. Copy it below."}
                </span>
              </span>
            </label>
          </div>

          {error && (
            <div className="text-xs text-accentb mt-4 font-semibold">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2.5 mt-7">
            <div>
              {clientUploads && (
                <button
                  type="button"
                  onClick={copyUploadLink}
                  className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
                >
                  {copiedLink ? "Copied ✓" : "Copy upload link"}
                </button>
              )}
              {project.assetCount === 0 &&
                (confirmingDelete ? (
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-muted">
                      Delete this project?
                    </span>
                    <button
                      onClick={deleteProject}
                      disabled={deleting}
                      className="cursor-pointer text-[11px] font-semibold text-accentb hover:text-text border border-accentb px-2.5 py-1.5"
                    >
                      {deleting ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text px-2.5 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="cursor-pointer text-[11px] font-semibold text-dim hover:text-accentb border border-line2 hover:border-accentb px-2.5 py-1.5"
                  >
                    Delete project
                  </button>
                ))}
            </div>
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={loading}>
                {loading ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
