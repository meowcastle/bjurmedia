"use client";

import { useMemo, useState } from "react";
import { buildWeeklySlackPost } from "@/lib/slackCalendar";
import { mondayOfWeek } from "@/lib/weeks";

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
  const hasTitle = !!a.contentTitle?.trim();
  const hasCaption = !!a.caption?.trim();
  if (hasTitle && hasCaption) return { label: "Ready", color: "var(--success)" };
  if (hasTitle) return { label: "Needs caption", color: "var(--muted)" };
  return { label: "Needs title", color: "var(--dim)" };
}

export function AdminMediaCalendar({
  rows,
  onPatch,
}: {
  rows: CalendarRow[];
  /** Persists a change and updates the parent's copy — the table and calendar share state. */
  onPatch: (id: string, fields: Partial<CalendarRow>) => Promise<void> | void;
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(new Date()));
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ contentTitle: string; caption: string; captionYT: string } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function schedule(assetId: string, day: Date) {
    await onPatch(assetId, { weekOf: day.toISOString() });
    setPickerDay(null);
  }

  async function unschedule(a: CalendarRow) {
    await onPatch(a.id, { weekOf: null });
    setOpenId(null);
    setDraft(null);
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
              className="border border-line2 px-2.5 py-1 text-sm text-muted hover:text-text hover:border-text"
            >
              ‹
            </button>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              aria-label="Next week"
              className="border border-line2 px-2.5 py-1 text-sm text-muted hover:text-text hover:border-text"
            >
              ›
            </button>
          </div>
          <button
            onClick={() => setWeekStart(mondayOfWeek(new Date()))}
            className="border border-line2 px-3 py-1 text-[11px] uppercase font-bold text-muted hover:text-text hover:border-text"
          >
            Today
          </button>

          <div className="flex items-center gap-3.5 ml-auto text-[10.5px] text-dim">
            {[
              { label: "Ready", color: "var(--success)" },
              { label: "Needs caption", color: "var(--muted)" },
              { label: "Needs title", color: "var(--dim)" },
            ].map((s) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-line border border-line">
          {days.map((d, i) => {
            const key = dateKey(d);
            const a = byDay.get(key);
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                data-day={key}
                className={`min-w-0 md:min-h-[260px] p-2.5 ${isToday ? "bg-s1" : "bg-bg"}`}
              >
                <div
                  className={`text-[10.5px] uppercase font-bold mb-2 ${isToday ? "text-accent" : "text-dim"}`}
                >
                  {DAY_NAMES[i]} {d.getUTCDate()}
                </div>

                {a ? (
                  <button
                    onClick={() => openDrawer(a)}
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
                ✕
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

            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving || draft.caption.length > IG_CAPTION_LIMIT}
                className="flex-1 bg-accent hover:bg-accentb disabled:opacity-50 text-bg text-[11px] uppercase font-bold py-2.5"
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
              className="text-[10.5px] uppercase font-bold text-muted hover:text-text"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <pre className="bg-bg border border-line2 p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-72 overflow-auto text-muted">
            {slackPreview}
          </pre>
          <div className="text-[10px] text-dim mt-2.5">
            Exactly what auto-post sends for this week. Turn it on per client in
            Integrations → Slack.
          </div>
        </div>
      </div>
    </div>
  );
}
