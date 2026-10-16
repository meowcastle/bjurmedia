"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/Toast";

/**
 * "+ Add guest" on a Film project's reviewer list. A guest has no login: they get a link,
 * give their name once, and can never download. If a cut is already out they are sent it
 * straight away.
 */
export function AddGuestReviewer({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/projects/${projectId}/reviewers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; mailedCut?: number | null };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not add that guest.");
      return;
    }
    setToast(data.mailedCut ? `Added · sent cut ${data.mailedCut}` : "Added · they get the next cut");
    setEmail("");
    setRole("");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {open ? (
        <div className="pt-3 flex flex-col gap-2" data-testid="add-guest-form">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email.trim() && void add()}
            type="email"
            placeholder="director@studio.com"
            aria-label="Guest email"
            autoFocus
            className="w-full bg-transparent border border-line2 focus:border-text outline-none px-3 py-2 text-[13px] transition-colors"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email.trim() && void add()}
            placeholder="Director (optional)"
            aria-label="Guest role"
            className="w-full bg-transparent border border-line2 focus:border-text outline-none px-3 py-2 text-[13px] transition-colors"
          />
          {error && <span className="text-[11px] text-accentb">{error}</span>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void add()}
              disabled={!email.trim() || busy}
              className="text-[10.5px] font-semibold uppercase tracking-[.06em] border border-line2 hover:border-text px-3 py-1.5 cursor-pointer disabled:opacity-40 transition-colors"
            >
              {busy ? "Adding…" : "Add guest"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted hover:text-text cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="add-guest"
          className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted hover:text-text cursor-pointer transition-colors"
        >
          + Add guest
        </button>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

/** A guest's review link, copied to hand over by hand. */
export function CopyGuestLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(link).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        })
      }
      className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted hover:text-text cursor-pointer transition-colors"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
