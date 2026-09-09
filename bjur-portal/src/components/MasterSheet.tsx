"use client";

import { useEffect } from "react";
import { IconDownload, IconLock, IconClose } from "@/components/ui/Icon";

/**
 * The master sheet: everything about the file, one swipe up from the clip.
 *
 * The bottom bar used to carry a Download Master button inline, which meant the one
 * place to see what you were about to download was the button that downloaded it. The
 * facts live here now — resolution, duration, size, whether you are watching the proxy
 * or the master — and the action sits underneath them.
 *
 * Deliberately dark regardless of theme, like the rest of the viewer: this floats over
 * someone's footage, and the footage sets the ground.
 */
export type MasterFacts = {
  name: string;
  format: string;
  dims: string | null;
  durationLabel: string | null;
  size: string | null;
  /** Watermarked proxy standing in for a master nobody has licensed yet. */
  locked: boolean;
  licensable: boolean;
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
      <span className="text-[10px] uppercase tracking-[.12em] text-white/45">{label}</span>
      <span className="text-[13px] text-white/90 text-right tabular-nums">{value}</span>
    </div>
  );
}

export function MasterSheet({
  open,
  facts,
  assetId,
  canDownload,
  onClose,
  onRequestLicense,
}: {
  open: boolean;
  facts: MasterFacts;
  assetId: string;
  canDownload: boolean;
  onClose: () => void;
  onRequestLicense: () => void;
}) {
  // Escape closes the sheet before it closes the viewer — otherwise the sheet swallows
  // nothing and the whole viewer vanishes underneath an open drawer.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="absolute inset-0 z-30 bg-black/50"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        />
      )}
      <div
        data-testid="master-sheet"
        data-open={open ? "1" : "0"}
        aria-hidden={!open}
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 z-40 w-[min(560px,100%)] bg-[#0c0c0d] border-t border-white/15 transition-transform duration-500 ${
          open ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        style={{
          transitionTimingFunction: "cubic-bezier(.32,.72,0,1)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
        }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.12em] text-white/45 mb-1">Master</div>
            <div className="text-[15px] text-white truncate" title={facts.name}>
              {facts.name}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close master sheet"
            className="flex-none text-white/60 hover:text-white text-lg cursor-pointer"
          >
            <IconClose />
          </button>
        </div>

        <div className="px-5">
          <Fact label="Format" value={facts.format} />
          {facts.dims && <Fact label="Resolution" value={facts.dims} />}
          {facts.durationLabel && <Fact label="Duration" value={facts.durationLabel} />}
          {facts.size && <Fact label="Size" value={facts.size} />}
          <Fact
            label="Watching"
            value={facts.locked ? "Watermarked proxy" : "Proxy · master available"}
          />
        </div>

        <div className="px-5 pt-4">
          {facts.locked ? (
            <button
              onClick={onRequestLicense}
              data-testid="sheet-unlock"
              className="w-full bg-white text-black text-[12px] uppercase tracking-[.1em] py-3.5 cursor-pointer hover:bg-accent hover:text-white"
            >
              <span className="inline-flex items-center gap-2">
                <IconLock /> Unlock master
              </span>
            </button>
          ) : canDownload ? (
            <a
              href={`/api/assets/${assetId}/download`}
              data-testid="sheet-download"
              className="block w-full text-center bg-white text-black text-[12px] uppercase tracking-[.1em] py-3.5 hover:bg-accent hover:text-white"
            >
              <span className="inline-flex items-center gap-2">
                <IconDownload /> Download master{facts.size ? ` · ${facts.size}` : ""}
              </span>
            </a>
          ) : (
            // Viewers can watch but not take files. Saying so beats a button that
            // refuses, or worse, no button and no explanation.
            <div className="text-[12px] text-white/50 text-center py-3">
              Your access is view-only. Ask the account owner for downloads.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
