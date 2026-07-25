"use client";

import { useEffect, useRef, useState } from "react";
import { gradientFor } from "@/lib/gradients";
import type { VideoNavAsset } from "@/components/VideoViewer";

/**
 * One mounted slot in the 3-wide carousel track (prev/current/next). Owns only its
 * own playback lifecycle — VideoViewer drives play/pause/seek/mute on the active
 * slide imperatively via `onMediaRef`, and reads state back via the on* callbacks
 * (the video element itself is the source of truth, not a mirrored bit of state).
 */
export function VideoSlide({
  item,
  active,
  onMediaRef,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  onMuteChange,
  onEnded,
}: {
  item: VideoNavAsset | null;
  active: boolean;
  onMediaRef?: (el: HTMLVideoElement | null) => void;
  onTimeUpdate?: (t: number) => void;
  onDurationChange?: (d: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onMuteChange?: (muted: boolean) => void;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Keyed by asset id rather than a plain boolean reset in a useEffect — a
  // post-render effect reset left a one-frame window where a *new* item's poster
  // briefly inherited the *previous* item's "ready" state (so it rendered
  // opacity-0, invisible, before the effect caught up), which is exactly the
  // flash this is meant to prevent. Comparing ids is synchronously correct on
  // every render, no lag window.
  const [readyForId, setReadyForId] = useState<string | null>(null);
  const [failedForId, setFailedForId] = useState<string | null>(null);

  // Autoplay the slide that becomes active — swipe-driven mounts don't carry the
  // same user-activation guarantee as the initial tap-driven open, so a rejected
  // unmuted autoplay falls back to muted + retry rather than silently staying paused.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) {
      video.pause();
      return;
    }
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }, [active, item?.id]);

  if (!item) {
    return <div className="w-full h-full shrink-0" />;
  }

  const showPoster = readyForId !== item.id;
  const posterFailed = failedForId === item.id;

  return (
    <div className="w-full h-full shrink-0 relative" style={{ background: gradientFor(item.id) }}>
      <video
        key={item.id}
        ref={(el) => {
          videoRef.current = el;
          onMediaRef?.(el);
        }}
        src={`/api/assets/${item.id}/proxy`}
        data-testid={active ? "active-video" : undefined}
        playsInline
        // "auto" on every mounted slot, not just the active one — the immediate
        // neighbors get the entire time the current video is being watched to
        // buffer real bytes in the background, so by the time a swipe lands the
        // next video already has data queued up instead of starting from zero.
        preload="auto"
        className="w-full h-full object-contain"
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        onDurationChange={(e) => onDurationChange?.(e.currentTarget.duration)}
        onPlay={() => onPlayStateChange?.(true)}
        onPause={() => onPlayStateChange?.(false)}
        onVolumeChange={(e) => onMuteChange?.(e.currentTarget.muted)}
        onCanPlay={() => setReadyForId(item.id)}
        onEnded={onEnded}
      />
      {/* Own-managed poster, faded out only once onCanPlay confirms real playable
          data — <video poster> clears itself as soon as the browser *attempts* to
          load, which can land well before a frame is actually ready, producing a
          blank gap. This keeps a frame visible the entire time in between. */}
      {!posterFailed && (
        // eslint-disable-next-line @next/next/no-img-element -- proxied binary from our own API, not a static asset Next can optimize
        <img
          src={`/api/assets/${item.id}/thumb`}
          alt=""
          onError={() => setFailedForId(item.id)}
          className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-200 ${
            showPoster ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
