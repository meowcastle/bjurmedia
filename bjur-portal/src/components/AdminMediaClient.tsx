"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gradientFor } from "@/lib/gradients";
import { formatViews, timeAgo, formatBytes } from "@/lib/format";
import { UploadDialog } from "@/components/UploadDialog";
import { AdminMediaCalendar } from "@/components/AdminMediaCalendar";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { AdminProxyViewer } from "@/components/AdminProxyViewer";
import { GrantLicenseDialog } from "@/components/GrantLicenseDialog";
import {
  ManageFoldersDialog,
  type FolderRow,
} from "@/components/ManageFoldersDialog";

type Asset = {
  id: string;
  name: string;
  kind: "PHOTO" | "VIDEO";
  format: string;
  size: string;
  /** Decimal string — sizeBytes is a BigInt server-side. */
  sizeBytes: string;
  proxyStatus: "PENDING" | "GENERATING" | "READY" | "FAILED";
  thumbReady: boolean;
  dims: string | null;
  durationSec: number | null;
  masterCodec: string | null;
  proxyRes: string | null;
  relPath: string;
  reingestCount: number;
  lastReplacedAt: string | null;
  internal: boolean;
  licensable: boolean;
  basePrice: number | null;
  weekOf: string | null;
  folderId: string | null;
  contentTitle: string | null;
  caption: string | null;
  captionYT: string | null;
  licenseExpired: boolean;
  socialPosts: { id: string; permalink: string | null; viewCount: number }[];
};

type ProjectOption = { id: string; title: string };
type ClientGroup = { id: string; name: string; projects: ProjectOption[] };
type Seat = { id: string; name: string; email: string };

const STATUS_MAP: Record<
  Asset["proxyStatus"],
  { label: string; color: string }
> = {
  READY: { label: "Ready", color: "#2ec36b" },
  GENERATING: { label: "Generating…", color: "var(--accentb)" },
  PENDING: { label: "Queued", color: "var(--muted)" },
  FAILED: { label: "Failed", color: "var(--accent)" },
};

export function AdminMediaClient({
  selectedProjectId,
  selectedProjectTitle,
  selectedClientId,
  selectedClientName,
  siblingProjects,
  clientGroups,
  clientSeats,
  folders,
  assets,
}: {
  selectedProjectId: string;
  selectedProjectTitle: string | null;
  selectedClientId: string | null;
  selectedClientName: string | null;
  siblingProjects: ProjectOption[];
  clientSeats: Seat[];
  clientGroups: ClientGroup[];
  folders: FolderRow[];
  assets: Asset[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(assets);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [weekOfDrafts, setWeekOfDrafts] = useState<Record<string, string>>({});
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>(
    {},
  );
  const [captionYTDrafts, setCaptionYTDrafts] = useState<
    Record<string, string>
  >({});
  const [ytExpanded, setYtExpanded] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [view, setView] = useState<"files" | "calendar">("files");
  const [grantingLicenseFor, setGrantingLicenseFor] = useState<Asset | null>(
    null,
  );
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  // A thumb that 404s falls back to the gradient rather than an empty broken-image box.
  const [thumbFailed, setThumbFailed] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [bulkHiding, setBulkHiding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(
    new Set(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [foldersDialogOpen, setFoldersDialogOpen] = useState(false);
  const [folderFilterId, setFolderFilterId] = useState<string>("ALL");
  // "NEEDS_WEEK" is not a format — it is the set the content calendar and the weekly
  // Slack post both ignore, which is exactly the set worth finding quickly.
  const [formatFilter, setFormatFilter] = useState<string>("ALL");
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Switching projects is a client-side navigation (router.push), not a full reload —
  // useState's initial value only applies on first mount, so without this the table
  // silently keeps showing whichever project happened to load first and never
  // updates, even though selectedProjectId and the assets prop both change correctly.
  // Adjusting state during render (React's own pattern for this) instead of an effect
  // avoids an extra render pass.
  const [prevProjectId, setPrevProjectId] = useState(selectedProjectId);
  if (selectedProjectId !== prevProjectId) {
    setPrevProjectId(selectedProjectId);
    setRows(assets);
    setPriceDrafts({});
    setWeekOfDrafts({});
    setTitleDrafts({});
    setCaptionDrafts({});
    setCaptionYTDrafts({});
    setYtExpanded(new Set());
    setFormatFilter("ALL");
    setConfirmingDeleteId(null);
    setDeleteError(null);
    setSelectedIds(new Set());
    setConfirmingBulkDelete(false);
    setBulkDeleteError(null);
    setFolderFilterId("ALL");
    setMoveTargetId("");
    setMoveError(null);
  }

  // Same "adjust during render" trick, but keyed on the assets prop's identity rather
  // than the project — this is what actually makes the poll below visible. Every
  // router.refresh() re-fetches the server component and hands this client component a
  // brand new assets array, but a plain useState(assets) only ever reads that as its
  // *initial* value; without re-syncing here, the table would keep the interval running
  // forever (still seeing the old stale "Generating…"/"Queued" rows) instead of ever
  // reflecting the refreshed proxyStatus.
  const [prevAssets, setPrevAssets] = useState(assets);
  if (assets !== prevAssets) {
    setPrevAssets(assets);
    setRows(assets);
    const stillPresent = new Set(assets.map((a) => a.id));
    setSelectedIds(
      (ids) => new Set([...ids].filter((id) => stillPresent.has(id))),
    );
  }

  const byFolder =
    folderFilterId === "ALL"
      ? rows
      : folderFilterId === "UNSORTED"
        ? rows.filter((r) => !r.folderId)
        : rows.filter((r) => r.folderId === folderFilterId);

  const tableRows =
    formatFilter === "ALL"
      ? byFolder
      : formatFilter === "NEEDS_WEEK"
        ? byFolder.filter((r) => !r.weekOf && !r.internal)
        : byFolder.filter((r) => r.format === formatFilter);

  const needsWeekCount = byFolder.filter(
    (r) => !r.weekOf && !r.internal,
  ).length;
  const formatCounts = byFolder.reduce<Record<string, number>>((acc, r) => {
    acc[r.format] = (acc[r.format] ?? 0) + 1;
    return acc;
  }, {});

  // Proxy generation happens out-of-band in the worker container, so nothing on this
  // page would otherwise learn a status changed short of a manual reload. Polling only
  // while something's actually in flight (not on a fixed interval forever) keeps this
  // cheap and self-stopping the moment every row settles into Ready/Failed.
  useEffect(() => {
    const inFlight = rows.some(
      (r) => r.proxyStatus === "PENDING" || r.proxyStatus === "GENERATING",
    );
    if (!inFlight) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [rows, router]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedIds.size > 0 && selectedIds.size < tableRows.length;
  }, [selectedIds, tableRows.length]);

  const totalBytes = rows.reduce((n, r) => n + Number(r.sizeBytes), 0);
  const selectedBytes = rows
    .filter((r) => selectedIds.has(r.id))
    .reduce((n, r) => n + Number(r.sizeBytes), 0);
  const ready = rows.filter((a) => a.proxyStatus === "READY").length;
  const generating = rows.filter(
    (a) => a.proxyStatus === "GENERATING" || a.proxyStatus === "PENDING",
  ).length;
  const failed = rows.filter((a) => a.proxyStatus === "FAILED").length;

  function selectProject(id: string) {
    router.push(`/admin/media?project=${id}`);
  }

  function toggleClientExpand(id: string) {
    setExpandedClients((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleInternal(a: Asset) {
    setRows((rs) =>
      rs.map((r) => (r.id === a.id ? { ...r, internal: !r.internal } : r)),
    );
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internal: !a.internal }),
    });
  }

  async function toggleLicensable(a: Asset) {
    const next = !a.licensable;
    setRows((rs) =>
      rs.map((r) => (r.id === a.id ? { ...r, licensable: next } : r)),
    );
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licensable: next }),
    });
  }

  async function savePrice(a: Asset) {
    const raw = priceDrafts[a.id];
    if (raw === undefined) return;
    const price = raw === "" ? null : Number(raw);
    setRows((rs) =>
      rs.map((r) => (r.id === a.id ? { ...r, basePrice: price } : r)),
    );
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basePrice: price }),
    });
  }

  async function saveWeekOf(a: Asset) {
    const raw = weekOfDrafts[a.id];
    if (raw === undefined) return;
    const weekOf = raw === "" ? null : new Date(raw).toISOString();
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, weekOf } : r)));
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekOf }),
    });
  }

  // The calendar edits the same rows the table does, so it goes through here to keep
  // both views and the server in step from one place.
  async function bulkSetInternal(internal: boolean) {
    const ids = [...selectedIds];
    setBulkHiding(true);
    setRows((rs) =>
      rs.map((r) => (selectedIds.has(r.id) ? { ...r, internal } : r)),
    );
    const res = await fetch("/api/admin/assets/bulk-internal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: ids, internal }),
    });
    setBulkHiding(false);
    if (!res.ok) {
      // Put the optimistic change back rather than leaving the table claiming
      // something the database never accepted.
      router.refresh();
      setBulkDeleteError(
        "Could not change visibility for every selected file.",
      );
      return;
    }
    setSelectedIds(new Set());
  }

  async function patchAsset(id: string, fields: Record<string, unknown>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    await fetch(`/api/admin/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  }

  async function saveFolder(a: Asset, folderId: string | null) {
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, folderId } : r)));
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
  }

  async function saveContentTitle(a: Asset) {
    const raw = titleDrafts[a.id];
    if (raw === undefined) return;
    const contentTitle = raw.trim() || null;
    setRows((rs) =>
      rs.map((r) => (r.id === a.id ? { ...r, contentTitle } : r)),
    );
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentTitle }),
    });
  }

  async function saveCaption(a: Asset) {
    const raw = captionDrafts[a.id];
    if (raw === undefined) return;
    const caption = raw.trim() || null;
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, caption } : r)));
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption }),
    });
  }

  async function saveCaptionYT(a: Asset) {
    const raw = captionYTDrafts[a.id];
    if (raw === undefined) return;
    const captionYT = raw.trim() || null;
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, captionYT } : r)));
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captionYT }),
    });
  }

  async function unlinkSocialPost(assetId: string, postId: string) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === assetId
          ? { ...r, socialPosts: r.socialPosts.filter((p) => p.id !== postId) }
          : r,
      ),
    );
    await fetch(`/api/admin/social-posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: null }),
    });
  }

  async function retry(a: Asset) {
    setRows((rs) =>
      rs.map((r) => (r.id === a.id ? { ...r, proxyStatus: "PENDING" } : r)),
    );
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retry: true }),
    });
  }

  async function deleteAsset(a: Asset) {
    setDeletingId(a.id);
    setDeleteError(null);
    const res = await fetch(`/api/admin/assets/${a.id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((rs) => rs.filter((r) => r.id !== a.id));
      setConfirmingDeleteId(null);
    } else {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "Failed to delete asset.");
    }
    setDeletingId(null);
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((ids) =>
      ids.size === tableRows.length
        ? new Set()
        : new Set(tableRows.map((r) => r.id)),
    );
  }

  async function bulkDelete() {
    setBulkDeleting(true);
    setBulkDeleteError(null);
    const ids = [...selectedIds];
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/admin/assets/${id}`, {
          method: "DELETE",
        });
        return { id, ok: res.ok };
      }),
    );
    const failedIds = results.filter((r) => !r.ok).map((r) => r.id);
    const succeededIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setRows((rs) => rs.filter((r) => !succeededIds.has(r.id)));
    setSelectedIds(new Set(failedIds));
    if (failedIds.length > 0) {
      setBulkDeleteError(
        `Failed to delete ${failedIds.length} of ${ids.length} asset${ids.length !== 1 ? "s" : ""}.`,
      );
    } else {
      setConfirmingBulkDelete(false);
    }
    setBulkDeleting(false);
  }

  async function bulkMove() {
    setMoving(true);
    setMoveError(null);
    const folderId = moveTargetId === "UNSORTED" ? null : moveTargetId;
    const ids = [...selectedIds];
    const res = await fetch(`/api/admin/assets/bulk-folder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: ids, folderId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMoveError(data.error ?? "Failed to move assets.");
      setMoving(false);
      return;
    }
    setRows((rs) =>
      rs.map((r) => (ids.includes(r.id) ? { ...r, folderId } : r)),
    );
    setSelectedIds(new Set());
    setMoveTargetId("");
    setMoving(false);
  }

  if (!selectedProjectId) {
    return (
      <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[1400px] mx-auto bjfade">
        <div className="mb-6">
          <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
            Pipeline
          </div>
          <h1 className="text-[34px] tracking-tight font-black mb-2.5">
            Media
          </h1>
          <p className="text-sm text-muted">
            Pick a client, then a project, to see its pipeline.
          </p>
        </div>

        <div className="border border-line">
          {clientGroups.map((g) => {
            const isOpen = expandedClients.has(g.id);
            return (
              <div key={g.id} className="border-b border-line last:border-b-0">
                <button
                  onClick={() => toggleClientExpand(g.id)}
                  className="cursor-pointer w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-[11px] text-muted">
                      {isOpen ? "▾" : "▸"}
                    </span>
                    <span className="font-semibold text-sm">{g.name}</span>
                  </span>
                  <span className="text-[11px] text-muted">
                    {g.projects.length} project
                    {g.projects.length !== 1 ? "s" : ""}
                  </span>
                </button>
                {isOpen && (
                  <div className="pb-2">
                    {g.projects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/admin/media?project=${p.id}`}
                        className="block pl-11 pr-5 py-2.5 text-[13px] text-muted hover:text-text hover:bg-s1"
                      >
                        {p.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {clientGroups.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted">
              No projects yet.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 pb-32 max-w-[1400px] mx-auto bjfade">
      <div className="mb-6">
        {selectedClientName && selectedClientId && (
          <Link
            href={`/admin/clients/${selectedClientId}`}
            className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-text mb-4 py-2.5 -my-2.5"
          >
            ← {selectedClientName}
          </Link>
        )}
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
          Media
        </div>
        <h1 className="text-[34px] tracking-tight font-black">
          {selectedProjectTitle}
        </h1>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {siblingProjects.length > 0 && (
          <>
            <span className="text-[11px] tracking-wide uppercase text-muted font-semibold">
              Switch project
            </span>
            <select
              value={selectedProjectId}
              onChange={(e) => selectProject(e.target.value)}
              className="bg-bg border border-line2 px-3.5 py-2.5 text-[13px] text-text outline-none"
            >
              <option value={selectedProjectId}>{selectedProjectTitle}</option>
              {siblingProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="flex border border-line2">
          {(["files", "calendar"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`cursor-pointer text-[11px] font-semibold uppercase px-3 py-2 ${
                view === v ? "bg-accent text-bg" : "text-muted hover:text-text"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-3 py-2"
        >
          Upload
        </button>
        <Link
          href={`/admin/library?project=${selectedProjectId}`}
          className="text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-3 py-2"
        >
          Import from NAS →
        </Link>
        <button
          onClick={() => setFoldersDialogOpen(true)}
          className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-3 py-2"
        >
          Folders{folders.length > 0 ? ` (${folders.length})` : ""}
        </button>
        {folders.length > 0 && (
          <>
            <span className="text-[11px] tracking-wide uppercase text-muted font-semibold">
              Folder
            </span>
            <select
              value={folderFilterId}
              onChange={(e) => {
                setFolderFilterId(e.target.value);
                setSelectedIds(new Set());
              }}
              className="bg-bg border border-line2 px-3.5 py-2.5 text-[13px] text-text outline-none"
            >
              <option value="ALL">All</option>
              <option value="UNSORTED">Unsorted</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {view === "calendar" && (
        <AdminMediaCalendar
          rows={tableRows}
          onPatch={(id, fields) => patchAsset(id, fields)}
        />
      )}

      {view === "files" && (
        <>
          {/* §10: five stat tiles replaced by one line. They spent a whole row restating
          what the table shows, and the fifth ("Workers online: 1") was a hardcoded
          literal — it never reflected anything. */}
          <div className="flex items-center gap-2.5 flex-wrap text-[13px] text-muted mb-4">
            <span>{rows.length} assets</span>
            <span className="w-1 h-1 rounded-full bg-dim" />
            <span className="tabular-nums">{formatBytes(totalBytes)}</span>
            <span className="w-1 h-1 rounded-full bg-dim" />
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-success" />
              {ready} ready
            </span>
            {generating > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-dim" />
                <span className="text-accentb">{generating} generating</span>
              </>
            )}
            {failed > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-dim" />
                <Link href="/admin/media" className="text-accent font-semibold">
                  {failed} failed
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-5">
            {[
              { id: "ALL", label: `All ${byFolder.length}` },
              ...Object.keys(formatCounts)
                .sort()
                .map((f) => ({ id: f, label: `${f} ${formatCounts[f]}` })),
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => setFormatFilter(c.id)}
                className={`cursor-pointer text-[11px] font-semibold uppercase tracking-wide px-3.5 py-2 border ${
                  formatFilter === c.id
                    ? "bg-text text-bg border-text"
                    : "border-line2 text-muted hover:text-text"
                }`}
              >
                {c.label}
              </button>
            ))}
            {needsWeekCount > 0 && (
              <button
                onClick={() => setFormatFilter("NEEDS_WEEK")}
                title="Client-visible files with no delivery week — invisible to the calendar and the weekly Slack post"
                className={`cursor-pointer text-[11px] font-semibold uppercase tracking-wide px-3.5 py-2 border ${
                  formatFilter === "NEEDS_WEEK"
                    ? "bg-accentb text-bg border-accentb"
                    : "border-accentb/60 text-accentb hover:border-accentb"
                }`}
              >
                Needs week {needsWeekCount}
              </button>
            )}
          </div>

          {previewId && (
            <AdminProxyViewer
              // Keyed on the active file: moving to the next one remounts, which resets
              // playback state without an effect that writes state on every id change.
              key={previewId}
              assets={tableRows}
              activeId={previewId}
              onNavigate={setPreviewId}
              onClose={() => setPreviewId(null)}
              onRegenerate={(a) => retry(rows.find((r) => r.id === a.id)!)}
              onToggleInternal={(a) =>
                toggleInternal(rows.find((r) => r.id === a.id)!)
              }
            />
          )}

          {/* §10: the bulk actions were an inline block that pushed the table down and
          scrolled away with it. Fixed to the bottom, matching the client-side selection
          bar, so the count and the actions stay where the eye is while selecting.

          No bulk "set week" here on purpose: weekOf is the post's day, and the calendar
          and Slack post both render one file per date. Setting twelve files to one week
          would silently drop eleven of them. */}
          {selectedIds.size > 0 && (
            <div
              data-testid="bulk-bar"
              className="fixed inset-x-0 bottom-0 sm:inset-x-10 sm:bottom-6 z-40 bjrise"
            >
              <div className="bg-s2 border border-line2 px-4 sm:px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_18px_50px_rgba(0,0,0,.6)] flex items-center gap-3 flex-wrap">
                <span className="text-sm font-extrabold tabular-nums">
                  {selectedIds.size} selected
                </span>
                <span className="text-[13px] text-muted tabular-nums">
                  {formatBytes(selectedBytes)}
                </span>

                <div className="flex items-center gap-2">
                  <select
                    value={moveTargetId}
                    onChange={(e) => setMoveTargetId(e.target.value)}
                    className="bg-bg border border-line2 px-2.5 py-1.5 text-[11px] text-text outline-none"
                  >
                    <option value="">Move to…</option>
                    <option value="UNSORTED">Unsorted</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={bulkMove}
                    disabled={!moveTargetId || moving}
                    className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5 disabled:opacity-40"
                  >
                    {moving ? "Moving…" : "Move"}
                  </button>
                </div>

                <button
                  onClick={() => bulkSetInternal(true)}
                  disabled={bulkHiding}
                  className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5 disabled:opacity-40"
                >
                  Hide from client
                </button>
                <button
                  onClick={() => bulkSetInternal(false)}
                  disabled={bulkHiding}
                  className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5 disabled:opacity-40"
                >
                  Show to client
                </button>

                <div className="flex-1" />

                {moveError && (
                  <span className="text-[11px] text-accentb">{moveError}</span>
                )}
                {bulkDeleteError && (
                  <span className="text-[11px] text-accentb">
                    {bulkDeleteError}
                  </span>
                )}

                {confirmingBulkDelete ? (
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-[11px] text-muted">
                      Delete permanently?
                    </span>
                    <button
                      onClick={bulkDelete}
                      disabled={bulkDeleting}
                      className="cursor-pointer text-[11px] font-semibold text-accentb hover:text-text border border-accentb px-2.5 py-1.5"
                    >
                      {bulkDeleting
                        ? "Deleting…"
                        : `Confirm (${selectedIds.size})`}
                    </button>
                    <button
                      onClick={() => {
                        setConfirmingBulkDelete(false);
                        setBulkDeleteError(null);
                      }}
                      className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text px-2.5 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setBulkDeleteError(null);
                      setConfirmingBulkDelete(true);
                    }}
                    className="cursor-pointer text-[11px] font-semibold text-dim hover:text-accentb border border-line2 hover:border-accentb px-2.5 py-1.5"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="cursor-pointer text-[11px] font-semibold uppercase text-muted hover:text-text px-2.5 py-1.5"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="border border-line">
            <div
              className="hidden md:grid gap-3.5 px-5 py-3.5 border-b-2 border-line2 text-[10.5px] tracking-wide uppercase text-muted font-bold items-center"
              style={{
                gridTemplateColumns: "24px 96px 2.4fr 1fr 1fr 1.4fr 56px",
              }}
            >
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={
                  tableRows.length > 0 && selectedIds.size === tableRows.length
                }
                onChange={toggleSelectAll}
                disabled={tableRows.length === 0}
                aria-label="Select all"
                className="cursor-pointer w-3.5 h-3.5"
              />
              <span />
              <span>File</span>
              <span>Type</span>
              <span>Size</span>
              <span>Proxy / Thumb</span>
              <span className="text-right">Action</span>
            </div>
            {tableRows.map((a) => {
              const status = STATUS_MAP[a.proxyStatus];
              const isMaster = a.format === "Master";
              return (
                <div
                  key={a.id}
                  data-testid={`asset-row-${a.id}`}
                  className="flex flex-col gap-2.5 px-4 py-4 border-b border-line last:border-b-0 md:grid md:gap-3.5 md:px-5 md:py-3.5 md:items-center"
                  style={{
                    gridTemplateColumns: "24px 96px 2.4fr 1fr 1fr 1.4fr 56px",
                  }}
                >
                  {/* Thumbnail + filename/badges/week share a row on mobile (display:contents
                  at md: makes this wrapper disappear, restoring the plain 7-col grid). */}
                  <div className="flex items-start gap-3 md:contents">
                    {/* The tap target is the label, not the 14px box: padding has no
                        effect on a checkbox, and a thumb does not hit 14px reliably. */}
                    <label className="flex items-center cursor-pointer p-2.5 -m-1.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelectOne(a.id)}
                        aria-label={`Select ${a.name}`}
                        className="cursor-pointer w-3.5 h-3.5 shrink-0"
                      />
                    </label>
                    {/* §10: 96×54. The pipeline has been generating a poster all along
                    (Asset.thumbRelPath) and the client gallery shows it; the admin table
                    was drawing a gradient over the top of it, so the one screen used to
                    identify a file was the one that never showed the frame. The gradient
                    stays as the ground behind it, which is what shows while a proxy is
                    still generating or if the thumb 404s. */}
                    <div
                      className="w-24 h-[54px] relative shrink-0 overflow-hidden"
                      style={{ background: gradientFor(a.id) }}
                    >
                      {a.thumbReady && !thumbFailed.has(a.id) && (
                        // eslint-disable-next-line @next/next/no-img-element -- proxied binary from our own API, not a static asset Next can optimize
                        <img
                          src={`/api/assets/${a.id}/thumb`}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={() =>
                            setThumbFailed((s) => new Set(s).add(a.id))
                          }
                        />
                      )}
                      {a.kind === "VIDEO" && (
                        <div className="absolute inset-0 grid place-items-center text-white/90 text-[11px] drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">
                          ▶
                        </div>
                      )}
                      {a.proxyStatus === "GENERATING" ? (
                        <span className="absolute bottom-0 right-0 bg-black/75 text-white/85 text-[9px] px-1 py-0.5">
                          encoding
                        </span>
                      ) : (
                        a.durationSec != null && (
                          <span className="absolute bottom-0 right-0 bg-black/75 text-white/85 text-[9px] px-1 py-0.5 tabular-nums">
                            {Math.floor(a.durationSec / 60)}:
                            {String(a.durationSec % 60).padStart(2, "0")}
                          </span>
                        )
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="text-[13px] font-mono text-text truncate">
                          {a.name}
                        </span>
                        {a.internal && (
                          <span className="flex-none text-[9px] font-bold tracking-wide text-muted border border-line2 px-1.5 py-0.5">
                            INTERNAL
                          </span>
                        )}
                        {a.licensable && (
                          <span className="flex-none text-[9px] font-bold tracking-wide text-accentb border border-accent/40 px-1.5 py-0.5">
                            PAYWALLED
                          </span>
                        )}
                        {a.licenseExpired && (
                          <span className="flex-none text-[9px] font-bold tracking-wide text-accent border border-accent px-1.5 py-0.5">
                            LICENSE EXPIRED
                          </span>
                        )}
                        {a.reingestCount > 0 && (
                          <span
                            title="Re-uploaded to this same path after its first ingest — worth a second look if playback seems off"
                            className="flex-none text-[9px] font-bold tracking-wide text-accentb border border-accentb/40 px-1.5 py-0.5"
                          >
                            ↻ RE-UPLOADED
                            {a.reingestCount > 1 ? ` ×${a.reingestCount}` : ""}
                            {a.lastReplacedAt
                              ? ` · ${timeAgo(a.lastReplacedAt)}`
                              : ""}
                          </span>
                        )}
                      </div>
                      {/* §10 sub-line: the specs that decide whether this is the right
                      file, which otherwise meant opening it to find out. */}
                      {(a.dims || a.masterCodec || a.proxyRes) && (
                        <div className="text-[11px] text-dim mt-0.5 truncate">
                          {[
                            a.dims,
                            (a.masterCodec ?? a.proxyRes)?.split(" · ")[0],
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] text-dim uppercase tracking-wide">
                          Week
                        </span>
                        <input
                          type="date"
                          defaultValue={a.weekOf ? a.weekOf.slice(0, 10) : ""}
                          onChange={(e) =>
                            setWeekOfDrafts((d) => ({
                              ...d,
                              [a.id]: e.target.value,
                            }))
                          }
                          onBlur={() => saveWeekOf(a)}
                          aria-label={`Delivery week for ${a.name}`}
                          className={`bg-bg border text-[11px] px-1.5 py-2 outline-none focus:border-accent ${
                            a.weekOf
                              ? "border-line2 text-text"
                              : "border-accent/50 text-accentb"
                          }`}
                        />
                        {/* Folder, title and captions used to sit open on every row, which
                        made a thirteen-file project two thousand pixels of mostly-empty
                        form. Folded away behind this, so the table reads as a table. */}
                        <button
                          onClick={() =>
                            setExpandedRows((set) => {
                              const next = new Set(set);
                              if (next.has(a.id)) next.delete(a.id);
                              else next.add(a.id);
                              return next;
                            })
                          }
                          aria-expanded={expandedRows.has(a.id)}
                          className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-dim hover:text-text ml-2 py-2.5 -my-2.5"
                        >
                          {expandedRows.has(a.id) ? "Hide details" : "Details"}
                          {!expandedRows.has(a.id) &&
                          (a.contentTitle || a.caption || a.captionYT)
                            ? " ·"
                            : ""}
                        </button>
                      </div>
                      {expandedRows.has(a.id) && (
                        <>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className="text-[10px] text-dim uppercase tracking-wide">
                              Folder
                            </span>
                            <select
                              value={a.folderId ?? ""}
                              onChange={(e) =>
                                saveFolder(a, e.target.value || null)
                              }
                              className="bg-bg border border-line2 text-[11px] text-text px-1.5 py-1 outline-none focus:border-accent"
                            >
                              <option value="">Unsorted</option>
                              {folders.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                            <span className="text-[10px] text-dim uppercase tracking-wide ml-2">
                              Title
                            </span>
                            <input
                              type="text"
                              defaultValue={a.contentTitle ?? ""}
                              placeholder="e.g. TOVA (FAM ONLY)"
                              onChange={(e) =>
                                setTitleDrafts((d) => ({
                                  ...d,
                                  [a.id]: e.target.value,
                                }))
                              }
                              onBlur={() => saveContentTitle(a)}
                              className="bg-bg border border-line2 text-[11px] text-text px-1.5 py-1 outline-none focus:border-accent w-44"
                            />
                          </div>
                          <div className="mt-1.5">
                            <textarea
                              defaultValue={a.caption ?? ""}
                              placeholder="IG & YT caption…"
                              rows={2}
                              onChange={(e) =>
                                setCaptionDrafts((d) => ({
                                  ...d,
                                  [a.id]: e.target.value,
                                }))
                              }
                              onBlur={() => saveCaption(a)}
                              className="w-full bg-bg border border-line2 text-[11px] text-text px-1.5 py-1 outline-none focus:border-accent resize-y"
                            />
                            {a.captionYT != null || ytExpanded.has(a.id) ? (
                              <textarea
                                defaultValue={a.captionYT ?? ""}
                                placeholder="YouTube caption (if different)…"
                                rows={2}
                                onChange={(e) =>
                                  setCaptionYTDrafts((d) => ({
                                    ...d,
                                    [a.id]: e.target.value,
                                  }))
                                }
                                onBlur={() => saveCaptionYT(a)}
                                className="w-full mt-1 bg-bg border border-accent/40 text-[11px] text-text px-1.5 py-1 outline-none focus:border-accent resize-y"
                              />
                            ) : (
                              <button
                                onClick={() =>
                                  setYtExpanded((s) => new Set(s).add(a.id))
                                }
                                className="cursor-pointer text-[10px] text-dim hover:text-accentb mt-1"
                              >
                                + Different caption for YouTube
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Format/size/status flow inline on mobile instead of each fighting for a
                  narrow fixed grid column. */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:contents">
                    <span className="font-bold tracking-wide text-muted">
                      {a.format.toUpperCase()}
                    </span>
                    <span className="text-[13px] text-muted tabular-nums">
                      {a.size}
                    </span>
                    <div className="flex items-center gap-2">
                      {a.proxyStatus === "GENERATING" && (
                        <span className="w-3 h-3 border-2 border-line2 border-t-accent rounded-full bjspin inline-block" />
                      )}
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-none"
                        style={{ background: status.color }}
                      />
                      <span
                        className="text-xs font-semibold"
                        style={{ color: status.color }}
                      >
                        {status.label}
                      </span>
                    </div>
                    {a.socialPosts.map((p) => (
                      <div key={p.id} className="flex items-center gap-1.5">
                        {p.permalink ? (
                          <a
                            href={p.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-accentb hover:text-text py-2 -my-2 inline-block"
                          >
                            ▶ {formatViews(p.viewCount)} views ↗
                          </a>
                        ) : (
                          <span className="text-[11px] font-semibold text-accentb">
                            ▶ {formatViews(p.viewCount)} views
                          </span>
                        )}
                        <button
                          onClick={() => unlinkSocialPost(a.id, p.id)}
                          className="cursor-pointer text-[10px] text-dim hover:text-accentb px-2.5 py-2 -mx-1 -my-1"
                          title="Unlink this post"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col items-start gap-1.5 md:items-end">
                    {confirmingDeleteId === a.id ? (
                      <div className="flex gap-2 items-center justify-start md:justify-end flex-wrap">
                        <span className="text-[11px] text-muted">
                          Delete permanently?
                        </span>
                        <button
                          onClick={() => deleteAsset(a)}
                          disabled={deletingId === a.id}
                          className="cursor-pointer text-[11px] font-semibold text-accentb hover:text-text border border-accentb px-2.5 py-1.5"
                        >
                          {deletingId === a.id ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteId(null)}
                          className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text px-2.5 py-1.5"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center justify-start md:justify-end flex-wrap">
                        {/* The price is data rather than an action, so it stays on the row
                        where it can be read without opening anything. Everything you *do*
                        to a file moved into the menu. */}
                        {isMaster && a.licensable && (
                          <input
                            defaultValue={a.basePrice ?? ""}
                            onChange={(e) =>
                              setPriceDrafts((d) => ({
                                ...d,
                                [a.id]: e.target.value,
                              }))
                            }
                            onBlur={() => savePrice(a)}
                            placeholder="Base $"
                            aria-label={`Base price for ${a.name}`}
                            className="w-20 bg-bg border border-line2 text-text text-[11px] px-2 py-1.5 outline-none focus:border-accent"
                          />
                        )}
                        <RowMenu label={`Actions for ${a.name}`}>
                          {(close) => (
                            <>
                              <RowMenuItem
                                onClick={() => {
                                  setPreviewId(a.id);
                                  close();
                                }}
                              >
                                Preview proxy
                              </RowMenuItem>
                              <RowMenuItem
                                onClick={() => {
                                  toggleInternal(a);
                                  close();
                                }}
                              >
                                {a.internal
                                  ? "Show client"
                                  : "Hide from client"}
                              </RowMenuItem>
                              {a.proxyStatus !== "GENERATING" && (
                                <RowMenuItem
                                  onClick={() => {
                                    retry(a);
                                    close();
                                  }}
                                >
                                  {a.proxyStatus === "READY"
                                    ? "Regenerate proxy"
                                    : "Retry proxy"}
                                </RowMenuItem>
                              )}
                              {isMaster && (
                                <>
                                  <div className="h-px bg-line my-1" />
                                  <RowMenuItem
                                    onClick={() => {
                                      toggleLicensable(a);
                                      close();
                                    }}
                                  >
                                    {a.licensable
                                      ? "License off"
                                      : "Licensable"}
                                  </RowMenuItem>
                                  {a.licensable && a.basePrice != null && (
                                    <RowMenuItem
                                      onClick={() => {
                                        setGrantingLicenseFor(a);
                                        close();
                                      }}
                                    >
                                      Grant custom license
                                    </RowMenuItem>
                                  )}
                                </>
                              )}
                              <div className="h-px bg-line my-1" />
                              <RowMenuItem
                                tone="danger"
                                onClick={() => {
                                  setDeleteError(null);
                                  setConfirmingDeleteId(a.id);
                                  close();
                                }}
                              >
                                Delete
                              </RowMenuItem>
                            </>
                          )}
                        </RowMenu>
                      </div>
                    )}
                    {confirmingDeleteId === a.id && deleteError && (
                      <div className="text-[11px] text-accentb text-left md:text-right max-w-[240px]">
                        {deleteError}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {tableRows.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted">
                {rows.length === 0
                  ? "No assets in this project yet."
                  : "No assets in this folder."}
              </div>
            )}
          </div>
        </>
      )}

      {uploadOpen && selectedProjectId && (
        <UploadDialog
          projectId={selectedProjectId}
          projectTitle={selectedProjectTitle ?? "this project"}
          folders={folders}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => router.refresh()}
        />
      )}

      {foldersDialogOpen && selectedProjectId && (
        <ManageFoldersDialog
          projectId={selectedProjectId}
          folders={folders}
          onClose={() => setFoldersDialogOpen(false)}
          onChanged={() => router.refresh()}
        />
      )}

      {grantingLicenseFor && selectedClientName && (
        <GrantLicenseDialog
          assetId={grantingLicenseFor.id}
          assetName={grantingLicenseFor.name}
          clientName={selectedClientName}
          seats={clientSeats}
          onClose={() => setGrantingLicenseFor(null)}
          onGranted={() => {
            setGrantingLicenseFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
