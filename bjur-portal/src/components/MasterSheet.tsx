"use client";

import { useEffect, useState } from "react";
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
  /** The project is on a payment hold: this downloads marked, at full quality. */
  watermarked: boolean;
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
  // The refusal is remembered against the clip it was about, so swiping to the next one
  // does not carry someone else's error along with it. Cheaper and more honest than
  // clearing it from an effect.
  const [error, setError] = useState<{ assetId: string; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const visibleError = error?.assetId === assetId ? error.message : null;

  /**
   * Ask for one byte before committing the browser to a navigation.
   *
   * A held project can refuse a download (409) while its watermarked copy is still
   * encoding, and a plain <a> would answer that by showing the client raw JSON in a new
   * tab. The preflight is a ranged request, which the download route deliberately does
   * not log as a download, so checking costs nothing in the activity feed — and the real
   * download still goes through the browser rather than a blob, so a multi-gigabyte
   * master never has to sit in memory.
   */
  async function startDownload(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let a modified click (new tab, save-as) go straight through untouched.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();

    const url = `/api/assets/${assetId}/download`;
    setError(null);
    setChecking(true);
    const ctrl = new AbortController();
    try {
      const res = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: ctrl.signal });
      if (res.ok) {
        ctrl.abort(); // never read the body — this was only ever a question
        window.location.href = url;
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError({
        assetId,
        message: body?.error ?? "This file could not be downloaded just now. Try again shortly.",
      });
    } catch {
      setError({
        assetId,
        message: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setChecking(false);
    }
  }

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
            value={
              facts.watermarked
                ? "Watermarked · full quality"
                : facts.locked
                  ? "Watermarked proxy"
                  : "Proxy · master available"
            }
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
            <>
              {/* Still a real link, not a button: right-click \u2192 Save link as keeps working,
                  and if the preflight below never runs the href is the plain old download
                  it always was. The click handler only intercepts to ask first. */}
              <a
                href={`/api/assets/${assetId}/download`}
                onClick={startDownload}
                aria-disabled={checking}
                data-testid="sheet-download"
                className={`block w-full text-center bg-white text-black text-[12px] uppercase tracking-[.1em] py-3.5 hover:bg-accent hover:text-white ${
                  checking ? "opacity-70 pointer-events-none" : ""
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <IconDownload />
                  {checking
                    ? "Starting\u2026"
                    : `Download ${facts.watermarked ? "watermarked copy" : "master"}${
                        facts.size ? ` \u00b7 ${facts.size}` : ""
                      }`}
                </span>
              </a>
              {visibleError && (
                <div
                  data-testid="sheet-download-error"
                  className="mt-3 text-[12px] leading-relaxed text-white/75 bg-white/10 px-3.5 py-3"
                >
                  {visibleError}
                </div>
              )}
            </>
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
