"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes } from "@/lib/format";
import { Portal } from "@/components/ui/Portal";

type Entry = { name: string; path: string; isFolder: boolean; size?: number };
type ProjectOption = { id: string; title: string; clientName: string };
type PreviewRow = {
  path: string;
  name: string;
  size: string;
  kind: "PHOTO" | "VIDEO";
  format: "Reel" | "Film" | "Still" | "Master";
  orientation: "landscape" | "portrait";
  dims: string | null;
  durationSec: number | null;
  dateGuess: string;
};

const FORMAT_CYCLE: PreviewRow["format"][] = ["Reel", "Film", "Still", "Master"];

function TreeNode({
  entry,
  depth,
  expanded,
  picked,
  childrenCache,
  onToggleExpand,
  onTogglePick,
  onToggleFolderPick,
}: {
  entry: Entry;
  depth: number;
  expanded: Set<string>;
  picked: Set<string>;
  childrenCache: Map<string, Entry[]>;
  onToggleExpand: (path: string) => void;
  onTogglePick: (path: string) => void;
  onToggleFolderPick: (entry: Entry) => void;
}) {
  const isOpen = expanded.has(entry.path);
  const isPicked = picked.has(entry.path);
  const children = childrenCache.get(entry.path);

  return (
    <>
      <div
        className="flex items-center gap-2.5 px-4 py-2 border-b border-line hover:bg-white/[0.02]"
        style={{ paddingLeft: 16 + depth * 22 }}
      >
        {entry.isFolder ? (
          <button
            onClick={() => onToggleExpand(entry.path)}
            className="w-3.5 text-center cursor-pointer text-muted text-[11px] flex-none"
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-3.5 flex-none" />
        )}
        <div
          onClick={() => (entry.isFolder ? onToggleFolderPick(entry) : onTogglePick(entry.path))}
          role="checkbox"
          aria-checked={isPicked}
          aria-label={entry.name}
          className={`w-[18px] h-[18px] border-[1.5px] grid place-items-center cursor-pointer flex-none ${
            isPicked ? "bg-accent border-accent" : "border-line2"
          }`}
        >
          {isPicked && <span className="text-bg text-[11px] font-extrabold leading-none">✓</span>}
        </div>
        <span className="text-[13px] font-mono text-text truncate flex-1 min-w-0">{entry.name}</span>
        {!entry.isFolder && entry.size !== undefined && (
          <span className="text-[11px] text-dim whitespace-nowrap flex-none">{formatBytes(entry.size)}</span>
        )}
      </div>
      {entry.isFolder && isOpen && children && (
        <>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expanded={expanded}
              picked={picked}
              childrenCache={childrenCache}
              onToggleExpand={onToggleExpand}
              onTogglePick={onTogglePick}
              onToggleFolderPick={onToggleFolderPick}
            />
          ))}
          {children.length === 0 && (
            <div className="px-4 py-2 text-xs text-dim" style={{ paddingLeft: 16 + (depth + 1) * 22 }}>
              Empty
            </div>
          )}
        </>
      )}
    </>
  );
}

export function AdminLibraryClient({
  archiveRoot,
  rootEntries,
  projects,
  preselectProjectId,
}: {
  archiveRoot: string;
  rootEntries: Entry[];
  projects: ProjectOption[];
  preselectProjectId?: string;
}) {
  const router = useRouter();
  const [childrenCache, setChildrenCache] = useState<Map<string, Entry[]>>(
    () => new Map([["", rootEntries]])
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [targetProject, setTargetProject] = useState(
    (preselectProjectId && projects.some((p) => p.id === preselectProjectId) ? preselectProjectId : null) ??
      projects[0]?.id ??
      ""
  );
  const [autoMap, setAutoMap] = useState(true);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDir = useCallback(async (dirPath: string) => {
    const res = await fetch(`/api/admin/library/scan?dir=${encodeURIComponent(dirPath)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setChildrenCache((c) => new Map(c).set(dirPath, data.entries));
    }
  }, []);

  async function toggleExpand(dirPath: string) {
    const isOpen = expanded.has(dirPath);
    setExpanded((s) => {
      const next = new Set(s);
      if (isOpen) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
    if (!isOpen && !childrenCache.has(dirPath)) {
      await loadDir(dirPath);
    }
  }

  function togglePick(filePath: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }

  async function toggleFolderPick(folder: Entry) {
    const res = await fetch(`/api/admin/library/scan?dir=${encodeURIComponent(folder.path)}&recursive=1`);
    const data = await res.json().catch(() => ({ entries: [] }));
    const filePaths: string[] = data.entries.map((e: Entry) => e.path);
    const allPicked = filePaths.every((p) => picked.has(p));
    setPicked((s) => {
      const next = new Set(s);
      filePaths.forEach((p) => (allPicked ? next.delete(p) : next.add(p)));
      return next;
    });
  }

  async function runPreview() {
    if (!picked.size) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/library/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: Array.from(picked), projectId: targetProject, autoMap }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Preview failed.");
      return;
    }
    setPreview(data.rows);
  }

  function cycleFormat(path: string) {
    setPreview((rows) =>
      (rows ?? []).map((r) =>
        r.path === path ? { ...r, format: FORMAT_CYCLE[(FORMAT_CYCLE.indexOf(r.format) + 1) % FORMAT_CYCLE.length] } : r
      )
    );
  }

  function removeFromPreview(path: string) {
    setPreview((rows) => (rows ?? []).filter((r) => r.path !== path));
    setPicked((s) => {
      const next = new Set(s);
      next.delete(path);
      return next;
    });
  }

  async function confirmImport() {
    if (!preview?.length) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/library/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: targetProject,
        items: preview.map((r) => ({
          path: r.path,
          name: r.name,
          kind: r.kind,
          format: r.format,
          orientation: r.orientation,
          dims: r.dims,
          durationSec: r.durationSec,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Import failed.");
      return;
    }
    setPreview(null);
    setPicked(new Set());
    router.refresh();
  }

  return (
    <div className="px-10 py-12 max-w-[1400px] mx-auto bjfade">
      <div className="mb-2">
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
          Back-catalog import
        </div>
        <h1 className="text-[34px] tracking-tight font-black">Library</h1>
      </div>
      <p className="text-sm text-muted max-w-[640px] mb-6">
        Browse what&apos;s already on the NAS and pull in only what you want — files are registered in
        place, never moved or re-uploaded.
      </p>

      <div className="grid grid-cols-[1fr_340px] gap-5 items-start">
        <div className="border border-line">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b-2 border-line2 text-[11px] font-mono text-muted">
            <span className="text-dim">▸</span> {archiveRoot}
          </div>
          {rootEntries.map((e) => (
            <TreeNode
              key={e.path}
              entry={e}
              depth={0}
              expanded={expanded}
              picked={picked}
              childrenCache={childrenCache}
              onToggleExpand={toggleExpand}
              onTogglePick={togglePick}
              onToggleFolderPick={toggleFolderPick}
            />
          ))}
          {rootEntries.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted">
              Nothing found under this archive path.
            </div>
          )}
        </div>

        <div className="border border-line bg-s1 sticky top-[92px]">
          <div className="p-5 border-b border-line">
            <div className="text-[10.5px] tracking-wide uppercase text-muted font-bold mb-3">
              Register to project
            </div>
            <select
              value={targetProject}
              onChange={(e) => setTargetProject(e.target.value)}
              className="w-full bg-bg border border-line2 px-3.5 py-2.5 text-[13px] text-text outline-none mb-3"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.clientName} — {p.title}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-3 mt-2">
              <div>
                <div className="text-[13px] font-semibold">Auto-map from path</div>
                <div className="text-[11px] text-dim mt-0.5 max-w-[190px]">
                  Derive date from filename, format from file content
                </div>
              </div>
              <div
                onClick={() => setAutoMap((v) => !v)}
                className={`w-10 h-[22px] border border-line2 relative cursor-pointer flex-none ${autoMap ? "bg-accent" : "bg-s3"}`}
              >
                <div
                  className="w-4 h-4 bg-bg absolute top-[2px] transition-transform"
                  style={{ transform: autoMap ? "translateX(20px)" : "translateX(2px)" }}
                />
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-[32px] font-black tracking-tight tabular-nums">{picked.size}</span>{" "}
              <span className="text-xs text-muted">file(s) selected</span>
            </div>
            {error && <div className="text-xs text-accentb mb-3 font-semibold">{error}</div>}
            <button
              onClick={runPreview}
              disabled={!picked.size || !targetProject || loading}
              className="w-full cursor-pointer font-bold text-[13px] text-bg bg-accent hover:bg-accentb px-0 py-3.5 disabled:opacity-50"
            >
              {loading ? "Working…" : "Preview import"}
            </button>
            <div className="mt-3 text-[11px] text-dim leading-relaxed">
              Registered in place · originals stay put · proxies + thumbnails queued to the worker.
            </div>
          </div>
        </div>
      </div>

      {preview && (
        <Portal>
        <div className="fixed inset-0 z-50 bg-black/75 grid place-items-center p-6 bjfade" onClick={() => setPreview(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[640px] max-h-[80vh] bg-s2 border border-line2 flex flex-col bjrise"
          >
            <div className="p-6 border-b border-line2">
              <div className="text-xl font-black tracking-tight">Confirm import</div>
              <div className="text-[13px] text-muted mt-1">
                Tap a format tag to correct it before registering.
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {preview.map((r) => (
                <div key={r.path} className="flex items-center gap-3 px-6 py-3 border-b border-line">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-mono truncate">{r.name}</div>
                    <div className="text-[11px] text-dim mt-0.5">
                      {r.size} · {r.dateGuess}
                    </div>
                  </div>
                  <button
                    onClick={() => cycleFormat(r.path)}
                    className="cursor-pointer text-[11px] font-bold tracking-wide uppercase text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5 whitespace-nowrap"
                  >
                    {r.format}
                  </button>
                  <button
                    onClick={() => removeFromPreview(r.path)}
                    className="cursor-pointer text-dim hover:text-accentb text-sm px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="p-5 flex justify-end gap-2.5 border-t border-line2">
              <button
                onClick={() => setPreview(null)}
                className="cursor-pointer text-[13px] font-semibold text-muted hover:text-text border border-line2 px-4 py-2.5"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={loading || preview.length === 0}
                className="cursor-pointer font-bold text-[13px] text-bg bg-accent hover:bg-accentb px-5 py-2.5 disabled:opacity-50"
              >
                {loading ? "Registering…" : `Register ${preview.length} file(s)`}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
