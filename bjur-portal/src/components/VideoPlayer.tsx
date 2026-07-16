"use client";

import { Portal } from "@/components/ui/Portal";

export function VideoPlayer({
  assetId,
  name,
  canDownload,
  locked,
  onClose,
  onRequestLicense,
}: {
  assetId: string;
  name: string;
  canDownload: boolean;
  locked: boolean;
  onClose: () => void;
  onRequestLicense: () => void;
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[1100px] px-6">
        <video
          src={`/api/assets/${assetId}/proxy`}
          controls
          autoPlay
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
