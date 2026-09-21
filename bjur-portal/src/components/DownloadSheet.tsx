"use client";

import { useState } from "react";
import { IconDownload, IconClose } from "@/components/ui/Icon";

/**
 * The viewer's swipe-up sheet: what this file is, and the one button that takes it.
 *
 * Replaced MasterSheet, which was built around licensing — tiers, a price, an "Unlock
 * master" path. None of that exists now. What survives is the part that was always the
 * point: you can see what you are about to download before you download it.
 *
 * Visual pass is still to come (D4); this keeps the behaviour working in the meantime,
 * including the preflight below, which is the bit that would be easy to lose in a
 * restyle and expensive to notice.
 *
 * Deliberately dark regardless of theme, like the rest of the viewer: this floats over
 * someone's footage, and the footage sets the ground.
 */
export type DownloadFacts = {
  name: string;
  format: string;
  dims: string | null;
  durationLabel: string | null;
  size: string | null;
  /** The project is on a payment hold, so what downloads carries a mark. */
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

export function DownloadSheet({
  open,
  facts,
  assetId,
  canDownload,
  onClose,
}: {
  open: boolean;
  facts: DownloadFacts;
  assetId: string;
  canDownload: boolean;
  onClose: () => void;
}) {
  // Remembered against the clip it was about, so swiping to the next one does not carry
  // someone else's error along with it.
  const [error, setError] = useState<{ assetId: string; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const visibleError = error?.assetId === assetId ? error.message : null;

  /**
   * Above this the browser does the transfer and there is no percentage.
   *
   * A live number means reading the response in JS and holding it as a Blob until it is
   * complete — that is the only way to count bytes — and delivered files here run to
   * gigabytes. A multi-gigabyte blob on a laptop is a killed tab, and a killed tab
   * mid-download is worse than no progress bar. Under the ceiling the count is real;
   * over it the button hands off to the browser rather than lying with an animation.
   */
  const PROGRESS_CEILING = 2 * 1024 * 1024 * 1024;

  /**
   * Ask for one byte before committing the browser to a navigation.
   *
   * A held project refuses the download (409) while its watermarked copy is still
   * encoding, and a plain link answers that by showing the client raw JSON in a new tab.
   * The preflight is a ranged request, which the download route deliberately does not log
   * as a download, so asking costs nothing in the activity feed — and the real download
   * still goes through the browser rather than a blob, so a multi-gigabyte file never has
   * to sit in memory.
   */
  async function startDownload(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (progress !== null && !finished) return; // re-clicking a running download does nothing

    const url = `/api/assets/${assetId}/download`;
    setError(null);
    setChecking(true);
    const ctrl = new AbortController();
    try {
      const res = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: ctrl.signal });
      if (res.ok) {
        // Content-Range on the probe gives the real size before committing to a path.
        const total = Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
        ctrl.abort(); // never read the probe's body — it was only ever a question

        if (!total || total > PROGRESS_CEILING) {
          window.location.href = url;
          return;
        }
        await downloadWithProgress(url, total);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError({
        assetId,
        message: body?.error ?? "This file could not be downloaded just now. Try again shortly.",
      });
    } catch {
      setError({ assetId, message: "Could not reach the server. Check your connection and try again." });
    } finally {
      setChecking(false);
    }
  }

  /** Streams the file, counting as it goes, then hands the finished blob to the browser. */
  async function downloadWithProgress(url: string, total: number) {
    setProgress(0);
    setFinished(false);
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      setError({ assetId, message: "The download did not start. Try again." });
      setProgress(null);
      return;
    }

    const reader = res.body.getReader();
    const parts: BlobPart[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as unknown as BlobPart);
      received += value.length;
      // Capped at 99 until the blob is actually handed over, so "100%" and "Downloaded"
      // arrive together rather than the bar sitting full while nothing has saved.
      setProgress(Math.min(99, Math.round((received / total) * 100)));
    }

    const href = URL.createObjectURL(new Blob(parts));
    const a = document.createElement("a");
    a.href = href;
    a.download = facts.name;
    a.click();
    URL.revokeObjectURL(href);

    setProgress(100);
    setFinished(true);
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`absolute inset-0 z-[60] bg-black/50 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        data-testid="download-sheet"
        data-open={open ? "1" : "0"}
        className={`absolute left-0 right-0 bottom-0 z-[61] bg-[#101012] border-t border-white/12 transition-transform duration-[500ms] ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(.32,.72,0,1)" }}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <span className="text-[13px] text-white/90 font-semibold break-all">{facts.name}</span>
          <button onClick={onClose} className="flex-none text-white/60 hover:text-white text-lg cursor-pointer">
            <IconClose />
          </button>
        </div>

        <div className="px-5">
          <Fact label="Format" value={facts.format} />
          {facts.dims && <Fact label="Resolution" value={facts.dims} />}
          {facts.durationLabel && <Fact label="Duration" value={facts.durationLabel} />}
          {facts.size && <Fact label="Size" value={facts.size} />}
        </div>

        <div className="px-5 pt-4 pb-6">
          {canDownload ? (
            <>
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
                  {finished
                    ? "Downloaded"
                    : progress !== null
                      ? `Downloading ${progress}%`
                      : checking
                        ? "Starting…"
                        : `Download${facts.size ? ` · ${facts.size}` : ""}`}
                </span>
              </a>
              {/* The rule fills with the transfer. Only drawn while one is running, so a
                  sheet at rest is not a progress bar showing nothing. */}
              {progress !== null && (
                <span className="block h-[2px] bg-white/12 mt-[3px]" data-testid="download-progress">
                  <span
                    className="block h-full bg-white transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </span>
              )}
              {/* One quiet line, no red and no lock glyph: a mark on an unpaid job is a
                  normal condition of the work, not an error the client has hit. */}
              {facts.watermarked && (
                <div className="mt-3 text-[12px] leading-relaxed text-white/55">
                  Downloads carry a preview mark until the invoice is settled.
                </div>
              )}
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
            <div className="text-[12px] text-white/50 text-center py-3">
              Your access is view-only. Ask the account owner for downloads.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
