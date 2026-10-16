"use client";

import { haptic } from "@/lib/haptics";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/** How far a downward drag has to travel before letting go closes the sheet. */
const DISMISS_PX = 80;

/**
 * The phone menu as a sheet from the bottom edge (PORTAL-POLISH §4), on the pattern
 * DownloadSheet set: it stays mounted, slides on --dur-4 with DownloadSheet's curve, and
 * is `inert` while closed so its controls are out of the tab order. Backdrop tap and a
 * downward drag on the handle close it. Themed, unlike the viewer's always-dark sheet.
 *
 * Portalled to <body> because the headers that open it are sticky with backdrop-filter,
 * which makes a `fixed` child position against the header rather than the screen.
 */
export function BottomSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  // Client-only, since it renders closed on every page load and a portal has no server.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    haptic();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-[55] bg-black/50 transition-opacity duration-(--dur-3) ease-std ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        inert={!open}
        aria-hidden={!open}
        data-testid="bottom-sheet"
        data-open={open ? "1" : "0"}
        className={`fixed left-0 right-0 bottom-0 z-[56] bg-s2 border-t border-line2 shadow-3 overscroll-contain max-h-[85dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)] ${
          dragging ? "" : "transition-transform duration-(--dur-4) ease-out"
        }`}
        style={{ transform: open ? `translateY(${dragY}px)` : "translateY(100%)" }}
      >
        <div
          className="flex justify-center pt-3 pb-2 touch-none cursor-grab"
          onPointerDown={(e) => {
            start.current = e.clientY;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current !== null) setDragY(Math.max(0, e.clientY - start.current));
          }}
          onPointerUp={() => {
            const dismiss = dragY > DISMISS_PX;
            start.current = null;
            setDragging(false);
            setDragY(0);
            if (dismiss) onClose();
          }}
          onPointerCancel={() => {
            start.current = null;
            setDragging(false);
            setDragY(0);
          }}
        >
          <span className="block w-9 h-1 bg-line2" aria-hidden />
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
