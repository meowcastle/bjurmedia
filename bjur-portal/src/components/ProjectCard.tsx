import Link from "next/link";
import { gradientFor } from "@/lib/gradients";
import { formatSize } from "@/components/AssetTile";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export function ProjectCard({
  id,
  title,
  deliveredAt,
  expiresAt,
  photoCount,
  videoCount,
  coverAssetId,
  newCount,
  totalBytes,
}: {
  id: string;
  title: string;
  deliveredAt: Date | null;
  expiresAt: Date | null;
  photoCount: number;
  videoCount: number;
  coverAssetId: string | null;
  /** Files delivered this week. 0 hides the badge. */
  newCount: number;
  totalBytes: number;
}) {
  const parts: string[] = [];
  if (videoCount) parts.push(`${videoCount} video${videoCount > 1 ? "s" : ""}`);
  if (photoCount) parts.push(`${photoCount} photo${photoCount > 1 ? "s" : ""}`);

  return (
    <Link
      href={`/p/${id}`}
      className="block bg-s1 border border-line hover:border-line2 bjfade"
    >
      <div
        className="aspect-[16/10] relative overflow-hidden"
        style={{ background: gradientFor(id) }}
      >
        {coverAssetId && (
          // eslint-disable-next-line @next/next/no-img-element -- proxied binary from our own API, not a static asset Next can optimize
          <img
            src={`/api/assets/${coverAssetId}/thumb`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-black/55" />
        {newCount > 0 && (
          <div className="absolute top-3 left-3 text-[10px] tracking-wide uppercase font-bold text-bg bg-accent px-2 py-1">
            {newCount} new
          </div>
        )}
        {expiresAt && (
          <div className="absolute top-3 right-3 text-[10px] tracking-wide uppercase font-bold text-text bg-black/60 border border-accentb/60 px-2 py-1">
            Available until {formatDate(expiresAt)}
          </div>
        )}
        <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between gap-2">
          <span className="text-[11px] tracking-wide text-white/82 font-semibold">
            {parts.join(" · ")}
          </span>
          <span className="text-[11px] text-white/82 font-semibold tabular-nums">
            {formatSize(totalBytes)}
          </span>
        </div>
      </div>
      <div className="px-4 pt-4 pb-5">
        <div className="text-xl font-extrabold tracking-tight leading-snug mb-2.5">{title}</div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-dim">
            Delivered {deliveredAt ? formatDate(deliveredAt) : "—"}
          </span>
          <span className="text-xs font-bold text-muted">Open →</span>
        </div>
      </div>
    </Link>
  );
}
