"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReviewScreen, type ReviewScreenProps, type ScreenCut, type ScreenNote } from "@/components/ReviewScreen";

/**
 * The studio half: answer the previous cut's notes, and send a cut that has not gone out.
 *
 * Send goes through a confirm rather than straight out, because it is the one action
 * here that reaches people outside the building and cannot be taken back.
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
  notesCutId: string;
  previousCutId: string | null;
}) {
  const router = useRouter();
  const [activeCutId, setActiveCutId] = useState(props.initialCutId);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const cut = props.cuts.find((c) => c.id === activeCutId);
  const answeredCount = props.previousNotes.filter((n) => n.outcome).length;

  async function answer(noteId: string, outcome: "CHANGED" | "KEPT", response: string) {
    // The note's own cut. Using the open tab sent cut 2's answers to cut 3, and the
    // server, rightly, found no such note there.
    const onPrevious = props.previousNotes.some((n) => n.id === noteId);
    const cutId = onPrevious ? props.previousCutId : props.notesCutId;
    const res = await fetch(`/api/admin/reviews/${cutId}/notes/${noteId}`, {
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
              They each get their own link
              {answeredCount > 0
                ? `, with the ${answeredCount} note${answeredCount === 1 ? "" : "s"} you answered on cut ${cut.version - 1}`
                : ""}
              . It cannot be recalled.
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
