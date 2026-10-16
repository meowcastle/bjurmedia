"use client";

import { useEffect, useState } from "react";

/**
 * Keeps a closing element mounted for its exit, then lets it go. For menus and bars that
 * are rendered as `{open && …}` and would otherwise vanish the frame they close.
 * `leaving` is the cue to play the exit class; unmount follows after `ms` (--dur-1 by
 * default), or at once under reduced motion.
 */
export function usePresence(open: boolean, ms = 120) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setMounted(false), reduce ? 0 : ms);
    return () => clearTimeout(t);
  }, [open, mounted, ms]);
  return { mounted, leaving: mounted && !open };
}
