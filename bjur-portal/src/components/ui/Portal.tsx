"use client";

import { createPortal } from "react-dom";

/**
 * Renders children as a direct child of <body>, so full-screen overlays (fixed
 * inset-0) are never at the mercy of an ancestor's stacking context or containing
 * block (position:sticky/backdrop-filter headers etc. can otherwise render on top
 * of a nested "fixed" modal despite a higher z-index).
 *
 * No SSR mount-guard needed: every call site gates rendering behind client-only
 * state that starts closed (a dialog/modal `open` flag, a selected-id, etc.), so
 * Portal is never invoked during the server render or initial hydration.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
