"use client";

import { FadeImg } from "@/components/ui/FadeImg";
import { DUR, EASE_OUT, SPRING_SMALL } from "@/lib/motion";
import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { gradientFor } from "@/lib/gradients";
import { formatViews } from "@/lib/format";
import { IconCheck, IconHeart, IconPlay } from "@/components/ui/Icon";

export type TileAsset = {
  id: string;
  kind: "PHOTO" | "VIDEO";
  format: string;
  orientation: string;
  name: string;
  dims: string | null;
  durationSec: number | null;
  /** Decimal string — BigInt cannot cross the server/client boundary. */
  sizeBytes: string;
  createdAt: string;
  updatedAt: string;
  thumbReady: boolean;
  viewCount: number | null;
};

function fmtDuration(sec: number | null) {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * One file on a project page (PortalProject13): 9:16 for vertical media, 16:9 for wide,
 * a round check top left that shows on hover, a duration pill bottom right, and the file
 * name with "Video" or "Still" under it. Selected, the tile is outlined in shu.
 */
export function AssetTile({
  asset,
  selected,
  favorite,
  isNew,
  index,
  onToggleSelect,
  onToggleFavorite,
  onOpen,
  footer = null,
}: {
  asset: TileAsset;
  selected: boolean;
  favorite: boolean;
  isNew?: boolean;
  index?: number;
  onToggleSelect: () => void;
  onToggleFavorite: () => void;
  onOpen: () => void;
  /** One more line under the name: a reel's caption state. */
  footer?: ReactNode;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const wide = asset.orientation !== "portrait";
  const duration = asset.kind === "VIDEO" ? fmtDuration(asset.durationSec) : "";

  return (
    <motion.div
      data-testid={`asset-tile-${asset.id}`}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: DUR[3],
        ease: EASE_OUT,
        // §3 stagger: 0.02s a tile, never more than 0.3s in total.
        delay: Math.min((index ?? 0) * 0.02, 0.3),
      }}
      className={`bj-tile${wide ? " wide" : ""}${selected ? " on" : ""}${favorite ? " fav" : ""}`}
    >
      <div className="im" onClick={onOpen} style={{ background: gradientFor(asset.id) }}>
        {asset.thumbReady && !thumbFailed && (
          <FadeImg src={`/api/assets/${asset.id}/thumb`} onError={() => setThumbFailed(true)} />
        )}

        {/* A real checkbox to assistive tech and the keyboard, round to the eye. */}
        <div
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${asset.name}`}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          onKeyDown={(e) => {
            if (e.key !== " " && e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect();
          }}
          className="ck"
        >
          <IconCheck />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title="Add to favorites"
          aria-pressed={favorite}
          className="hrt"
        >
          {/* §3 success moment: the heart remounts on change and springs back from 1.25,
              so favouriting is a small pop rather than a colour swap. */}
          <motion.span
            key={favorite ? "on" : "off"}
            initial={{ scale: favorite ? 1.25 : 1 }}
            animate={{ scale: 1 }}
            transition={SPRING_SMALL}
            className="grid place-items-center"
          >
            <IconHeart fill="currentColor" />
          </motion.span>
        </button>

        {asset.viewCount != null && asset.viewCount > 0 && (
          <span className="vw">
            <IconPlay fill="currentColor" /> {formatViews(asset.viewCount)} views
          </span>
        )}

        {duration && <span className="dur">{duration}</span>}
      </div>

      <div className="cap" onClick={onOpen}>
        <b>{asset.name}</b>
        <span className="kind">
          {isNew && <span className="bj-pill ok">New</span>}
          <span className="bj-mono">{asset.kind === "VIDEO" ? "Video" : "Still"}</span>
        </span>
      </div>
      {footer}
    </motion.div>
  );
}
