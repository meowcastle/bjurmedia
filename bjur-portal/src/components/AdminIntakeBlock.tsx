"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/format";

/**
 * Everything a client has sent, and the links they sent it through.
 *
 * Lives on the client page, not a project page. Footage arrives for weeks before anyone
 * knows what it will be cut into, and filing it under whichever project happened to exist
 * meant a review job could not be retired without first solving a 302 GB storage question.
 *
 * Two columns: what came in, and the doors it came through.
 */
export type IntakeBatch = {
  id: string;
  name: string;
  uploaderName: string;
  via: "send link" | "portal";
  fileCount: number;
  completeCount: number;
  receivedBytes: string;
  kinds: string[];
  status: "RECEIVING" | "STALLED" | "ON_SERVER" | "FILES_DELETED";
  /** When a byte last landed. Null if nothing ever did. */
  lastByteAt: string | null;
  smbPath: string;
  createdAt: string;
};

export type IntakeLink = {
  id: string;
  name: string;
  state: "open" | "closed" | "expired";
  sendPath: string;
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export function AdminIntakeBlock({
  clientId,
  batches,
  links,
  onChanged,
}: {
  clientId: string;
  batches: IntakeBatch[];
  links: IntakeLink[];
  onChanged: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [linkName, setLinkName] = useState("");

  const receiving = batches.filter((b) => b.status === "RECEIVING").length;
  const stalled = batches.filter((b) => b.status === "STALLED").length;
  const onServer = batches.filter((b) => b.status === "ON_SERVER").length;
  const openLinks = links.filter((l) => l.state === "open").length;

  async function deleteFiles(b: IntakeBatch) {
    setBusy(b.id);
    const res = await fetch(`/api/admin/upload-batches/${b.id}/files`, { method: "DELETE" });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(data.error ?? "Could not delete those files.");
      return;
    }
    setToast(`Freed ${formatBytes(Number(data.freedBytes))} — the record is kept.`);
    onChanged();
  }

  async function newLink() {
    const name = linkName.trim();
    if (!name) return;
    setBusy("new-link");
    const res = await fetch(`/api/admin/clients/${clientId}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(null);
    if (res.ok) {
      setLinkName("");
      setNaming(false);
      onChanged();
    }
  }

  async function toggleLink(l: IntakeLink) {
    setBusy(l.id);
    await fetch(`/api/admin/requests/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ open: l.state !== "open" }),
    });
    setBusy(null);
    onChanged();
  }

  return (
    <div className="mt-10" data-testid="intake-block">
      <div className="flex items-baseline justify-between gap-4 pb-2.5 border-b border-line2">
        <span className="text-[11px] tracking-[0.1em] uppercase text-dim">Sent to Bjur</span>
        <span className="text-[11px] text-dim2">
          {receiving} receiving
          {stalled > 0 ? ` · ${stalled} stalled` : ""} · {onServer} on server ·{" "}
          {openLinks === 0 ? (
            // Worth saying plainly: with no open link nobody can send anything, which is
            // a different situation from having nothing to show.
            <span style={{ color: "var(--accentb)" }}>no open links</span>
          ) : (
            `${openLinks} open link${openLinks === 1 ? "" : "s"}`
          )}
        </span>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-px bg-line2 border border-line2 border-t-0">
        {/* What came in */}
        <div className="bg-s1 p-5">
          {batches.length === 0 ? (
            <p className="text-[12px] text-muted leading-relaxed">
              Nothing yet. Make a link and send it to whoever is shooting — they need no
              account.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {batches.map((b) => (
                <div key={b.id} className="py-3.5" data-testid={`batch-${b.id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="bj-serif text-[17px] truncate">{b.name}</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-[.06em] whitespace-nowrap">
                      {b.status === "RECEIVING" ? (
                        <span style={{ color: "var(--accentb)" }}>Receiving</span>
                      ) : b.status === "STALLED" ? (
                        <span className="text-dim2">Stalled</span>
                      ) : b.status === "FILES_DELETED" ? (
                        <span className="text-dim2">Files deleted</span>
                      ) : (
                        <span style={{ color: "var(--success)" }}>On server</span>
                      )}
                    </span>
                  </div>

                  <div className="text-[11px] text-muted mt-1">
                    {b.uploaderName} · {b.via} ·{" "}
                    {b.status === "RECEIVING" || b.status === "STALLED"
                      ? `${b.completeCount} of ${b.fileCount} files`
                      : `${b.fileCount} file${b.fileCount === 1 ? "" : "s"}`}{" "}
                    · {formatBytes(Number(b.receivedBytes))}
                    {b.kinds.length ? ` · ${b.kinds.join(" · ")}` : ""} · {when(b.createdAt)}
                  </div>

                  {b.status === "STALLED" && b.lastByteAt && (
                    <div className="text-[11px] text-dim2 mt-1">
                      Nothing since {new Date(b.lastByteAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "2-digit",
                      })}
                      {" — "}
                      {b.fileCount - b.completeCount} file
                      {b.fileCount - b.completeCount === 1 ? "" : "s"} never finished. The rest
                      arrived.
                    </div>
                  )}

                  {b.status === "RECEIVING" && (
                    <span className="block h-[2px] bg-white/10 mt-2">
                      <span
                        className="block h-full"
                        style={{
                          width: `${(b.completeCount / Math.max(1, b.fileCount)) * 100}%`,
                          background: "var(--accentb)",
                        }}
                      />
                    </span>
                  )}

                  {b.status !== "FILES_DELETED" && (
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(b.smbPath);
                          setToast("Path copied.");
                        }}
                        data-testid={`copy-path-${b.id}`}
                        className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted hover:text-text cursor-pointer"
                      >
                        Copy path
                      </button>
                      {(b.status === "ON_SERVER" || b.status === "STALLED") && (
                        <button
                          type="button"
                          onClick={() => void deleteFiles(b)}
                          disabled={busy === b.id}
                          data-testid={`delete-files-${b.id}`}
                          className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted hover:text-accentb cursor-pointer disabled:opacity-50"
                        >
                          {busy === b.id ? "Deleting…" : "Delete files"}
                        </button>
                      )}
                      <span className="text-[10.5px] text-dim2 font-mono truncate">{b.smbPath}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* The doors */}
        <div className="bg-s1 p-5">
          <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-line">
            <span className="text-[11px] tracking-[0.1em] uppercase text-dim">Send links</span>
            <button
              type="button"
              onClick={() => setNaming((v) => !v)}
              data-testid="new-link"
              className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted hover:text-text cursor-pointer"
            >
              + New link
            </button>
          </div>

          {naming && (
            <div className="py-3 border-b border-line">
              <input
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void newLink()}
                placeholder="Who is it for? e.g. Xavier"
                autoFocus
                data-testid="link-name"
                className="w-full bg-transparent border border-line2 focus:border-text outline-none px-3 py-2 text-[13px]"
              />
              <p className="text-[10.5px] text-dim2 mt-1.5">
                Admin-only label — the sender never sees it. The link lives 14 days and
                closes itself.
              </p>
              <button
                type="button"
                onClick={() => void newLink()}
                disabled={!linkName.trim() || busy === "new-link"}
                className="mt-2 text-[10.5px] font-semibold uppercase tracking-[.06em] border border-line2 hover:border-text px-3 py-1.5 cursor-pointer disabled:opacity-40"
              >
                Make it
              </button>
            </div>
          )}

          <div className="divide-y divide-line">
            {links.map((l) => (
              <div key={l.id} className="py-3" data-testid={`link-${l.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] truncate">{l.name}</span>
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-[.06em] ${
                      l.state === "open" ? "text-success" : "text-dim2"
                    }`}
                  >
                    {l.state}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}${l.sendPath}`);
                      setToast("Link copied.");
                    }}
                    className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted hover:text-text cursor-pointer"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleLink(l)}
                    disabled={busy === l.id}
                    className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted hover:text-text cursor-pointer disabled:opacity-50"
                  >
                    {l.state === "open" ? "Close" : "Reopen"}
                  </button>
                </div>
              </div>
            ))}
            {links.length === 0 && !naming && (
              <p className="text-[12px] text-muted leading-relaxed py-3">
                No links yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div
          data-testid="intake-toast"
          onAnimationEnd={() => setToast(null)}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-text text-bg text-[12.5px] px-4 py-2.5"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
