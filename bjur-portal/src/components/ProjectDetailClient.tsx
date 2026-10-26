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
import { IconHeart } from "@/components/ui/Icon";
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

/** Tile width per group: vertical tiles sit narrower than wide ones, as on the board.
 * A group of nothing but wide files gets wider columns so a 16:9 frame is not a strip. */
function colsFor(items: { orientation: string }[]) {
  return items.every((a) => a.orientation !== "portrait")
    ? "repeat(auto-fill,minmax(300px,1fr))"
    : "repeat(auto-fill,minmax(220px,1fr))";
}

/* The zips are handed to the browser (an <a> or a form POST), so the download lands in
 * Downloads with the browser's own progress as soon as the first byte arrives. It used
 * to be read into a blob in the page first, which kept a multi-gigabyte gallery out of
 * Downloads until the very end, and on a phone the tab ran out of memory. */

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
        cols: colsFor(weekItems),
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
    /** The studio opened footage uploads for this client: the header offers /send. */
    footageUploads?: boolean;
    folders: { id: string; name: string }[];
    /** Opens by client logins, once per tab session. */
    viewCount: number;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bar = usePresence(selected.size > 0, 200);
  const [favorites, setFavorites] = useState<Set<string>>(
    new Set(initialFavorites),
  );
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  // Grouped by format, and by folder when the project has any. The By Week toggle, the
  // Wide/Vertical filter and the past-years accordion each added a control for a
  // question few clients asked.
  const scoped = assets;

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

  // §4: iOS's rubber-band overscroll dragged the sticky selection bar with it. Contained
  // while the gallery is up, and put back for every other page.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "contain";
    return () => {
      html.style.overscrollBehaviorY = prev;
    };
  }, []);

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
    haptic();
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
              cols: colsFor(items),
              items,
            },
          ]
        : [];
    }
    // Files outside any folder come first under the plain format headings, then each
    // folder in the order it was made, as its own section. A folder holding more than
    // one format splits into "Folder · Reels", "Folder · Films" so each grid keeps the
    // tile size its format needs.
    const formatDefs = FORMAT_DEFS.filter((d) => filter === "ALL" || filter === d[0]);
    const sections = [
      { key: "", name: null as string | null, items: scoped.filter((a) => !a.folderId || !project.folders.some((f) => f.id === a.folderId)) },
      ...project.folders.map((f) => ({ key: f.id, name: f.name as string | null, items: scoped.filter((a) => a.folderId === f.id) })),
    ];
    return sections.flatMap((sec) => {
      const byFormat = formatDefs
        .map((d) => ({ d, items: sec.items.filter((a) => a.format === d[0]) }))
        .filter((x) => x.items.length);
      return byFormat.map(({ d, items }) => ({
        label: sec.name == null ? d[1] : byFormat.length > 1 ? `${sec.name} · ${d[1]}` : sec.name,
        count: `${items.length} file${items.length > 1 ? "s" : ""}`,
        folder: `${project.path}/${sec.key ? `${sec.key}/` : ""}${d[0]}`,
        cols: colsFor(items),
        items,
      }));
    });
  }, [filter, scoped, favorites, project.path, project.folders]);

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
      <motion.section
        layout
        key={grp.folder}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR[2], ease: EASE_OUT }}
        className="bj-sx"
        data-testid="file-group"
      >
        {/* The folder's name, its count in Archivo under it, then its size. */}
        <span className="bj-mono bj-lab">
          <span data-testid="group-name">{grp.label}</span>
          <b>{grp.items.length}</b>
          <span className="bj-mono sz" data-testid="group-size">
            {grp.summary ?? formatBytes(bytesOf(grp.items))}
          </span>
        </span>
        <div
          className={`bj-tiles${selected.size > 0 ? " sel" : ""}`}
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
      </motion.section>
    );
  }

  const fileCount = scoped.length;

  return (
    <div className="bj-cpage bj-project bjfade">
      <Link href="/" className="bj-back bj-mono">
        ← All projects
      </Link>

      <section className="bj-phead">
        <div className="min-w-0">
          <h1 className="bj-big">{project.title}</h1>
          <div className="meta">
            <span className="bj-mono">Delivered {fmtDate(project.deliveredAt)}</span>
            <span className="bj-mono">
              {fileCount} file{fileCount === 1 ? "" : "s"} · {formatBytes(totalBytes)}
            </span>
            {project.expiresAt && (
              <span className="bj-mono ink">Available until {fmtDate(project.expiresAt)}</span>
            )}
            {project.viewCount > 0 && (
              <span className="bj-mono" data-testid="project-views">
                Viewed {project.viewCount} {project.viewCount === 1 ? "time" : "times"}
              </span>
            )}
            {totalSocialPosts > 0 && (
              <span className="bj-mono">
                {formatViews(totalViews)} views across {totalSocialPosts} post
                {totalSocialPosts > 1 ? "s" : ""}
              </span>
            )}
            {/* The one place payment is mentioned, with the reason on hover. */}
            {project.paymentHold && (
              <span
                data-testid="hold-pill"
                title="Downloads carry a watermark until the invoice is paid."
                className="bj-pill red"
              >
                Awaiting payment
              </span>
            )}
          </div>
        </div>
        {(project.footageUploads || canDownload) && (
          <div className="acts">
            {/* Only where the studio has opened footage uploads for this client; off,
                there is no /send to go to, so no button either. */}
            {project.footageUploads && (
              <Link href="/send" className="bj-ghost">
                ↑ Send footage
              </Link>
            )}
            {canDownload && (
              <button type="button" onClick={downloadAll} className="bj-cta">
                ↓ Download all <span className="sz">· {formatBytes(totalBytes)}</span>
              </button>
            )}
          </div>
        )}
      </section>

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
        <div className="bj-chips bj-chiprow" role="group" aria-label="Show">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              data-testid={`filter-${f.id}`}
              aria-pressed={filter === f.id}
              className={`bj-chip${filter === f.id ? " on" : ""}`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>

        {groups.map(renderGroup)}

        {filter === "CHECK" && groups.length === 0 && (
          <div data-testid="captions-all-checked" className="bj-empty bj-mono">
            Nothing left to check. Every caption this week has been read.
          </div>
        )}

        {filter === "FAV" && groups.length === 0 && (
          <section className="bj-sx">
            <span className="bj-mono bj-lab">Favorites</span>
            <div className="bj-empty">
              <b>No favorites yet</b>
              <p>Tap the heart on any file to add it here.</p>
            </div>
          </section>
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

      {/* The selection bar (PortalProject13): an ink bar that slides up on DownloadSheet's
          curve with the count and size, Clear, and Download. */}
      {canDownload && bar.mounted && (
        <div className={`bj-selbar ${bar.leaving ? "is-out" : "is-in"}`} data-testid="selection-bar">
          <b className="tabular-nums">{selected.size} selected</b>
          <span className="bj-mono tabular-nums">{formatBytes(bytesOf(selectedAssets))}</span>
          <span className="sp" />
          <button type="button" onClick={() => setSelected(new Set())} className="lnk">
            Clear
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set(visibleIds))}
            className="lnk"
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
            <button
              type="button"
              onClick={downloadSelected}
              className="bj-cta"
              // The bar already says how many and how big; the name says it again for
              // anyone who reaches the button without reading the bar.
              aria-label={`Download ${selected.size} · ${formatBytes(bytesOf(selectedAssets))}`}
            >
              ↓ Download
            </button>
          )}
        </div>
      )}
    </div>
  );
}
