"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReviewScreen, type ReviewScreenProps, type ScreenCut, type ScreenNote } from "@/components/ReviewScreen";

/**
 * The studio half: answer the previous cut's notes, then release the new one.
 *
 * Release goes through a confirm rather than straight out, because it is the one action
 * here that reaches people outside the building and cannot be taken back. The server
 * refuses an unanswered round regardless — this is a second pair of eyes, not the gate.
 */
export function StudioReviewClient({
  ...props
}: Omit<
  ReviewScreenProps,
  "activeCutId" | "onSelectCut" | "onAddNote" | "onDeleteNote" | "onSendNotes" | "onApprove" | "onUndoApprove"
> & {
  cuts: ScreenCut[];
  notes: ScreenNote[];
  previousNotes: ScreenNote[];
  initialCutId: string;
}) {
  const router = useRouter();
  const [activeCutId, setActiveCutId] = useState(props.initialCutId);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const cut = props.cuts.find((c) => c.id === activeCutId);
  const reviewerCount = props.previousNotes.length;

  async function answer(noteId: string, outcome: "CHANGED" | "KEPT", response: string) {
    const res = await fetch(`/api/admin/reviews/${activeCutId}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, response }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save that answer.");
      return;
    }
    setError(null);
    router.refresh();
  }

  async function release() {
    setSending(true);
    const res = await fetch(`/api/admin/reviews/${activeCutId}/release`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    setConfirming(false);
    if (!res.ok) {
      setError(data.error ?? "Could not send that cut.");
      return;
    }
    setError(null);
    router.refresh();
  }

  return (
    <>
      <ReviewScreen
        {...props}
        activeCutId={activeCutId}
        onSelectCut={setActiveCutId}
        onAddNote={async () => {}}
        onDeleteNote={async () => {}}
        onSendNotes={async () => {}}
        onApprove={async () => {}}
        onUndoApprove={async () => {}}
        onAnswerNote={answer}
        onPreviewRelease={() => setConfirming(true)}
        markerExportHref={`/api/admin/reviews/${activeCutId}/markers`}
      />

      {error && (
        <div data-testid="studio-error" className="bj-rv-toast" role="status">
          {error}
        </div>
      )}

      {confirming && cut && (
        <div className="fixed inset-0 z-[70] bg-black/70 grid place-items-center px-4" data-testid="release-preview">
          <div className="bj-rv-dialog" role="dialog" aria-modal="true" aria-labelledby="release-title">
            <span className="bj-mono">Cut {cut.version} email</span>
            <h2 id="release-title">Send to every reviewer?</h2>
            <p>
              They each get their own link and the full list of {reviewerCount} note
              {reviewerCount === 1 ? "" : "s"} from cut {cut.version - 1} with what you did about
              each. This is the only time those answers travel, and it cannot be recalled.
            </p>
            <div className="row">
              <button
                type="button"
                onClick={() => void release()}
                disabled={sending}
                data-testid="confirm-release"
                className="bj-cta"
              >
                {sending ? "Sending…" : "Send it"} <i>→</i>
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="bj-ghost">
                ← Back to notes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
