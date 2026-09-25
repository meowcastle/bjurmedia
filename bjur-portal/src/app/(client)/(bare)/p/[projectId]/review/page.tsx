import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
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
      <div className="fixed inset-0 bg-black text-white grid place-items-center px-6">
        <div className="max-w-sm text-center">
          <div className="bj-serif text-[26px]">{data.projectTitle}</div>
          <div className="text-[11px] font-mono uppercase tracking-[.1em] text-white/45 mt-2">
            {data.clientName}
          </div>
          <p className="text-[13px] leading-relaxed text-white/60 mt-5">
            No cut yet. When Bjur puts one up you&apos;ll get an email, and it will play here
            with room to leave notes.
          </p>
        </div>
      </div>
    );
  }

  return <ReviewScreenClient mode="client" backHref="/" {...data} />;
}
