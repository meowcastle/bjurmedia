import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadReviewScreen } from "@/lib/reviewScreenData";
import Link from "next/link";
import { ReviewScreenClient } from "@/components/ReviewScreenClient";
import { ReviewShell } from "@/components/ReviewScreen";

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

  if (session.clientId !== project.clientId) notFound();

  const reviewer = await db.reviewer.findFirst({
    where: { projectId, userId: session.id, revokedAt: null },
  });
  // A seat on the client who was never added as a reviewer, or was revoked. Not a 403:
  // they simply have no business on this screen, and 404 says less about who else does.
  //
  // This row is the whole credential, and deliberately not getProjectAccess(). That gate
  // reads any ProjectMember row as "this login sees only the projects it is listed on",
  // which is right for browsing deliveries and wrong here: a reviewer restricted to one
  // delivery was mailed a link to a cut and then 404'd on it, because being added to the
  // review cycle grants no ProjectMember row. Two credentials for one screen, and the
  // one the studio actually manages was not the one being checked.
  if (!reviewer) notFound();

  const data = await loadReviewScreen(projectId, reviewer.id);
  if (!data) notFound();

  if (data.empty) {
    return (
      <ReviewShell mode="client" clientName={data.clientName} brandHref="/" viewerName={session.name}>
        <section className="bj-rv-solo">
          <Link href="/" className="bj-mono" data-testid="review-back">
            ← All projects
          </Link>
          <h1 className="bj-mid">{data.projectTitle}</h1>
          <p className="bj-lead">
            No cut yet. When we put one up you&apos;ll get an email, and it will play here
            with room to leave notes.
          </p>
        </section>
      </ReviewShell>
    );
  }

  return <ReviewScreenClient mode="client" backHref="/" {...data} />;
}
