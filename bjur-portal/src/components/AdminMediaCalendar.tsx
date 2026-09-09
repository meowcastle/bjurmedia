"use client";

import { useMemo, useState } from "react";
import { buildWeeklySlackPost } from "@/lib/slackCalendar";
import { mondayOfWeek } from "@/lib/weeks";
import { IconPrev, IconNext, IconClose, IconCheck } from "@/components/ui/Icon";

/** The subset of an admin Asset this view needs. Mirrors AdminMediaClient's type. */
export type CalendarRow = {
  id: string;
  name: string;
  format: string;
  proxyStatus: "PENDING" | "GENERATING" | "READY" | "FAILED";
  internal: boolean;
  weekOf: string | null;
  contentTitle: string | null;
  caption: string | null;
  captionYT: string | null;
  captionApprovedAt: string | null;
  postedToSlackAt: string | null;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const IG_CAPTION_LIMIT = 2200;

/** UTC-only date maths throughout: weekOf is stored at UTC midnight and
 *  buildWeeklySlackPost formats in UTC, so doing any of this in local time shifts
 *  posts onto the wrong day for anyone west of Greenwich. */
function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

function fmtDay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * What still needs doing before this post is ready to go out. Derived from the fields
 * that exist rather than the PublishState enum in the design handoff — that enum, and
 * the approval/publishing states it carries, need schema and a publisher that aren't
 * built yet. These three say something true today.
 */
function readiness(a: CalendarRow) {
  if (a.postedToSlackAt) return { label: "Posted", color: "var(--success)" };
  const hasTitle = !!a.contentTitle?.trim();
  const hasCaption = !!a.caption?.trim();
  // Written and read are different things. A caption can be complete and still be a
  // draft nobody has looked at, and that is exactly what must not go out.
  if (hasTitle && hasCaption) {
    return a.captionApprovedAt
      ? { label: "Approved", color: "var(--success)" }
      : { label: "Needs review", color: "var(--accentb)" };
  }
  if (hasTitle) return { label: "Needs caption", color: "var(--muted)" };
  return { label: "Needs title", color: "var(--dim)" };
}

export function AdminMediaCalendar({
  rows,
  onPatch,
  projectId,
  canPost = false,
  onPosted,
}: {
  rows: CalendarRow[];
  /** Persists a change and updates the parent's copy — the table and calendar share state. */
  onPatch: (id: string, fields: Partial<CalendarRow>) => Promise<void> | void;
  projectId: string;
  /** True only for projects scheduled on the board. Everything else keeps the
   *  preview-and-copy behaviour this view had before. */
  canPost?: boolean;
  /** Ask the page to refetch, so states land from the server rather than being guessed. */
  onPosted?: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(new Date()));
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ contentTitle: string; caption: string; captionYT: string } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postOk, setPostOk] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // One asset per day, matching buildWeeklySlackPost: it keys by date and keeps the
  // first, so showing more here would promise a calendar the Slack post can't render.
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarRow>();
    for (const a of rows) {
      if (!a.weekOf || a.internal) continue;
      const k = dateKey(new Date(a.weekOf));
      if (!m.has(k)) m.set(k, a);
    }
    return m;
  }, [rows]);

  // How many extra assets share a day with the one shown. buildWeeklySlackPost keeps
  // the first per date, so these are genuinely not going out — worth saying rather
  // than letting the grid imply the day holds one file.
  const overflowByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of rows) {
      if (!a.weekOf || a.internal) continue;
      const k = dateKey(new Date(a.weekOf));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const weekAssets = useMemo(
    () => days.map((d) => byDay.get(dateKey(d))).filter((a): a is CalendarRow => !!a),
    [days, byDay]
  );

  const unscheduled = useMemo(
    () => rows.filter((a) => !a.weekOf && !a.internal && a.proxyStatus === "READY"),
    [rows]
  );

  const slackPreview = useMemo(
    () =>
      buildWeeklySlackPost(
        weekStart,
        weekAssets.map((a) => ({
          weekOf: new Date(a.weekOf!),
          contentTitle: a.contentTitle,
          caption: a.caption,
          captionYT: a.captionYT,
        }))
      ),
    [weekStart, weekAssets]
  );

  const open = openId ? (rows.find((r) => r.id === openId) ?? null) : null;

  function openDrawer(a: CalendarRow) {
    setOpenId(a.id);
    setDraft({
      contentTitle: a.contentTitle ?? "",
      caption: a.caption ?? "",
      captionYT: a.captionYT ?? "",
    });
  }

  async function save() {
    if (!open || !draft) return;
    setSaving(true);
    await onPatch(open.id, {
      contentTitle: draft.contentTitle.trim() || null,
      caption: draft.caption.trim() || null,
      captionYT: draft.captionYT.trim() || null,
    });
    setSaving(false);
    setOpenId(null);
    setDraft(null);
  }

  function onDayDragOver(e: React.DragEvent, key: string) {
    // Both calls are load-bearing: without preventDefault the browser refuses the drop
    // outright, and the drop handler never runs.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDay !== key) setDragOverDay(key);
  }

  async function onDayDrop(e: React.DragEvent, day: Date) {
    e.preventDefault();
    setDragOverDay(null);
    const assetId = e.dataTransfer.getData("text/plain");
    if (assetId) await schedule(assetId, day);
  }

  async function schedule(assetId: string, day: Date) {
    await onPatch(assetId, { weekOf: day.toISOString() });
    setPickerDay(null);
  }

  async function unschedule(a: CalendarRow) {
    await onPatch(a.id, { weekOf: null });
    setOpenId(null);
    setDraft(null);
  }

  async function approveCaption(a: CalendarRow) {
    setSaving(true);
    const res = await fetch(`/api/admin/assets/${a.id}/approve-caption`, { method: "POST" });
    setSaving(false);
    if (!res.ok) return;
    await onPatch(a.id, { captionApprovedAt: new Date().toISOString() });
  }

  async function unapproveCaption(a: CalendarRow) {
    setSaving(true);
    const res = await fetch(`/api/admin/assets/${a.id}/approve-caption`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return;
    await onPatch(a.id, { captionApprovedAt: null });
  }

  async function postWeek() {
    setPosting(true);
    setPostError(null);
    setPostOk(null);
    const res = await fetch("/api/admin/slack/post-week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, weekStart: dateKey(weekStart) }),
    });
    const data = await res.json().catch(() => ({}));
    setPosting(false);
    if (!res.ok) {
      setPostError(data.error ?? "That didn't go through.");
      return;
    }
    setPostOk(`Posted ${data.posted} to ${data.channel}`);
    onPosted?.();
  }

  async function copyPreview() {
    await navigator.clipboard.writeText(slackPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const todayKey = dateKey(new Date());

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
      <div>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="text-xl font-extrabold">Week of {fmtDay(weekStart)}</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              aria-label="Previous week"
              className="border border-line2 px-3 py-2 text-sm text-muted hover:text-text hover:border-text"
            >
              <IconPrev />
            </button>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              aria-label="Next week"
              className="border border-line2 px-3 py-2 text-sm text-muted hover:text-text hover:border-text"
            >
              <IconNext />
            </button>
          </div>
          <button
            onClick={() => setWeekStart(mondayOfWeek(new Date()))}
            className="border border-line2 px-3 py-2 text-[11px] uppercase font-bold text-muted hover:text-text hover:border-text"
          >
            Today
          </button>

          <div className="flex items-center gap-3.5 ml-auto text-[10.5px] text-dim">
            {(canPost
              ? [
                  { label: "Approved", color: "var(--success)" },
                  { label: "Needs review", color: "var(--accentb)" },
                  { label: "Needs caption", color: "var(--muted)" },
                  { label: "Needs title", color: "var(--dim)" },
                ]
              : [
                  { label: "Ready", color: "var(--success)" },
                  { label: "Needs caption", color: "var(--muted)" },
                  { label: "Needs title", color: "var(--dim)" },
                ]
            ).map((s) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {unscheduled.length > 0 && (
          <div className="mb-3 border border-line2" data-testid="unscheduled-tray">
            <div className="px-3 py-2 border-b border-line text-[10.5px] uppercase tracking-wide font-bold text-muted flex items-center gap-2">
              Unscheduled
              <span className="text-accentb tabular-nums">{unscheduled.length}</span>
              {/* Said plainly: drag is a mouse affordance, and the picker in each day
                  is the way through on a phone. */}
              <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-dim">
                Drag onto a day, or use + schedule
              </span>
            </div>
            <div className="flex gap-2 p-2.5 overflow-x-auto">
              {unscheduled.map((u) => (
                <div
                  key={u.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", u.id)}
                  data-testid="tray-card"
                  data-asset-id={u.id}
                  title={u.name}
                  className="flex-none w-[170px] border border-line2 bg-s2 px-2.5 py-2 cursor-grab active:cursor-grabbing hover:border-text"
                >
                  <div className="text-[11px] font-semibold truncate">{u.name}</div>
                  <div className="text-[10px] text-dim">{u.format}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-line border border-line">
          {days.map((d, i) => {
            const key = dateKey(d);
            const a = byDay.get(key);
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                data-day={key}
                onDragOver={(e) => onDayDragOver(e, key)}
                onDragLeave={() => setDragOverDay((c) => (c === key ? null : c))}
                onDrop={(e) => onDayDrop(e, d)}
                className={`min-w-0 md:min-h-[260px] p-2.5 ${
                  dragOverDay === key ? "bg-s3 outline outline-1 outline-text" : isToday ? "bg-s1" : "bg-bg"
                }`}
              >
                <div
                  className={`text-[10.5px] uppercase font-bold mb-2 ${isToday ? "text-accent" : "text-dim"}`}
                >
                  {DAY_NAMES[i]} {d.getUTCDate()}
                </div>

                {a ? (
                  <button
                    onClick={() => openDrawer(a)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}
                    data-testid="calendar-card"
                    className={`w-full text-left border p-2 ${
                      openId === a.id ? "border-accent" : "border-line2"
                    } bg-s2 hover:border-text`}
                  >
                    <div className="text-[11px] font-extrabold uppercase leading-tight break-words">
                      {a.contentTitle?.trim() || "Untitled"}
                    </div>
                    <div className="text-[10px] text-dim mt-1 truncate" title={a.name}>
                      {a.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span
                        className="w-1.5 h-1.5 flex-none"
                        style={{ background: readiness(a).color }}
                      />
                      <span className="text-[10px] text-muted">{readiness(a).label}</span>
                    </div>
                    {(overflowByDay.get(key) ?? 0) > 1 && (
                      <div className="text-[10px] text-accentb mt-1">
                        +{(overflowByDay.get(key) ?? 0) - 1} more on this day — not posted
                      </div>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setPickerDay(key)}
                    className="w-full border border-dashed border-line2 py-3 text-[11px] text-dim hover:text-text hover:border-text"
                  >
                    + schedule
                  </button>
                )}

                {pickerDay === key && (
                  <div className="mt-2 border border-line2 bg-s2 max-h-56 overflow-auto">
                    {unscheduled.length === 0 ? (
                      <div className="p-3 text-[11px] text-dim">
                        No unscheduled files with a ready proxy.
                      </div>
                    ) : (
                      unscheduled.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => schedule(u.id, d)}
                          className="block w-full text-left px-2.5 py-2 border-b border-line last:border-0 hover:bg-s3"
                        >
                          <div className="text-[11px] font-semibold truncate">{u.name}</div>
                          <div className="text-[10px] text-dim">{u.format}</div>
                        </button>
                      ))
                    )}
                    <button
                      onClick={() => setPickerDay(null)}
                      className="w-full px-2.5 py-2 text-[10.5px] text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">
        {open && draft ? (
          <div className="border border-line2 bg-s1 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="text-[11px] uppercase tracking-wide font-bold text-muted">
                {open.weekOf
                  ? new Date(open.weekOf).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })
                  : "Unscheduled"}
              </div>
              <button
                onClick={() => {
                  setOpenId(null);
                  setDraft(null);
                }}
                aria-label="Close"
                className="text-muted hover:text-text text-sm leading-none"
              >
                <IconClose />
              </button>
            </div>

            <div className="text-[11px] text-dim mb-3 truncate" title={open.name}>
              {open.name} · {open.format}
            </div>

            <label className="block text-[10.5px] uppercase tracking-wide font-bold text-muted mb-1.5">
              Title (Slack line)
            </label>
            <input
              value={draft.contentTitle}
              onChange={(e) => setDraft({ ...draft, contentTitle: e.target.value })}
              placeholder="TOVA (FAM ONLY)"
              className="w-full bg-bg border border-line2 text-text text-[13px] font-bold uppercase px-2.5 py-2 mb-4 outline-none focus:border-accent"
            />

            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-[10.5px] uppercase tracking-wide font-bold text-muted">
                Instagram caption
              </label>
              <span
                className={`text-[10px] ${
                  draft.caption.length > IG_CAPTION_LIMIT ? "text-accentb" : "text-dim"
                }`}
              >
                {draft.caption.length} / {IG_CAPTION_LIMIT}
              </span>
            </div>
            <textarea
              value={draft.caption}
              onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
              rows={5}
              placeholder="Caption + hashtags"
              className="w-full bg-bg border border-line2 text-text text-[13px] px-2.5 py-2 mb-4 outline-none focus:border-accent resize-y"
            />

            <label className="block text-[10.5px] uppercase tracking-wide font-bold text-muted mb-1.5">
              YouTube caption <span className="text-dim normal-case">— only if it differs</span>
            </label>
            <textarea
              value={draft.captionYT}
              onChange={(e) => setDraft({ ...draft, captionYT: e.target.value })}
              rows={3}
              placeholder="Leave empty to use the Instagram caption for both"
              className="w-full bg-bg border border-line2 text-text text-[13px] px-2.5 py-2 mb-4 outline-none focus:border-accent resize-y"
            />

            {/* Sign-off is what lets the week go out. Separate from Save because the
                question is not "is this written" but "has a person read it" — the two
                come apart precisely when the copy was drafted by the model. */}
            {canPost && (
              <div className="border border-line2 p-3 mb-4">
                {open.postedToSlackAt ? (
                  <div className="text-[11px] text-success font-bold uppercase tracking-wide">
                    Posted to Slack
                  </div>
                ) : open.captionApprovedAt ? (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-success font-bold uppercase tracking-wide">
                      Caption approved
                    </span>
                    <button
                      onClick={() => unapproveCaption(open)}
                      disabled={saving}
                      className="cursor-pointer text-[10.5px] uppercase font-bold text-muted hover:text-text"
                    >
                      Undo
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => approveCaption(open)}
                    disabled={saving || !(open.contentTitle?.trim() || open.caption?.trim())}
                    data-testid="approve-caption"
                    className="cursor-pointer w-full border border-line2 hover:border-text disabled:opacity-40 text-[11px] uppercase font-bold py-2"
                  >
                    Approve caption
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving || draft.caption.length > IG_CAPTION_LIMIT}
                className="flex-1 bg-text hover:bg-accent disabled:opacity-50 text-bg text-[11px] uppercase font-bold py-2.5"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => unschedule(open)}
                className="border border-line2 text-muted hover:text-text hover:border-text text-[11px] uppercase font-bold px-3 py-2.5"
              >
                Unschedule
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-line bg-s1 p-4 text-[12px] text-dim">
            Pick a day to see and edit what goes out that morning.
          </div>
        )}

        <div className="border border-line bg-s1 p-4 mt-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[10.5px] uppercase tracking-wide font-bold text-muted">
              Slack post preview
            </div>
            <button
              onClick={copyPreview}
              className="cursor-pointer text-[10.5px] uppercase font-bold text-muted hover:text-text px-2.5 py-2 -mr-2.5 -my-1"
            >
              {copied ? (
                <span className="inline-flex items-center gap-1">
                  Copied <IconCheck />
                </span>
              ) : (
                "Copy"
              )}
            </button>
          </div>
          <pre className="bg-bg border border-line2 p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-72 overflow-auto text-muted">
            {slackPreview}
          </pre>
          {canPost ? (
            <>
              <button
                onClick={postWeek}
                disabled={posting}
                data-testid="post-week"
                className="cursor-pointer w-full mt-3 bg-text hover:bg-accent disabled:opacity-50 text-bg text-[11px] uppercase font-bold py-2.5"
              >
                {posting ? "Posting…" : "Post week to Slack"}
              </button>
              {postError && (
                <div className="text-[11px] text-accentb font-semibold mt-2">{postError}</div>
              )}
              {postOk && <div className="text-[11px] text-success font-semibold mt-2">{postOk}</div>}
              <div className="text-[10px] text-dim mt-2.5">
                Goes out when you press it — every caption has to be approved first.
              </div>
            </>
          ) : (
            <div className="text-[10px] text-dim mt-2.5">
              Exactly what auto-post sends for this week. Turn it on per client in
              Integrations → Slack.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
