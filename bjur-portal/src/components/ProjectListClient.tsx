"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FadeImg } from "@/components/ui/FadeImg";
import { gradientFor } from "@/lib/gradients";
import { formatBytes } from "@/lib/format";

export type ProjectListItem = {
  id: string;
  title: string;
  deliveredAt: string | null;
  expiresAt: string | null;
  photoCount: number;
  videoCount: number;
  coverAssetId: string | null;
  /** Files delivered this week. Above 0, the row says New. */
  newCount: number;
  /** Decimal string — sizeBytes is a BigInt server-side. */
  totalBytes: string;
  /** A Film project opens on its cut, not on a gallery of one file. */
  isFilm: boolean;
  /** A sent cut is still waiting on the client. */
  reviewPending: boolean;
};

type Sort = "newest" | "az";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function filesLabel(n: number) {
  return `${n} file${n === 1 ? "" : "s"}`;
}

function hrefFor(p: ProjectListItem) {
  // A Film project's front door is the cut under review. Sending it to the gallery
  // first would show a client one file and no way to say anything about it.
  return p.isFilm ? `/p/${p.id}/review` : `/p/${p.id}`;
}

/**
 * The client home's "All projects" section: a table, with search and sort once the list
 * outgrows a screen.
 *
 * Filtering is on project titles only, and deliberately client-side: the whole list is
 * already in the payload, so a round trip would be slower and offer nothing.
 */
export function ProjectListClient({ projects }: { projects: ProjectListItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? projects.filter((p) => p.title.toLowerCase().includes(q)) : projects;
    const sorted = [...filtered];
    if (sort === "az") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      // Undelivered projects sort last rather than being treated as epoch 0.
      sorted.sort((a, b) => {
        if (!a.deliveredAt && !b.deliveredAt) return 0;
        if (!a.deliveredAt) return 1;
        if (!b.deliveredAt) return -1;
        return new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime();
      });
    }
    return sorted;
  }, [projects, query, sort]);

  // A handful of rows is faster to scan than to search; the tools earn their place once
  // the list outgrows a screen.
  const showTools = projects.length >= 8;

  if (projects.length === 0) {
    return (
      <section className="bj-sx">
        <span className="bj-mono bj-lab">All projects</span>
        <EmptyState icon="projects" className="bj-empty">
          No projects yet.
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="bj-sx">
      <span className="bj-mono bj-lab">All projects</span>
      <div className="min-w-0">
        {showTools && (
          <div className="bj-listtools">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              className="bj-find"
            />
            <div className="bj-chips" role="group" aria-label="Sort">
              {(
                [
                  ["newest", "Newest"],
                  ["az", "A–Z"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSort(id)}
                  aria-pressed={sort === id}
                  className={`bj-chip${sort === id ? " on" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {shown.length === 0 ? (
          <p className="bj-empty bj-mono">No projects match “{query.trim()}”.</p>
        ) : (
          <div className="bj-tblw">
            <table className="bj-tbl bj-projtbl">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="hide">Delivered</th>
                  <th>Status</th>
                  <th className="r hide">Size</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {shown.map((p, i) => {
                  const files = p.photoCount + p.videoCount;
                  const href = hrefFor(p);
                  return (
                    <tr
                      key={p.id}
                      className="row bj-row"
                      data-testid="project-row"
                      style={{ "--i": i } as React.CSSProperties}
                      // The row is the target for a pointer; the title link is the real one
                      // for a keyboard, a screen reader and a middle-click.
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a")) return;
                        router.push(href);
                      }}
                    >
                      <td>
                        <div className="bj-thumbs">
                          <span className="ph" style={{ background: gradientFor(p.id) }}>
                            {p.coverAssetId && <FadeImg src={`/api/assets/${p.coverAssetId}/thumb`} />}
                          </span>
                          <div className="t min-w-0">
                            <Link href={href} className="ttl" data-testid="project-title">
                              {p.title}
                            </Link>
                            <span className="bj-mono">
                              {p.isFilm ? "Film · " : ""}
                              {filesLabel(files)}
                              {p.expiresAt ? ` · Until ${fmtDate(p.expiresAt)}` : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="num hide">{fmtDate(p.deliveredAt)}</td>
                      <td>
                        {p.reviewPending ? (
                          <span className="bj-pill red">Needs your review</span>
                        ) : p.newCount > 0 ? (
                          <span className="bj-pill ok">New</span>
                        ) : (
                          <span className="bj-mono">Delivered</span>
                        )}
                      </td>
                      <td className="num r hide">
                        {filesLabel(files)} · {formatBytes(Number(p.totalBytes))}
                      </td>
                      <td className="r arr" aria-hidden="true">
                        →
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
