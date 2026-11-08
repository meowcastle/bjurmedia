"use client";

import { motion } from "framer-motion";
import { DUR, EASE_OUT, SPRING_SMALL } from "@/lib/motion";
import { formatBytes } from "@/lib/format";
import { IconCheck, IconHeart, IconLock } from "@/components/ui/Icon";
import type { TileAsset } from "@/components/AssetTile";

/** 3725 -> "1:02:05". Production audio runs long; a 62-minute take is not "62:05". */
function fmtDuration(sec: number | null) {
  if (sec == null) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * One raw camera original or audio file on a project page (lib/fileOnly.ts).
 *
 * A row, not a tile. There is no picture to put in a tile — no poster, no proxy, nothing
 * the swipe viewer could play — and a grid of 33 identical grey boxes says less than a
 * list of 33 clip names with their sizes. So these sit under the tiles as a plain file
 * list: select, favourite, and a direct Download of the original.
 *
 * While the project is awaiting payment the row is `locked`: still listed with its name
 * and size, so the client can see everything that was shot, but with no checkbox and no
 * download — the routes refuse with 402 anyway (paymentHold.ts, lockedUnderHold), and a
 * control that only ever errors is worse than no control.
 */
export function FileRow({
  asset,
  locked,
  canDownload,
  selected,
  favorite,
  isNew,
  index,
  onToggleSelect,
  onToggleFavorite,
}: {
  asset: TileAsset;
  locked: boolean;
  canDownload: boolean;
  selected: boolean;
  favorite: boolean;
  isNew?: boolean;
  index?: number;
  onToggleSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const ext = asset.name.includes(".") ? asset.name.split(".").pop()!.toUpperCase() : null;
  const meta = [ext, formatBytes(Number(asset.sizeBytes)), fmtDuration(asset.durationSec)]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.div
      data-testid={`file-row-${asset.id}`}
      data-locked={locked || undefined}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR[3], ease: EASE_OUT, delay: Math.min((index ?? 0) * 0.02, 0.3) }}
      className={`bj-file${selected ? " on" : ""}${favorite ? " fav" : ""}${locked ? " locked" : ""}`}
    >
      {locked ? (
        <span className="ic" aria-hidden>
          <IconLock />
        </span>
      ) : (
        <div
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${asset.name}`}
          tabIndex={0}
          onClick={onToggleSelect}
          onKeyDown={(e) => {
            if (e.key !== " " && e.key !== "Enter") return;
            e.preventDefault();
            onToggleSelect();
          }}
          className="ck"
        >
          <IconCheck />
        </div>
      )}

      <div className="nm">
        <b title={asset.name}>{asset.name}</b>
        <span className="bj-mono">
          {meta}
          {isNew && <span className="bj-pill ok">New</span>}
        </span>
      </div>

      <button
        type="button"
        onClick={onToggleFavorite}
        title="Add to favorites"
        aria-pressed={favorite}
        className="hrt"
      >
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

      {locked ? (
        <span className="bj-mono st" data-testid={`file-locked-${asset.id}`}>
          <span className="lg">Unlocks after payment</span>
          <span className="sm">Locked</span>
        </span>
      ) : canDownload ? (
        // A plain link: the route streams the original as an attachment, so the browser
        // saves it with its own progress — a 4 GB .braw must never be read into the page.
        <a
          href={`/api/assets/${asset.id}/download`}
          download
          className="bj-mono dl"
          aria-label={`Download ${asset.name} · ${formatBytes(Number(asset.sizeBytes))}`}
        >
          ↓ Download
        </a>
      ) : null}
    </motion.div>
  );
}
