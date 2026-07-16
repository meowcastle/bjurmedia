"use client";

import { useState } from "react";
import { gradientFor } from "@/lib/gradients";
import { licenseTiers } from "@/lib/licensing";

export type TileAsset = {
  id: string;
  kind: "PHOTO" | "VIDEO";
  format: string;
  orientation: string;
  name: string;
  dims: string | null;
  durationSec: number | null;
  licensable: boolean;
  basePrice: number | null;
  createdAt: string;
  updatedAt: string;
  thumbReady: boolean;
};

function fmtDuration(sec: number | null) {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtStamp(createdAt: string, updatedAt: string) {
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  if (updated - created > 60_000) {
    return { text: `Updated ${new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, isUpdate: true };
  }
  return { text: `Added ${new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, isUpdate: false };
}

function aspectFor(a: TileAsset) {
  if (a.format === "Reel") return "9 / 16";
  if (a.format === "Still") return a.orientation === "portrait" ? "3 / 4" : "3 / 2";
  return "16 / 9";
}

export function AssetTile({
  asset,
  selected,
  favorite,
  unlocked,
  onToggleSelect,
  onToggleFavorite,
  onOpen,
}: {
  asset: TileAsset;
  selected: boolean;
  favorite: boolean;
  unlocked: boolean;
  onToggleSelect: () => void;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const locked = asset.licensable && !unlocked;
  const stamp = fmtStamp(asset.createdAt, asset.updatedAt);
  const badge = asset.kind === "VIDEO" ? fmtDuration(asset.durationSec) : asset.dims ?? "";
  const priceLabel = locked && asset.basePrice ? `from $${licenseTiers(asset.basePrice)[0].amount}` : "";
  const [thumbFailed, setThumbFailed] = useState(false);

  const borderColor = selected ? "border-accent" : locked ? "border-accent/40" : "border-line";

  return (
    <div className="bjfade">
      <div
        onClick={onOpen}
        className={`cursor-pointer relative overflow-hidden border hover:border-accent transition-colors ${borderColor}`}
        style={{ aspectRatio: aspectFor(asset), background: gradientFor(asset.id) }}
      >
        {asset.thumbReady && !thumbFailed && (
          // eslint-disable-next-line @next/next/no-img-element -- proxied binary from our own API, not a static asset Next can optimize
          <img
            src={`/api/assets/${asset.id}/thumb`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/12 via-transparent via-60% to-black/60" />

        {asset.licensable && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2] flex items-center justify-center">
            <div className="w-[260%] -rotate-[24deg] flex flex-col gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="text-xs font-extrabold tracking-[0.32em] text-white/[0.13] whitespace-nowrap text-center"
                >
                  BJUR MEDIA · PREVIEW · BJUR MEDIA · PREVIEW · BJUR MEDIA
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={`absolute top-2.5 left-2.5 w-[22px] h-[22px] border-[1.5px] grid place-items-center z-[4] cursor-pointer ${
            selected ? "bg-accent border-accent" : "bg-black/35 border-white/70"
          }`}
        >
          {selected && <span className="text-bg text-[13px] font-extrabold leading-none">✓</span>}
        </div>

        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title="Add to favorites"
          className={`absolute top-2.5 right-2.5 w-[26px] h-[26px] grid place-items-center z-[4] cursor-pointer bg-black/40 hover:bg-black/60 text-sm ${
            favorite ? "text-accent" : "text-white/80"
          }`}
        >
          ♥
        </div>

        {locked ? (
          <div className="absolute left-0 right-0 bottom-0 z-[5] px-3 py-2.5 bg-gradient-to-t from-black/85 to-transparent flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-white truncate">🔒 {asset.name}</span>
            <span className="text-[11px] font-extrabold text-accentb whitespace-nowrap">{priceLabel}</span>
          </div>
        ) : (
          <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2 z-[3]">
            <span className="text-[11px] text-white/90 font-semibold truncate">{asset.name}</span>
            <span className="text-[10px] text-white/62 whitespace-nowrap">{badge}</span>
          </div>
        )}
      </div>
      {stamp.text && (
        <div className={`pt-1.5 text-[10.5px] ${stamp.isUpdate ? "text-accentb" : "text-dim"}`}>
          {stamp.text}
        </div>
      )}
    </div>
  );
}
