"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * Saving a selection on a phone: straight into Photos, or as one zip into Files.
 *
 * A zip is the right answer on a laptop and the wrong one on a phone — iOS files it under
 * Downloads, and nothing inside it reaches the camera roll without unzipping by hand. The
 * Photos path hands the files themselves to the OS share sheet ("Save N Items"), the same
 * way the viewer's single-file "Save to phone" does.
 *
 * Two taps by necessity, as there: Safari only opens the share sheet during a tap, and
 * fetching the files outlasts that window. The first tap fetches with a count; the second
 * shares what is already in hand.
 */

export type PhoneSaveAsset = { id: string; kind: "PHOTO" | "VIDEO"; name: string };

/** Held in memory until shared, so a phone is not asked to hold more than this at once. */
const MAX_BYTES = 1.5 * 1024 * 1024 * 1024;
const CONCURRENCY = 3;

function canShareFiles() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  );
}

const coarse = () => window.matchMedia("(pointer: coarse)");

/** A touch device whose browser can hand files to the share sheet. */
export function phoneSaveAvailable() {
  return typeof window !== "undefined" && coarse().matches && canShareFiles();
}

/**
 * For rendering. A click handler should call phoneSaveAvailable() instead: a tap that
 * lands before hydration is replayed during it, while this still returns the server's
 * answer (false) — which sent an early "Download all" tap on a phone to the zip.
 */
export function usePhoneSave() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = coarse();
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    phoneSaveAvailable,
    () => false,
  );
}

/**
 * Videos come as their 1080p preview — the phone-sized copy a camera roll wants, and the
 * route already swaps in the marked copy on a held project. Stills have no preview, so
 * the file itself; asked for as a range so a batch does not post one "downloaded" line
 * per photo to the activity feed and Slack, matching the video path, which never did.
 */
async function fetchOne(a: PhoneSaveAsset, onBytes: (n: number) => void): Promise<File | null> {
  const stem = a.name.replace(/\.[^.]+$/, "");
  const res =
    a.kind === "VIDEO"
      ? await fetch(`/api/assets/${a.id}/proxy?download=1`)
      : await fetch(`/api/assets/${a.id}/download`, { headers: { Range: "bytes=0-" } });
  // Not ready (still encoding, or its marked copy is) — skipped rather than substituted.
  if (!res.ok || !res.body) return null;
  const reader = res.body.getReader();
  const parts: BlobPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value as unknown as BlobPart);
    onBytes(value.length);
  }
  const type = res.headers.get("content-type") ?? (a.kind === "VIDEO" ? "video/mp4" : "image/jpeg");
  return new File(parts, a.kind === "VIDEO" ? `${stem}.mp4` : a.name, { type });
}

type Run = {
  key: string;
  done: number;
  files: File[] | null;
  skipped: number;
  shared: boolean;
  error: string | null;
};

export function PhoneSaveButtons({
  assets,
  onSaveToFiles,
}: {
  assets: PhoneSaveAsset[];
  onSaveToFiles: () => void;
}) {
  // Keyed on the selection, so changing it starts over instead of sharing a stale set.
  const key = assets.map((a) => a.id).sort().join(",");
  const [run, setRun] = useState<Run | null>(null);
  const current = run?.key === key ? run : null;
  const fetching = current !== null && current.files === null && current.error === null;

  async function saveToPhotos() {
    if (current?.files) {
      try {
        await navigator.share({ files: current.files });
        setRun({ ...current, shared: true });
      } catch (e) {
        // AbortError is the person closing the sheet; the files stay for another tap.
        if ((e as Error).name !== "AbortError") {
          setRun({ ...current, files: null, error: "Your phone would not take that many at once. Select fewer and try again." });
        }
      }
      return;
    }
    if (fetching) return;

    let bytes = 0;
    let done = 0;
    let over = false;
    setRun({ key, done: 0, files: null, skipped: 0, shared: false, error: null });

    const results: (File | null)[] = new Array(assets.length).fill(null);
    let next = 0;
    async function worker() {
      while (!over && next < assets.length) {
        const i = next++;
        try {
          results[i] = await fetchOne(assets[i], (n) => {
            bytes += n;
            if (bytes > MAX_BYTES) over = true;
          });
        } catch {
          results[i] = null;
        }
        done++;
        setRun((r) => (r && r.key === key ? { ...r, done } : r));
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker));

    if (over) {
      setRun({ key, done, files: null, skipped: 0, shared: false, error: "Too much for Photos in one go. Select fewer, or use Save to Files." });
      return;
    }
    const files = results.filter((f): f is File => f !== null);
    if (files.length === 0) {
      setRun({ key, done, files: null, skipped: 0, shared: false, error: "None of these are ready yet. Try again in a few minutes." });
      return;
    }
    if (!navigator.canShare({ files })) {
      setRun({ key, done, files: null, skipped: 0, shared: false, error: "Your phone would not take that many at once. Select fewer and try again." });
      return;
    }
    setRun({ key, done, files, skipped: assets.length - files.length, shared: false, error: null });
  }

  const label = current?.shared
    ? "Saved"
    : current?.files
      ? `Add ${current.files.length} to Photos`
      : fetching
        ? `Preparing ${current.done} of ${assets.length}`
        : "Save to Photos";

  return (
    <div className="basis-full flex flex-col gap-2" data-testid="phone-save">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={saveToPhotos}
          data-testid="save-to-photos"
          className="cursor-pointer font-bold text-[13px] text-bg bg-text hover:bg-accent px-3 py-3.5"
        >
          {label}
        </button>
        <button
          type="button"
          onClick={onSaveToFiles}
          data-testid="save-to-files"
          className="cursor-pointer font-bold text-[13px] text-text border border-line2 hover:border-text px-3 py-3.5"
        >
          Save to Files
        </button>
      </div>
      {fetching && (
        <span className="block h-[2px] bg-line2">
          <span
            className="block h-full bg-text transition-[width] duration-200"
            style={{ width: `${(current.done / assets.length) * 100}%` }}
          />
        </span>
      )}
      {current?.error ? (
        <span className="text-[12px] text-muted" data-testid="phone-save-error">{current.error}</span>
      ) : current?.files && !current.shared ? (
        <span className="text-[12px] text-muted">
          Tap again, then choose{" "}
          {current.files.length > 1
            ? `Save ${current.files.length} Items`
            : current.files[0].type.startsWith("video/")
              ? "Save Video"
              : "Save Image"}
          .
          {current.skipped > 0 && ` ${current.skipped} not ready yet, left out.`}
        </span>
      ) : null}
    </div>
  );
}
