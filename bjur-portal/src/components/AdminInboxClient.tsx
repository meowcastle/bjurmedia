"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toast } from "@/components/ui/Toast";

type Pending = {
  id: string;
  kind: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  body: string;
  why: string | null;
  dealTitle: string | null;
  createdAt: string;
};
type Recent = {
  id: string;
  kind: string;
  state: string;
  toEmail: string | null;
  subject: string | null;
  dealTitle: string | null;
  at: string;
  error: string | null;
};

const KIND_LABEL: Record<string, string> = {
  FOLLOW_UP: "Follow-up",
  PAYMENT_NUDGE: "Payment reminder",
  NEXT_STEP: "Next step",
};

const STATE_STYLE: Record<string, string> = {
  APPROVED: "text-muted border-line2",
  SENT: "text-success border-success",
  DISMISSED: "text-dim border-line2",
  FAILED: "text-accentb border-accentb",
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The approval queue (CRM.md §4). Nothing an agent writes reaches a client until a person
 * reads it here and approves it; approving hands it to the worker's sender. The reason it
 * was drafted sits above every draft, so a bad one can be traced to its trigger.
 */
export function AdminInboxClient({ pending, recent }: { pending: Pending[]; recent: Recent[] }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[860px] mx-auto bjfade">
      <h1 className="bj-serif text-[34px] font-normal mb-7">Inbox</h1>

      {pending.length === 0 ? (
        <div className="border border-line bg-s1 shadow-1 mb-10">
          <EmptyState icon="files">Nothing waiting for you.</EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-5 mb-10">
          {pending.map((d, i) => (
            <DraftCard
              key={d.id}
              draft={d}
              index={i}
              onDone={(msg) => {
                setToast(msg);
                router.refresh();
              }}
            />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div className="border border-line bg-s1 shadow-1">
          <div className="px-4 py-3 border-b border-line2 text-[10.5px] tracking-[0.1em] uppercase text-muted font-bold">
            Recent
          </div>
          {recent.map((r) => (
            <div key={r.id} className="flex items-baseline gap-3 px-4 py-2.5 border-b border-line last:border-b-0" data-testid={`recent-${r.id}`}>
              <span className={`text-[9.5px] font-extrabold uppercase tracking-[.06em] border px-[6px] py-[2px] flex-none ${STATE_STYLE[r.state] ?? ""}`}>
                {r.state.toLowerCase()}
              </span>
              <span className="text-[13px] flex-1 min-w-0 truncate">
                {r.subject || KIND_LABEL[r.kind] || r.kind}
                <span className="text-dim"> · {r.toEmail ?? "no address"}</span>
                {r.error && <span className="block text-[11px] text-accentb truncate">{r.error}</span>}
              </span>
              <span className="text-[11px] text-dim tabular-nums flex-none">{when(r.at)}</span>
            </div>
          ))}
        </div>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function DraftCard({ draft, index, onDone }: { draft: Pending; index: number; onDone: (msg: string) => void }) {
  const [to, setTo] = useState(draft.toEmail);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<"approve" | "dismiss" | null>(null);
  const [error, setError] = useState("");

  async function act(action: "approve" | "dismiss") {
    setBusy(action);
    setError("");
    const res = await fetch(`/api/admin/crm/drafts/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, toEmail: to, subject, body }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "That did not go through.");
      return;
    }
    onDone(action === "approve" ? `Approved · sending to ${to}` : "Dismissed");
  }

  return (
    <article
      data-testid={`draft-${draft.id}`}
      className="bj-row border border-line bg-s1 shadow-1"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <span className="text-[10.5px] tracking-[0.1em] uppercase font-bold text-accentb">
          {KIND_LABEL[draft.kind] ?? draft.kind}
          {draft.dealTitle && <span className="text-muted normal-case tracking-normal font-semibold"> · {draft.dealTitle}</span>}
        </span>
        <span className="text-[11px] text-dim">{when(draft.createdAt)}</span>
      </div>
      {draft.why && <p className="px-5 mt-1.5 text-[12px] text-muted">{draft.why}</p>}
      <div className="px-5 pt-4 flex flex-col gap-2.5">
        <label className="flex items-center gap-3 text-[12px]">
          <span className="w-14 text-dim uppercase tracking-wide text-[10px]">To</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To"
            className="flex-1 min-w-0 bg-bg border border-line2 focus:border-accentb outline-none px-3 py-2 text-[13px] transition-colors"
          />
        </label>
        <label className="flex items-center gap-3 text-[12px]">
          <span className="w-14 text-dim uppercase tracking-wide text-[10px]">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label="Subject"
            className="flex-1 min-w-0 bg-bg border border-line2 focus:border-accentb outline-none px-3 py-2 text-[13px] transition-colors"
          />
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Email"
          rows={Math.min(14, Math.max(5, body.split("\n").length + 1))}
          className="w-full bg-bg border border-line2 focus:border-accentb outline-none px-3.5 py-3 text-[14px] leading-[1.6] resize-y transition-colors"
        />
      </div>
      {error && <div className="px-5 pt-2 text-xs text-accentb font-semibold">{error}</div>}
      <div className="flex justify-end gap-2.5 px-5 py-4">
        <Button variant="secondary" onClick={() => void act("dismiss")} loading={busy === "dismiss"} disabled={busy !== null}>
          Dismiss
        </Button>
        <Button onClick={() => void act("approve")} loading={busy === "approve"} disabled={busy !== null || !body.trim()}>
          Approve &amp; send
        </Button>
      </div>
    </article>
  );
}
