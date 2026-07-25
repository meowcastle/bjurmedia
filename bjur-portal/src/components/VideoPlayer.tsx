"use client";

import { useRef } from "react";
import { Portal } from "@/components/ui/Portal";

const SWIPE_THRESHOLD_PX = 50;

export function VideoPlayer({
  assetId,
  name,
  canDownload,
  locked,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onRequestLicense,
}: {
  assetId: string;
  name: string;
  canDownload: boolean;
  locked: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onRequestLicense: () => void;
}) {
  const touchStartX = useRef<number | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (dx > SWIPE_THRESHOLD_PX && hasPrev) onPrev();
    else if (dx < -SWIPE_THRESHOLD_PX && hasNext) onNext();
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 bg-black/97 backdrop-blur-sm flex items-center justify-center bjfade touch-none overscroll-contain"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 grid place-items-center bg-black/40 hover:bg-black/60 text-white/80 hover:text-white text-xl cursor-pointer z-10"
      >
        ✕
      </button>
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-2 md:left-6 w-10 h-10 grid place-items-center bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-2xl cursor-pointer z-10"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-2 md:right-6 w-10 h-10 grid place-items-center bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-2xl cursor-pointer z-10"
        >
          ›
        </button>
      )}
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[1100px] px-6">
        <video
          key={assetId}
          src={`/api/assets/${assetId}/proxy`}
          controls
          autoPlay
          playsInline
          className="w-full max-h-[76vh] bg-black"
        />
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-white/80">{name}</span>
          {locked ? (
            <button
              onClick={onRequestLicense}
              className="text-xs font-bold uppercase tracking-wide bg-accent text-bg px-4 py-2.5 hover:bg-accentb cursor-pointer"
            >
              🔒 Unlock master
            </button>
          ) : (
            canDownload && (
              <a
                href={`/api/assets/${assetId}/download`}
                className="text-xs font-bold uppercase tracking-wide bg-accent text-bg px-4 py-2.5 hover:bg-accentb"
              >
                ↓ Download master
              </a>
            )
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
