"use client";

/* eslint-disable react-hooks/refs --
 * Same composite-return false positive as VideoViewer.tsx: useMediaCarousel()
 * mixes real refs/framer-motion handles with plain useState values in one
 * returned object, and the rule can't discriminate per-property. Everything
 * flagged here (dragControls, x, width, ...) is either passed straight to a
 * framer-motion prop or read as a plain value, never `.current` during
 * render. */
import { motion } from "framer-motion";
import { Portal } from "@/components/ui/Portal";
import { ImageSlide, type PhotoNavAsset } from "@/components/ImageSlide";
import { PhotoChrome } from "@/components/PhotoChrome";
import { SwipeHint } from "@/components/SwipeHint";
import { useMediaCarousel, OVERDAMPED_DRAG_TRANSITION } from "@/lib/useMediaCarousel";

export type { PhotoNavAsset };

/**
 * Fullscreen, Photos-app-style stills carousel — the same drag/tap/settle
 * engine as the video viewer (useMediaCarousel), swapped to plain <img>
 * slides and a much lighter chrome (no scrubber/play-pause/download — the
 * photo lightbox never had those).
 */
export function ImageViewer({
  items,
  initialId,
  onClose,
}: {
  items: PhotoNavAsset[];
  initialId: string;
  onClose: () => void;
}) {
  const carousel = useMediaCarousel({
    onClose, items, initialId });

  const currentItem = carousel.currentItem;
  if (!currentItem) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black bjfade overscroll-contain">
        <div ref={carousel.viewportRef} className="relative w-full h-full overflow-hidden">
          <motion.div
            className="flex h-full"
            style={{ x: carousel.x }}
            drag={carousel.hasPrev || carousel.hasNext ? "x" : false}
            dragListener={false}
            dragControls={carousel.dragControls}
            dragElastic={0.55}
            dragMomentum={false}
            dragConstraints={carousel.dragConstraints}
            dragTransition={OVERDAMPED_DRAG_TRANSITION}
            onDragEnd={carousel.handleDragEnd}
          >
            <div style={{ width: carousel.width, height: "100%", flexShrink: 0 }}>
              <ImageSlide item={carousel.prevItem} active={false} />
            </div>
            <div style={{ width: carousel.width, height: "100%", flexShrink: 0 }}>
              <ImageSlide item={currentItem} active />
            </div>
            <div style={{ width: carousel.width, height: "100%", flexShrink: 0 }}>
              <ImageSlide item={carousel.nextItem} active={false} />
            </div>
          </motion.div>

          {/* Same gesture-capture pattern as the video viewer — a transparent
              overlay above the slides, arming drag externally via dragControls
              rather than framer listening directly on the track. */}
          <motion.div
            data-testid="photo-gesture-surface"
            className="absolute inset-0 touch-none"
            onPointerDown={(e) => carousel.dragControls.start(e)}
            onTap={() => carousel.setChromeVisible((v) => !v)}
          />
        </div>

        <SwipeHint visible={carousel.swipeHintVisible} />

        <PhotoChrome
          visible={carousel.chromeVisible}
          name={currentItem.name}
          index={carousel.currentIndex}
          total={items.length}
          hasPrev={carousel.hasPrev}
          hasNext={carousel.hasNext}
          onClose={onClose}
          onPrev={carousel.goPrev}
          onNext={carousel.goNext}
        />
      </div>
    </Portal>
  );
}
