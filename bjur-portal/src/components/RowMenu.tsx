"use client";

import { useEffect, useRef, useState } from "react";
import { IconMore } from "@/components/ui/Icon";

/**
 * §10. A row's action column had grown to six buttons — Hide, Regenerate, Delete, and
 * for masters a licensing cluster on top — which made every row read as a toolbar and
 * left the destructive one sitting a few pixels from the routine ones.
 *
 * Same open/close contract as the account menu in the header: outside click and Escape
 * both close, the trigger reports aria-expanded, items are menuitems.
 */
export function RowMenu({
  label,
  children,
  align = "right",
}: {
  label: string;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
    // Bound only while open — a listener per row on a 200-row table is a lot of
    // handlers to run on every stray click otherwise.
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="cursor-pointer w-8 h-8 grid place-items-center border border-line2 text-muted hover:text-text hover:border-text text-[15px] leading-none"
      >
        <IconMore />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-[calc(100%+6px)] min-w-[200px] bg-s2 border border-line2 shadow-[0_18px_50px_rgba(0,0,0,.6)] z-30 py-1`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** One row in a RowMenu. `tone="danger"` for the destructive entry. */
export function RowMenuItem({
  onClick,
  children,
  tone = "normal",
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "normal" | "danger";
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`w-full text-left px-3.5 py-2.5 text-[12px] cursor-pointer hover:bg-white/[0.04] ${
        tone === "danger" ? "text-dim hover:text-accentb" : "text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
