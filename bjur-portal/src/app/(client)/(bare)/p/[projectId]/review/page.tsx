import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectAccess } from "@/lib/projectAccess";
import { loadReviewScreen } from "@/lib/reviewScreenData";
import { ReviewScreenClient } from "@/components/ReviewScreenClient";

/**
 * A seat reviewing a Film project.
 *
 * Guests reach the same screen through /r/[token] with no session at all; the difference
 * is only how the viewer is identified, which is why both pages end in the same loader.
 */
export default async function ClientReviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await getSessionUser();
  if (!session?.clientId) redirect("/login");

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project || project.type !== "FILM") notFound();

  const access = await getProjectAccess(session, project);
  if (!access.allowed) notFound();

  const reviewer = await db.reviewer.findFirst({
    where: { projectId, userId: session.id, revokedAt: null },
  });
  // A seat on the client who was never added as a reviewer, or was revoked. Not a 403:
  // they simply have no business on this screen, and 404 says less about who else does.
  if (!reviewer) notFound();

  const data = await loadReviewScreen(projectId, reviewer.id);
  if (!data) notFound();

  return <ReviewScreenClient mode="client" {...data} />;
}
