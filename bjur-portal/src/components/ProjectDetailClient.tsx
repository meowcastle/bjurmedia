"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AssetTile, type TileAsset } from "@/components/AssetTile";
import { haptic } from "@/lib/haptics";
import { Lightbox } from "@/components/Lightbox";
import { VideoViewer } from "@/components/VideoViewer";
import { LicensingDialog } from "@/components/LicensingDialog";

type Asset = TileAsset & { weekOf: string | null };

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

function formatBytes(n: number) {
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
      <span className="relative z-10">{downloading ? `↓ Downloading… ${formatBytes(downloadedBytes)}` : label}</span>
    </button>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

/** Monday (UTC midnight) of the calendar week containing `d`, as an ISO date string. */
function mondayOfWeek(d: Date) {
  const day = d.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday));
  return monday.toISOString();
}

type Group = { label: string; count: string; folder: string; cols: string; items: Asset[] };

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
}: {
  project: {
    id: string;
    title: string;
    path: string;
    clientName: string;
    deliveredAt: string | null;
    expiresAt: string | null;
  };
  assets: Asset[];
  initialFavorites: string[];
  initialLicensedAssetIds: string[];
  role: "OWNER" | "DOWNLOADER" | "VIEWER";
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [groupMode, setGroupMode] = useState<"format" | "week">("week");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFavorites));
  const [licensedIds, setLicensedIds] = useState<Set<string>>(new Set(initialLicensedAssetIds));
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
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
    setLastVisit(localStorage.getItem(key));
    localStorage.setItem(key, new Date().toISOString());
  }, [project.id]);

  const canDownload = role !== "VIEWER";
  const [downloading, setDownloading] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);

  async function downloadZip(opts: { method: "GET" | "POST"; body?: { assetIds: string[] }; filename: string }) {
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

  const photos = useMemo(() => assets.filter((a) => a.kind === "PHOTO"), [assets]);

  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets) counts[a.format] = (counts[a.format] ?? 0) + 1;
    return counts;
  }, [assets]);

  const favCount = useMemo(() => assets.filter((a) => favorites.has(a.id)).length, [assets, favorites]);

  const filters = [
    { id: "ALL", label: "All" },
    ...FORMAT_DEFS.filter((d) => formatCounts[d[0]]).map((d) => ({ id: d[0], label: d[1].split(" · ")[0] })),
    { id: "FAV", label: `♥ Favorites${favCount ? ` (${favCount})` : ""}` },
  ];

  const metaAssets = FORMAT_DEFS.map((d) => [formatCounts[d[0]] ?? 0, d[1]] as const)
    .filter(([c]) => c)
    .map(([c, label]) => `${c} ${label.split(" · ")[0].toLowerCase()}`)
    .join(" · ");

  const currentYear = new Date().getFullYear();

  const groups: Group[] = useMemo(() => {
    if (filter === "FAV") {
      const items = assets.filter((a) => favorites.has(a.id));
      return items.length
        ? [{ label: "Favorites", count: `${items.length} item${items.length > 1 ? "s" : ""}`, folder: project.path, cols: "repeat(auto-fill,minmax(220px,1fr))", items }]
        : [];
    }
    if (groupMode === "week") {
      // Current year (plus anything undated) shows directly; older years are bucketed
      // separately below into collapsible folders so the default view stays focused on
      // this year's weekly deliveries instead of a year-spanning wall of weeks.
      const byFilter = filter === "ALL" ? assets : assets.filter((a) => a.format === filter);
      const items = byFilter.filter((a) => !a.weekOf || new Date(a.weekOf).getUTCFullYear() === currentYear);
      return bucketByWeek(items, project.path);
    }
    return FORMAT_DEFS.filter((d) => filter === "ALL" || filter === d[0])
      .map((d) => {
        const items = assets.filter((a) => a.format === d[0]);
        return {
          label: d[1],
          count: `${items.length} file${items.length > 1 ? "s" : ""}`,
          folder: `${project.path}/${d[0]}`,
          cols: colsFor(d[0]),
          items,
        };
      })
      .filter((g) => g.items.length);
  }, [filter, groupMode, assets, favorites, project.path, currentYear]);

  type YearFolder = { year: number; count: string; weeks: Group[] };
  const pastYearFolders: YearFolder[] = useMemo(() => {
    if (groupMode !== "week" || filter === "FAV") return [];
    const byFilter = filter === "ALL" ? assets : assets.filter((a) => a.format === filter);
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
  }, [assets, groupMode, filter, project.path, currentYear]);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  const visibleIds = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.id)), [groups]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  // Follows the same grouped/filtered visual order the grid is actually rendered in
  // (week or format buckets, current filter) rather than raw upload order, so swipe
  // navigation in the video viewer matches what's on screen.
  const videoOrder = useMemo(
    () => groups.flatMap((g) => g.items.filter((i) => i.kind === "VIDEO")),
    [groups]
  );
  const videoNavItems = useMemo(
    () => videoOrder.map((v) => ({ id: v.id, name: v.name, licensable: v.licensable, licensed: licensedIds.has(v.id) })),
    [videoOrder, licensedIds]
  );

  function openAsset(a: Asset) {
    if (a.kind === "VIDEO") {
      setOpenVideoId(a.id);
    } else {
      setLightboxIdx(photos.findIndex((p) => p.id === a.id));
    }
  }

  function renderGroup(grp: Group) {
    return (
      <motion.div
        layout
        key={grp.folder}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="mb-9"
      >
        <div className="flex items-baseline gap-3 border-b border-line pb-2.5 mb-4">
          <span className="text-[15px] font-extrabold">{grp.label}</span>
          <span className="text-[11px] text-muted">{grp.count}</span>
        </div>
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: grp.cols }}>
          <AnimatePresence mode="popLayout">
            {grp.items.map((a, i) => (
              <AssetTile
                key={a.id}
                asset={a}
                index={i}
                isNew={lastVisit != null && new Date(a.createdAt) > new Date(lastVisit)}
                selected={selected.has(a.id)}
                favorite={favorites.has(a.id)}
                unlocked={licensedIds.has(a.id)}
                onToggleSelect={() => toggleSelect(a.id)}
                onToggleFavorite={() => toggleFavorite(a.id)}
                onOpen={() => openAsset(a)}
              />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 pt-6 md:pt-8 pb-32 max-w-[1500px] mx-auto bjfade">
      <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-text mb-6">
        ← All projects
      </Link>

      <div className="flex items-end justify-between gap-6 flex-wrap border-b-2 border-line2 pb-6 mb-2">
        <div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-3">
            {project.clientName}
          </div>
          <h1 className="text-[28px] sm:text-4xl tracking-tight font-black mb-3.5">{project.title}</h1>
          <div className="flex items-center gap-4 text-[13px] text-muted flex-wrap">
            <span>{metaAssets}</span>
            <span className="w-1 h-1 rounded-full bg-dim" />
            <span>Delivered {fmtDate(project.deliveredAt)}</span>
            {project.expiresAt && (
              <>
                <span className="w-1 h-1 rounded-full bg-dim" />
                <span className="text-accentb font-semibold">Available until {fmtDate(project.expiresAt)}</span>
              </>
            )}
          </div>
        </div>
        {canDownload &&
          (selected.size > 0 ? (
            <DownloadButton
              label={`↓ Download selected (${selected.size})`}
              onClick={downloadSelected}
              downloading={downloading}
              downloadedBytes={downloadedBytes}
            />
          ) : (
            <DownloadButton
              label="↓ Download all"
              onClick={downloadAll}
              downloading={downloading}
              downloadedBytes={downloadedBytes}
            />
          ))}
      </div>

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
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10">{f.label}</span>
              </button>
            ))}
          </div>
          {canDownload && (
            <button
              onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visibleIds))}
              className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted hover:text-text px-1"
            >
              {allVisibleSelected ? "Clear selection" : "Select all"}
            </button>
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
              <span className="relative z-10">By {g === "format" ? "Format" : "Week"}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="popLayout">{groups.map(renderGroup)}</AnimatePresence>

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
            {isOpen && <div className="pl-6">{yf.weeks.map(renderGroup)}</div>}
          </div>
        );
      })}

      {filter === "FAV" && groups.length === 0 && (
        <div className="border border-line px-6 py-16 text-center mt-0.5">
          <div className="text-2xl text-dim mb-3">♥</div>
          <div className="text-[15px] font-bold mb-1.5">No favorites yet</div>
          <div className="text-[13px] text-muted">Tap the heart on any still to add it to this collection.</div>
        </div>
      )}

      {lightboxIdx !== null && photos[lightboxIdx] && (
        <Lightbox
          assetId={photos[lightboxIdx].id}
          name={photos[lightboxIdx].name}
          hasPrev={lightboxIdx > 0}
          hasNext={lightboxIdx < photos.length - 1}
          onPrev={() => setLightboxIdx((i) => (i ?? 0) - 1)}
          onNext={() => setLightboxIdx((i) => (i ?? 0) + 1)}
          onClose={() => setLightboxIdx(null)}
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
    </div>
  );
}
