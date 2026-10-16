"use client";

import { useEffect, useState } from "react";
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
  action,
}: {
  message: string | null;
  onDone: () => void;
  raised?: boolean;
  /** One follow-up, such as UNDO. The strip stays up longer so there is time to reach it. */
  action?: { label: string; onClick: () => void };
}) {
  const hasAction = Boolean(action);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, hasAction ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [message, onDone, hasAction]);

  // The last message stays on screen for the length of the exit after the parent clears
  // it, so the strip fades out instead of vanishing mid-read. Derived during render — the
  // React-sanctioned way to follow a prop — with a timer only to finish the exit.
  const [shown, setShown] = useState(message);
  if (message && message !== shown) setShown(message);
  const leaving = !message && shown !== null;
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setShown(null), 120);
    return () => clearTimeout(t);
  }, [leaving]);

  if (!shown) return null;

  return (
    <Portal>
      <div
        role="status"
        aria-live="polite"
        data-testid="toast"
        className={`fixed left-1/2 -translate-x-1/2 z-[60] bg-text text-bg text-[13px] font-bold px-[18px] py-3 shadow-2 ${
          leaving ? "bj-toast-out" : "bj-toast-in"
        } ${
          raised
            ? "bottom-[calc(100px+env(safe-area-inset-bottom))]"
            : "bottom-[calc(2rem+env(safe-area-inset-bottom))]"
        }`}
      >
        {shown}
        {action && (
          <button
            onClick={() => {
              action.onClick();
              onDone();
            }}
            className="ml-4 underline underline-offset-2 cursor-pointer tracking-[.08em]"
          >
            {action.label}
          </button>
        )}
      </div>
    </Portal>
  );
}
