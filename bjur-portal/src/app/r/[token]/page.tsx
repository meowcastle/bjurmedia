import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadReviewScreen } from "@/lib/reviewScreenData";
import { GuestReviewEntry } from "@/components/GuestReviewEntry";

/**
 * A guest reviewing by link. No session, no account, no way to download anything.
 *
 * 404 rather than 403 for a revoked or unknown token: a link that says "you used to have
 * access to something" tells whoever holds it more than it should. It simply stops
 * existing.
 */
export default async function GuestReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const reviewer = await db.reviewer.findUnique({ where: { token } });
  if (!reviewer || reviewer.revokedAt || reviewer.kind !== "GUEST") notFound();

  // Opening the link is the only signal the studio gets that a guest has watched, so it
  // is recorded here rather than on first note — most reviewers never leave one.
  await db.reviewer
    .update({ where: { id: reviewer.id }, data: { lastOpenedAt: new Date() } })
    .catch(() => {});

  const data = await loadReviewScreen(reviewer.projectId, reviewer.id);
  if (!data) notFound();

  return (
    <GuestReviewEntry
      token={token}
      needsName={!reviewer.name.trim()}
      reviewerId={reviewer.id}
      data={data}
    />
  );
}
