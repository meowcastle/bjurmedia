"use client";

import { useState } from "react";
import { licenseTiers, type LicenseTierId } from "@/lib/licensing";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";

export function LicensingDialog({
  assetId,
  name,
  basePrice,
  onClose,
  onLicensed,
}: {
  assetId: string;
  name: string;
  basePrice: number;
  onClose: () => void;
  onLicensed: () => void;
}) {
  const tiers = licenseTiers(basePrice);
  const [selected, setSelected] = useState<LicenseTierId>(tiers[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const chosen = tiers.find((t) => t.id === selected)!;

  async function confirm() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, tier: selected }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Purchase failed.");
      setLoading(false);
      return;
    }
    onLicensed();
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center bjfade" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] bg-s2 border border-line2 p-6"
      >
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2">
          Unlock master · BRAW
        </div>
        <h3 className="text-xl font-extrabold mb-5">{name}</h3>

        <div className="flex flex-col gap-2 mb-5">
          {tiers.map((t) => (
            <label
              key={t.id}
              className={`flex items-start gap-3 border p-3.5 cursor-pointer ${
                selected === t.id ? "border-accent bg-bg" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="tier"
                checked={selected === t.id}
                onChange={() => setSelected(t.id)}
                className="mt-1 accent-accent"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{t.label}</span>
                  <span className="text-sm font-extrabold">${t.amount}</span>
                </div>
                <div className="text-xs text-muted mt-1">{t.scope}</div>
              </div>
            </label>
          ))}
        </div>

        {error && <div className="text-xs text-accentb mb-4 font-semibold">{error}</div>}

        <div className="text-[11px] text-dim mb-5">
          Full-res BRAW master · watermark removed · resumable download
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={confirm} disabled={loading}>
            {loading ? "Processing…" : `Confirm — $${chosen.amount}`}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
