import Link from "next/link";
import { gradientFor } from "@/lib/gradients";

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
}: {
  id: string;
  title: string;
  deliveredAt: Date | null;
  expiresAt: Date | null;
  photoCount: number;
  videoCount: number;
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
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-black/55" />
        {expiresAt && (
          <div className="absolute top-3 left-3 text-[10px] tracking-wide uppercase font-bold text-bg bg-accent px-2 py-1">
            Expires {formatDate(expiresAt)}
          </div>
        )}
        <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between">
          <span className="text-[11px] tracking-wide text-white/82 font-semibold">
            {parts.join(" · ")}
          </span>
          <span className="text-base leading-none text-white">→</span>
        </div>
      </div>
      <div className="px-4 pt-4 pb-5">
        <div className="text-[10px] tracking-widest uppercase text-muted font-semibold mb-2">
          LIVE
        </div>
        <div className="text-xl font-extrabold tracking-tight leading-snug mb-2.5">{title}</div>
        <div className="text-xs text-dim">
          Delivered {deliveredAt ? formatDate(deliveredAt) : "—"}
        </div>
      </div>
    </Link>
  );
}
