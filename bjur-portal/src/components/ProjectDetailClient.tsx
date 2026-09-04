"use client";

import { useEffect, useMemo, useState } from "react";
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
import { LicensingDialog } from "@/components/LicensingDialog";
import { mondayOfWeek as mondayOfWeekDate } from "@/lib/weeks";
import { formatViews, formatBytes } from "@/lib/format";

type Asset = TileAsset & {
  weekOf: string | null;
  folderId: string | null;
  contentTitle: string | null;
  caption: string | null;
  publishAt: string | null;
  publishIg: boolean;
  publishYt: boolean;
  publishState: ScheduledPost["publishState"];
  approvalDueAt: string | null;
  heldAt: string | null;
};

const FORMAT_DEFS: [string, string][] = [
  ["Reel", "Reels"],
  ["Film", "Films"],
  ["Still", "Stills"],
  ["Master", "Masters · BRAW"],
];

function colsFor(format: string) {
  if (format === "Reel") return "repeat(auto-fill,minmax(180px,1fr))";
  if (format === "Still") return "repeat(auto-fill,minmax(270px,1fr))";
  return "repeat(auto-fill,minmax(340px,1fr))";
}

/** Live byte counter for a streaming download — B/KB/MB, not the file-size formatter.
 *  Named apart from formatBytes because it shadowed it, which is how a decimal-GB size
 *  column and a binary-GB total ended up disagreeing about the same file. */
function formatProgressBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Download button with a looping shimmer + live byte count while a zip streams in —
 * the server can't report a Content-Length (archiver zips on the fly), so this is
 * honest progress feedback rather than a fabricated percentage. */
function DownloadButton({
  label,
  onClick,
  downloading,
  downloadedBytes,
}: {
  label: string;
  onClick: () => void;
  downloading: boolean;
  downloadedBytes: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={downloading}
      className="relative overflow-hidden cursor-pointer inline-flex items-center gap-2 font-bold text-[13px] text-bg bg-accent hover:bg-accentb px-5 py-3.5 disabled:cursor-default"
    >
      {downloading && (
        <motion.div
          className="absolute inset-y-0 left-0 w-1/3 bg-white/25"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        />
      )}
      <span className="relative z-10">
        {downloading
          ? `↓ Downloading… ${formatProgressBytes(downloadedBytes)}`
          : label}
      </span>
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
  folder: string;
  cols: string;
  items: Asset[];
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
  assets,
  initialFavorites,
  initialLicensedAssetIds,
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
    folders: { id: string; name: string }[];
  };
  assets: Asset[];
  initialFavorites: string[];
  initialLicensedAssetIds: string[];
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
  totalViews: number;
  totalSocialPosts: number;
}) {
  // §13. Anything with a publish date is a post as far as the client is concerned.
  const scheduled: ScheduledPost[] = assets
    .filter((a) => a.publishState !== "NONE")
    .sort((x, y) => (x.publishAt ?? "").localeCompare(y.publishAt ?? ""));

  // "All files" stays the default even when posts are waiting: someone who came here to
  // download should still land on the gallery. The banner is what redirects them.
  const [postsView, setPostsView] = useState<PostsView>("files");

  const [filter, setFilter] = useState<string>("ALL");
  // §3: format is the default. Week grouping remains available, but a client opening a
  // delivery wants it sorted by what the files *are*, not which week they landed.
  const [groupMode, setGroupMode] = useState<"format" | "week">("format");
  const [folderFilter, setFolderFilter] = useState<string>("ALL");
  const scoped = useMemo(
    () =>
      folderFilter === "ALL"
        ? assets
        : assets.filter((a) => a.folderId === folderFilter),
    [assets, folderFilter],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(
    new Set(initialFavorites),
  );
  const [licensedIds, setLicensedIds] = useState<Set<string>>(
    new Set(initialLicensedAssetIds),
  );
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  const [licensingAsset, setLicensingAsset] = useState<Asset | null>(null);

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
  const [downloading, setDownloading] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);

  async function downloadZip(opts: {
    method: "GET" | "POST";
    body?: { assetIds: string[] };
    filename: string;
  }) {
    setDownloading(true);
    setDownloadedBytes(0);
    try {
      const res = await fetch(`/api/projects/${project.id}/download-all`, {
        method: opts.method,
        headers: opts.body ? { "Content-Type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (!res.ok || !res.body) return;

      // No Content-Length to compute a real percentage against (the server zips on
      // the fly via archiver), so this tracks bytes actually received — honest
      // progress feedback instead of a static "Zipping…" label.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.byteLength;
          setDownloadedBytes(total);
        }
      }

      const blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = opts.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  function downloadSelected() {
    downloadZip({
      method: "POST",
      body: { assetIds: [...selected] },
      filename: `${project.title.replace(/[^a-z0-9]+/gi, "-")}-selected.zip`,
    });
  }

  function downloadAll() {
    downloadZip({
      method: "GET",
      filename: `${project.title.replace(/[^a-z0-9]+/gi, "-")}.zip`,
    });
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

  const filters = [
    { id: "ALL", label: `All ${scoped.length}` },
    ...FORMAT_DEFS.filter((d) => formatCounts[d[0]]).map((d) => ({
      id: d[0],
      label: `${d[1].split(" · ")[0]} ${formatCounts[d[0]]}`,
    })),
    { id: "FAV", label: `♥ Favorites${favCount ? ` ${favCount}` : ""}` },
  ];

  const metaAssets = FORMAT_DEFS.map(
    (d) => [formatCounts[d[0]] ?? 0, d[1]] as const,
  )
    .filter(([c]) => c)
    .map(([c, label]) => `${c} ${label.split(" · ")[0].toLowerCase()}`)
    .join(" · ");

  const currentYear = new Date().getFullYear();

  const groups: Group[] = useMemo(() => {
    if (filter === "FAV") {
      const items = scoped.filter((a) => favorites.has(a.id));
      return items.length
        ? [
            {
              label: "Favorites",
              count: `${items.length} item${items.length > 1 ? "s" : ""}`,
              folder: project.path,
              cols: "repeat(auto-fill,minmax(220px,1fr))",
              items,
            },
          ]
        : [];
    }
    if (groupMode === "week") {
      // Current year (plus anything undated) shows directly; older years are bucketed
      // separately below into collapsible folders so the default view stays focused on
      // this year's weekly deliveries instead of a year-spanning wall of weeks.
      const byFilter =
        filter === "ALL" ? scoped : scoped.filter((a) => a.format === filter);
      const items = byFilter.filter(
        (a) => !a.weekOf || new Date(a.weekOf).getUTCFullYear() === currentYear,
      );
      return bucketByWeek(items, project.path);
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
  }, [filter, groupMode, scoped, favorites, project.path, currentYear]);

  type YearFolder = { year: number; count: string; weeks: Group[] };
  const pastYearFolders: YearFolder[] = useMemo(() => {
    if (groupMode !== "week" || filter === "FAV") return [];
    const byFilter =
      filter === "ALL" ? scoped : scoped.filter((a) => a.format === filter);
    const byYear = new Map<number, Asset[]>();
    for (const a of byFilter) {
      if (!a.weekOf) continue;
      const year = new Date(a.weekOf).getUTCFullYear();
      if (year === currentYear) continue;
      const items = byYear.get(year) ?? [];
      items.push(a);
      byYear.set(year, items);
    }
    return [...byYear.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, items]) => ({
        year,
        count: `${items.length} file${items.length > 1 ? "s" : ""}`,
        weeks: bucketByWeek(items, `${project.path}/${year}`),
      }));
  }, [scoped, groupMode, filter, project.path, currentYear]);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

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
      videoOrder.map((v) => ({
        id: v.id,
        name: v.name,
        licensable: v.licensable,
        licensed: licensedIds.has(v.id),
        // Every download control states its size, per the handoff's global rule.
        size: formatBytes(Number(v.sizeBytes)),
      })),
    [videoOrder, licensedIds],
  );
  const photoOrder = useMemo(
    () => groups.flatMap((g) => g.items.filter((i) => i.kind === "PHOTO")),
    [groups],
  );
  const photoNavItems = useMemo(
    () => photoOrder.map((p) => ({ id: p.id, name: p.name })),
    [photoOrder],
  );

  function openAsset(a: Asset) {
    if (a.kind === "VIDEO") {
      setOpenVideoId(a.id);
    } else {
      setOpenPhotoId(a.id);
    }
  }

  function renderGroup(grp: Group) {
    return (
      <motion.div
        layout
        key={grp.folder}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="mb-9"
      >
        <div className="flex items-baseline gap-3 border-b border-line pb-2.5 mb-4">
          <span className="text-[15px] font-extrabold">{grp.label}</span>
          <span className="text-[11px] text-muted">
            {grp.count} · {formatBytes(bytesOf(grp.items))}
          </span>
          {canDownload && (
            <button
              onClick={() => {
                const ids = grp.items.map((i) => i.id);
                const allIn = ids.every((id) => selected.has(id));
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const id of ids) {
                    if (allIn) next.delete(id);
                    else next.add(id);
                  }
                  return next;
                });
              }}
              className="ml-auto cursor-pointer text-[11px] font-semibold text-muted hover:text-text py-2.5 -my-2.5"
            >
              {grp.items.every((i) => selected.has(i.id))
                ? "Clear"
                : `Select all in ${grp.label}`}
            </button>
          )}
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
              unlocked={licensedIds.has(a.id)}
              onToggleSelect={() => toggleSelect(a.id)}
              onToggleFavorite={() => toggleFavorite(a.id)}
              onOpen={() => openAsset(a)}
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
          <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-3">
            {project.clientName}
          </div>
          <h1 className="text-[28px] sm:text-4xl tracking-tight font-black mb-3.5">
            {project.title}
          </h1>
          <div className="flex items-center gap-4 text-[13px] text-muted flex-wrap">
            <span>{metaAssets}</span>
            <span className="w-1 h-1 rounded-full bg-dim" />
            <span className="tabular-nums">{formatBytes(totalBytes)}</span>
            <span className="w-1 h-1 rounded-full bg-dim" />
            <span>Delivered {fmtDate(project.deliveredAt)}</span>
            {project.expiresAt && (
              <>
                <span className="w-1 h-1 rounded-full bg-dim" />
                <span className="text-accentb font-semibold">
                  Available until {fmtDate(project.expiresAt)}
                </span>
              </>
            )}
            {totalSocialPosts > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-dim" />
                <span className="text-accentb font-semibold">
                  ▶ {formatViews(totalViews)} views across {totalSocialPosts}{" "}
                  post
                  {totalSocialPosts > 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href={`/p/${project.id}/upload`}
            className="inline-flex items-center gap-2 font-bold text-[13px] text-text border border-line2 hover:border-text px-5 py-3.5"
          >
            ↑ Upload footage
          </Link>
          {canDownload && (
            <DownloadButton
              label={`↓ Download all · ${formatBytes(totalBytes)}`}
              onClick={downloadAll}
              downloading={downloading}
              downloadedBytes={downloadedBytes}
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
                  className={`relative cursor-pointer text-xs font-semibold uppercase tracking-wide px-4 py-2.5 border-l border-line2 first:border-l-0 ${
                    filter === f.id ? "text-bg" : "text-muted"
                  }`}
                >
                  {filter === f.id && (
                    <motion.div
                      layoutId="filterPill"
                      className="absolute inset-0 bg-accent z-0"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 40,
                      }}
                    />
                  )}
                  <span className="relative z-10">{f.label}</span>
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
          <div className="inline-flex border border-line2">
            {(["format", "week"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupMode(g)}
                className={`relative cursor-pointer text-[11px] font-semibold uppercase tracking-wide px-3.5 py-2.5 border-l border-line2 first:border-l-0 ${
                  groupMode === g ? "text-bg" : "text-muted"
                }`}
              >
                {groupMode === g && (
                  <motion.div
                    layoutId="groupModePill"
                    className="absolute inset-0 bg-accent z-0"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10">
                  By {g === "format" ? "Format" : "Week"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {groups.map(renderGroup)}

        {pastYearFolders.map((yf) => {
          const isOpen = expandedYears.has(yf.year);
          return (
            <div key={yf.year} className="mb-9">
              <button
                onClick={() =>
                  setExpandedYears((s) => {
                    const next = new Set(s);
                    if (next.has(yf.year)) next.delete(yf.year);
                    else next.add(yf.year);
                    return next;
                  })
                }
                className="cursor-pointer w-full flex items-center gap-3 border-b border-line2 pb-2.5 mb-4 text-left"
              >
                <span className="text-[11px]">{isOpen ? "▾" : "▸"}</span>
                <span className="text-[15px] font-extrabold">{yf.year}</span>
                <span className="text-[11px] text-muted">{yf.count}</span>
              </button>
              {isOpen && (
                <div className="pl-6">{yf.weeks.map(renderGroup)}</div>
              )}
            </div>
          );
        })}

        {filter === "FAV" && groups.length === 0 && (
          <div className="border border-line px-6 py-16 text-center mt-0.5">
            <div className="text-2xl text-dim mb-3">♥</div>
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
          onClose={() => setOpenVideoId(null)}
          onRequestLicense={(assetId) => {
            const asset = videoOrder.find((v) => v.id === assetId);
            if (asset) setLicensingAsset(asset);
            setOpenVideoId(null);
          }}
        />
      )}

      {licensingAsset && licensingAsset.basePrice != null && (
        <LicensingDialog
          assetId={licensingAsset.id}
          name={licensingAsset.name}
          basePrice={licensingAsset.basePrice}
          onClose={() => setLicensingAsset(null)}
          onLicensed={() => {
            setLicensedIds((s) => new Set(s).add(licensingAsset.id));
            setLicensingAsset(null);
          }}
        />
      )}

      {/* §3 selection bar. Replaces swapping the header button's label, which put the
          count somewhere the eye is not while selecting, and gave no way to clear or
          favourite a selection without scrolling back up. */}
      {canDownload && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 sm:inset-x-10 sm:bottom-6 z-40 bjrise">
          <div className="bg-s2 border border-line2 px-4 sm:px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_18px_50px_rgba(0,0,0,.6)] flex items-center gap-3 sm:gap-4 flex-wrap">
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
            <DownloadButton
              label={`↓ Download ${selected.size} · ${formatBytes(bytesOf(selectedAssets))}`}
              onClick={downloadSelected}
              downloading={downloading}
              downloadedBytes={downloadedBytes}
            />
          </div>
        </div>
      )}
    </div>
  );
}
