"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AssetTile, type TileAsset } from "@/components/AssetTile";
import { Lightbox } from "@/components/Lightbox";
import { VideoPlayer } from "@/components/VideoPlayer";
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
  const [groupMode, setGroupMode] = useState<"format" | "week">("format");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFavorites));
  const [licensedIds, setLicensedIds] = useState<Set<string>>(new Set(initialLicensedAssetIds));
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [videoAssetId, setVideoAssetId] = useState<string | null>(null);
  const [licensingAsset, setLicensingAsset] = useState<Asset | null>(null);

  const canDownload = role !== "VIEWER";

  async function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleFavorite(id: string) {
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

  type Group = { label: string; count: string; folder: string; cols: string; items: Asset[] };
  const groups: Group[] = useMemo(() => {
    if (filter === "FAV") {
      const items = assets.filter((a) => favorites.has(a.id));
      return items.length
        ? [{ label: "Favorites", count: `${items.length} item${items.length > 1 ? "s" : ""}`, folder: project.path, cols: "repeat(auto-fill,minmax(220px,1fr))", items }]
        : [];
    }
    if (groupMode === "week") {
      // Bucket by the Monday of the calendar week each asset's weekOf falls in, so
      // files dated a day or two apart within the same studio week still cluster
      // together, then sort newest week first with "Undated" pinned at the end.
      const byWeek = new Map<string, Asset[]>();
      for (const a of assets) {
        const key = a.weekOf ? mondayOfWeek(new Date(a.weekOf)) : "Undated";
        const items = byWeek.get(key) ?? [];
        items.push(a);
        byWeek.set(key, items);
      }
      return [...byWeek.entries()]
        .sort(([a], [b]) => {
          if (a === "Undated") return 1;
          if (b === "Undated") return -1;
          return b.localeCompare(a);
        })
        .map(([w, items]) => {
          const label = w === "Undated" ? w : `Week of ${fmtDate(w)}`;
          return {
            label,
            count: `${items.length} file${items.length > 1 ? "s" : ""}`,
            folder: `${project.path}/${label.replace(/\s+/g, "-")}`,
            cols: "repeat(auto-fill,minmax(190px,1fr))",
            items,
          };
        });
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
  }, [filter, groupMode, assets, favorites, project.path]);

  const activeVideo = videoAssetId ? assets.find((a) => a.id === videoAssetId) ?? null : null;
  const activeVideoLocked = activeVideo ? activeVideo.licensable && !licensedIds.has(activeVideo.id) : false;

  function openAsset(a: Asset) {
    if (a.kind === "VIDEO") {
      setVideoAssetId(a.id);
    } else {
      setLightboxIdx(photos.findIndex((p) => p.id === a.id));
    }
  }

  return (
    <div className="px-10 pt-8 pb-32 max-w-[1500px] mx-auto bjfade">
      <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-text mb-6">
        ← All projects
      </Link>

      <div className="flex items-end justify-between gap-6 flex-wrap border-b-2 border-line2 pb-6 mb-2">
        <div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-3">
            {project.clientName}
          </div>
          <h1 className="text-4xl tracking-tight font-black mb-3.5">{project.title}</h1>
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
          <div className="mt-3.5 flex items-center gap-2 text-[11px] font-mono text-dim flex-wrap">
            <span className="text-muted">MEDIA_ROOT</span>
            <span>/</span>
            <span className="text-text">{project.path}</span>
            <span className="ml-1.5 px-1.5 py-0.5 border border-line text-muted tracking-wide">
              PROJECT · DATE · FORMAT
            </span>
          </div>
        </div>
        {canDownload && (
          <a
            href={`/api/projects/${project.id}/download-all`}
            className="inline-flex items-center gap-2 font-bold text-[13px] text-bg bg-accent hover:bg-accentb px-5 py-3.5"
          >
            ↓ Download all
          </a>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap my-6">
        <div className="inline-flex border border-line2">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`cursor-pointer text-xs font-semibold uppercase tracking-wide px-4 py-2.5 border-l border-line2 first:border-l-0 ${
                filter === f.id ? "bg-accent text-bg" : "bg-transparent text-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="inline-flex border border-line2">
          {(["format", "week"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupMode(g)}
              className={`cursor-pointer text-[11px] font-semibold uppercase tracking-wide px-3.5 py-2.5 border-l border-line2 first:border-l-0 ${
                groupMode === g ? "bg-accent text-bg" : "bg-transparent text-muted"
              }`}
            >
              By {g === "format" ? "Format" : "Week"}
            </button>
          ))}
        </div>
      </div>

      {groups.map((grp) => (
        <div key={grp.label} className="mb-9">
          <div className="flex items-baseline gap-3 border-b border-line pb-2.5 mb-4">
            <span className="text-[15px] font-extrabold">{grp.label}</span>
            <span className="text-[11px] text-muted">{grp.count}</span>
            <span className="ml-auto text-[11px] text-dim font-mono">{grp.folder}</span>
          </div>
          <div className="grid gap-4 items-start" style={{ gridTemplateColumns: grp.cols }}>
            {grp.items.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                selected={selected.has(a.id)}
                favorite={favorites.has(a.id)}
                unlocked={licensedIds.has(a.id)}
                onToggleSelect={() => toggleSelect(a.id)}
                onToggleFavorite={() => toggleFavorite(a.id)}
                onOpen={() => openAsset(a)}
              />
            ))}
          </div>
        </div>
      ))}

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

      {activeVideo && (
        <VideoPlayer
          assetId={activeVideo.id}
          name={activeVideo.name}
          canDownload={canDownload}
          locked={activeVideoLocked}
          onClose={() => setVideoAssetId(null)}
          onRequestLicense={() => {
            setVideoAssetId(null);
            setLicensingAsset(activeVideo);
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
