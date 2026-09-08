"use client";

import { useEffect } from "react";
import { Portal } from "@/components/ui/Portal";

/**
 * The confirmation strip from the handoff's global section.
 *
 * Rendered above dialogs rather than inside them: the thing worth confirming usually
 * happens as a dialog closes, so a toast owned by the dialog would unmount with the
 * action it was reporting.
 */
export function Toast({
  message,
  onDone,
  /** Lifts clear of the client-side selection bar when one is up. */
  raised = false,
}: {
  message: string | null;
  onDone: () => void;
  raised?: boolean;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [message, onDone]);

  if (!message) return null;

  return (
    <Portal>
      <div
        role="status"
        aria-live="polite"
        data-testid="toast"
        className={`fixed left-1/2 -translate-x-1/2 z-[60] bg-text text-bg text-[13px] font-bold px-[18px] py-3 bjrise ${
          raised ? "bottom-[100px]" : "bottom-8"
        }`}
      >
        {message}
      </div>
    </Portal>
  );
}
