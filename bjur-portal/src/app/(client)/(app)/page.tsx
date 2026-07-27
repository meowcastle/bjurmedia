import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectCard } from "@/components/ProjectCard";
import { WeeklyDigest } from "@/components/WeeklyDigest";
import { mondayOfWeek } from "@/lib/weeks";

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

  // "This week" digest: assets whose admin-set delivery week (weekOf) falls in
  // the current calendar week. Computed fresh on every load straight off that
  // column — no scheduler or DB write needed, the calendar week boundary does
  // that job for free.
  const weekStart = mondayOfWeek(new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weeklyAssets = await db.asset.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      internal: false,
      weekOf: { gte: weekStart, lt: weekEnd },
    },
    select: { projectId: true, format: true },
  });

  const totalsByFormat: Record<string, number> = {};
  const perProjectTotals = new Map<string, Record<string, number>>();
  for (const a of weeklyAssets) {
    totalsByFormat[a.format] = (totalsByFormat[a.format] ?? 0) + 1;
    const projectTotals = perProjectTotals.get(a.projectId) ?? {};
    projectTotals[a.format] = (projectTotals[a.format] ?? 0) + 1;
    perProjectTotals.set(a.projectId, projectTotals);
  }
  const digestProjects = projects
    .filter((p) => perProjectTotals.has(p.id))
    .map((p) => ({ id: p.id, title: p.title, totalsByFormat: perProjectTotals.get(p.id)! }));

  return (
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-9">
        <div>
          <div className="text-[11px] tracking-[0.24em] uppercase text-accent font-bold mb-3">
            Your Deliveries
          </div>
          <h1 className="text-[32px] sm:text-[44px] tracking-[-0.025em] font-black">Projects</h1>
        </div>
        <div className="text-[13px] text-muted">
          {projects.length} active project{projects.length !== 1 ? "s" : ""}
        </div>
      </div>

      <WeeklyDigest totalsByFormat={totalsByFormat} projects={digestProjects} />

      <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
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
            hasNewThisWeek={perProjectTotals.has(p.id)}
          />
        ))}
      </div>
    </div>
  );
}
