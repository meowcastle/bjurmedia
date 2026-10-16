import Link from "next/link";
import { FadeImg } from "@/components/ui/FadeImg";
import { gradientFor } from "@/lib/gradients";
import { formatBytes } from "@/lib/format";
import { LinkPending } from "@/components/ui/LinkPending";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
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
  isFilm,
  reviewPending,
  index = 0,
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
  /** A Film project opens on its cut, not on a gallery of one file. */
  isFilm?: boolean;
  /** True while the latest cut is still awaiting an answer — worth saying on the card. */
  reviewPending?: boolean;
  /** Position in the list, for the §3 stagger. */
  index?: number;
}) {
  const parts: string[] = [];
  if (isFilm) parts.push(reviewPending ? "Cut awaiting your notes" : "Cuts & notes");
  else {
    if (videoCount) parts.push(`${videoCount} video${videoCount > 1 ? "s" : ""}`);
    if (photoCount) parts.push(`${photoCount} photo${photoCount > 1 ? "s" : ""}`);
  }

  return (
    <Link
      // A Film project's front door is the cut under review. Sending it to the gallery
      // first would show a client one file and no way to say anything about it.
      href={isFilm ? `/p/${id}/review` : `/p/${id}`}
      className="group relative block bg-s1 border border-line hover:border-line2 shadow-1 hover:shadow-2 hover:-translate-y-0.5 active:scale-[.985] transition-[transform,box-shadow,border-color] duration-(--dur-1) ease-std bj-row"
      style={{ "--i": index } as React.CSSProperties}
    >
      <LinkPending />
      <div
        className="aspect-[16/10] relative overflow-hidden"
        style={{ background: gradientFor(id) }}
      >
        {coverAssetId && (
          <FadeImg
            src={`/api/assets/${coverAssetId}/thumb`}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-[opacity,transform] duration-(--dur-3) ease-out"
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
            {formatBytes(totalBytes)}
          </span>
        </div>
      </div>
      <div className="px-4 pt-4 pb-5">
        <div className="text-xl font-extrabold tracking-tight leading-snug mb-2.5">
          {title}
        </div>
        <span className="text-xs text-dim">
          Delivered {deliveredAt ? formatDate(deliveredAt) : "—"}
        </span>
      </div>
    </Link>
  );
}
