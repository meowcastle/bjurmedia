"use client";

import { useEffect, useRef, useState } from "react";
import { gradientFor } from "@/lib/gradients";
import { IconPlay } from "@/components/ui/Icon";

export type ReviewRound = {
  id: string;
  assetId: string;
  version: number;
  note: string | null;
  state: "PENDING" | "APPROVED" | "FEEDBACK";
  feedback: string | null;
  respondedAt: string | null;
  /** Who answered, for a round somebody else on the account already handled. */
  respondedBy: string | null;
  assetName: string;
  contentTitle: string | null;
  kind: "PHOTO" | "VIDEO";
  thumbReady: boolean;
  durationSec: number | null;
};

/** 60 seconds to take it back, matching the toast. */
const UNDO_MS = 60_000;

function duration(sec: number | null) {
  if (!sec) return null;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

/**
 * Cuts waiting on the client, and the ones they have already answered.
 *
 * Every seat can answer. The approval flow this replaces was owner-only because it
 * published to the client's own channels; a review is the studio asking "is this
 * right", which is a question anyone they gave a login to can answer. The email still
 * goes to owners so it lands with someone accountable.
 */
export function ClientReviewPanel({
  rounds,
  onOpenAsset,
}: {
  rounds: ReviewRound[];
  onOpenAsset?: (assetId: string) => void;
}) {
  const [rows, setRows] = useState(rounds);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writingId, setWritingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [undoable, setUndoable] = useState<{ id: string; until: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!undoable) return;
    timer.current = setTimeout(() => setUndoable(null), UNDO_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [undoable]);

  async function respond(round: ReviewRound, state: "APPROVED" | "FEEDBACK", feedback?: string) {
    setBusyId(round.id);
    setError(null);
    const res = await fetch(`/api/reviews/${round.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, feedback }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "That didn't go through. Try again.");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === round.id
          ? {
              ...r,
              state,
              feedback: feedback ?? null,
              respondedAt: new Date().toISOString(),
              respondedBy: "You",
            }
          : r
      )
    );
    setWritingId(null);
    setDraft("");
    setUndoable({ id: round.id, until: Date.now() + UNDO_MS });
  }

  async function undo(roundId: string) {
    setBusyId(roundId);
    const res = await fetch(`/api/reviews/${roundId}/respond`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Too late to undo that.");
      setUndoable(null);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === roundId
          ? { ...r, state: "PENDING", feedback: null, respondedAt: null, respondedBy: null }
          : r
      )
    );
    setUndoable(null);
  }

  if (rows.length === 0) return null;

  const pending = rows.filter((r) => r.state === "PENDING");

  return (
    <section className="border border-line2 mb-6" data-testid="review-panel">
      <div className="flex items-baseline justify-between gap-3 px-5 py-3.5 border-b border-line2 flex-wrap">
        <h2 className="text-sm font-bold">
          {pending.length > 0
            ? `${pending.length} ${pending.length === 1 ? "cut needs" : "cuts need"} your review`
            : "Reviewed"}
        </h2>
        {pending.length > 0 && (
          <span className="text-[11px] text-muted">
            Approve it or send notes — there&rsquo;s no deadline.
          </span>
        )}
      </div>

      {error && (
        <div className="px-5 py-2.5 text-xs text-accentb font-semibold border-b border-line">
          {error}
        </div>
      )}

      {rows.map((r) => {
        const title = r.contentTitle?.trim() || r.assetName;
        const canUndo = undoable?.id === r.id;
        const len = duration(r.durationSec);

        return (
          <div
            key={r.id}
            data-testid={`review-row-${r.id}`}
            className="flex items-start gap-4 px-5 py-4 border-b border-line last:border-b-0 flex-wrap"
          >
            <button
              type="button"
              onClick={() => onOpenAsset?.(r.assetId)}
              aria-label={`Watch ${title}`}
              className="w-14 h-[74px] relative flex-none overflow-hidden cursor-pointer"
              style={{ background: gradientFor(r.assetId) }}
            >
              {r.thumbReady && (
                // eslint-disable-next-line @next/next/no-img-element -- proxied binary from our own API, not a static asset Next can optimize
                <img
                  src={`/api/assets/${r.assetId}/thumb`}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              {r.kind === "VIDEO" && (
                <span className="absolute inset-0 grid place-items-center text-white/90 text-[11px] drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">
                  <IconPlay fill="currentColor" />
                </span>
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-[10px] tracking-[0.16em] uppercase font-bold text-dim">
                  Cut {r.version}
                  {len ? ` · ${len}` : ""}
                </span>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wide ${
                    r.state === "PENDING"
                      ? "text-accentb"
                      : r.state === "APPROVED"
                        ? "text-success"
                        : "text-muted"
                  }`}
                >
                  {r.state === "PENDING"
                    ? "For your review"
                    : r.state === "APPROVED"
                      ? "Approved"
                      : "Notes sent"}
                </span>
              </div>

              <div className="text-sm font-bold mt-1 truncate">{title}</div>

              {r.note && (
                <p className="text-xs text-muted mt-1.5 leading-relaxed whitespace-pre-wrap">
                  {r.note}
                </p>
              )}

              {r.state === "FEEDBACK" && r.feedback && (
                <p className="text-xs text-body mt-2 leading-relaxed border-l-2 border-line2 pl-3 whitespace-pre-wrap">
                  {r.feedback}
                </p>
              )}

              {writingId === r.id ? (
                <div className="mt-3">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    placeholder="What needs changing?"
                    aria-label={`Notes on ${title}`}
                    className="w-full bg-bg border border-line2 px-3 py-2.5 text-sm text-text outline-none focus:border-accent resize-y"
                  />
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button
                      type="button"
                      disabled={!draft.trim() || busyId === r.id}
                      onClick={() => respond(r, "FEEDBACK", draft)}
                      className="cursor-pointer text-xs font-bold px-3.5 py-2 bg-text text-bg disabled:opacity-40"
                    >
                      {busyId === r.id ? "Sending…" : "Send to Bjur"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWritingId(null);
                        setDraft("");
                      }}
                      className="cursor-pointer text-xs font-semibold text-muted hover:text-text px-2 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : r.state === "PENDING" ? (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => respond(r, "APPROVED")}
                    className="cursor-pointer text-xs font-bold px-3.5 py-2 bg-text text-bg disabled:opacity-40"
                  >
                    {busyId === r.id ? "…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWritingId(r.id)}
                    className="cursor-pointer text-xs font-semibold px-3.5 py-2 border border-line2 hover:border-text"
                  >
                    Send notes
                  </button>
                </div>
              ) : canUndo ? (
                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                  <span className="text-[11px] text-muted">
                    {r.state === "APPROVED" ? "Approved." : "Sent to Bjur."}
                  </span>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => undo(r.id)}
                    className="cursor-pointer text-[11px] font-bold underline underline-offset-2 hover:text-accent"
                  >
                    Undo
                  </button>
                </div>
              ) : (
                r.respondedBy && (
                  <div className="text-[11px] text-dim mt-2.5">
                    {r.state === "APPROVED" ? "Approved by" : "Notes from"} {r.respondedBy}
                  </div>
                )
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
