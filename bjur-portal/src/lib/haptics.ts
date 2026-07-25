/**
 * Fires a very short vibration if the platform supports it. Safe to call
 * unconditionally — notably a no-op on iOS Safari, which has never implemented
 * the Vibration API (works on Android Chrome and other Vibration-API browsers).
 */
export function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(ms);
  }
}
