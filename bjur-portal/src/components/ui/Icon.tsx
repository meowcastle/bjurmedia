/**
 * The UI icon set.
 *
 * The portal drew its controls with emoji and typographic glyphs — ▶ ⏸ 🔊 🔒 ✕ ‹ › ⌕ ♥.
 * Emoji are the real problem of the two: they are font-dependent, so 🔊 is a full-colour
 * pictogram on iOS, flat monochrome on most Androids, and a different shape again in
 * Chrome on Windows. A mute button that changes appearance per device is not a designed
 * control. The typographic ones are subtler but sit on the text baseline and cannot be
 * sized or aligned like a real icon.
 *
 * One place for the defaults so every icon in the app shares a weight, per the handoff's
 * 2.2–2.5 stroke on currentColor.
 */
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Lock,
  Heart,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  MoreHorizontal,
  Search,
  Download,
  Upload,
  RotateCcw,
  type LucideProps,
} from "lucide-react";

const DEFAULTS: LucideProps = {
  strokeWidth: 2.25,
  // Sized in em so an icon tracks whatever text it sits beside, rather than needing a
  // pixel size passed at every call site.
  width: "1em",
  height: "1em",
  "aria-hidden": true,
  focusable: false,
};

function make(C: React.ComponentType<LucideProps>) {
  const Wrapped = (props: LucideProps) => <C {...DEFAULTS} {...props} />;
  Wrapped.displayName = `Icon(${C.displayName ?? C.name ?? "?"})`;
  return Wrapped;
}

export const IconPlay = make(Play);
export const IconPause = make(Pause);
export const IconVolumeOn = make(Volume2);
export const IconVolumeOff = make(VolumeX);
export const IconLock = make(Lock);
export const IconHeart = make(Heart);
export const IconCheck = make(Check);
export const IconClose = make(X);
export const IconPrev = make(ChevronLeft);
export const IconNext = make(ChevronRight);
export const IconMore = make(MoreVertical);
export const IconMoreH = make(MoreHorizontal);
export const IconSearch = make(Search);
export const IconDownload = make(Download);
export const IconUpload = make(Upload);
export const IconRetry = make(RotateCcw);
