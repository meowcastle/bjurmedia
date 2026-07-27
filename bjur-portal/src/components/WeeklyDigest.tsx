import Link from "next/link";

const FORMAT_LABELS: Record<string, string> = {
  Reel: "reel",
  Film: "film",
  Still: "still",
  Master: "master",
};

function summarize(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([format, n]) => {
      const label = FORMAT_LABELS[format] ?? format.toLowerCase();
      return `${n} new ${label}${n > 1 ? "s" : ""}`;
    })
    .join(" · ");
}

export function WeeklyDigest({
  totalsByFormat,
  projects,
}: {
  totalsByFormat: Record<string, number>;
  projects: { id: string; title: string; totalsByFormat: Record<string, number> }[];
}) {
  if (projects.length === 0) return null;

  return (
    <div className="border border-line2 bg-s1 px-5 py-5 mb-9">
      <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2">
        This Week
      </div>
      <div className="text-lg font-extrabold tracking-tight mb-4">{summarize(totalsByFormat)}</div>
      <div className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/p/${p.id}`}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-bg bg-accent hover:bg-accentb px-3.5 py-2"
          >
            {p.title}
            <span className="text-bg/70 font-normal">{summarize(p.totalsByFormat)}</span>
            <span>→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
