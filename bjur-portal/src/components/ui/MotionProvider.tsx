"use client";

import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/Toast";

/**
 * Reduced motion for every framer animation in one place (PORTAL-POLISH §1). The CSS
 * block in globals.css covers transitions and keyframes; this covers framer, which
 * animates in JS and so never sees that block. "user" follows the OS setting:
 * transforms and layout animations jump, opacity still fades.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  // The toast stack lives here too: one instance at the root, for every page.
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster />
    </MotionConfig>
  );
}
