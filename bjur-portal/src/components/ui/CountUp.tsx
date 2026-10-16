"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";

/**
 * A number that counts up from zero on mount (PORTAL-POLISH §3), over --dur-4 on
 * --ease-out. Anything that is not a plain whole number — "4.2 GB", "—" — renders as
 * given. Under reduced motion it is simply the value.
 */
export function CountUp({ value }: { value: string | number }) {
  const target = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : null;
  const reduce = useReducedMotion();
  const [n, setN] = useState(target === null || reduce ? target : 0);
  useEffect(() => {
    if (target === null || reduce) return;
    const controls = animate(0, target, {
      duration: DUR[4],
      ease: EASE_OUT,
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [target, reduce]);
  if (target === null) return <>{value}</>;
  return <>{reduce ? target : n}</>;
}
