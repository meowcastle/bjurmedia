import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadStudioReviewScreen } from "@/lib/reviewScreenData";
import Link from "next/link";
import { StudioReviewClient } from "@/components/StudioReviewClient";
import { ReviewShell } from "@/components/ReviewScreen";
import { themeScript } from "@/lib/theme";

/**
 * Studio mode. Outside the admin (app) group on purpose: the review screen takes the whole
 * window and brings its own header, and the admin nav on top of it covers the cut tabs.
 */
export default async function StudioReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session?.isAdmin) redirect("/admin/login");

  const data = await loadStudioReviewScreen(id);
  if (!data) notFound();

  if (data.empty) {
    return (
      <>
        <script dangerouslySetInnerHTML={{ __html: themeScript("admin") }} />
        <ReviewShell mode="studio" clientName={data.clientName} brandHref="/admin">
          <section className="bj-rv-solo">
            <Link href={`/admin/projects/${id}`} className="bj-mono" data-testid="review-back">
              ← Back to the project
            </Link>
            <h1 className="bj-mid">
              {data.clientName} · {data.projectTitle}
            </h1>
            <p className="bj-lead">No cuts yet. The first export you drop in the inbox becomes cut 1.</p>
          </section>
        </ReviewShell>
      </>
    );
  }

  return (
    <>
      {/* Outside the admin (app) layout, so the theme is stamped here. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("admin") }} />
      <StudioReviewClient mode="studio" backHref={`/admin/projects/${id}`} {...data} />
    </>
  );
}
