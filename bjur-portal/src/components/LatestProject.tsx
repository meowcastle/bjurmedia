import Link from "next/link";
import { FadeImg } from "@/components/ui/FadeImg";
import { gradientFor } from "@/lib/gradients";
import { formatBytes } from "@/lib/format";
import type { ProjectListItem } from "@/components/ProjectListClient";

export type LatestProjectData = ProjectListItem & {
  fileCount: number;
  /** The studio's description, or one line from the counts: "3 videos and 1 still." */
  line: string;
  /** The third number: a master's dimensions over its codec, or counts when unknown. */
  format: { value: string; label: string };
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The client home's "Latest" section (PortalProjects13): the most recent project's still,
 * its status, title, one line and three numbers. The whole block is clickable through a
 * stretched "Open project" link, so the title is not a second link a screen reader reads
 * out beside the table row's.
 */
export function LatestProject({ p }: { p: LatestProjectData }) {
  const href = p.isFilm ? `/p/${p.id}/review` : `/p/${p.id}`;
  return (
    <section className="bj-sx" data-testid="latest-project">
      <span className="bj-mono bj-lab">Latest</span>
      <div className="bj-latest">
        <div className="im" style={{ background: gradientFor(p.id) }}>
          {p.coverAssetId && <FadeImg src={`/api/assets/${p.coverAssetId}/thumb`} />}
        </div>
        <div>
          {p.reviewPending ? (
            <span className="bj-pill red">Needs your review</span>
          ) : p.newCount > 0 ? (
            <span className="bj-pill ok">New{p.deliveredAt ? ` · ${shortDate(p.deliveredAt)}` : ""}</span>
          ) : p.deliveredAt ? (
            <span className="bj-mono">Delivered {shortDate(p.deliveredAt)}</span>
          ) : null}
          <h2>{p.title}</h2>
          <p className="bj-lead">{p.line}</p>
          <div className="meta">
            <div>
              <b>{p.fileCount}</b>
              <span className="bj-mono">{p.fileCount === 1 ? "file" : "files"}</span>
            </div>
            <div>
              <b>{formatBytes(Number(p.totalBytes))}</b>
              <span className="bj-mono">size</span>
            </div>
            <div>
              <b>{p.format.value}</b>
              <span className="bj-mono">{p.format.label}</span>
            </div>
          </div>
          <Link href={href} className="bj-cta go">
            Open project <i>→</i>
          </Link>
        </div>
      </div>
    </section>
  );
}
