"use client";

import { useEffect, useRef } from "react";
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

  return (
    <div className="w-full h-full shrink-0 relative" style={{ background: gradientFor(item.id) }}>
      <video
        key={item.id}
        ref={(el) => {
          videoRef.current = el;
          onMediaRef?.(el);
        }}
        src={`/api/assets/${item.id}/proxy`}
        poster={`/api/assets/${item.id}/thumb`}
        data-testid={active ? "active-video" : undefined}
        playsInline
        preload={active ? "auto" : "metadata"}
        className="w-full h-full object-contain"
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        onDurationChange={(e) => onDurationChange?.(e.currentTarget.duration)}
        onPlay={() => onPlayStateChange?.(true)}
        onPause={() => onPlayStateChange?.(false)}
        onVolumeChange={(e) => onMuteChange?.(e.currentTarget.muted)}
        onEnded={onEnded}
      />
    </div>
  );
}
