"use client";

import { useMemo, useState } from "react";
import { ProjectCard } from "@/components/ProjectCard";

export type ProjectListItem = {
  id: string;
  title: string;
  deliveredAt: string | null;
  expiresAt: string | null;
  photoCount: number;
  videoCount: number;
  coverAssetId: string | null;
  newCount: number;
  /** Decimal string — sizeBytes is a BigInt server-side. */
  totalBytes: string;
};

type Sort = "newest" | "az";

/**
 * §2: search and sort over the client's deliveries.
 *
 * Filtering is on project titles only, and deliberately client-side — the whole list
 * is already in the payload, so a round trip would be slower and offer nothing. The
 * handoff notes searching asset names later needs /api/search, which does not exist;
 * the placeholder says "Search projects" rather than promising files it cannot find.
 */
export function ProjectListClient({ projects }: { projects: ProjectListItem[] }) {
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

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
          className="flex-1 min-w-[200px] bg-bg border border-line2 text-text text-[13px] px-3 py-2.5 outline-none focus:border-accent"
        />
        <div className="flex border border-line2">
          {(
            [
              ["newest", "Newest"],
              ["az", "A–Z"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSort(id)}
              className={`cursor-pointer text-[11px] uppercase font-semibold px-3.5 py-2.5 ${
                sort === id ? "bg-accent text-bg" : "text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="border border-line2 px-5 py-10 text-center text-sm text-muted">
          No projects match “{query.trim()}”.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
          {shown.map((p) => (
            <ProjectCard
              key={p.id}
              id={p.id}
              title={p.title}
              deliveredAt={p.deliveredAt ? new Date(p.deliveredAt) : null}
              expiresAt={p.expiresAt ? new Date(p.expiresAt) : null}
              photoCount={p.photoCount}
              videoCount={p.videoCount}
              coverAssetId={p.coverAssetId}
              newCount={p.newCount}
              totalBytes={Number(p.totalBytes)}
            />
          ))}
        </div>
      )}
    </>
  );
}
