import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadStudioReviewScreen } from "@/lib/reviewScreenData";
import { StudioReviewClient } from "@/components/StudioReviewClient";

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
      <div className="fixed inset-0 bg-black text-white grid place-items-center px-6">
        <div className="max-w-sm text-center">
          <div className="bj-serif text-[26px]">{data.projectTitle}</div>
          <div className="text-[11px] font-mono uppercase tracking-[.1em] text-white/45 mt-2">
            {data.clientName}
          </div>
          <p className="text-[13px] leading-relaxed text-white/60 mt-5">
            No cuts yet. The first export you drop in the inbox becomes cut 1.
          </p>
          <a href={`/admin/projects/${id}`} className="inline-block mt-5 text-[12px] underline text-white/60 hover:text-white">
            ← Back to the project
          </a>
        </div>
      </div>
    );
  }

  return <StudioReviewClient mode="studio" {...data} />;
}
