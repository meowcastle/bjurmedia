"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Seal } from "@/components/ui/Seal";
import { ClientLogo, type ClientMark } from "@/components/ClientLogo";
import { initials } from "@/lib/initials";

/**
 * The review screen: one component, two modes.
 *
 * Client mode is a reviewer watching a cut and leaving notes. Studio mode is the same
 * screen with the composer replaced by answering — every sent note gets Changed or Kept
 * as is, and only then can the next cut go out.
 *
 * One component rather than two because the halves that matter — the player, the marked
 * scrubber, the note list — are identical, and the two screens drifting apart is how a
 * timestamp ends up meaning one thing to the client and another to the person cutting.
 *
 * No portal nav. A guest reaching this from a link has no account and should see a player,
 * not a product. v13 (design/v13/PortalReview13): a page in the bjur.nyc look, themed like
 * the rest of the portal; styles in src/app/v13/review.css.
 */

export type ReviewMode = "client" | "studio";

export type ScreenNote = {
  id: string;
  /** Null for a general note migrated from the old whole-cut feedback. */
  timeSec: number | null;
  body: string;
  /** Null while it is a draft, visible only to its author. */
  sentAt: string | null;
  authorId: string;
  authorName: string;
  outcome: "CHANGED" | "KEPT" | null;
  response: string | null;
};

export type ScreenCut = {
  id: string;
  version: number;
  /** Null means uploaded but not released — studio mode only ever sees this. */
  sentAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  assetId: string;
  /** The file this cut is, named. Per cut: the header follows the tab you are on. */
  title: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  /** Frames per second, for the studio's SMPTE readout. */
  fps: number | null;
};

export type ReviewScreenProps = {
  mode: ReviewMode;
  clientName: string;
  /** The client logo for the header (seal x logo); not shown to staff. */
  clientLogo?: ClientMark | null;
  projectTitle: string;
  assetTitle: string;
  /** Where the wordmark goes. Omitted for a guest, who has no portal to go back to. */
  backHref?: string;
  /** Newest last. Studio sees an unsent cut; clients never do. */
  cuts: ScreenCut[];
  activeCutId: string;
  onSelectCut: (cutId: string) => void;
  /** Notes on the active cut. Drafts are only ever this viewer's own. */
  notes: ScreenNote[];
  /** Sent notes on the cut before this one, with whatever was done about them. */
  previousNotes: ScreenNote[];
  /** Who is watching. Null in studio mode — staff are not reviewers. */
  viewer: { id: string; name: string; role: string | null; canApprove: boolean } | null;
  onAddNote: (timeSec: number, body: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onSendNotes: () => Promise<void>;
  onApprove: () => Promise<void>;
  onUndoApprove: () => Promise<void>;
  /** Studio only. */
  onAnswerNote?: (noteId: string, outcome: "CHANGED" | "KEPT", response: string) => Promise<void>;
  onPreviewRelease?: () => void;
  markerExportHref?: string;
};

/** m:ss for clients. A note at 74.2s reads 1:14, which is what they will say out loud. */
function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * HH:MM:SS:FF for the studio, because a note has to land on a frame in an edit.
 * 23.976 when the asset never reported a rate — the common case for what we take in, and
 * wrong by less than a frame over a five-minute cut.
 */
function timecode(sec: number, fps: number | null) {
  const rate = fps && fps > 0 ? fps : 23.976;
  const total = Math.max(0, sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * rate);
  return [h, m, s, f].map((n) => String(n).padStart(2, "0")).join(":");
}

export function ReviewScreen({
  mode,
  clientName,
  clientLogo = null,
  projectTitle,
  assetTitle,
  backHref,
  cuts,
  activeCutId,
  onSelectCut,
  notes,
  previousNotes,
  viewer,
  onAddNote,
  onDeleteNote,
  onSendNotes,
  onApprove,
  onUndoApprove,
  onAnswerNote,
  onPreviewRelease,
  markerExportHref,
}: ReviewScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLInputElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState("");
  /** Locked when the composer takes focus, so a note lands where you paused, not where
   *  the video drifted to while you were typing. */
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [sentBanner, setSentBanner] = useState<string | null>(null);

  const cut = cuts.find((c) => c.id === activeCutId) ?? cuts[cuts.length - 1];
  const latest = cuts.filter((c) => c.sentAt).slice(-1)[0] ?? cuts[cuts.length - 1];
  const isLatest = cut?.id === latest?.id;
  const approved = !!cut?.approvedAt;
  const duration = cut?.durationSec ?? 0;

  const myDrafts = useMemo(
    () => notes.filter((n) => !n.sentAt && n.authorId === viewer?.id),
    [notes, viewer?.id]
  );
  const sentNotes = useMemo(() => notes.filter((n) => n.sentAt), [notes]);
  const unanswered = useMemo(
    () => (mode === "studio" ? previousNotes.filter((n) => !n.outcome).length : 0),
    [mode, previousNotes]
  );

  // Notes the viewer may act on, in timeline order. A general note (no time) sorts first
  // because it is about the whole cut.
  const visible = useMemo(
    () =>
      [...notes].sort((a, b) => (a.timeSec ?? -1) - (b.timeSec ?? -1) || a.id.localeCompare(b.id)),
    [notes]
  );

  /**
   * Fullscreen the player, not the page.
   *
   * On the element rather than document.body so the notes panel and transport go away —
   * a reviewer watching a grade wants the frame and nothing else. iOS Safari has no
   * element fullscreen, so it falls back to the video's own native player, which is the
   * behaviour people expect there anyway.
   */
  // Safari is the reason this is three branches rather than one. The unprefixed element
  // API only landed in Safari 16.4, iOS has never had it for anything but a <video>, and
  // the prefixed spelling is still what an older Mac answers to. Falling straight through
  // to the video is the last resort because it loses the note overlay with the chrome.
  const toggleFullscreen = useCallback(() => {
    const box = playerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => void })
      | null;
    const vid = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else doc.webkitExitFullscreen?.();
      return;
    }
    // iPhone first, because it is the case that silently does nothing otherwise. iOS has
    // no element fullscreen at all — only the <video> can go fullscreen — and it reports
    // that honestly through fullscreenEnabled, so ask before trying. Calling
    // requestFullscreen there returns a promise that rejects into the void, which is
    // exactly what "there is no option" looks like from the outside.
    const canElement =
      document.fullscreenEnabled ||
      (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled;
    if (!canElement) {
      vid?.webkitEnterFullscreen?.();
      return;
    }
    if (box?.requestFullscreen) void box.requestFullscreen().catch(() => vid?.webkitEnterFullscreen?.());
    else if (box?.webkitRequestFullscreen) box.webkitRequestFullscreen();
    else vid?.webkitEnterFullscreen?.();
  }, []);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const onChange = () => setIsFull(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, t);
    v.pause();
    setElapsed(Math.max(0, t));
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  /** The note floating over the frame: one that has just gone past. */
  const overlay = useMemo(
    () =>
      sentNotes.find(
        (n) => n.timeSec != null && elapsed >= n.timeSec - 0.3 && elapsed <= n.timeSec + 3
      ) ?? null,
    [sentNotes, elapsed]
  );

  // Keyboard. Every shortcut is off while an input has focus — N is a letter before it is
  // a command, and a reviewer typing "no, not that one" should not be seeking the video.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        if (e.key === "Escape") el.blur();
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      if (e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(v.currentTime - (e.shiftKey ? 5 : 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(v.currentTime + (e.shiftKey ? 5 : 1));
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        composerRef.current?.focus();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        const next = visible.find((n) => n.timeSec != null && n.timeSec > v.currentTime + 0.05);
        if (next?.timeSec != null) seek(next.timeSec);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle, seek, visible, toggleFullscreen]);

  function focusComposer() {
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
    setLockedAt(v?.currentTime ?? elapsed);
  }

  async function addNote() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onAddNote(lockedAt ?? elapsed, body);
      setDraft("");
      // Re-lock to where the video sits now, so a second thought about the same moment
      // does not silently attach itself to the first note's timestamp.
      setLockedAt(videoRef.current?.currentTime ?? elapsed);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!myDrafts.length || busy) return;
    setBusy(true);
    try {
      await onSendNotes();
      setSentBanner(
        `Notes sent · ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
      );
    } finally {
      setBusy(false);
    }
  }


  const markLabel = (n: ScreenNote) =>
    n.timeSec == null ? "General" : mode === "studio" ? timecode(n.timeSec, cut?.fps ?? null) : clock(n.timeSec);

  // v13 markup only from here down: the state, timing and keys above are unchanged.
  const drafts = visible.filter((n) => !n.sentAt);
  const sentVisible = visible.filter((n) => n.sentAt);
  const canCompose = mode === "client" && !!viewer && isLatest && !approved;
  const prevVersion = (cut?.version ?? 2) - 1;
  const cutTitle = cut?.title ?? assetTitle;
  const sameAsProject = cutTitle.trim().toLowerCase() === projectTitle.trim().toLowerCase();
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  const backLine = (
    <>
      {sameAsProject ? null : <>{projectTitle} · </>}
      <span data-testid="asset-title">{cutTitle}</span>
    </>
  );

  const noteRow = (n: ScreenNote) => {
    const mine = n.authorId === viewer?.id;
    return (
      <div
        key={n.id}
        data-testid={`note-${n.id}`}
        className={`bj-rv-note ${n.sentAt ? "sent" : ""} ${mode === "studio" ? "tc" : ""}`}
      >
        <button type="button" className="t" onClick={() => n.timeSec != null && seek(n.timeSec)}>
          {markLabel(n)}
        </button>
        <div className="min-w-0">
          <p>{n.body}</p>
          <span className="bj-mono by">
            {!n.sentAt ? (
              <>
                <span>You · not sent</span>
                <button type="button" onClick={() => void onDeleteNote(n.id)}>
                  Delete
                </button>
              </>
            ) : (
              <span>
                {n.authorName}
                {mine ? " (you)" : ""} · sent{" "}
                {new Date(n.sentAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </span>
        </div>
      </div>
    );
  };

  const showClientFoot =
    mode === "client" && isLatest && (approved || myDrafts.length > 0 || !!viewer?.canApprove);

  return (
    <ReviewShell
      testId="review-screen"
      mode={mode}
      clientName={clientName}
      clientLogo={clientLogo}
      brandHref={mode === "studio" ? "/admin" : backHref}
      viewerName={viewer?.name ?? null}
      viewerRole={viewer?.role ?? null}
    >
      <section className="bj-rv-head">
        <div className="min-w-0">
          {backHref ? (
            // The only way off this screen besides the seal: a page of its own, with no
            // portal nav, so the browser's back button is not the only exit.
            <Link
              href={backHref}
              data-testid="review-back"
              className="bj-mono bj-rv-back"
              title={mode === "studio" ? "Back to the project" : "Back to your projects"}
            >
              ← {backLine}
            </Link>
          ) : (
            <span className="bj-mono bj-rv-back">{backLine}</span>
          )}
          <h1 className="bj-mid">
            {clientName} · {projectTitle}, cut {cut?.version}
          </h1>
        </div>
        <div className="bj-rv-cuts" role="tablist" aria-label="Cuts" data-testid="cut-tabs">
          {cuts.map((c) => {
            const active = c.id === cut?.id;
            const unsent = !c.sentAt;
            const tag = c.approvedAt ? "Approved" : unsent ? "Not sent yet" : c.id === latest?.id ? "Latest" : "";
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={unsent && mode === "client"}
                onClick={() => onSelectCut(c.id)}
                data-testid={`cut-tab-${c.version}`}
                className={`${active ? "on" : ""} ${unsent ? "unsent" : ""}`}
              >
                Cut {c.version}
                {tag ? ` · ${tag}` : ""}
              </button>
            );
          })}
        </div>
      </section>

      <section className="bj-rv">
        <div className="min-w-0">
          {/* The player. On a phone it is a fixed slice of the viewport rather than 16:9,
              so the frame keeps real height above the notes. */}
          <div ref={playerRef} data-testid="player-area" className="bj-rv-player">
            {cut && (
              <video
                ref={videoRef}
                key={cut.assetId}
                src={`/api/assets/${cut.assetId}/proxy`}
                playsInline
                onClick={toggle}
                onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                className="bj-rv-video"
                data-testid="review-video"
              />
            )}
            <span className="bj-rv-tc" data-testid={mode === "studio" ? "smpte" : "timecode"}>
              {mode === "studio" ? timecode(elapsed, cut?.fps ?? null) : timecode(elapsed, cut?.fps ?? null).slice(3)}
            </span>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFull ? "Exit fullscreen" : "Fullscreen"}
              data-testid="fullscreen"
              className="bj-rv-fs"
            >
              {isFull ? "⤡" : "⤢"}
            </button>
            {overlay && (
              <div data-testid="frame-note" className="bj-rv-frame-note">
                <div className="t">{markLabel(overlay)}</div>
                <div>{overlay.body}</div>
              </div>
            )}
          </div>

          {/* Transport: round play, the timeline with its markers, the clock. */}
          <div className="bj-rv-transport">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              data-testid="play"
              className="bj-rv-pp"
            >
              {playing ? (
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <rect x="2" y="1.5" width="2.6" height="9" fill="currentColor" />
                  <rect x="7.4" y="1.5" width="2.6" height="9" fill="currentColor" />
                </svg>
              ) : (
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
                </svg>
              )}
            </button>
            <div
              className="bj-rv-track"
              data-testid="scrubber"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                if (duration) seek(((e.clientX - r.left) / r.width) * duration);
              }}
            >
              <span className="ln" />
              <span className="pl" style={{ width: duration ? `${(elapsed / duration) * 100}%` : 0 }} />
              {/* Markers: shu is a note not sent yet, ash is sent; the cut before is smaller. */}
              {[
                ...visible.map((n) => ({ n, old: false })),
                ...previousNotes.map((n) => ({ n, old: true })),
              ]
                .filter(({ n }) => n.timeSec != null && duration > 0)
                .map(({ n, old }) => {
                  const active = Math.abs((n.timeSec ?? 0) - elapsed) < 0.35;
                  return (
                    <button
                      key={`${old ? "p" : "c"}-${n.id}`}
                      type="button"
                      title={`${markLabel(n)} · ${n.body}`}
                      aria-label={`Note at ${markLabel(n)}`}
                      data-testid={`marker-${n.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (n.timeSec != null) seek(n.timeSec);
                      }}
                      className={`bj-rv-mk ${old ? "old" : !n.sentAt ? "draft" : ""} ${active ? "on" : ""}`}
                      style={{ left: `${((n.timeSec ?? 0) / duration) * 100}%` }}
                    />
                  );
                })}
              <span className="hd" style={{ left: duration ? `${(elapsed / duration) * 100}%` : 0 }} />
            </div>
            <span className="bj-mono bj-rv-time">
              {mode === "studio"
                ? `${timecode(elapsed, cut?.fps ?? null)} / ${timecode(duration, cut?.fps ?? null)}`
                : `${clock(elapsed)} / ${clock(duration)}`}
            </span>
          </div>

          {canCompose && (
            <div className="bj-rv-composer">
              <span data-testid="stamp" className={`bj-rv-at ${lockedAt != null ? "on" : ""}`}>
                @ {clock(lockedAt ?? elapsed)}
              </span>
              <input
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={focusComposer}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addNote();
                  }
                  if (e.key === "Escape") {
                    setDraft("");
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Add a note at this moment"
                aria-label="Add a note at this moment"
                data-testid="composer"
              />
              <button
                type="button"
                onClick={() => void addNote()}
                disabled={!draft.trim() || busy}
                data-testid="add-note"
                className="bj-ghost bj-rv-add"
              >
                Add ↵
              </button>
            </div>
          )}

          {mode === "client" && !isLatest && (
            <div className="bj-rv-elsewhere">
              Notes go on the latest cut.{" "}
              <button type="button" className="bj-link" onClick={() => latest && onSelectCut(latest.id)}>
                Go to cut {latest?.version}
              </button>
            </div>
          )}

          <p className="bj-mono bj-rv-keys">
            {canCompose
              ? "Space play · N note · ← → one second · M next note"
              : "Space play · ← → one second · M next note"}
          </p>
        </div>

        <aside className="bj-rv-notes" aria-label="Notes">
          <div className="bj-rv-list">
            <div className="bj-rv-h">
              {mode === "client" ? (
                <>
                  <span className="bj-mono ink">Your notes · {myDrafts.length} not sent</span>
                  <span className="bj-mono">Only you see these</span>
                </>
              ) : (
                <>
                  <span className="bj-mono ink">Notes · cut {cut?.version}</span>
                  <span className="bj-mono">{plural(sentNotes.length, "note")}</span>
                </>
              )}
            </div>
            {sentBanner && (
              <p data-testid="sent-banner" className="bj-mono bj-rv-banner">
                {sentBanner}
              </p>
            )}
            {mode === "studio" && unanswered > 0 && (
              <p data-testid="answer-banner" className="bj-rv-banner">
                Cut {cut?.version ?? 1} uploaded. Answer each note on cut {(cut?.version ?? 2) - 1}. They go
                out in the cut {cut?.version} email.
              </p>
            )}

            {visible.length === 0 && (
              <p className="bj-rv-empty">
                {mode === "client"
                  ? "Nothing yet. Pause where something needs changing and write it down."
                  : "No notes on this cut yet."}
              </p>
            )}

            {mode === "client" ? (
              <>
                {drafts.map(noteRow)}
                {sentVisible.length > 0 && (
                  <>
                    <div className="bj-rv-h sub">
                      <span className="bj-mono">Sent on cut {cut?.version}</span>
                      <span className="bj-mono">{plural(sentVisible.length, "note")}</span>
                    </div>
                    {sentVisible.map(noteRow)}
                  </>
                )}
              </>
            ) : (
              visible.map(noteRow)
            )}

            {/* The previous cut, and what was done about each note. In studio mode these
                are the rows being answered; in client mode they are the receipt. */}
            {previousNotes.length > 0 && (
              <>
                <div className="bj-rv-h sub">
                  <span className="bj-mono">From cut {prevVersion}</span>
                  <span className="bj-mono">{plural(previousNotes.length, "note")}</span>
                </div>
                {previousNotes.map((n) => (
                  <PreviousNote
                    key={n.id}
                    note={n}
                    label={markLabel(n)}
                    mode={mode}
                    onSeek={() => n.timeSec != null && seek(n.timeSec)}
                    onAnswer={onAnswerNote}
                  />
                ))}
              </>
            )}
          </div>

          {/* Pinned at the bottom of the column: send, or approve. */}
          {(showClientFoot || mode === "studio") && (
            <div className="bj-rv-send">
              {mode === "client" && isLatest && approved && (
                <div data-testid="approved-state" className="bj-rv-approved">
                  <span>
                    <span className="bj-dot ok" />
                    Cut {cut?.version} approved{cut?.approvedByName ? ` by ${cut.approvedByName}` : ""}
                  </span>
                  {viewer?.canApprove && (
                    <button type="button" className="bj-link" onClick={() => void onUndoApprove()}>
                      Undo
                    </button>
                  )}
                </div>
              )}

              {mode === "client" && isLatest && !approved && myDrafts.length > 0 && (
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy}
                  data-testid="send-notes"
                  className="bj-cta"
                >
                  Send {plural(myDrafts.length, "note")} to Bjur <i>→</i>
                </button>
              )}

              {mode === "client" && isLatest && !approved && myDrafts.length === 0 && viewer?.canApprove && (
                <div className="or">
                  <p>No changes needed?</p>
                  <button
                    type="button"
                    onClick={() => void onApprove()}
                    disabled={busy}
                    data-testid="approve"
                    className="bj-ghost"
                  >
                    Approve cut {cut?.version}
                  </button>
                </div>
              )}

              {mode === "studio" && (
                <StudioFooter
                  unanswered={unanswered}
                  total={previousNotes.length}
                  version={cut?.version ?? 1}
                  unsent={!cut?.sentAt}
                  approved={approved}
                  approvedByName={cut?.approvedByName ?? null}
                  markerExportHref={markerExportHref}
                  onPreviewRelease={onPreviewRelease}
                />
              )}
            </div>
          )}
        </aside>
      </section>
    </ReviewShell>
  );
}

/**
 * The page around the review: the seal and who on the left, the theme on the right, the
 * footer at the end. Shared with the empty and guest-name screens so all of them are one
 * frame. No portal links: a guest has no portal, and a client leaves by the back link.
 */
export function ReviewShell({
  mode,
  clientName,
  clientLogo = null,
  brandHref,
  viewerName = null,
  viewerRole = null,
  testId,
  children,
}: {
  mode: ReviewMode;
  clientName: string;
  /** The client logo for the header (seal x logo); not shown to staff. */
  clientLogo?: ClientMark | null;
  /** Where the seal goes. Omitted for a guest. */
  brandHref?: string;
  viewerName?: string | null;
  viewerRole?: string | null;
  testId?: string;
  children: React.ReactNode;
}) {
  const who = (
    <>
      <Seal />
      {mode !== "studio" && clientLogo && (
        <>
          <span className="x" aria-hidden="true">&times;</span>
          <ClientLogo client={clientLogo} size={34} />
        </>
      )}
      <span className="who">
        <span className="bj-mono ink">{mode === "studio" ? "Studio" : "Client portal"}</span>
        <span className="bj-mono">{mode === "studio" ? "Client portal admin" : clientName}</span>
      </span>
    </>
  );
  return (
    <div data-testid={testId} className="bj-page bj-rv-page">
      <nav className="bj-nav bj-rv-nav" aria-label="Primary">
        {brandHref ? (
          <Link className="bj-brand" href={brandHref}>
            {who}
          </Link>
        ) : (
          <span className="bj-brand">{who}</span>
        )}
        <div className="r">
          <ThemeToggle portal={mode === "studio" ? "admin" : "client"} />
          {viewerName && (
            <span className="bj-me" title={`${viewerName}${viewerRole ? ` · ${viewerRole}` : ""}`}>
              {initials(viewerName)}
            </span>
          )}
        </div>
      </nav>
      {children}
      <footer className="bj-foot bj-rv-foot">
        <span>Bjur · Brooklyn, NY</span>
        <a className="c" href="mailto:hi@bjur.nyc">
          hi@bjur.nyc
        </a>
        <span className="rr">portal.bjur.nyc</span>
      </footer>
    </div>
  );
}

/** A note from the cut before: read-only for clients, answerable for the studio. */
function PreviousNote({
  note,
  label,
  mode,
  onSeek,
  onAnswer,
}: {
  note: ScreenNote;
  label: string;
  mode: ReviewMode;
  onSeek: () => void;
  onAnswer?: (noteId: string, outcome: "CHANGED" | "KEPT", response: string) => Promise<void>;
}) {
  const [response, setResponse] = useState(note.response ?? "");
  const [saving, setSaving] = useState(false);

  async function answer(outcome: "CHANGED" | "KEPT") {
    if (!onAnswer || saving) return;
    setSaving(true);
    try {
      await onAnswer(note.id, outcome, response.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`bj-rv-note sent ${mode === "studio" ? "tc" : ""}`} data-testid={`prev-note-${note.id}`}>
      <button type="button" className="t" onClick={onSeek}>
        {label}
      </button>
      <div className="min-w-0">
        <p>{note.body}</p>
        <span className="bj-mono by">{note.authorName}</span>

        {mode === "studio" && onAnswer ? (
          <div>
            <div className="bj-rv-ans">
              {(["CHANGED", "KEPT"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => void answer(o)}
                  disabled={saving}
                  aria-pressed={note.outcome === o}
                  data-testid={`answer-${o.toLowerCase()}-${note.id}`}
                  className={`${note.outcome === o ? "on" : ""} ${o === "CHANGED" ? "ok" : ""}`}
                >
                  {o === "CHANGED" ? "Changed" : "Kept as is"}
                </button>
              ))}
            </div>
            <input
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              onBlur={() => note.outcome && void answer(note.outcome)}
              placeholder={
                note.outcome === "KEPT" ? "Why it stays (reviewers read this)" : "What you did (optional)"
              }
              data-testid={`response-${note.id}`}
              className="bj-rv-answer"
            />
          </div>
        ) : (
          note.outcome && (
            <div className="bj-rv-resp">
              <span className={`bj-pill ${note.outcome === "CHANGED" ? "ok" : ""}`}>
                {note.outcome === "CHANGED" ? "Changed" : "Kept as is"}
              </span>{" "}
              {note.response ? note.response : note.outcome === "CHANGED" ? "Done." : null}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function StudioFooter({
  unanswered,
  total,
  version,
  unsent,
  approved,
  approvedByName,
  markerExportHref,
  onPreviewRelease,
}: {
  unanswered: number;
  total: number;
  version: number;
  unsent: boolean;
  approved: boolean;
  approvedByName: string | null;
  markerExportHref?: string;
  onPreviewRelease?: () => void;
}) {
  if (approved) {
    return (
      <div data-testid="studio-approved" className="bj-rv-studio">
        <span className="bj-rv-approved">
          <span>
            <span className="bj-dot ok" />
            Approved{approvedByName ? ` by ${approvedByName}` : ""}
          </span>
        </span>
        <p className="bj-rv-small">Deliver the master from the project page.</p>
      </div>
    );
  }

  // A cut that has landed but not gone out: the only thing to do here is answer the
  // previous round, and the button stays shut until every note has an outcome.
  if (unsent) {
    const done = total - unanswered;
    return (
      <div data-testid="studio-release" className="bj-rv-studio">
        <div className="bj-rv-progress">
          <span className="bj-mono ink">
            {done} of {total} answered
          </span>
          <span className="bj-mono">Cut {version}</span>
        </div>
        <span className="bj-rv-bar">
          <span style={{ width: total ? `${(done / total) * 100}%` : "100%" }} />
        </span>
        <button
          type="button"
          onClick={onPreviewRelease}
          disabled={unanswered > 0}
          data-testid="preview-release"
          className="bj-cta"
        >
          Preview cut {version} email <i>→</i>
        </button>
        {unanswered > 0 && (
          <p className="bj-rv-small">
            Answer {unanswered} more note{unanswered === 1 ? "" : "s"} to continue.
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-testid="studio-markers" className="bj-rv-studio">
      <span className="bj-mono">Markers for your edit</span>
      <div className="bj-rv-exports">
        {markerExportHref &&
          (
            [
              ["Premiere (.csv)", "csv"],
              ["Resolve (.edl)", "edl"],
              ["Copy (text)", "txt"],
            ] as const
          ).map(([label, fmt]) => (
            <a key={fmt} href={`${markerExportHref}?format=${fmt}`} className="bj-ghost">
              {label}
            </a>
          ))}
      </div>
      <p className="bj-rv-small">
        Next you&apos;ll answer each note. Every reviewer gets cut {version + 1} and your answers in one email.
      </p>
    </div>
  );
}
