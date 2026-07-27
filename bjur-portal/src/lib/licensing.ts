export type LicenseTierId = "SOCIAL" | "COMMERCIAL" | "BUYOUT";

export type LicenseTierOption = {
  id: LicenseTierId;
  label: string;
  amount: number;
  scope: string;
};

function round50(n: number) {
  return Math.round(n / 50) * 50;
}

export function licenseTiers(basePrice: number): LicenseTierOption[] {
  return [
    {
      id: "SOCIAL",
      label: "Social & Digital",
      amount: round50(basePrice),
      scope: "Organic social, web & internal use · 1 year",
    },
    {
      id: "COMMERCIAL",
      label: "Commercial & Broadcast",
      amount: round50(basePrice * 2),
      scope: "Paid ads, TV / OTT, out-of-home · 2 years",
    },
    {
      id: "BUYOUT",
      label: "Full Buyout",
      amount: round50(basePrice * 4),
      scope: "All media, worldwide, in perpetuity",
    },
  ];
}

// ── Enterprise custom licensing (admin-granted only) ────────────────────────

export const CHANNEL_OPTIONS = [
  { key: "organic_social", label: "Organic Social" },
  { key: "paid_social", label: "Paid Social" },
  { key: "ooh", label: "OOH" },
  { key: "broadcast", label: "Broadcast" },
] as const;

export type ChannelKey = (typeof CHANNEL_OPTIONS)[number]["key"];

function channelLabel(key: string): string {
  return CHANNEL_OPTIONS.find((c) => c.key === key)?.label ?? key;
}

/** Composes the frozen `scope` text for a custom license from its structured
 * fields — "12 months · North America · Paid Social · Exclusive", etc. */
export function composeCustomScope(opts: {
  termMonths: number | null;
  territory: string | null;
  channels: string[];
  exclusive: boolean;
}): string {
  const term = opts.termMonths ? `${opts.termMonths} month${opts.termMonths === 1 ? "" : "s"}` : "Perpetuity";
  const territory = opts.territory?.trim() || "Worldwide";
  const channels = opts.channels.length > 0 ? opts.channels.map(channelLabel).join(" + ") : "All channels";
  const exclusivity = opts.exclusive ? "Exclusive" : "Non-exclusive";
  return [term, territory, channels, exclusivity].join(" · ");
}

/** purchasedAt + termMonths, or null for a perpetual license. */
export function computeExpiresAt(purchasedAt: Date, termMonths: number | null): Date | null {
  if (!termMonths) return null;
  const d = new Date(purchasedAt);
  d.setMonth(d.getMonth() + termMonths);
  return d;
}
