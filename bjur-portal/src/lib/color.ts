const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(v: string): boolean {
  return HEX_RE.test(v);
}

/** Blends a hex color toward white by `amount` (0-1) — used to derive the hover
 * shade from a client's single base accent color, matching the app's default
 * --accent/--accentb pairing (accentb is a brighter tint of accent). */
export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
