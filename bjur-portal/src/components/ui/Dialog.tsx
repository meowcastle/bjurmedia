"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Portal } from "@/components/ui/Portal";

/** How long each exit runs (PORTAL-POLISH §2): --dur-1 for a dialog, --dur-2 for a drawer. */
const EXIT_MS = { center: 120, drawer: 200 } as const;

/**
 * Lets a dialog animate out before its parent unmounts it.
 *
 * Every dialog here is rendered by its parent as `{open && <XDialog onClose=… />}`, so
 * the moment onClose runs the dialog is gone — there is no frame left to animate. Rather
 * than AnimatePresence (which once left the gallery's old tiles mounted for good), the
 * dialog plays its own exit and only then calls onClose. A close that starts in the
 * parent still works; it just skips the exit.
 */
export function useDialogExit(onClose: () => void, variant: "center" | "drawer" = "center") {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const close = useCallback(() => {
    if (timer.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return onClose();
    setClosing(true);
    // Reset after, so a dialog that lives in its parent (rather than being unmounted and
    // remounted) opens fresh the next time instead of mid-exit.
    timer.current = setTimeout(() => {
      timer.current = null;
      setClosing(false);
      onClose();
    }, EXIT_MS[variant]);
  }, [onClose, variant]);
  return { close, closing };
}

// Body scroll-lock is counted, so a dialog opened over a drawer does not unlock the page
// when it closes first.
let locks = 0;
let savedOverflow = "";

/**
 * The overlay every dialog and drawer shares: backdrop, panel, Escape, body scroll-lock,
 * a 90dvh cap and safe-area padding. Enter is --dur-3 --ease-out; exit is shorter and on
 * --ease-in, as the tokens require. `onDismiss` undefined means the backdrop and Escape
 * do nothing — for the screens that show a password once and must be closed on purpose.
 */
export function Dialog({
  closing,
  onDismiss,
  variant = "center",
  panelClassName = "",
  children,
}: {
  closing: boolean;
  onDismiss?: () => void;
  variant?: "center" | "drawer";
  panelClassName?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (locks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (--locks === 0) document.body.style.overflow = savedOverflow;
    };
  }, []);

  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const drawer = variant === "drawer";
  return (
    <Portal>
      <div
        data-state={closing ? "closing" : "open"}
        className={`fixed inset-0 z-50 bg-black/70 ${
          drawer
            ? "flex justify-end"
            : "grid place-items-center p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        } ${closing ? "bj-backdrop-out" : "bj-backdrop-in"}`}
        onClick={onDismiss}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className={`bg-s2 border-line2 shadow-3 overscroll-contain ${
            drawer
              ? `w-full h-full overflow-y-auto border-l pb-[env(safe-area-inset-bottom)] ${closing ? "bj-drawer-out" : "bj-drawer-in"}`
              : `w-full max-h-[90dvh] overflow-y-auto border ${closing ? "bj-dialog-out" : "bj-dialog-in"}`
          } ${panelClassName}`}
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}
