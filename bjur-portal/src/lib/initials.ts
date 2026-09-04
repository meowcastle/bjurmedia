/**
 * Initials for a client or person's avatar.
 *
 * There were four near-copies of this, differing in ways that showed: one split on
 * whitespace only, so "57.NYC" came out "5"; another split on whitespace and dots but
 * took a single letter from a one-word name, so "SSH" came out "S" next to two-letter
 * initials everywhere else. One version now, so the same name looks the same on every
 * screen.
 */
export function initials(name: string) {
  const words = name.split(/[\s.]+/).filter(Boolean);
  if (words.length === 0) return "?";
  // A single word gives up its first two letters rather than sitting alone next to
  // two-letter initials — "SSH" reads as SS, not S.
  const letters =
    words.length === 1 ? words[0].slice(0, 2) : words.map((w) => w[0]).join("");
  return letters.slice(0, 2).toUpperCase();
}
