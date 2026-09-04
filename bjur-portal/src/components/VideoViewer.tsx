"use client";

/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect --
 * react-hooks/refs: useMediaCarousel() returns one object mixing real refs/
 * framer-motion handles (viewportRef, x, dragControls) with plain useState
 * values (hasPrev, width, currentItem, ...). The rule can't discriminate
 * per-property on a composite custom-hook return, so it flags every access
 * on `carousel` as a ref read — including dragControls/x, which are only
 * ever *passed* to framer-motion props here, never read as `.current`
 * during render. Verified correct behavior via e2e/video-rapid-swipe.spec.ts
 * and extensive manual testing, not just typechecking.
 * react-hooks/set-state-in-effect: the playback-state reset on active-item
 * change (line below) is the standard "reset state when switching to a new
 * item" effect — deliberate, not an accidental derived-state anti-pattern. */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Portal } from "@/components/ui/Portal";
import { VideoSlide } from "@/components/VideoSlide";
import { VideoChrome } from "@/components/VideoChrome";
import { SwipeHint } from "@/components/SwipeHint";
import { useMediaCarousel, OVERDAMPED_DRAG_TRANSITION } from "@/lib/useMediaCarousel";

export type VideoNavAsset = {
  id: string;
  name: string;
  licensable: boolean;
  licensed: boolean;
  /** Formatted master size for the download control. */
  size: string;
};

/**
 * Fullscreen, Photos-app-style video carousel. Mounts exactly 3 slides
 * (prev/current/next) inside a draggable track; chrome (close/scrubber/prev-next/
 * download) is a sibling overlay on top of the track, never nested inside it, so
 * taps on real controls never reach the track's tap-to-toggle-chrome handler.
 * The drag/tap/settle mechanics live in useMediaCarousel (shared with the stills
 * viewer) — this file owns only video-specific playback state.
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
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastTimeUpdateRef = useRef(0);

  const carousel = useMediaCarousel({
    onClose,
    onTogglePlay: togglePlay,
    items,
    initialId,
    onCommit: () => activeVideoRef.current?.pause(),
  });

  // Fresh per-asset playback state whenever the active slide changes (swipe or
  // arrow-driven) — each video starts unmuted/autoplaying/at 0:00 on its own.
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(true);
    setMuted(false);
  }, [carousel.currentItem?.id]);

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

  const currentItem = carousel.currentItem;
  if (!currentItem) return null;

  const activeLocked = currentItem.licensable && !currentItem.licensed;

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
              <VideoSlide item={carousel.prevItem} active={false} mount={carousel.neighborsSettled} />
            </div>
            <div style={{ width: carousel.width, height: "100%", flexShrink: 0 }}>
              <VideoSlide
                item={currentItem}
                active
                mount
                onMediaRef={(el) => {
                  activeVideoRef.current = el;
                }}
                onTimeUpdate={handleTimeUpdate}
                onDurationChange={setDuration}
                onPlayStateChange={setPlaying}
                onMuteChange={setMuted}
              />
            </div>
            <div style={{ width: carousel.width, height: "100%", flexShrink: 0 }}>
              <VideoSlide item={carousel.nextItem} active={false} mount={carousel.neighborsSettled} />
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
            onPointerDown={(e) => carousel.dragControls.start(e)}
            onTap={() => carousel.setChromeVisible((v) => !v)}
          />
        </div>

        <SwipeHint visible={carousel.swipeHintVisible} />

        <VideoChrome
          visible={carousel.chromeVisible}
          name={currentItem.name}
          playing={playing}
          muted={muted}
          currentTime={currentTime}
          duration={duration}
          hasPrev={carousel.hasPrev}
          hasNext={carousel.hasNext}
          canDownload={canDownload}
          size={currentItem.size}
          locked={activeLocked}
          assetId={currentItem.id}
          onTogglePlay={togglePlay}
          onToggleMute={toggleMute}
          onSeek={seek}
          onClose={onClose}
          onPrev={carousel.goPrev}
          onNext={carousel.goNext}
          onRequestLicense={() => onRequestLicense(currentItem.id)}
        />
      </div>
    </Portal>
  );
}
