"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY, THEME_FALLBACK, type Portal } from "@/lib/theme";

/**
 * Light/dark, remembered per portal.
 *
 * Two separate keys because they are two different habits: clients read their gallery
 * in daylight, staff live in the admin at night. One shared preference would mean
 * whichever you touched last decides for both.
 *
 * The stamp goes on <html> so every token swap is one attribute change. Storage can
 * throw outright in a private window, so every read and write is guarded — a browser
 * that refuses to remember still has to render.
 */
// The stamped attribute on <html> is the source of truth, and it lives outside React.
// useSyncExternalStore is the sanctioned way to read that: no effect writing state back
// on mount, and hydration is handled by the server snapshot rather than a flash.
let listeners: (() => void)[] = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function currentTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeToggle({ portal }: { portal: Portal }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => THEME_FALLBACK[portal]);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY[portal], next);
    } catch {
      // Preference is lost on reload, but the page still switches now.
    }
    for (const l of listeners) l();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="cursor-pointer text-[10.5px] uppercase tracking-[.1em] font-bold text-muted hover:text-text px-2.5 py-2"
    >
      {theme === "dark" ? "\u263c Light" : "\u263e Dark"}
    </button>
  );
}
