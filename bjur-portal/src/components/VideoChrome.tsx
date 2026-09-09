"use client";

import {
  IconClose,
  IconPlay,
  IconPause,
  IconVolumeOn,
  IconVolumeOff,
} from "@/components/ui/Icon";

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CHIP = "w-9 h-9 grid place-items-center bg-black/40 hover:bg-black/60 text-white/80 hover:text-white cursor-pointer";

/**
 * Pure presentational overlay — no drag/tap logic of its own. Rendered as an
 * absolutely-positioned sibling ABOVE the draggable video track (not nested inside
 * it), with pointer-events-none on this wrapper and pointer-events-auto on each real
 * control. That layering is what guarantees a tap on a button never also reaches the
 * track's tap-to-toggle-chrome handler — not `stopPropagation()` (kept anyway as
 * cheap defense-in-depth).
 */
export function VideoChrome({
  visible,
  name,
  playing,
  muted,
  currentTime,
  duration,
  hasPrev,
  hasNext,
  locked,
  isFavorite,
  onTogglePlay,
  onToggleMute,
  onSeek,
  onClose,
  onOpenMaster,
}: {
  visible: boolean;
  name: string;
  playing: boolean;
  muted: boolean;
  currentTime: number;
  duration: number;
  hasPrev: boolean;
  hasNext: boolean;
  locked: boolean;
  /** Shown top-left so the current state is readable without tapping to find out. */
  isFavorite?: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onSeek: (t: number) => void;
  onClose: () => void;
  /** Opens the master sheet, which carries the download and licensing actions. */
  onOpenMaster: () => void;
}) {
  // Hidden chrome must be fully click-through, not just invisible — otherwise an
  // opacity-0 button still sits there intercepting the tap that's meant to reveal it.
  const interactive = visible ? "pointer-events-auto" : "pointer-events-none";
  return (
    <div
      // Hidden chrome leaves the accessibility tree too, not just the eye. It is already
      // fully click-through when hidden, so a screen reader announcing a Close button
      // nobody can reach — and a test asserting one is on screen when it is at opacity
      // zero — were both reading a control that is not really there.
      aria-hidden={!visible}
      // Where we are in the run, as data. The arrows used to be the only way to tell,
      // which meant removing them would have taken the swipe tests' bearings with them.
      data-has-prev={hasPrev ? "1" : "0"}
      data-has-next={hasNext ? "1" : "0"}
      className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* top bar */}
      <div
        className="absolute top-0 left-0 right-0 flex justify-between items-center px-4 pb-3 pointer-events-none"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <span
          data-testid="viewer-favorite-state"
          data-favorite={isFavorite ? "1" : "0"}
          aria-label={isFavorite ? "Favourited" : "Not favourited"}
          className={`text-lg ${isFavorite ? "text-accentb" : "text-white/30"}`}
        >
          {isFavorite ? "\u2665" : "\u2661"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
          className={`${CHIP} ${interactive} text-xl`}
        >
          <IconClose />
        </button>
      </div>

      {/* bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 px-4 pt-10 pointer-events-none bg-gradient-to-t from-black/85 to-transparent"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
      >
        <div className={`flex items-center gap-3 ${interactive} mb-3`}>
          <span className="text-[11px] text-white/70 font-mono tabular-nums w-9 text-right">
            {fmtTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="bj-scrubber flex-1 accent-accent"
          />
          <span className="text-[11px] text-white/70 font-mono tabular-nums w-9">{fmtTime(duration)}</span>
        </div>

        {/* The filename and the download used to share one non-shrinking row, so on a
            phone "↓ Download master" ran off the right edge and the only way to save a
            single clip was invisible. The name gives up its space first now, and the
            control keeps its own. */}
        <div className={`flex items-center justify-between gap-2 ${interactive}`}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePlay();
              }}
              aria-label={playing ? "Pause" : "Play"}
              className={CHIP}
            >
              {playing ? <IconPause /> : <IconPlay />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute();
              }}
              aria-label={muted ? "Unmute" : "Mute"}
              className={CHIP}
            >
              {muted ? <IconVolumeOff /> : <IconVolumeOn />}
            </button>
            <span className="text-sm text-white/80 truncate min-w-0">{name}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenMaster();
            }}
            data-testid="master-chip"
            className="shrink-0 text-xs font-bold uppercase tracking-wide border border-white/25 hover:border-white text-white/85 hover:text-white px-3.5 py-2.5 cursor-pointer whitespace-nowrap"
          >
            {locked ? "\u2191 Unlock master" : "\u2191 Master"}
          </button>
        </div>
      </div>
    </div>
  );
}
