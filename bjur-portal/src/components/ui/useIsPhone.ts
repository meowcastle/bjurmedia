"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 639px)";

/** Below Tailwind's `sm`, where menus become bottom sheets (PORTAL-POLISH §4). */
export function useIsPhone() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
