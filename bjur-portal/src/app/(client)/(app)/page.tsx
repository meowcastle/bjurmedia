import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectListClient } from "@/components/ProjectListClient";
import { LatestProject, type LatestProjectData } from "@/components/LatestProject";
import { mondayOfWeek } from "@/lib/weeks";
import { getAccessibleProjectIds } from "@/lib/projectAccess";

/** "1080×1920" → "1080 × 1920", as the board sets it. */
function spacedDims(dims: string) {
  return dims.replace(/\s*[×x]\s*/, " × ");
}

/** "3 videos and 1 still." Said from the counts, never about the work itself. */
function contentsLine(videos: number, stills: number) {
  const parts: string[] = [];
  if (videos) parts.push(`${videos} video${videos === 1 ? "" : "s"}`);
  if (stills) parts.push(`${stills} still${stills === 1 ? "" : "s"}`);
  return parts.length ? `${parts.join(" and ")}.` : "No files yet.";
}

export default async function ProjectListPage() {
  const session = await getSessionUser();
  if (!session?.clientId) redirect("/login");

  const accessibleIds = await getAccessibleProjectIds(session);

  const [projects, client] = await Promise.all([
    db.project.findMany({
      where: {
        clientId: session.clientId,
        status: "LIVE",
        ...(accessibleIds ? { id: { in: accessibleIds } } : {}),
      },
      orderBy: { deliveredAt: "desc" },
      include: {
        assets: {
          where: { internal: false },
          orderBy: { createdAt: "asc" },
          select: { kind: true, sizeBytes: true, dims: true, masterCodec: true },
        },
      },
    }),
    db.client.findUnique({
      where: { id: session.clientId },
      select: { footageUploads: true },
    }),
  ]);

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

  // Assets whose admin-set delivery week (weekOf) falls in the current calendar week.
  // Computed fresh on every load straight off that column: no scheduler or DB write
  // needed, the calendar week boundary does that job for free.
  const weekStart = mondayOfWeek(new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weeklyAssets = await db.asset.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      internal: false,
      weekOf: { gte: weekStart, lt: weekEnd },
    },
    select: { projectId: true },
  });
  const newByProject = new Map<string, number>();
  for (const a of weeklyAssets) newByProject.set(a.projectId, (newByProject.get(a.projectId) ?? 0) + 1);

  // Released cuts still waiting on someone. Sent and PENDING is the whole condition: an
  // unsent cut is not the client's business yet, and an approved one is not waiting on
  // anybody. Newest first, so the bar names the one that arrived last.
  const pendingCuts = await db.review.findMany({
    where: {
      state: "PENDING",
      sentAt: { not: null },
      asset: { projectId: { in: projects.map((p) => p.id) } },
    },
    orderBy: { sentAt: "desc" },
    select: { version: true, asset: { select: { projectId: true } } },
  });
  const pendingCutProjects = new Set(pendingCuts.map((r) => r.asset.projectId));

  const items = projects.map((p) => ({
    id: p.id,
    title: p.title,
    deliveredAt: p.deliveredAt?.toISOString() ?? null,
    expiresAt: p.expiresAt?.toISOString() ?? null,
    photoCount: p.assets.filter((a) => a.kind === "PHOTO").length,
    videoCount: p.assets.filter((a) => a.kind === "VIDEO").length,
    coverAssetId: coverByProject.get(p.id) ?? null,
    newCount: newByProject.get(p.id) ?? 0,
    // BigInt cannot cross the RSC boundary; summed here and serialised.
    totalBytes: String(p.assets.reduce((n, a) => n + Number(a.sizeBytes), 0)),
    isFilm: p.type === "FILM",
    reviewPending: pendingCutProjects.has(p.id),
  }));

  // Latest: the most recently delivered project. Undelivered ones sort last above, so
  // the first with a date is the one, and the first of all only when none has a date.
  const latestRaw = projects.find((p) => p.deliveredAt) ?? projects[0];
  let latest: LatestProjectData | null = null;
  if (latestRaw) {
    const item = items.find((i) => i.id === latestRaw.id)!;
    const video = latestRaw.assets.find((a) => a.kind === "VIDEO" && a.dims);
    const still = latestRaw.assets.find((a) => a.kind === "PHOTO" && a.dims);
    let format: { value: string; label: string };
    if (video?.dims) {
      format = {
        value: spacedDims(video.dims),
        label: video.masterCodec?.split(" · ")[0]?.trim() || "Video",
      };
    } else if (still?.dims) {
      format = { value: spacedDims(still.dims), label: "Still" };
    } else if (item.videoCount) {
      format = { value: String(item.videoCount), label: item.videoCount === 1 ? "video" : "videos" };
    } else {
      format = { value: String(item.photoCount), label: item.photoCount === 1 ? "still" : "stills" };
    }
    latest = {
      ...item,
      fileCount: latestRaw.assets.length,
      line: contentsLine(item.videoCount, item.photoCount),
      format,
    };
  }

  const firstName = session.name?.trim().split(/\s+/)[0] ?? "";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
  const waiting = pendingCuts[0];
  const waitingProject = waiting ? projects.find((p) => p.id === waiting.asset.projectId) : null;

  return (
    <div className="bj-cpage">
      <section className="bj-hello">
        <div>
          <span className="bj-mono">
            {today} · {projects.length} project{projects.length === 1 ? "" : "s"}
          </span>
          <h1 className="bj-big">
            {firstName ? (
              <>
                Your projects,{" "}
                <br />
                {firstName}.
              </>
            ) : (
              "Your projects."
            )}
          </h1>
        </div>
        {client?.footageUploads && (
          <Link href="/send" className="bj-ghost" data-testid="home-send">
            ↑ Send us footage
          </Link>
        )}
      </section>

      {waiting && waitingProject && (
        <div className="bj-wait" data-testid="cut-waiting">
          <span className="n">{pendingCuts.length}</span>
          <div>
            <b>
              {pendingCuts.length === 1
                ? "A cut is waiting for your notes."
                : `${pendingCuts.length} cuts are waiting for your notes.`}
            </b>
            <p>
              {waitingProject.title}, cut {waiting.version}. Leave notes on the frame, or approve it as is.
            </p>
          </div>
          <Link className="bj-cta" href={`/p/${waitingProject.id}/review`}>
            Review <i>→</i>
          </Link>
        </div>
      )}

      {latest && <LatestProject p={latest} />}

      <ProjectListClient projects={items} />
    </div>
  );
}
