"use client";

import { gradientFor } from "@/lib/gradients";
import { Portal } from "@/components/ui/Portal";

export function Lightbox({
  assetId,
  name,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: {
  assetId: string;
  name: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <Portal>
    <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center bjfade" onClick={onClose}>
      <button
        onClick={onClose}
        className="absolute top-5 right-6 text-white/70 hover:text-white text-2xl cursor-pointer"
      >
        ✕
      </button>
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-4 md:left-8 text-white/60 hover:text-white text-3xl cursor-pointer"
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
          className="absolute right-4 md:right-8 text-white/60 hover:text-white text-3xl cursor-pointer"
        >
          ›
        </button>
      )}
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-[88vw] max-h-[82vh] aspect-[3/2] w-[900px]"
        style={{ background: gradientFor(assetId) }}
      >
        <img src={`/api/assets/${assetId}/thumb`} alt={name} className="w-full h-full object-contain" />
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-white/80">{name}</div>
    </div>
    </Portal>
  );
}
