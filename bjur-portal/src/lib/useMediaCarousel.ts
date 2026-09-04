"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMotionValue, useDragControls, animate, type PanInfo } from "framer-motion";
import { haptic } from "@/lib/haptics";

// Slow drag must cross 30% of the viewport to commit; a fast flick commits on a
// much shorter drag if it clears this velocity (px/s) — mirrors iOS Photos' feel.
const COMMIT_DISTANCE_RATIO = 0.3;
const COMMIT_VELOCITY = 500;
const SPRING = { type: "spring" as const, stiffness: 300, damping: 32 };

// framer-motion's own drag implementation runs a boundary-correction animation
// on release — synchronously, in the same tick as pointerup, *before* onDragEnd
// even fires (onDragEnd is deferred to frame.postRender). dragMomentum={false}
// only zeroes the velocity fed into that animation, it doesn't disable it — so
// on any drag that ends past the raw constraint edge (routine with dragElastic
// during a real flick), framer's own animation visibly pulls x back toward the
// old rest position for a beat *before* commitAndSlide's own animate() call
// takes over. That's the two-stage "snaps to center, then pushes to next"
// bounce. These values are framer's own "elastic disabled" branch — passing
// them via dragTransition makes framer's own correction animation effectively
// instant/invisible, leaving 100% of the visible motion to the one animation
// this file actually controls. Live-drag rubber-banding (dragElastic) is a
// separate code path and is untouched by this.
export const OVERDAMPED_DRAG_TRANSITION = { bounceStiffness: 1_000_000, bounceDamping: 10_000_000 };

/**
 * Shared engine behind both the video and stills fullscreen carousels: a 3-slot
 * windowed mount (prev/current/next) with tap-to-reveal chrome and drag-to-swipe,
 * armed via `dragControls` from a caller-rendered gesture-capture overlay rather
 * than framer listening directly on whatever's inside each slide (a native
 * <video> element is known to intercept/compete for touch input on custom
 * players — this was the actual root cause of unreliable finger-swipe on video,
 * kept structural here so stills inherit the same fix by construction).
 *
 * Owns only state/logic, not JSX — the track/slot markup is simple enough that
 * each caller renders its own (video and image slides need different props),
 * but the correctness-critical parts (index/animation sync, the rebase math,
 * the settle debounce) live in exactly one place.
 */
const SWIPE_HINT_KEY = "bjur:swipeHint";

export function useMediaCarousel<T extends { id: string }>({
  items,
  initialId,
  onCommit,
  onClose,
  onTogglePlay,
}: {
  items: T[];
  initialId: string;
  /** Extra media-specific behavior on commit, beyond the haptic tick every
   * carousel gets — e.g. video pausing the outgoing slide. Stills need nothing
   * here. */
  onCommit?: (direction: 1 | -1) => void;
  /** Esc. Both viewers were keyboard-inert before this: no escape, no arrows. */
  onClose?: () => void;
  /** Space. Video only; stills have nothing to toggle. */
  onTogglePlay?: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const i = items.findIndex((v) => v.id === initialId);
    return i >= 0 ? i : 0;
  });
  // Chrome starts *visible*. It used to start hidden, so opening a clip on a phone gave
  // you a full-screen video with no close button, no download and nothing saying either
  // existed — you had to already know to tap the screen. A tap still hides it for anyone
  // who wants the frame clear; nothing takes it away on its own, because controls that
  // vanish while you are reaching for them are the same complaint in a quieter form.
  const [chromeVisible, setChromeVisible] = useState(true);

  // §4: a one-time "swipe for next" hint, because the ‹ › chips are gone on mobile and
  // nothing else says the carousel is swipeable.
  //
  // Read in the initialiser rather than an effect. That is normally a hydration hazard,
  // but both viewers mount only when someone opens a file — they are never server
  // rendered, so there is no server output for this to disagree with, and setting it
  // from an effect would just cost an extra render.
  const [swipeHintVisible, setSwipeHintVisible] = useState(() => {
    if (typeof window === "undefined" || items.length < 2) return false;
    try {
      return !localStorage.getItem(SWIPE_HINT_KEY);
    } catch {
      // Private mode and blocked storage both throw on access; the hint is a nicety.
      return false;
    }
  });

  function dismissSwipeHint() {
    setSwipeHintVisible(false);
    try {
      localStorage.setItem(SWIPE_HINT_KEY, "1");
    } catch {
      // Ignore — worst case the hint shows again next visit.
    }
  }

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 0));
  const dragControls = useDragControls();

  // x is the track's absolute translateX in px. Rest position is -width (centers
  // the middle "current" slide in the viewport); dragging/committing moves it to
  // -2*width (reveal next) or 0 (reveal prev), then a completed commit snaps the
  // 3-item window over by one and resets x back to -width, invisibly.
  const x = useMotionValue(-width);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setWidth(w);
      // .jump() (not .set()) explicitly stops any in-flight animation first —
      // an orientation change mid-transition shouldn't leave a stale animation
      // fighting the resize-driven reset.
      x.jump(-w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [x]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;
  const prevItem = hasPrev ? items[currentIndex - 1] : null;
  const currentItem = items[currentIndex] as T | undefined;
  const nextItem = hasNext ? items[currentIndex + 1] : null;

  // Fixing the animation-gating below removed an *accidental* rate limiter —
  // currentIndex can now change as fast as someone can physically flick, not
  // once per ~400ms spring settle. Without this, every commit during a rapid
  // swipe burst would mount up to 2 fresh neighbor slides, each immediately
  // abandoned a moment later — real churn for a caller streaming real media
  // (video especially). Neighbors only "settle" once the index has held still
  // for a beat; the active slide is unaffected either way.
  const [settledIndex, setSettledIndex] = useState(currentIndex);
  useEffect(() => {
    const t = setTimeout(() => setSettledIndex(currentIndex), 250);
    return () => clearTimeout(t);
  }, [currentIndex]);
  const neighborsSettled = settledIndex === currentIndex;

  // The single source of truth (currentIndex) must never be gated behind an
  // animation finishing — a new touch interrupts framer-motion's in-flight
  // animation on `x` the instant it lands (synchronously, before any drag
  // threshold is even evaluated), and an interrupted animation's onComplete
  // never fires. Under rapid re-swiping that used to mean a commit sometimes
  // just... never ran, while the next drag kept moving x against stale
  // dragConstraints computed from the pre-commit index — currentIndex and the
  // visible track position would drift apart, compounding with every rapid
  // swipe until the carousel broke. Deciding+applying the index change
  // synchronously here (using x's actual current value, not an assumed rest
  // position) makes every subsequent animation purely cosmetic — safe to
  // interrupt with anything, since state is already correct by the time any
  // animation even starts.
  function commitAndSlide(direction: 1 | -1) {
    dismissSwipeHint();
    // .jump() (not .set()) — framer's own drag implementation starts its own
    // boundary-correction animation on this same value synchronously on
    // release, before onDragEnd even fires (it's deferred to frame.postRender).
    // A plain .set() doesn't necessarily halt that already-running animation
    // (only .start()-family calls reliably do), which let framer's animation
    // keep ticking on top of the rebase — the actual mechanism behind the
    // reported "restarts to center" bounce. .jump() explicitly stops any
    // active animation as part of the same call, closing that gap.
    //
    // slot k's viewport position is x + k*width; when slot2's content becomes
    // slot1's content on a "next" commit, x_new + width = x_old + 2*width =>
    // x_new = x_old + width. Generalizes to both directions as one line.
    x.jump(x.get() + direction * width);
    setCurrentIndex((i) => i + direction);
    // Cosmetic only from here — safe to interrupt with anything, since state
    // is already correct.
    animate(x, -width, {
      ...SPRING,
      onComplete: () => {
        haptic();
        onCommit?.(direction);
      },
    });
  }

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    // Framer's own drag implementation starts its own boundary-correction
    // animation on `x` synchronously on release — before this callback even
    // runs, since onDragEnd is deferred to frame.postRender. Stop it
    // explicitly, first thing, so nothing here (commit or snap-back) has to
    // fight an animation that's already ticking.
    x.stop();

    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const goNext = hasNext && (offset < -width * COMMIT_DISTANCE_RATIO || velocity < -COMMIT_VELOCITY);
    const goPrevFlag = hasPrev && (offset > width * COMMIT_DISTANCE_RATIO || velocity > COMMIT_VELOCITY);

    if (goNext) commitAndSlide(1);
    else if (goPrevFlag) commitAndSlide(-1);
    else animate(x, -width, SPRING); // snap back, no state change
  }

  // Keyboard lives here rather than in each viewer so photo and video behave the same
  // and neither can drift. Bound to window: the viewer is an overlay and focus may sit
  // on the page behind it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      // Never hijack typing.
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;

      if (e.key === "Escape") {
        onClose?.();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (hasPrev) commitAndSlide(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (hasNext) commitAndSlide(1);
      } else if (e.key === " " && onTogglePlay) {
        e.preventDefault(); // stop the page scrolling underneath
        onTogglePlay();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function goPrev() {
    if (hasPrev) commitAndSlide(-1);
  }

  function goNext() {
    if (hasNext) commitAndSlide(1);
  }

  return {
    viewportRef,
    x,
    dragControls,
    width,
    currentIndex,
    currentItem,
    prevItem,
    nextItem,
    hasPrev,
    hasNext,
    neighborsSettled,
    chromeVisible,
    setChromeVisible,
    dragConstraints: {
      left: hasNext ? -width * 2 : -width,
      right: hasPrev ? 0 : -width,
    },
    handleDragEnd,
    goPrev,
    goNext,
    swipeHintVisible,
    dismissSwipeHint,
  };
}
