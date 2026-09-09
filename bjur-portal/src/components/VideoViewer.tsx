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
import { MasterSheet } from "@/components/MasterSheet";
import { useTapGestures, useHeartBurst } from "@/lib/useTapGestures";
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
  /** Facts the master sheet shows before someone commits to a download. */
  format: string;
  dims: string | null;
  durationSec: number | null;
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
  favorites,
  onToggleFavorite,
}: {
  items: VideoNavAsset[];
  initialId: string;
  canDownload: boolean;
  onClose: () => void;
  onRequestLicense: (assetId: string) => void;
  /** Ids currently favourited, so the heart reflects the page's state. */
  favorites?: Set<string>;
  onToggleFavorite?: (assetId: string) => void;
}) {
  const { burst, fire } = useHeartBurst();
  const [masterOpen, setMasterOpen] = useState(false);
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

  const isFavorite = favorites?.has(carousel.currentItem?.id ?? "") ?? false;

  // Single tap toggles chrome, double tap favourites. Both go through one handler so a
  // double tap cannot also flash the chrome on its way past.
  // The keyboard equivalent of the swipe. Registered here rather than in the carousel
  // because the sheet is this viewer's concern, not the track's.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMasterOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleTap = useTapGestures({
    onSingle: () => carousel.setChromeVisible((v) => !v),
    onDouble: () => {
      const id = carousel.currentItem?.id;
      if (!id || !onToggleFavorite) return;
      onToggleFavorite(id);
      fire();
    },
  });

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
            onTap={handleTap}
            // Swipe up opens the master sheet. Threshold is generous vertically and
            // strict horizontally, so a slightly-diagonal swipe between clips is not
            // read as a request for the sheet.
            onPanEnd={(_, info) => {
              if (info.offset.y < -70 && Math.abs(info.offset.x) < 60) setMasterOpen(true);
            }}
          />

          {/* Confirms the double-tap landed. Keyed on the burst token so a second
              favourite replays it rather than sitting on a flag that is already set. */}
          {burst > 0 && (
            <div
              key={burst}
              aria-hidden
              data-testid="heart-burst"
              className="absolute inset-0 grid place-items-center pointer-events-none z-20 bjburst"
            >
              <span className="text-[86px] leading-none drop-shadow-[0_2px_12px_rgba(0,0,0,.6)]">
                {isFavorite ? "\u2665" : "\u2661"}
              </span>
            </div>
          )}
        </div>

        <SwipeHint visible={carousel.swipeHintVisible} />

        <MasterSheet
          open={masterOpen}
          assetId={currentItem.id}
          canDownload={canDownload}
          facts={{
            name: currentItem.name,
            format: currentItem.format,
            dims: currentItem.dims,
            durationLabel: currentItem.durationSec
              ? `${Math.floor(currentItem.durationSec / 60)}:${String(
                  Math.round(currentItem.durationSec % 60),
                ).padStart(2, "0")}`
              : null,
            size: currentItem.size,
            locked: activeLocked,
            licensable: currentItem.licensable,
          }}
          onClose={() => setMasterOpen(false)}
          onRequestLicense={() => {
            setMasterOpen(false);
            onRequestLicense(currentItem.id);
          }}
        />

        <VideoChrome
          visible={carousel.chromeVisible}
          name={currentItem.name}
          playing={playing}
          muted={muted}
          currentTime={currentTime}
          duration={duration}
          hasPrev={carousel.hasPrev}
          hasNext={carousel.hasNext}
          isFavorite={isFavorite}
          locked={activeLocked}
          onTogglePlay={togglePlay}
          onToggleMute={toggleMute}
          onSeek={seek}
          onClose={onClose}
          onOpenMaster={() => setMasterOpen(true)}
        />
      </div>
    </Portal>
  );
}
