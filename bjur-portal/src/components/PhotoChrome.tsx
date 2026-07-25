"use client";

const CHIP = "w-9 h-9 grid place-items-center bg-black/40 hover:bg-black/60 text-white/80 hover:text-white cursor-pointer";

/**
 * Minimal chrome for the stills carousel — close, prev/next, filename. No
 * scrubber/play-pause/download-unlock: those are video-specific, and the
 * photo lightbox never had download/licensing UI either. Same tap-to-reveal
 * layering as VideoChrome — a sibling overlay above the draggable track, not
 * nested inside it, so a tap on a real control never also toggles chrome
 * visibility, and hidden chrome is fully click-through (not just invisible).
 */
export function PhotoChrome({
  visible,
  name,
  hasPrev,
  hasNext,
  onClose,
  onPrev,
  onNext,
}: {
  visible: boolean;
  name: string;
  hasPrev: boolean;
  hasNext: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const interactive = visible ? "pointer-events-auto" : "pointer-events-none";
  return (
    <div
      className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className="absolute top-0 left-0 right-0 flex justify-end px-4 pb-3 pointer-events-none"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
          className={`${CHIP} ${interactive} text-xl`}
        >
          ✕
        </button>
      </div>

      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="Previous photo"
          className={`absolute left-2 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-2xl cursor-pointer ${interactive}`}
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
          aria-label="Next photo"
          className={`absolute right-2 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-2xl cursor-pointer ${interactive}`}
        >
          ›
        </button>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 px-4 pt-10 flex justify-center pointer-events-none bg-gradient-to-t from-black/85 to-transparent"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
      >
        <span className={`text-sm text-white/80 ${interactive}`}>{name}</span>
      </div>
    </div>
  );
}
