"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/ui/Toast";
import { IconClose } from "@/components/ui/Icon";
import { captionState, IG_CAPTION_MAX, type CaptionState } from "@/lib/captionState";

/** Everything the editor reads about one reel. Serialisable, so it crosses from the page. */
export type ReelCopy = {
  id: string;
  contentTitle: string | null;
  caption: string | null;
  captionYT: string | null;
  captionSource: "HUMAN" | "AI";
  transcriptStatus: string;
  postedToSlackAt: string | null;
  captionEditedBy: string | null;
  captionEditedAt: string | null;
  transcript: string | null;
  transcriptSegments: { start: number; text: string }[] | null;
};

export type CopyPatch = Partial<
  Pick<ReelCopy, "contentTitle" | "caption" | "captionYT" | "captionSource" | "captionEditedBy" | "captionEditedAt" | "postedToSlackAt">
>;

type Tab = "ig" | "yt" | "transcript";
type Field = "contentTitle" | "caption" | "captionYT";

const SAVE_DEBOUNCE_MS = 600;

const PILL: Record<Exclude<CaptionState, "NO_SPEECH">, { label: string; cls: string }> = {
  DRAFT: { label: "Draft · not checked", cls: "border-warn text-warn" },
  CHECKED: { label: "Checked", cls: "border-success text-success" },
  POSTED: { label: "Posted · locked", cls: "border-dim text-dim" },
};

function shortDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

function fmtStamp(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          // Clipboard refused: the text is still there to select by hand.
        }
      }}
      className="text-[10.5px] uppercase tracking-[.08em] text-dim hover:text-text cursor-pointer"
    >
      {done ? "Copied" : label}
    </button>
  );
}

/**
 * A reel's title, Instagram caption and YouTube description, read and edited where the
 * reel is watched. The same editor sits in the desktop viewer's side panel and in the
 * phone's swipe-up sheet; `variant` only changes the layout.
 *
 * It saves as people type (600ms after the last key, and at once on blur), because the
 * point is that nothing a client writes is ever lost to a forgotten button. Any edit
 * counts as having checked the caption. Keyed by reel from the outside, so switching
 * reels starts clean — and anything still unsaved goes out as the old one unmounts.
 */
export function CaptionEditor({
  reel,
  variant,
  currentTime = 0,
  onSeek,
  onChange,
  onClose,
  slackChannel,
}: {
  reel: ReelCopy;
  variant: "panel" | "sheet";
  /** The playhead, so the transcript can mark the line being spoken. */
  currentTime?: number;
  onSeek?: (t: number) => void;
  /** Reports each saved change so the gallery's tile lines and counts follow. */
  onChange: (id: string, patch: CopyPatch) => void;
  /** The sheet's ✕. The panel has none: the viewer's own close covers it. */
  onClose?: () => void;
  /** Named in the "ask to change it" note once a caption is locked. */
  slackChannel: string | null;
}) {
  const [title, setTitle] = useState(reel.contentTitle ?? "");
  const [ig, setIg] = useState(reel.caption ?? "");
  const [yt, setYt] = useState<string | null>(reel.captionYT);
  const [meta, setMeta] = useState({
    captionSource: reel.captionSource,
    captionEditedBy: reel.captionEditedBy,
    captionEditedAt: reel.captionEditedAt,
    postedToSlackAt: reel.postedToSlackAt,
  });
  const [tab, setTab] = useState<Tab>("ig");
  const [savedVisible, setSavedVisible] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flashSaved() {
    setSavedVisible(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedVisible(false), 1400);
  }
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);

  const state = captionState({
    contentTitle: title,
    caption: ig,
    captionYT: yt,
    captionSource: meta.captionSource,
    transcriptStatus: reel.transcriptStatus,
    postedToSlackAt: meta.postedToSlackAt,
  });
  const locked = state === "POSTED";

  // The latest values and what still has to reach the server, kept outside render so the
  // debounce timer and the unmount flush both see the words as they are now.
  const values = useRef<Record<Field, string | null>>({ contentTitle: title, caption: ig, captionYT: yt });
  const dirty = useRef<Set<Field>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  // Held in a ref so a parent re-render handing over a new function never re-runs the
  // unmount flush below while this reel is still open.
  const report = useRef(onChange);
  useEffect(() => {
    report.current = onChange;
  });

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (dirty.current.size === 0) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    const fields = [...dirty.current];
    dirty.current.clear();
    const body = Object.fromEntries(fields.map((f) => [f, values.current[f]]));
    inFlight.current = true;
    try {
      const res = await fetch(`/api/assets/${reel.id}/copy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        // Sent to Slack while this was open. Nothing more can be saved; say so plainly.
        const posted = new Date().toISOString();
        setMeta((m) => ({ ...m, postedToSlackAt: m.postedToSlackAt ?? posted }));
        report.current(reel.id, { postedToSlackAt: posted });
        setToast({ message: "This caption was sent for posting and is now locked." });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const saved = (await res.json()) as Pick<ReelCopy, "captionSource" | "captionEditedBy" | "captionEditedAt">;
      setMeta((m) => ({ ...m, ...saved }));
      report.current(reel.id, { ...body, ...saved });
      flashSaved();
    } catch {
      // Keep the words and try again on the next keystroke or blur.
      for (const f of fields) dirty.current.add(f);
      setToast({ message: "Couldn't save — check your connection" });
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, [reel.id]);

  function edit(field: Field, value: string | null) {
    if (locked) return;
    values.current[field] = value;
    dirty.current.add(field);
    if (field === "contentTitle") setTitle(value ?? "");
    if (field === "caption") setIg(value ?? "");
    if (field === "captionYT") setYt(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }

  // Leaving this reel (swipe, arrow, close) must not drop what was typed in the last
  // 600ms. keepalive lets the request outlive the component, and the page if need be.
  useEffect(() => {
    const id = reel.id;
    const pending = dirty.current;
    const latest = values.current;
    const t = timer;
    return () => {
      if (t.current) clearTimeout(t.current);
      if (pending.size === 0) return;
      const body = Object.fromEntries([...pending].map((f) => [f, latest[f]]));
      void fetch(`/api/assets/${id}/copy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
      report.current(id, { ...body, captionSource: "HUMAN", captionEditedBy: "CLIENT", captionEditedAt: new Date().toISOString() });
    };
  }, [reel.id]);


  async function looksGood() {
    const before = { captionEditedBy: meta.captionEditedBy, captionEditedAt: meta.captionEditedAt };
    const res = await fetch(`/api/assets/${reel.id}/copy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    }).catch(() => null);
    if (!res?.ok) {
      setToast({ message: "Couldn't save — check your connection" });
      return;
    }
    const saved = (await res.json()) as Pick<ReelCopy, "captionSource" | "captionEditedBy" | "captionEditedAt">;
    setMeta((m) => ({ ...m, ...saved }));
    report.current(reel.id, saved);
    setToast({
      message: "Marked checked",
      undo: async () => {
        const r = await fetch(`/api/assets/${reel.id}/copy`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revert: "AI",
            since: saved.captionEditedAt,
            prevEditedBy: before.captionEditedBy,
            prevEditedAt: before.captionEditedAt,
          }),
        }).catch(() => null);
        if (!r?.ok) return;
        const back = (await r.json()) as Pick<ReelCopy, "captionSource" | "captionEditedBy" | "captionEditedAt">;
        setMeta((m) => ({ ...m, ...back }));
        report.current(reel.id, back);
      },
    });
  }

  const sheet = variant === "sheet";
  const pill = state && state !== "NO_SPEECH" ? PILL[state] : null;
  const field =
    "w-full bg-s1 border border-line focus:border-line2 outline-none p-3.5 text-[14px] leading-[1.6] text-text placeholder:text-dim2 resize-y read-only:text-body";

  const tabs: [Tab, string][] = [
    ["ig", "Instagram"],
    ["yt", "YouTube"],
    ["transcript", "Transcript"],
  ];

  const segments = reel.transcriptSegments ?? [];
  const activeSegment = segments.reduce((hit, s, i) => (s.start <= currentTime ? i : hit), -1);

  const header = (
    <div className={sheet ? "px-5 pt-1" : "px-[26px] pt-[22px]"}>
      <div className="flex items-center justify-between gap-3 mb-4">
        {sheet ? (
          <span />
        ) : (
          <span className="text-[10.5px] uppercase tracking-[.12em] text-dim">Caption</span>
        )}
        <div className="flex items-center gap-3">
          <span
            data-testid="caption-saved"
            className={`text-[10px] uppercase tracking-[.1em] text-dim transition-opacity duration-300 ${
              savedVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            Saved
          </span>
          {pill && (
            <span
              data-testid="caption-pill"
              data-state={state}
              className={`text-[10px] uppercase tracking-[.1em] px-2 py-1 border ${pill.cls}`}
            >
              {pill.label}
            </span>
          )}
          {sheet && onClose && (
            <button onClick={onClose} aria-label="Close sheet" className="text-white/60 hover:text-white text-lg cursor-pointer">
              <IconClose />
            </button>
          )}
        </div>
      </div>
      {!sheet && (
        <label htmlFor={`title-${reel.id}`} className="block text-[10px] uppercase tracking-[.1em] text-dim mb-1">
          Title · also the YouTube title
        </label>
      )}
      <input
        id={`title-${reel.id}`}
        data-testid="caption-title"
        value={title}
        readOnly={locked}
        placeholder="Title"
        onChange={(e) => edit("contentTitle", e.target.value)}
        onBlur={() => void flush()}
        className={`w-full bg-transparent border-0 border-b border-line focus:border-line2 outline-none font-serif tracking-[-.01em] text-text placeholder:text-dim2 pb-2 ${
          sheet ? "text-[21px]" : "text-[24px]"
        }`}
      />
      {sheet ? (
        <div className="grid grid-cols-3 border border-line2 mt-4">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              data-testid={`caption-tab-${id}`}
              className={`min-h-[44px] text-[11px] uppercase tracking-[.08em] border-l border-line2 first:border-l-0 cursor-pointer ${
                tab === id ? "bg-text text-bg" : "text-dim"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-[22px] border-b border-line mt-5">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              data-testid={`caption-tab-${id}`}
              className={`text-[11px] uppercase tracking-[.08em] pb-2.5 -mb-px border-b cursor-pointer ${
                tab === id ? "text-text border-text" : "text-dim border-transparent hover:text-body"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const body = (
    <div className={`flex-1 min-h-0 overflow-y-auto ${sheet ? "px-5 py-4" : "px-[26px] py-5"}`}>
      {tab === "ig" && (
        <>
          <textarea
            data-testid="caption-ig"
            rows={sheet ? 6 : 9}
            value={ig}
            readOnly={locked}
            placeholder="Write a caption"
            onChange={(e) => edit("caption", e.target.value)}
            onBlur={() => void flush()}
            className={field}
          />
          <div className="flex items-center justify-between mt-2">
            <span className={`text-[10.5px] tabular-nums ${ig.length > IG_CAPTION_MAX ? "text-warn" : "text-dim"}`}>
              {ig.length} / {IG_CAPTION_MAX}
            </span>
            {ig && <CopyButton text={ig} />}
          </div>
          <p className="text-[11px] text-dim mt-3 leading-relaxed">
            Used on YouTube too, unless you write a separate description.
          </p>
        </>
      )}

      {tab === "yt" &&
        (yt === null ? (
          <>
            <div className="border border-line p-3.5">
              <div className="text-[10px] uppercase tracking-[.1em] text-dim mb-2">Same as Instagram</div>
              <p className="text-[13px] leading-[1.6] text-body whitespace-pre-wrap">{ig || "—"}</p>
            </div>
            {!locked && (
              <button
                data-testid="caption-yt-split"
                onClick={() => edit("captionYT", ig)}
                className="mt-3 text-[11px] text-text hover:text-accent cursor-pointer"
              >
                + Write a different YouTube description
              </button>
            )}
          </>
        ) : (
          <>
            <textarea
              data-testid="caption-yt"
              rows={7}
              value={yt}
              readOnly={locked}
              onChange={(e) => edit("captionYT", e.target.value)}
              onBlur={() => void flush()}
              className={field}
            />
            <div className="flex items-center justify-between mt-2">
              {!locked ? (
                <button
                  onClick={() => edit("captionYT", null)}
                  className="text-[10.5px] uppercase tracking-[.08em] text-dim hover:text-text cursor-pointer"
                >
                  Use Instagram caption
                </button>
              ) : (
                <span />
              )}
              {yt && <CopyButton text={yt} />}
            </div>
          </>
        ))}

      {tab === "transcript" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-dim">
              {segments.length ? "Click a line to jump there." : reel.transcript ? "" : "No transcript for this reel."}
            </span>
            {(segments.length > 0 || reel.transcript) && (
              <CopyButton
                label="Copy all"
                text={segments.length ? segments.map((s) => s.text).join("\n") : (reel.transcript ?? "")}
              />
            )}
          </div>
          {segments.length > 0
            ? segments.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onSeek?.(s.start)}
                  className={`w-full grid grid-cols-[44px_1fr] gap-2 text-left px-2 py-1.5 cursor-pointer ${
                    i === activeSegment ? "bg-s2 text-text" : "text-body hover:bg-s1"
                  }`}
                >
                  <span className="text-[11px] text-dim tabular-nums pt-px">{fmtStamp(s.start)}</span>
                  <span className="text-[12.5px] leading-[1.55]">{s.text}</span>
                </button>
              ))
            : reel.transcript
                ?.split(/\n+/)
                .map((p, i) => (
                  <p key={i} className="text-[12.5px] leading-[1.55] text-body mb-3">
                    {p}
                  </p>
                ))}
        </>
      )}
    </div>
  );

  const footer =
    state === "DRAFT" || state === "CHECKED" || state === "POSTED" ? (
      <div className={sheet ? "px-5 pb-3" : "border-t border-line px-[26px] pt-[18px] pb-6"}>
        {state === "DRAFT" && (
          <>
            <button
              data-testid="caption-looks-good"
              onClick={() => void looksGood()}
              className="w-full bg-text text-bg text-[11.5px] uppercase tracking-[.1em] py-[15px] cursor-pointer hover:opacity-90"
            >
              Looks good
            </button>
            {!sheet && (
              <p className="text-[11px] text-dim mt-3 leading-relaxed">
                Drafted from the audio. Read it before it goes out. Edits save as you type and Bjur sees them.
              </p>
            )}
          </>
        )}
        {state === "CHECKED" && !sheet && (
          <>
            <div className="flex items-center justify-between border border-line2 px-3.5 py-3 text-[10.5px] uppercase tracking-[.1em]">
              <span>Checked</span>
              <span className="text-dim">
                {meta.captionEditedBy === "ADMIN" ? "Bjur" : "You"}
                {meta.captionEditedAt ? ` · ${shortDate(meta.captionEditedAt)}` : ""}
              </span>
            </div>
            <p className="text-[11px] text-dim mt-3">Still editable. Bjur sees every change.</p>
          </>
        )}
        {state === "POSTED" && (
          <>
            <div className="border border-line px-3.5 py-3 text-[10.5px] uppercase tracking-[.1em] text-dim">
              Posted to Slack{meta.postedToSlackAt ? ` · ${shortDate(meta.postedToSlackAt)}` : ""}
            </div>
            <p className="text-[11px] text-dim mt-3">
              Already sent for posting. Ask in {slackChannel || "your Slack channel"} to change it.
            </p>
          </>
        )}
      </div>
    ) : null;

  return (
    <div data-theme="dark" data-testid={`caption-editor-${variant}`} className={sheet ? "" : "flex flex-col h-full min-h-0"}>
      {header}
      {body}
      {footer}
      <Toast
        message={toast?.message ?? null}
        onDone={() => setToast(null)}
        action={toast?.undo ? { label: "Undo", onClick: toast.undo } : undefined}
      />
    </div>
  );
}
