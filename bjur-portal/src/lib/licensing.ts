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
