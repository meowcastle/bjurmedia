"use client";

import { useLayoutEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";

/**
 * A number that counts up from zero on mount (PORTAL-POLISH §3), over --dur-4 on
 * --ease-out. Anything that is not a plain whole number — "4.2 GB", "—" — renders as
 * given.
 *
 * Server and first client render are both the real value: the server cannot know the
 * viewer's motion preference, so starting at 0 there was a hydration mismatch for anyone
 * with reduced motion on. The reset to 0 happens in a layout effect, before the first
 * paint, so there is no flash of the final number either. Reduced motion skips it.
 */
export function CountUp({ value }: { value: string | number }) {
  const target = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : null;
  const reduce = useReducedMotion();
  const [n, setN] = useState(target);
  useLayoutEffect(() => {
    if (target === null || reduce) return;
    const controls = animate(0, target, {
      duration: DUR[4],
      ease: EASE_OUT,
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [target, reduce]);
  if (target === null) return <>{value}</>;
  return <>{n}</>;
}
