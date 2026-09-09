import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Single tap toggles chrome, double tap favourites.
 *
 * The two have to be told apart from the same stream of taps, and the honest way is a
 * short wait: a tap is only a single tap once it is clear a second one is not coming.
 * That costs the chrome toggle a quarter-second of latency, which is the price of the
 * chrome not flickering every time someone double-taps to favourite something.
 *
 * A double tap deliberately does *not* also toggle chrome — the first tap's action is
 * cancelled, not queued behind the second.
 */
const DOUBLE_TAP_MS = 320;

export function useTapGestures({
  onSingle,
  onDouble,
}: {
  onSingle: () => void;
  onDouble: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);

  // Latest handlers without re-arming the timer: the callers pass inline closures that
  // change every render, and a dependency on those would cancel a pending tap mid-flight.
  // Written in an effect rather than during render — a ref assignment in the render body
  // is not guaranteed to have happened by the time anything reads it.
  const singleRef = useRef(onSingle);
  const doubleRef = useRef(onDouble);
  useEffect(() => {
    singleRef.current = onSingle;
    doubleRef.current = onDouble;
  }, [onSingle, onDouble]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      // Second tap: drop the pending single entirely.
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      lastTap.current = 0;
      doubleRef.current();
      return;
    }
    lastTap.current = now;
    timer.current = setTimeout(() => {
      timer.current = null;
      singleRef.current();
    }, DOUBLE_TAP_MS);
  }, []);
}

/**
 * The burst that confirms a favourite landed.
 *
 * Returns a token rather than a boolean so two favourites in a row replay the animation
 * instead of the second one doing nothing because the flag was already true.
 */
export function useHeartBurst(ms = 700) {
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(0), ms);
    return () => clearTimeout(t);
  }, [burst, ms]);

  return { burst, fire: useCallback(() => setBurst(Date.now()), []) };
}
