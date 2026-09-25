"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
 * Always dark, no portal nav. A guest reaching this from a link has no account and should
 * see a player, not a product.
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
    if (box?.requestFullscreen) void box.requestFullscreen().catch(() => {});
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
        `Your notes went to Bjur at ${new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}. Everyone gets one email when cut ${(cut?.version ?? 1) + 1} is up, with every note answered.`
      );
    } finally {
      setBusy(false);
    }
  }

  const markLabel = (n: ScreenNote) =>
    n.timeSec == null ? "General" : mode === "studio" ? timecode(n.timeSec, cut?.fps ?? null) : clock(n.timeSec);

  return (
    <div
      data-testid="review-screen"
      className="fixed inset-0 bg-black text-white flex flex-col"
      style={{ colorScheme: "dark" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 lg:gap-4 px-4 lg:px-5 py-2.5 lg:py-3 border-b border-white/12 flex-wrap shrink-0">
        {backHref ? (
          // The only way off this screen. It is a fixed-inset overlay with no portal nav
          // behind it, so without this the back button is the browser's and nothing else.
          <Link
            href={backHref}
            data-testid="review-back"
            className="bj-serif text-[19px] leading-none text-white/80 hover:text-white"
            title="Back to the project"
          >
            Bjur
          </Link>
        ) : (
          <span className="bj-serif text-[19px] leading-none">Bjur</span>
        )}
        <div className="min-w-0">
          <div className="text-[12px] font-mono truncate" data-testid="asset-title">
            {cut?.title ?? assetTitle}
          </div>
          <div className="text-[10.5px] font-mono text-white/45 truncate">
            {clientName} · {projectTitle}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap" data-testid="cut-tabs">
          {cuts.map((c) => {
            const active = c.id === cut?.id;
            const unsent = !c.sentAt;
            return (
              <button
                key={c.id}
                type="button"
                disabled={unsent && mode === "client"}
                onClick={() => onSelectCut(c.id)}
                data-testid={`cut-tab-${c.version}`}
                className={`px-2.5 py-1.5 text-[10.5px] font-mono uppercase tracking-[.08em] border ${
                  active ? "border-white text-white" : "border-white/20 text-white/55 hover:text-white"
                } ${unsent ? "border-dashed" : ""}`}
              >
                Cut {c.version}
                <span className="block text-[9px] tracking-normal text-white/40 normal-case">
                  {c.approvedAt ? "Approved" : unsent ? "Not sent yet" : c.id === latest?.id ? "Latest" : ""}
                </span>
              </button>
            );
          })}
        </div>
        {viewer && (
          <div className="text-[10.5px] font-mono text-white/45 whitespace-nowrap">
            {viewer.name}
            {viewer.role ? ` · ${viewer.role}` : ""}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Player.
            On a phone this is a fixed slice of the viewport rather than flex-1. Sharing
            the column with the notes list meant the list won and the video collapsed to
            300x150 — a review screen whose one job is watching the cut. Desktop keeps the
            row layout, where flex-1 is the right answer. */}
        <div className="shrink-0 lg:flex-1 lg:min-h-0 flex flex-col">
          <div
            ref={playerRef}
            data-testid="player-area"
            className="relative h-[42vh] lg:h-auto lg:flex-1 lg:min-h-0 grid place-items-center bg-black p-2 lg:p-3"
          >
            <span className="absolute top-4 left-5 text-[10.5px] font-mono uppercase tracking-[.1em] text-white/55 z-10">
              Cut {cut?.version}
            </span>
            {mode === "studio" && (
              <span
                className="absolute top-4 right-5 text-[11px] font-mono text-white/70 z-10 tabular-nums"
                data-testid="smpte"
              >
                {timecode(elapsed, cut?.fps ?? null)}
              </span>
            )}
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
                className="max-w-full max-h-full cursor-pointer"
                style={{ maxWidth: 1180 }}
                data-testid="review-video"
              />
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFull ? "Exit fullscreen" : "Fullscreen"}
              data-testid="fullscreen"
              className={`absolute ${mode === "studio" ? "top-12" : "top-4"} right-4 z-10 w-9 h-9 grid place-items-center border border-white/25 hover:border-white bg-black/50 text-white/80 hover:text-white cursor-pointer text-[13px]`}
            >
              {isFull ? "⤡" : "⤢"}
            </button>
            {overlay && (
              <div
                data-testid="frame-note"
                className="absolute bottom-5 left-5 max-w-[60%] bg-black/75 border border-white/15 px-3 py-2 z-10"
              >
                <div className="text-[10.5px] font-mono text-white/50">{markLabel(overlay)}</div>
                <div className="text-[13px] leading-snug">{overlay.body}</div>
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="px-4 lg:px-5 py-2.5 lg:py-3 border-t border-b lg:border-b-0 border-white/12 flex items-center gap-3 lg:gap-4 shrink-0">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              data-testid="play"
              className="w-[38px] h-[38px] grid place-items-center border border-white/25 hover:border-white cursor-pointer flex-none"
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="text-[11px] font-mono text-white/60 tabular-nums whitespace-nowrap">
              {mode === "studio"
                ? `${timecode(elapsed, cut?.fps ?? null)} / ${timecode(duration, cut?.fps ?? null)}`
                : `${clock(elapsed)} / ${clock(duration)}`}
            </span>
            <div
              className="relative flex-1 h-[26px] cursor-pointer"
              data-testid="scrubber"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                if (duration) seek(((e.clientX - r.left) / r.width) * duration);
              }}
            >
              <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-white/15" />
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-white/70"
                style={{ width: duration ? `${(elapsed / duration) * 100}%` : 0 }}
              />
              {/* Markers. Colour says whose and how far along: filled is sent, hollow is a
                  draft only this viewer can see, small and dim is the previous cut. */}
              {[
                ...visible.map((n) => ({ n, old: false })),
                ...previousNotes.map((n) => ({ n, old: true })),
              ]
                .filter(({ n }) => n.timeSec != null && duration > 0)
                .map(({ n, old }) => {
                  const mine = n.authorId === viewer?.id;
                  const isDraft = !n.sentAt;
                  const active = Math.abs((n.timeSec ?? 0) - elapsed) < 0.35;
                  const size = old ? 6 : active ? 10 : 8;
                  return (
                    <button
                      key={`${old ? "p" : "c"}-${n.id}`}
                      type="button"
                      title={`${markLabel(n)} · ${n.body}`}
                      data-testid={`marker-${n.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (n.timeSec != null) seek(n.timeSec);
                      }}
                      className="absolute top-0 -translate-x-1/2"
                      style={{ left: `${((n.timeSec ?? 0) / duration) * 100}%` }}
                    >
                      <span className="block w-px h-[9px] bg-white/25 mx-auto" />
                      <span
                        className="block"
                        style={{
                          width: size,
                          height: size,
                          background: old ? "transparent" : isDraft ? "transparent" : "var(--accent)",
                          border: `1px solid ${old ? "var(--dim)" : "var(--accent)"}`,
                          opacity: old ? 0.6 : mine || mode === "studio" ? 1 : 0.75,
                        }}
                      />
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="flex-1 min-h-0 lg:flex-none w-full lg:w-[380px] lg:min-w-[340px] lg:border-l border-white/12 flex flex-col">
          <div className="px-5 pt-4 pb-3 border-b border-white/12">
            <div className="bj-serif text-[19px] leading-none">Notes</div>
            <div className="text-[10.5px] font-mono uppercase tracking-[.1em] text-white/45 mt-1.5">
              Cut {cut?.version} ·{" "}
              {mode === "client"
                ? `${myDrafts.length} unsent`
                : `${sentNotes.length} note${sentNotes.length === 1 ? "" : "s"}`}
            </div>
            {sentBanner && (
              <div data-testid="sent-banner" className="mt-3 text-[12px] leading-relaxed text-white/60">
                {sentBanner}
              </div>
            )}
            {mode === "studio" && unanswered > 0 && (
              <div data-testid="answer-banner" className="mt-3 text-[12px] leading-relaxed text-white/60">
                Cut {(cut?.version ?? 1)} uploaded. Answer each note on cut {(cut?.version ?? 2) - 1}. They
                go out in the cut {cut?.version} email.
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {visible.length === 0 && (
              <div className="px-5 py-6 text-[12px] text-white/40">
                {mode === "client"
                  ? "Nothing yet. Pause where something needs changing and write it down."
                  : "No notes on this cut yet."}
              </div>
            )}
            {visible.map((n) => {
              const mine = n.authorId === viewer?.id;
              return (
                <div
                  key={n.id}
                  data-testid={`note-${n.id}`}
                  className="px-5 py-3.5 border-b border-white/8 hover:bg-white/[.03]"
                >
                  <button
                    type="button"
                    onClick={() => n.timeSec != null && seek(n.timeSec)}
                    className="text-[11px] font-mono text-white/50 hover:text-white cursor-pointer tabular-nums"
                    style={{ minWidth: mode === "studio" ? 88 : 44, textAlign: "left" }}
                  >
                    {markLabel(n)}
                  </button>
                  <div className="text-[13px] leading-snug mt-1">{n.body}</div>
                  <div className="mt-1.5 text-[10.5px] font-mono text-white/40 flex items-center gap-2">
                    {!n.sentAt ? (
                      <>
                        <span>Draft · only you</span>
                        <button
                          type="button"
                          onClick={() => void onDeleteNote(n.id)}
                          className="text-white/40 hover:text-white cursor-pointer underline"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <span>
                        {n.authorName}
                        {mine ? " (you)" : ""} · sent{" "}
                        {new Date(n.sentAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* The previous cut, and what was done about each note. In studio mode these
                are the rows being answered; in client mode they are the receipt. */}
            {previousNotes.length > 0 && (
              <div className="mt-2">
                <div className="px-5 py-2.5 text-[10.5px] font-mono uppercase tracking-[.1em] text-white/40 border-y border-white/10">
                  Cut {(cut?.version ?? 2) - 1} notes ·{" "}
                  {previousNotes.filter((n) => n.outcome === "CHANGED").length} changed
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
              </div>
            )}
          </div>

          {/* Composer / footer */}
          <div className="border-t border-white/12 px-5 py-4">
            {mode === "client" && viewer && isLatest && !approved && (
              <div className="flex items-center gap-2 mb-3 flex-wrap sm:flex-nowrap">
                <span
                  data-testid="stamp"
                  className="text-[11px] font-mono px-2 py-1.5 border"
                  style={{
                    borderColor: lockedAt != null ? "var(--accent)" : "rgba(255,255,255,.2)",
                    color: lockedAt != null ? "var(--accent)" : "rgba(255,255,255,.55)",
                  }}
                >
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
                  placeholder="What needs changing?"
                  data-testid="composer"
                  className="flex-1 min-w-[140px] bg-transparent border border-white/20 focus:border-white/60 outline-none px-3 py-2 text-[16px] sm:text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => void addNote()}
                  disabled={!draft.trim() || busy}
                  data-testid="add-note"
                  className="text-[10.5px] font-mono uppercase tracking-[.08em] border border-white/25 hover:border-white px-3 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                >
                  Add ↵
                </button>
              </div>
            )}

            {mode === "client" && !isLatest && (
              <div className="text-[12px] text-white/50 border border-dashed border-white/20 px-3 py-2.5 text-center">
                Notes go on the latest cut.{" "}
                <button
                  type="button"
                  onClick={() => latest && onSelectCut(latest.id)}
                  className="underline cursor-pointer hover:text-white"
                >
                  Go to cut {latest?.version} →
                </button>
              </div>
            )}

            {mode === "client" && isLatest && approved && (
              <div
                data-testid="approved-state"
                className="flex items-center justify-between gap-3 text-[12px]"
              >
                <span style={{ color: "var(--success)" }}>
                  ● Cut {cut?.version} approved{cut?.approvedByName ? ` by ${cut.approvedByName}` : ""}
                </span>
                {viewer?.canApprove && (
                  <button
                    type="button"
                    onClick={() => void onUndoApprove()}
                    className="underline text-white/60 hover:text-white cursor-pointer"
                  >
                    Undo
                  </button>
                )}
              </div>
            )}

            {mode === "client" && isLatest && !approved && myDrafts.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy}
                  data-testid="send-notes"
                  className="w-full py-2.5 text-[12px] font-semibold uppercase tracking-[.08em] cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#0b0b0c" }}
                >
                  Send {myDrafts.length} note{myDrafts.length === 1 ? "" : "s"} to Bjur
                </button>
                <p className="mt-2 text-[11.5px] leading-relaxed text-white/45">
                  Only you can see these until you send. Keep adding as you watch.
                </p>
              </>
            )}

            {mode === "client" && isLatest && !approved && myDrafts.length === 0 && viewer?.canApprove && (
              <>
                <p className="mb-2 text-[11.5px] text-white/45">
                  {sentNotes.length === 0
                    ? "Nothing to change?"
                    : `Happy with it after all? Approving tells Bjur cut ${cut?.version} is final.`}
                </p>
                <button
                  type="button"
                  onClick={() => void onApprove()}
                  disabled={busy}
                  data-testid="approve"
                  className="w-full py-2.5 text-[12px] font-semibold uppercase tracking-[.08em] cursor-pointer disabled:opacity-50"
                  style={
                    sentNotes.length === 0
                      ? { background: "var(--accent)", color: "#0b0b0c" }
                      : { border: "1px solid var(--accent)", color: "var(--accent)" }
                  }
                >
                  Approve cut {cut?.version}
                </button>
              </>
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
        </div>
      </div>
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
    <div className="px-5 py-3.5 border-b border-white/8" data-testid={`prev-note-${note.id}`}>
      <button
        type="button"
        onClick={onSeek}
        className="text-[11px] font-mono text-white/40 hover:text-white cursor-pointer tabular-nums"
      >
        {label}
      </button>
      <div className="text-[13px] leading-snug mt-1 text-white/80">{note.body}</div>
      <div className="mt-1 text-[10.5px] font-mono text-white/35">{note.authorName}</div>

      {mode === "studio" && onAnswer ? (
        <div className="mt-2.5">
          <div className="flex gap-0">
            {(["CHANGED", "KEPT"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => void answer(o)}
                disabled={saving}
                data-testid={`answer-${o.toLowerCase()}-${note.id}`}
                className="text-[10px] font-mono uppercase tracking-[.06em] px-2.5 py-1.5 border cursor-pointer disabled:opacity-50"
                style={
                  note.outcome === o
                    ? {
                        borderColor: o === "CHANGED" ? "var(--success)" : "rgba(255,255,255,.5)",
                        color: o === "CHANGED" ? "var(--success)" : "#fff",
                      }
                    : { borderColor: "rgba(255,255,255,.18)", color: "rgba(255,255,255,.5)" }
                }
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
            className="mt-2 w-full bg-transparent border border-white/15 focus:border-white/50 outline-none px-2.5 py-1.5 text-[12px]"
          />
        </div>
      ) : (
        note.outcome && (
          <div className="mt-1.5 text-[10.5px] font-mono uppercase tracking-[.06em]">
            <span style={{ color: note.outcome === "CHANGED" ? "var(--success)" : "rgba(255,255,255,.45)" }}>
              {note.outcome === "CHANGED" ? "Changed" : "Kept as is"}
            </span>
            {note.response ? (
              <span className="text-white/45 normal-case tracking-normal"> · {note.response}</span>
            ) : note.outcome === "CHANGED" ? (
              <span className="text-white/45 normal-case tracking-normal"> · Done.</span>
            ) : null}
          </div>
        )
      )}
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
      <div data-testid="studio-approved" className="text-[12px]">
        <span style={{ color: "var(--success)" }}>● Approved{approvedByName ? ` by ${approvedByName}` : ""}</span>
        <p className="mt-1.5 text-white/45 text-[11.5px]">Deliver the master from the project page.</p>
      </div>
    );
  }

  // A cut that has landed but not gone out: the only thing to do here is answer the
  // previous round, and the button stays shut until every note has an outcome.
  if (unsent) {
    const done = total - unanswered;
    return (
      <div data-testid="studio-release">
        <div className="flex items-center justify-between text-[11px] font-mono text-white/55">
          <span>
            {done} of {total} answered
          </span>
          <span>Cut {version}</span>
        </div>
        <span className="block h-[3px] bg-white/12 mt-2">
          <span
            className="block h-full transition-[width]"
            style={{
              width: total ? `${(done / total) * 100}%` : "100%",
              background: "var(--success)",
            }}
          />
        </span>
        <button
          type="button"
          onClick={onPreviewRelease}
          disabled={unanswered > 0}
          data-testid="preview-release"
          className="mt-3 w-full py-2.5 text-[12px] font-semibold uppercase tracking-[.08em] cursor-pointer disabled:opacity-40 disabled:cursor-default"
          style={{ background: "var(--accent)", color: "#0b0b0c" }}
        >
          Preview cut {version} email →
        </button>
        {unanswered > 0 && (
          <p className="mt-2 text-[11.5px] text-white/45">
            Answer {unanswered} more note{unanswered === 1 ? "" : "s"} to continue.
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-testid="studio-markers">
      <div className="text-[10.5px] font-mono uppercase tracking-[.1em] text-white/45 mb-2">
        Markers for your edit
      </div>
      <div className="flex gap-2 flex-wrap">
        {markerExportHref &&
          (
            [
              ["Premiere (.csv)", "csv"],
              ["Resolve (.edl)", "edl"],
              ["Copy (text)", "txt"],
            ] as const
          ).map(([label, fmt]) => (
            <a
              key={fmt}
              href={`${markerExportHref}?format=${fmt}`}
              className="text-[10.5px] font-mono uppercase tracking-[.06em] border border-white/25 hover:border-white px-2.5 py-1.5"
            >
              {label}
            </a>
          ))}
      </div>
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-white/45">
        Next you&apos;ll answer each note. Every reviewer gets cut {version + 1} and your answers in
        one email.
      </p>
    </div>
  );
}
