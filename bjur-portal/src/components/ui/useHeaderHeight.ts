"use client";

import { useEffect, useRef } from "react";

/**
 * Publishes the sticky header's live height as --header-h on <html> (PORTAL-POLISH §4),
 * so anything that sticks beneath it — the upload progress card, the Library panel —
 * sits exactly under it. They hard-coded 70px and 92px, which drifted the moment the
 * header wrapped onto a second line.
 */
export function useHeaderHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () =>
      document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}
