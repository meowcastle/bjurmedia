import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectCard } from "@/components/ProjectCard";

export default async function ProjectListPage() {
  const session = await getSessionUser();
  if (!session?.clientId) redirect("/login");

  const projects = await db.project.findMany({
    where: { clientId: session.clientId, status: "LIVE" },
    orderBy: { deliveredAt: "desc" },
    include: {
      assets: {
        where: { internal: false },
        select: { kind: true },
      },
    },
  });

  const covers = await db.asset.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      internal: false,
      thumbRelPath: { not: null },
    },
    orderBy: { createdAt: "desc" },
    distinct: ["projectId"],
    select: { id: true, projectId: true },
  });
  const coverByProject = new Map(covers.map((c) => [c.projectId, c.id]));

  return (
    <div className="px-10 py-12 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-9">
        <div>
          <div className="text-[11px] tracking-[0.24em] uppercase text-accent font-bold mb-3">
            Your Deliveries
          </div>
          <h1 className="text-[44px] tracking-[-0.025em] font-black">Projects</h1>
        </div>
        <div className="text-[13px] text-muted">
          {projects.length} active project{projects.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))" }}>
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            id={p.id}
            title={p.title}
            deliveredAt={p.deliveredAt}
            expiresAt={p.expiresAt}
            photoCount={p.assets.filter((a) => a.kind === "PHOTO").length}
            videoCount={p.assets.filter((a) => a.kind === "VIDEO").length}
            coverAssetId={coverByProject.get(p.id) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
