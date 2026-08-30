import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectAccess } from "@/lib/projectAccess";
import { SubmissionUploadClient } from "@/components/SubmissionUploadClient";

// Deliberately not gated on project.status === "LIVE" (unlike the deliverables page):
// a client may need to send raw source material before the studio has delivered
// anything back, i.e. before the project has ever gone LIVE. It's reachable only via
// a direct link (DRAFT projects don't show up in the client's project list) — the
// admin shares it when kicking off a new job.
export default async function ProjectUploadPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await getSessionUser();
  if (!session?.clientId) redirect("/login");

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const access = await getProjectAccess(session, project);
  if (!access.allowed) notFound();

  const expired = project.expiresAt != null && project.expiresAt < new Date();

  return (
    <SubmissionUploadClient
      project={{ id: project.id, title: project.title }}
      expired={expired}
    />
  );
}
