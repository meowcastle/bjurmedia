"use client";

import { usePresence } from "@/components/ui/usePresence";
import { DUR, EASE_OUT } from "@/lib/motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AssetTile, type TileAsset } from "@/components/AssetTile";
import {
  ClientPostsPanel,
  type ScheduledPost,
  type PostsView,
} from "@/components/ClientPostsPanel";
import { haptic } from "@/lib/haptics";
import { ImageViewer } from "@/components/ImageViewer";
import { VideoViewer } from "@/components/VideoViewer";
import type { ReelCopy, CopyPatch } from "@/components/CaptionEditor";
import { captionState, type CaptionState } from "@/lib/captionState";
import { mondayOfWeek as mondayOfWeekDate } from "@/lib/weeks";
import { fileStamp, formatViews, formatBytes } from "@/lib/format";
import { IconPlay, IconHeart } from "@/components/ui/Icon";
import { PhoneSaveButtons, phoneSaveAvailable, usePhoneSave } from "@/components/PhoneSave";


type Asset = TileAsset & {
  weekOf: string | null;
  folderId: string | null;
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
  publishAt: string | null;
  publishIg: boolean;
  publishYt: boolean;
  publishState: ScheduledPost["publishState"];
};

const FORMAT_DEFS: [string, string][] = [
  ["Reel", "Reels"],
  ["Film", "Films"],
  ["Still", "Stills"],
  ["Master", "Master"],
];

function colsFor(format: string) {
  if (format === "Reel") return "repeat(auto-fill,minmax(180px,1fr))";
  if (format === "Still") return "repeat(auto-fill,minmax(270px,1fr))";
  return "repeat(auto-fill,minmax(340px,1fr))";
}

/** The browser does the transfer, so the zip lands in Downloads with the browser's own
 * progress as soon as the first byte arrives. It used to be read into a blob in the page
 * first, which kept a multi-gigabyte gallery out of Downloads until the very end, and
 * on a phone or a big project the tab ran out of memory and nothing landed at all. */
function DownloadButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer inline-flex items-center gap-2 font-bold text-[13px] text-bg bg-text hover:bg-accent px-5 py-3.5"
    >
      {label}
    </button>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

/** Monday (UTC midnight) of the calendar week containing `d`, as an ISO date string. */
function mondayOfWeek(d: Date) {
  return mondayOfWeekDate(d).toISOString();
}

type Group = {
  label: string;
  count: string;
  /** Replaces "count · size" in the header, for views where size is beside the point. */
  summary?: string;
  folder: string;
  cols: string;
  items: Asset[];
};

function isReel(a: Asset) {
  return a.kind === "VIDEO" && a.format === "Reel";
}

function reelCaptionState(a: Asset): CaptionState | null {
  return isReel(a) ? captionState(a) : null;
}

/** The tile's caption line, per state. No line at all when there is nothing to say. */
const CAPTION_LINE: Record<CaptionState, { label: string; action: string; color: string }> = {
  DRAFT: { label: "Needs review", action: "Check", color: "var(--warn)" },
  CHECKED: { label: "Caption · checked", action: "Edit", color: "var(--muted)" },
  POSTED: { label: "Caption · posted", action: "View", color: "var(--dim)" },
  NO_SPEECH: { label: "No caption", action: "Write", color: "var(--dim)" },
};

/** Buckets assets by the Monday of their weekOf's calendar week, newest first, Undated last. */
function bucketByWeek(items: Asset[], folderBase: string): Group[] {
  const byWeek = new Map<string, Asset[]>();
  for (const a of items) {
    const key = a.weekOf ? mondayOfWeek(new Date(a.weekOf)) : "Undated";
    const list = byWeek.get(key) ?? [];
    list.push(a);
    byWeek.set(key, list);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => {
      if (a === "Undated") return 1;
      if (b === "Undated") return -1;
      return b.localeCompare(a);
    })
    .map(([w, weekItems]) => {
      const label = w === "Undated" ? w : `Week of ${fmtDate(w)}`;
      return {
        label,
        count: `${weekItems.length} file${weekItems.length > 1 ? "s" : ""}`,
        folder: `${folderBase}/${label.replace(/\s+/g, "-")}`,
        cols: "repeat(auto-fill,minmax(190px,1fr))",
        items: weekItems,
      };
    });
}

export function ProjectDetailClient({
  project,
  assets: initialAssets,
  initialFavorites,
  role,
  totalViews,
  totalSocialPosts,
}: {
  project: {
    id: string;
    title: string;
    path: string;
    clientName: string;
    deliveredAt: string | null;
    expiresAt: string | null;
    /** Everything here streams and downloads watermarked until the invoice is settled. */
    paymentHold: boolean;
    /** Where a posted week went, named in the note on a locked caption. */
    slackChannel: string | null;
    folders: { id: string; name: string }[];
  };
  assets: Asset[];
  initialFavorites: string[];
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
  totalViews: number;
  totalSocialPosts: number;
}) {
  // Local, because captions are edited in place: a save updates the tile line and the
  // "to check" count without a reload.
  const [assets, setAssets] = useState(initialAssets);
  const onCopyChange = useCallback((id: string, patch: CopyPatch) => {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const reelCopy = useCallback(
    (id: string): ReelCopy | null => {
      const a = assetById.get(id);
      if (!a || !isReel(a)) return null;
      return {
        id: a.id,
        contentTitle: a.contentTitle,
        caption: a.caption,
        captionYT: a.captionYT,
        captionSource: a.captionSource,
        transcriptStatus: a.transcriptStatus,
        postedToSlackAt: a.postedToSlackAt,
        captionEditedBy: a.captionEditedBy,
        captionEditedAt: a.captionEditedAt,
        transcript: a.transcript,
        transcriptSegments: a.transcriptSegments,
      };
    },
    [assetById],
  );

  // §13. Anything with a publish date is a post as far as the client is concerned.
  const scheduled: ScheduledPost[] = assets
    .filter((a) => a.publishState !== "NONE")
    .sort((x, y) => (x.publishAt ?? "").localeCompare(y.publishAt ?? ""));

  // "All files" stays the default even when posts are waiting: someone who came here to
  // download should still land on the gallery. The banner is what redirects them.
  const [postsView, setPostsView] = useState<PostsView>("files");

  const [filter, setFilter] = useState<string>("ALL");
  const [folderFilter, setFolderFilter] = useState<string>("ALL");

  const folderScoped = useMemo(
    () =>
      folderFilter === "ALL"
        ? assets
        : assets.filter((a) => a.folderId === folderFilter),
    [assets, folderFilter],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bar = usePresence(selected.size > 0, 200);
  const [favorites, setFavorites] = useState<Set<string>>(
    new Set(initialFavorites),
  );
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  // Grouped by format only. The By Week toggle, the Wide/Vertical filter and the
  // past-years accordion each added a control for a question few clients asked.
  const scoped = folderScoped;

  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  // The run the viewer swipes through, fixed when it opens. Under "Captions to check" a
  // reel leaves the grid the moment it is checked; if the viewer followed the grid, the
  // reel being read would vanish out from under the person reading it.
  const [viewerIds, setViewerIds] = useState<string[]>([]);

  // "New" badges compare each asset's createdAt against the timestamp of the client's
  // previous visit to *this* project, stored locally (no per-user "last viewed"
  // column in the DB — this is a lightweight per-device heuristic, not a synced
  // read-tracking system, so switching devices won't carry the same New badges).
  // Null on a first-ever visit deliberately suppresses badges entirely — everything
  // being "new" to a first-time visitor isn't a meaningful signal to highlight.
  const [lastVisit, setLastVisit] = useState<string | null>(null);
  useEffect(() => {
    const key = `bjur:lastVisit:${project.id}`;
    // Textbook "sync with an external system" (localStorage isn't readable during
    // render/SSR), exactly the pattern React's own docs sanction for useEffect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastVisit(localStorage.getItem(key));
    localStorage.setItem(key, new Date().toISOString());
  }, [project.id]);

  const canDownload = role !== "VIEWER";
  const zipUrl = `/api/projects/${project.id}/download-all`;

  const phoneSave = usePhoneSave();

  function downloadAll() {
    // On a phone, Download all selects everything instead, so the bar can offer Photos
    // or Files — a zip alone never reaches the camera roll.
    if (phoneSaveAvailable()) {
      setSelected(new Set(scoped.map((a) => a.id)));
      return;
    }
    const a = document.createElement("a");
    a.href = zipUrl;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** A form POST rather than fetch, for the same reason as Download all: the response
   * is an attachment, so the page stays put and the browser saves the stream. */
  function downloadSelected() {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = zipUrl;
    for (const id of selected) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "assetIds";
      input.value = id;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    form.remove();
  }

  async function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleFavorite(id: string) {
    haptic();
    const wasFav = favorites.has(id);
    setFavorites((f) => {
      const next = new Set(f);
      if (wasFav) next.delete(id);
      else next.add(id);
      return next;
    });
    await fetch(`/api/assets/${id}/favorite`, { method: "POST" }).catch(() => {
      setFavorites((f) => {
        const next = new Set(f);
        if (wasFav) next.add(id);
        else next.delete(id);
        return next;
      });
    });
  }

  const bytesOf = (items: Asset[]) =>
    items.reduce((n, a) => n + Number(a.sizeBytes), 0);
  const totalBytes = useMemo(() => bytesOf(scoped), [scoped]);
  const selectedAssets = useMemo(
    () => scoped.filter((a) => selected.has(a.id)),
    [scoped, selected],
  );

  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of scoped) counts[a.format] = (counts[a.format] ?? 0) + 1;
    return counts;
  }, [scoped]);

  const favCount = useMemo(
    () => scoped.filter((a) => favorites.has(a.id)).length,
    [scoped, favorites],
  );

  const draftCount = useMemo(
    () => scoped.filter((a) => reelCaptionState(a) === "DRAFT").length,
    [scoped],
  );

  const filters = [
    { id: "ALL", label: `All ${scoped.length}`, icon: null as React.ReactNode },
    ...FORMAT_DEFS.filter((d) => formatCounts[d[0]]).map((d) => ({
      id: d[0],
      label: `${d[1].split(" · ")[0]} ${formatCounts[d[0]]}`,
      icon: null as React.ReactNode,
    })),
    {
      id: "FAV",
      label: `Favorites${favCount ? ` ${favCount}` : ""}`,
      icon: <IconHeart fill="currentColor" />,
    },
    // Stays while it is the view in use, so checking the last draft shows the all-clear
    // rather than yanking the tab away; it is gone on the next load.
    ...(draftCount > 0 || filter === "CHECK"
      ? [
          {
            id: "CHECK",
            label: `Needs review${draftCount ? ` ${draftCount}` : ""}`,
            icon: <span aria-hidden className="inline-block w-1.5 h-1.5 bg-warn" /> as React.ReactNode,
          },
        ]
      : []),
  ];

  const groups: Group[] = useMemo(() => {
    if (filter === "CHECK") {
      return bucketByWeek(
        scoped.filter((a) => reelCaptionState(a) === "DRAFT"),
        `${project.path}/check`,
      ).map((g) => ({ ...g, summary: `${g.items.length} to check` }));
    }
    if (filter === "FAV") {
      const items = scoped.filter((a) => favorites.has(a.id));
      return items.length
        ? [
            {
              label: "Favorites",
              count: `${items.length} file${items.length > 1 ? "s" : ""}`,
              folder: project.path,
              cols: "repeat(auto-fill,minmax(220px,1fr))",
              items,
            },
          ]
        : [];
    }
    return FORMAT_DEFS.filter((d) => filter === "ALL" || filter === d[0])
      .map((d) => {
        const items = scoped.filter((a) => a.format === d[0]);
        return {
          label: d[1],
          count: `${items.length} file${items.length > 1 ? "s" : ""}`,
          folder: `${project.path}/${d[0]}`,
          cols: colsFor(d[0]),
          items,
        };
      })
      .filter((g) => g.items.length);
  }, [filter, scoped, favorites, project.path]);

  const visibleIds = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => i.id)),
    [groups],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  // Follows the same grouped/filtered visual order the grid is actually rendered in
  // (week or format buckets, current filter) rather than raw upload order, so swipe
  // navigation in the video/photo viewers matches what's on screen.
  const videoOrder = useMemo(
    () => groups.flatMap((g) => g.items.filter((i) => i.kind === "VIDEO")),
    [groups],
  );
  const videoNavItems = useMemo(
    () =>
      viewerIds.flatMap((id) => {
        const v = assetById.get(id);
        return v ? [v] : [];
      }).map((v) => ({
        id: v.id,
        name: v.name,
        // Every download control states its size, per the handoff's global rule.
        size: formatBytes(Number(v.sizeBytes)),
        format: v.format,
        dims: v.dims,
        durationSec: v.durationSec,
        weekLabel: v.weekOf
          ? `Week of ${new Date(mondayOfWeek(new Date(v.weekOf))).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
          : null,
        added: fileStamp(v.createdAt, v.updatedAt),
      })),
    [viewerIds, assetById],
  );
  const photoOrder = useMemo(
    () => groups.flatMap((g) => g.items.filter((i) => i.kind === "PHOTO")),
    [groups],
  );
  const photoNavItems = useMemo(
    () =>
      photoOrder.map((p) => ({
        id: p.id,
        name: p.name,
        detail: `${formatBytes(Number(p.sizeBytes))} · ${fileStamp(p.createdAt, p.updatedAt)}`,
      })),
    [photoOrder],
  );

  function openAsset(a: Asset) {
    if (a.kind === "VIDEO") {
      setViewerIds(videoOrder.map((v) => v.id));
      setOpenVideoId(a.id);
    } else {
      setOpenPhotoId(a.id);
    }
  }

  function captionLine(a: Asset) {
    const state = reelCaptionState(a);
    if (!state) return null;
    const line = CAPTION_LINE[state];
    return (
      <button
        type="button"
        data-testid={`caption-line-${a.id}`}
        data-state={state}
        onClick={() => openAsset(a)}
        className="group w-full mt-2 pt-2 pb-1.5 min-h-8 border-t border-line flex items-center gap-2 text-[10.5px] tracking-[.08em] uppercase cursor-pointer text-left whitespace-nowrap"
      >
        <span aria-hidden className="w-1.5 h-1.5 flex-none" style={{ background: line.color }} />
        <span className="group-hover:!text-text truncate min-w-0" style={{ color: line.color }}>
          {line.label}
        </span>
        <span className="ml-auto text-dim2 whitespace-nowrap flex-none">{line.action}</span>
      </button>
    );
  }

  function renderGroup(grp: Group) {
    return (
      <motion.div
        layout
        key={grp.folder}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR[2], ease: EASE_OUT }}
        className="mb-9"
      >
        <div className="flex items-baseline gap-3 border-b border-line pb-2.5 mb-4">
          <span className="text-[15px] font-extrabold">{grp.label}</span>
          <span className="text-[11px] text-muted">
            {grp.summary ?? `${grp.count} · ${formatBytes(bytesOf(grp.items))}`}
          </span>
        </div>
        <div
          className="grid gap-4 items-start"
          style={{ gridTemplateColumns: grp.cols }}
        >
          {grp.items.map((a, i) => (
            <AssetTile
              key={a.id}
              asset={a}
              index={i}
              isNew={
                lastVisit != null && new Date(a.createdAt) > new Date(lastVisit)
              }
              selected={selected.has(a.id)}
              favorite={favorites.has(a.id)}
              onToggleSelect={() => toggleSelect(a.id)}
              onToggleFavorite={() => toggleFavorite(a.id)}
              onOpen={() => openAsset(a)}
              footer={captionLine(a)}
            />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 pt-6 md:pt-8 pb-32 max-w-[1500px] mx-auto bjfade">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-text mb-6 py-2.5 -my-2.5"
      >
        ← All projects
      </Link>

      <div className="flex items-end justify-between gap-6 flex-wrap border-b-2 border-line2 pb-6 mb-2">
        <div>
          <h1 className="bj-serif text-[28px] sm:text-4xl font-normal mb-3.5">
            {project.title}
          </h1>
          <div className="flex items-center gap-4 text-[13px] text-muted flex-wrap">
            <span>Delivered {fmtDate(project.deliveredAt)}</span>
            {project.expiresAt && (
              <>
                <span className="w-1 h-1 rounded-full bg-dim" />
                <span className="text-accentb font-semibold">
                  Available until {fmtDate(project.expiresAt)}
                </span>
              </>
            )}
            {/* The one place payment is mentioned. It was this, a sentence under the
                header and another in the download sheet — three for one fact. */}
            {project.paymentHold && (
              <span
                data-testid="hold-pill"
                title="Downloads carry a watermark until the invoice is paid."
                className="text-[10px] font-extrabold uppercase tracking-[.06em] text-accentb border border-accentb px-[7px] py-[3px]"
              >
                Awaiting payment
              </span>
            )}
            {totalSocialPosts > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-dim" />
                <span className="text-accentb font-semibold">
                  <IconPlay fill="currentColor" /> {formatViews(totalViews)}{" "}
                  views across {totalSocialPosts} post
                  {totalSocialPosts > 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>
        {/* One primary action. Sending footage back is the rarer errand and reads as a
            text link under it, not a second button competing with Download all. Only on
            two-way projects, and with no disabled state when off — an affordance that
            cannot be used is worse than none. */}
        <div className="flex flex-col items-stretch sm:items-end gap-2.5">
          {canDownload && (
            <DownloadButton
              label={`Download all · ${formatBytes(totalBytes)}`}
              onClick={downloadAll}
            />
          )}
        </div>
      </div>

      {/* §13. Only for projects that actually have posts — a delivery of stills has
          nothing to approve and should not grow a tab strip saying so. */}
      {scheduled.length > 0 && (
        <ClientPostsPanel
          projectId={project.id}
          posts={scheduled}
          role={role}
          view={postsView}
          onViewChange={setPostsView}
        />
      )}

      <div hidden={scheduled.length > 0 && postsView !== "files"}>
        <div className="flex items-center justify-between gap-4 flex-wrap my-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="inline-flex border border-line2">
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  data-testid={`filter-${f.id}`}
                  className={`relative cursor-pointer text-xs font-semibold uppercase tracking-wide px-4 py-2.5 border-l border-line2 first:border-l-0 ${
                    filter === f.id ? "text-bg" : "text-muted"
                  }`}
                >
                  {filter === f.id && (
                    <motion.div
                      layoutId="filterPill"
                      className="absolute inset-0 bg-text z-0"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 40,
                      }}
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    {f.icon}
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
            {project.folders.length > 0 && (
              <select
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value)}
                className="bg-bg border border-line2 text-muted text-xs font-semibold px-3 py-2.5 outline-none focus:border-accent"
              >
                <option value="ALL">Folder: All</option>
                {project.folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    Folder: {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {groups.map(renderGroup)}

        {filter === "CHECK" && groups.length === 0 && (
          <div data-testid="captions-all-checked" className="text-[12.5px] text-dim py-[60px] text-center">
            Nothing left to check. Every caption this week has been read.
          </div>
        )}

        {filter === "FAV" && groups.length === 0 && (
          <div className="border border-line px-6 py-16 text-center mt-0.5">
            <div className="text-2xl text-dim mb-3 flex justify-center">
              <IconHeart />
            </div>
            <div className="text-[15px] font-bold mb-1.5">No favorites yet</div>
            <div className="text-[13px] text-muted">
              Tap the heart on any still to add it to this collection.
            </div>
          </div>
        )}
      </div>

      {openPhotoId && (
        <ImageViewer
          items={photoNavItems}
          initialId={openPhotoId}
          onClose={() => setOpenPhotoId(null)}
        />
      )}

      {openVideoId && (
        <VideoViewer
          items={videoNavItems}
          initialId={openVideoId}
          canDownload={canDownload}
          watermarked={project.paymentHold}
          onClose={() => setOpenVideoId(null)}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          reelCopy={reelCopy}
          onCopyChange={onCopyChange}
          slackChannel={project.slackChannel}
        />
      )}

      {/* §3 selection bar. Replaces swapping the header button's label, which put the
          count somewhere the eye is not while selecting, and gave no way to clear or
          favourite a selection without scrolling back up. */}
      {canDownload && bar.mounted && (
        <div
          className={`fixed inset-x-0 bottom-0 sm:inset-x-10 sm:bottom-6 z-40 ${bar.leaving ? "bj-bar-out" : "bj-bar-in"}`}
        >
          <div className="bg-s2 border border-line2 px-4 sm:px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-3 flex items-center gap-3 sm:gap-4 flex-wrap">
            <span className="text-sm font-extrabold tabular-nums">
              {selected.size} selected
            </span>
            <span className="text-[13px] text-muted tabular-nums">
              {formatBytes(bytesOf(selectedAssets))}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setSelected(new Set())}
              className="cursor-pointer text-[11px] font-semibold uppercase text-muted hover:text-text"
            >
              Clear
            </button>
            <button
              onClick={() => setSelected(new Set(visibleIds))}
              className="cursor-pointer text-[11px] font-semibold uppercase text-muted hover:text-text"
              hidden={allVisibleSelected}
            >
              Select all
            </button>
            {phoneSave ? (
              <PhoneSaveButtons
                assets={selectedAssets.map((a) => ({ id: a.id, kind: a.kind, name: a.name }))}
                onSaveToFiles={downloadSelected}
              />
            ) : (
              <DownloadButton
                label={`↓ Download ${selected.size} · ${formatBytes(bytesOf(selectedAssets))}`}
                onClick={downloadSelected}
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
}
