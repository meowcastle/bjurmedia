"use client";

import { useState } from "react";
import { gradientFor } from "@/lib/gradients";
import { IconPlay } from "@/components/ui/Icon";

export type ScheduledPost = {
  id: string;
  name: string;
  kind: "PHOTO" | "VIDEO";
  thumbReady: boolean;
  contentTitle: string | null;
  caption: string | null;
  publishAt: string | null;
  publishIg: boolean;
  publishYt: boolean;
  publishState: "NONE" | "DRAFT" | "AWAITING" | "APPROVED" | "PUBLISHING" | "PUBLISHED" | "FAILED";
  approvalDueAt: string | null;
  heldAt: string | null;
  viewCount: number | null;
};

export type PostsView = "week" | "published" | "files";

const STATE_LABEL: Record<ScheduledPost["publishState"], string> = {
  NONE: "Not scheduled",
  DRAFT: "On hold",
  AWAITING: "Needs your OK",
  APPROVED: "Approved",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  FAILED: "Failed",
};

const STATE_TONE: Record<ScheduledPost["publishState"], string> = {
  NONE: "text-dim",
  DRAFT: "text-accentb",
  AWAITING: "text-accentb",
  APPROVED: "text-success",
  PUBLISHING: "text-muted",
  PUBLISHED: "text-success",
  FAILED: "text-accentb",
};

function dayKicker(iso: string) {
  const d = new Date(iso);
  return d
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

function clockOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function platforms(p: ScheduledPost) {
  const list = [p.publishIg && "Instagram", p.publishYt && "YouTube"].filter(Boolean);
  return list.length ? list.join(" + ") : "No platform set";
}

/**
 * §13. The client's view of what is going out on their channels.
 *
 * Approve and Hold are owner-only, matching the API and the approval email, which is
 * addressed to the owner. Other seats still see the schedule — knowing what is queued is
 * useful to anyone on the account — they just cannot clear it.
 */
export function ClientPostsPanel({
  projectId,
  posts,
  role,
  view,
  onViewChange,
}: {
  projectId: string;
  posts: ScheduledPost[];
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
  view: PostsView;
  onViewChange: (v: PostsView) => void;
}) {
  const [rows, setRows] = useState(posts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");

  const awaiting = rows.filter((p) => p.publishState === "AWAITING");
  const published = rows.filter((p) => p.publishState === "PUBLISHED");
  const upcoming = rows.filter((p) => p.publishState !== "PUBLISHED");
  const shown = view === "published" ? published : upcoming;

  async function act(post: ScheduledPost, action: "approve" | "hold" | "caption", caption?: string) {
    setBusyId(post.id);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/posts/${post.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, caption }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "That didn't go through. Try again.");
      return;
    }
    const body = (await res.json()) as Partial<ScheduledPost>;
    setRows((rs) => rs.map((r) => (r.id === post.id ? { ...r, ...body } : r)));
    setEditingId(null);
  }

  return (
    <div data-testid="client-posts">
      {/* The banner is how someone who came to download files finds out something is
          waiting on them — it is not shown once nothing is. */}
      {awaiting.length > 0 && (
        <div
          data-testid="approval-banner"
          className="bg-s1 border border-line2 px-4 py-[14px] mb-5 flex items-center gap-4 flex-wrap"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[11px] tracking-[0.18em] uppercase font-bold text-accentb">
              {awaiting.length} post{awaiting.length > 1 ? "s need" : " needs"} your OK
            </div>
            <div className="text-[13px] text-muted mt-1">
              {awaiting[0].approvalDueAt
                ? `Auto-publishes ${dayKicker(awaiting[0].approvalDueAt)} ${clockOf(
                    awaiting[0].approvalDueAt
                  )} unless you hold ${awaiting.length > 1 ? "them" : "it"}.`
                : "Waiting on you before anything goes out."}
            </div>
          </div>
          <button
            onClick={() => onViewChange("week")}
            className="cursor-pointer text-[12px] font-semibold bg-accent text-bg px-4 py-2 flex-none"
          >
            Review
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {(
          [
            ["week", "This week"],
            ["published", "Published"],
            ["files", "All files"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onViewChange(key)}
            aria-pressed={view === key}
            className={`cursor-pointer text-[12px] font-semibold px-3.5 py-2 border ${
              view === key
                ? "border-text text-text"
                : "border-line2 text-muted hover:text-text hover:border-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view !== "files" && (
        <div className="border border-line bg-s1 mb-8">
          {error && <div className="px-5 py-3 text-[12px] text-accentb border-b border-line">{error}</div>}

          {shown.length === 0 ? (
            <div className="px-5 py-6 text-[13px] text-muted">
              {view === "published" ? "Nothing has gone out yet." : "Nothing scheduled right now."}
            </div>
          ) : (
            shown.map((p) => (
              <div
                key={p.id}
                data-testid={`post-row-${p.id}`}
                className="flex items-start gap-4 px-5 py-4 border-b border-line last:border-b-0 flex-wrap"
              >
                <div
                  className="w-14 h-[74px] relative flex-none overflow-hidden"
                  style={{ background: gradientFor(p.id) }}
                >
                  {p.thumbReady && (
                    // eslint-disable-next-line @next/next/no-img-element -- proxied binary from our own API, not a static asset Next can optimize
                    <img
                      src={`/api/assets/${p.id}/thumb`}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  {p.kind === "VIDEO" && (
                    <div className="absolute inset-0 grid place-items-center text-white/90 text-[11px] drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">
                      <IconPlay fill="currentColor" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-[10px] tracking-[0.16em] uppercase font-bold text-dim">
                      {p.publishAt ? dayKicker(p.publishAt) : "Unscheduled"}
                    </span>
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${STATE_TONE[p.publishState]}`}>
                      {STATE_LABEL[p.publishState]}
                    </span>
                  </div>
                  <div className="text-[14px] font-extrabold mt-1 truncate">
                    {p.contentTitle || p.name}
                  </div>
                  <div className="text-[12px] text-muted mt-0.5">
                    {platforms(p)}
                    {p.publishAt ? ` · ${clockOf(p.publishAt)}` : ""}
                  </div>

                  {editingId === p.id ? (
                    <div className="mt-2">
                      <textarea
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value)}
                        rows={3}
                        aria-label={`Caption for ${p.contentTitle || p.name}`}
                        className="w-full bg-bg border border-line2 text-[12px] text-text px-2 py-1.5 outline-none focus:border-accent resize-y"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => act(p, "caption", captionDraft)}
                          disabled={busyId === p.id}
                          className="cursor-pointer text-[11px] font-semibold bg-accent text-bg px-3 py-1.5 disabled:opacity-40"
                        >
                          {busyId === p.id ? "Saving…" : "Save caption"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text px-3 py-1.5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[12px] text-dim mt-1.5 line-clamp-2">
                      {p.publishState === "PUBLISHED" && p.viewCount != null
                        ? `${p.viewCount.toLocaleString("en-US")} views so far`
                        : p.caption || "No caption yet."}
                    </div>
                  )}
                </div>

                {role === "OWNER" && editingId !== p.id && (
                  <div className="flex items-center gap-2 flex-wrap flex-none">
                    {p.publishState === "AWAITING" && (
                      <>
                        <button
                          onClick={() => act(p, "approve")}
                          disabled={busyId === p.id}
                          className="cursor-pointer text-[11px] font-semibold text-text border border-text px-3 py-1.5 disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => act(p, "hold")}
                          disabled={busyId === p.id}
                          className="cursor-pointer text-[11px] font-semibold text-muted hover:text-accentb border border-line2 hover:border-accentb px-3 py-1.5 disabled:opacity-40"
                        >
                          Hold
                        </button>
                      </>
                    )}
                    {p.publishState !== "PUBLISHED" && p.publishState !== "PUBLISHING" && (
                      <button
                        onClick={() => {
                          setEditingId(p.id);
                          setCaptionDraft(p.caption ?? "");
                        }}
                        className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text px-2 py-1.5"
                      >
                        Edit caption
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
