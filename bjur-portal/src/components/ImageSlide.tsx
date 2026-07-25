"use client";

import { gradientFor } from "@/lib/gradients";

export type PhotoNavAsset = {
  id: string;
  name: string;
};

/**
 * One mounted slot in the stills carousel's 3-wide track. Much simpler than
 * VideoSlide — images don't carry video's decode-session/network-churn
 * concerns, so every slot renders unconditionally, no settle-gated mounting
 * needed.
 */
export function ImageSlide({ item, active }: { item: PhotoNavAsset | null; active: boolean }) {
  if (!item) {
    return <div className="w-full h-full shrink-0" />;
  }

  return (
    <div className="w-full h-full shrink-0 relative" style={{ background: gradientFor(item.id) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied binary from our own API, not a static asset Next can optimize */}
      <img
        src={`/api/assets/${item.id}/thumb`}
        alt={item.name}
        data-testid={active ? "active-photo" : undefined}
        className="w-full h-full object-contain"
      />
    </div>
  );
}
