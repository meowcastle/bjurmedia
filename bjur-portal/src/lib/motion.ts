/**
 * The §1 motion tokens in framer-motion's terms, for the components that animate in JS.
 * Mirrors globals.css — change one, change the other.
 */
export const EASE_OUT = [0.32, 0.72, 0, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;
export const EASE_STD = [0.2, 0, 0, 1] as const;

/** Seconds, as framer wants them. */
export const DUR = { 1: 0.12, 2: 0.2, 3: 0.26, 4: 0.42 } as const;

/** The viewer's springs (§0): large travel, and small. */
export const SPRING_LARGE = { type: "spring", stiffness: 300, damping: 32 } as const;
export const SPRING_SMALL = { type: "spring", stiffness: 500, damping: 40 } as const;
