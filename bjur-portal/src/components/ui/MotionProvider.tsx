"use client";

import { MotionConfig } from "framer-motion";

/**
 * Reduced motion for every framer animation in one place (PORTAL-POLISH §1). The CSS
 * block in globals.css covers transitions and keyframes; this covers framer, which
 * animates in JS and so never sees that block. "user" follows the OS setting:
 * transforms and layout animations jump, opacity still fades.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
