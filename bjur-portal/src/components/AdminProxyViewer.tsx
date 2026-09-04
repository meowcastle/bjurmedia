"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/ui/Portal";

export type ProxyViewerAsset = {
  id: string;
  name: string;
  kind: "PHOTO" | "VIDEO";
  format: string;
  size: string;
  dims: string | null;
  durationSec: number | null;
  masterCodec: string | null;
  proxyRes: string | null;
  relPath: string;
  proxyStatus: "PENDING" | "GENERATING" | "READY" | "FAILED";
  internal: boolean;
  weekOf: string | null;
};

function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-line last:border-b-0">
      <span className="text-[10px] uppercase tracking-wide text-dim flex-none">{label}</span>
      <span className="text-[12px] text-text text-right min-w-0 break-words">{value}</span>
    </div>
  );
}

/**
 * §10 admin preview. Not the client viewer: that one is a swipe carousel built to feel
 * like Photos, and what an admin needs off a file is the opposite — the proxy playing
 * beside the facts you would otherwise have to go looking for (is the proxy actually
 * ready, can the client see it, is it scheduled, where does the master live on disk).
 *
 * Photos have no proxy — proxyGen only encodes one for video — so a still previews from
 * its 960px poster instead of showing an empty frame.
 */
export function AdminProxyViewer({
  assets,
  activeId,
  onNavigate,
  onClose,
  onRegenerate,
  onToggleInternal,
}: {
  assets: ProxyViewerAsset[];
  activeId: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onRegenerate: (a: ProxyViewerAsset) => void;
  onToggleInternal: (a: ProxyViewerAsset) => void;
}) {
  const index = assets.findIndex((a) => a.id === activeId);
  const asset = index >= 0 ? assets[index] : null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      // Never swallow a key that belongs to something being typed in, and leave the
      // video its own native Space when it is the focused control.
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = index + (e.key === "ArrowRight" ? 1 : -1);
        // Stop at the ends rather than wrapping — wrapping past the last file reads as
        // a jump back to the top of the table you did not ask for.
        if (next >= 0 && next < assets.length) onNavigate(assets[next].id);
        return;
      }
      if (e.key === " " && el?.tagName !== "VIDEO") {
        const v = videoRef.current;
        if (!v) return;
        e.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, assets, onNavigate, onClose]);

  if (!asset) return null;

  const src = asset.kind === "VIDEO" ? `/api/assets/${asset.id}/proxy` : `/api/assets/${asset.id}/thumb`;
  const hasPlayableProxy = asset.kind === "VIDEO" && asset.proxyStatus === "READY";

  return (
    <Portal>
      <div
        data-testid="admin-proxy-viewer"
        className="fixed inset-0 z-50 bg-black flex flex-col lg:flex-row"
      >
        {/* Media */}
        <div className="relative flex-1 min-h-0 grid place-items-center p-4 lg:p-8">
          {mediaFailed || (asset.kind === "VIDEO" && !hasPlayableProxy) ? (
            <div className="text-center max-w-sm">
              <div className="text-[13px] text-white/80 font-semibold">No proxy to preview</div>
              <div className="text-[12px] text-white/50 mt-2">
                {asset.proxyStatus === "GENERATING"
                  ? "Still encoding — this file will be previewable when the worker finishes."
                  : asset.proxyStatus === "FAILED"
                    ? "The last encode failed. Regenerate it from the rail."
                    : mediaFailed
                      ? // The row says READY but nothing streams: the derived file has
                        // gone missing or was never finished. Saying "no proxy yet"
                        // here would contradict the rail and hide real drift.
                        "The row says this proxy is ready, but the file will not load. Regenerate it from the rail."
                      : "This file has no proxy yet."}
              </div>
            </div>
          ) : asset.kind === "VIDEO" ? (
            <video
              ref={videoRef}
              key={asset.id}
              src={src}
              controls
              playsInline
              className="max-w-full max-h-full"
              onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => setMediaFailed(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- proxied binary from our own API, not a static asset Next can optimize
            <img
              key={asset.id}
              src={src}
              alt={asset.name}
              className="max-w-full max-h-full object-contain"
              onError={() => setMediaFailed(true)}
            />
          )}

          <div className="absolute left-0 right-0 bottom-1 text-center text-[11px] text-white/45 px-4">
            <span className="tabular-nums">
              {index + 1} / {assets.length} · admin preview
            </span>
            <span className="hidden sm:inline"> · SPACE play · ← → next · ESC close</span>
          </div>
        </div>

        {/* Rail */}
        <div className="w-full lg:w-[340px] flex-none bg-s2 border-t lg:border-t-0 lg:border-l border-line2 overflow-y-auto max-h-[45vh] lg:max-h-none">
          <div className="px-5 py-4 border-b border-line2 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-mono text-text break-all">{asset.name}</div>
              <div className="text-[11px] text-dim mt-1">
                {asset.format}
                {asset.dims ? ` · ${asset.dims}` : ""}
                {asset.durationSec ? ` · ${clock(asset.durationSec)}` : ""}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close preview"
              className="cursor-pointer text-white/60 hover:text-white text-lg leading-none flex-none"
            >
              ✕
            </button>
          </div>

          <div className="px-5 py-2">
            <Row
              label="Proxy"
              value={
                // A failed load beats whatever the row says: the database claiming READY
                // while the file will not stream is exactly the drift worth surfacing,
                // and reprinting "1080p H.264" next to "no proxy to preview" hides it.
                mediaFailed ? (
                  <span className="text-accentb">Missing on disk — regenerate</span>
                ) : hasPlayableProxy ? (
                  (asset.proxyRes ?? "Ready")
                ) : asset.kind === "PHOTO" ? (
                  "Stills have no proxy"
                ) : (
                  asset.proxyStatus.charAt(0) + asset.proxyStatus.slice(1).toLowerCase()
                )
              }
            />
            <Row label="Visible to client" value={asset.internal ? "No — internal" : "Yes"} />
            <Row
              label="Scheduled"
              value={asset.weekOf ? new Date(asset.weekOf).toISOString().slice(0, 10) : "Not scheduled"}
            />
            <Row label="Master" value={asset.masterCodec ?? asset.size} />
            {asset.kind === "VIDEO" && playing && <Row label="Position" value={clock(elapsed)} />}
            <Row label="Path" value={<span className="font-mono text-[11px] text-muted">{asset.relPath}</span>} />
          </div>

          <div className="px-5 py-4 border-t border-line2 flex flex-col gap-2">
            <button
              onClick={() => onToggleInternal(asset)}
              className="cursor-pointer text-[12px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-3 py-2"
            >
              {asset.internal ? "Show to client" : "Hide from client"}
            </button>
            {asset.proxyStatus !== "GENERATING" && (
              <button
                onClick={() => onRegenerate(asset)}
                className="cursor-pointer text-[12px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-3 py-2"
              >
                {asset.proxyStatus === "READY" ? "Regenerate proxy" : "Retry proxy"}
              </button>
            )}
            <a
              href={`/api/assets/${asset.id}/download`}
              className="text-center text-[12px] font-semibold text-accentb hover:text-text border border-accent/40 hover:border-text px-3 py-2"
            >
              ↓ Download master · {asset.size}
            </a>
          </div>
        </div>
      </div>
    </Portal>
  );
}
