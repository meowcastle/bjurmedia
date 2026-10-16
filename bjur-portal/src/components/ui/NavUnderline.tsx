"use client";

import { motion } from "framer-motion";
import { SPRING_SMALL } from "@/lib/motion";

/**
 * The active tab's underline, shared across a nav so it slides to the next tab instead
 * of blinking out and in (PORTAL-POLISH §3). Same spring as the gallery's filter pill.
 * Render inside the active link, which must be `relative`.
 */
export function NavUnderline({ group }: { group: string }) {
  return (
    <motion.span
      layoutId={`nav-underline-${group}`}
      transition={SPRING_SMALL}
      aria-hidden
      className="absolute left-0 right-0 -bottom-px h-0.5 bg-accent"
    />
  );
}
