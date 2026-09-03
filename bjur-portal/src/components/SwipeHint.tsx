"use client";

/**
 * §4: the ‹ › chips are desktop-only now, so on a phone nothing signals that the
 * viewer is swipeable. Shown once per device and dismissed on the first swipe —
 * see useMediaCarousel, which owns the localStorage flag.
 */
export function SwipeHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      aria-hidden
      className="md:hidden absolute left-1/2 -translate-x-1/2 bottom-[170px] z-20 pointer-events-none
                 text-[11px] uppercase tracking-[.06em] text-white/55 bg-black/50 px-2.5 py-1.5"
    >
      ‹ Swipe for next ›
    </div>
  );
}
