"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useMotionValue, useDragControls, animate, type PanInfo } from "framer-motion";
import { Portal } from "@/components/ui/Portal";
import { VideoSlide } from "@/components/VideoSlide";
import { VideoChrome } from "@/components/VideoChrome";
import { haptic } from "@/lib/haptics";

export type VideoNavAsset = {
  id: string;
  name: string;
  licensable: boolean;
  licensed: boolean;
};

// Slow drag must cross 30% of the viewport to commit; a fast flick commits on a
// much shorter drag if it clears this velocity (px/s) — mirrors iOS Photos' feel.
const COMMIT_DISTANCE_RATIO = 0.3;
const COMMIT_VELOCITY = 500;
const SPRING = { type: "spring" as const, stiffness: 300, damping: 32 };

/**
 * Fullscreen, Photos-app-style video carousel. Mounts exactly 3 slides
 * (prev/current/next) inside a draggable track; chrome (close/scrubber/prev-next/
 * download) is a sibling overlay on top of the track, never nested inside it, so
 * taps on real controls never reach the track's tap-to-toggle-chrome handler.
 */
export function VideoViewer({
  items,
  initialId,
  canDownload,
  onClose,
  onRequestLicense,
}: {
  items: VideoNavAsset[];
  initialId: string;
  canDownload: boolean;
  onClose: () => void;
  onRequestLicense: (assetId: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const i = items.findIndex((v) => v.id === initialId);
    return i >= 0 ? i : 0;
  });
  const [chromeVisible, setChromeVisible] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 0));
  const dragControls = useDragControls();
  const lastTimeUpdateRef = useRef(0);

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
      x.set(-w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [x]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;
  const prevItem = hasPrev ? items[currentIndex - 1] : null;
  const currentItem = items[currentIndex] as VideoNavAsset | undefined;
  const nextItem = hasNext ? items[currentIndex + 1] : null;

  // Fresh per-asset playback state whenever the active slide changes (swipe or
  // arrow-driven) — each video starts unmuted/autoplaying/at 0:00 on its own.
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(true);
    setMuted(false);
  }, [currentItem?.id]);

  function commit(direction: 1 | -1) {
    haptic();
    activeVideoRef.current?.pause();
    setCurrentIndex((i) => i + direction);
    x.set(-width);
  }

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const goNext = hasNext && (offset < -width * COMMIT_DISTANCE_RATIO || velocity < -COMMIT_VELOCITY);
    const goPrev = hasPrev && (offset > width * COMMIT_DISTANCE_RATIO || velocity > COMMIT_VELOCITY);

    if (goNext) {
      animate(x, -width * 2, { ...SPRING, onComplete: () => commit(1) });
    } else if (goPrev) {
      animate(x, 0, { ...SPRING, onComplete: () => commit(-1) });
    } else {
      animate(x, -width, SPRING);
    }
  }

  function goPrev() {
    if (!hasPrev) return;
    animate(x, 0, { ...SPRING, onComplete: () => commit(-1) });
  }

  function goNext() {
    if (!hasNext) return;
    animate(x, -width * 2, { ...SPRING, onComplete: () => commit(1) });
  }

  // Native timeupdate fires many times a second — piping every tick straight into
  // React state re-renders the whole viewer (including the drag track) that often,
  // which competes with touch gesture tracking on the main thread while a video is
  // playing. Throttling to 4x/sec keeps the scrubber live-feeling without the churn.
  function handleTimeUpdate(t: number) {
    const now = performance.now();
    if (now - lastTimeUpdateRef.current < 250) return;
    lastTimeUpdateRef.current = now;
    setCurrentTime(t);
  }

  function seek(t: number) {
    if (activeVideoRef.current) activeVideoRef.current.currentTime = t;
    setCurrentTime(t);
  }

  function togglePlay() {
    const v = activeVideoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function toggleMute() {
    const v = activeVideoRef.current;
    if (v) v.muted = !v.muted;
  }

  if (!currentItem) return null;

  const activeLocked = currentItem.licensable && !currentItem.licensed;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black bjfade overscroll-contain">
        <div ref={viewportRef} className="relative w-full h-full overflow-hidden">
          <motion.div
            className="flex h-full"
            style={{ x }}
            drag={hasPrev || hasNext ? "x" : false}
            dragListener={false}
            dragControls={dragControls}
            dragElastic={0.55}
            dragMomentum={false}
            dragConstraints={{
              left: hasNext ? -width * 2 : -width,
              right: hasPrev ? 0 : -width,
            }}
            onDragEnd={handleDragEnd}
          >
            <div style={{ width, height: "100%", flexShrink: 0 }}>
              <VideoSlide item={prevItem} active={false} />
            </div>
            <div style={{ width, height: "100%", flexShrink: 0 }}>
              <VideoSlide
                item={currentItem}
                active
                onMediaRef={(el) => {
                  activeVideoRef.current = el;
                }}
                onTimeUpdate={handleTimeUpdate}
                onDurationChange={setDuration}
                onPlayStateChange={setPlaying}
                onMuteChange={setMuted}
              />
            </div>
            <div style={{ width, height: "100%", flexShrink: 0 }}>
              <VideoSlide item={nextItem} active={false} />
            </div>
          </motion.div>

          {/* Transparent gesture-capture surface, above the video elements but below
              VideoChrome. Drag is externally armed from here (dragListener={false} +
              dragControls on the track above) rather than letting Framer listen
              directly on the track — native <video> elements can intercept/compete
              for touch input, which is what made finger-swipe unreliable while a
              raw <video> sat directly under the touch point. */}
          <motion.div
            data-testid="video-gesture-surface"
            className="absolute inset-0 touch-none"
            onPointerDown={(e) => dragControls.start(e)}
            onTap={() => setChromeVisible((v) => !v)}
          />
        </div>

        <VideoChrome
          visible={chromeVisible}
          name={currentItem.name}
          playing={playing}
          muted={muted}
          currentTime={currentTime}
          duration={duration}
          hasPrev={hasPrev}
          hasNext={hasNext}
          canDownload={canDownload}
          locked={activeLocked}
          assetId={currentItem.id}
          onTogglePlay={togglePlay}
          onToggleMute={toggleMute}
          onSeek={seek}
          onClose={onClose}
          onPrev={goPrev}
          onNext={goNext}
          onRequestLicense={() => onRequestLicense(currentItem.id)}
        />
      </div>
    </Portal>
  );
}
