import Link from "next/link";
import { AddGuestReviewer, CopyGuestLink } from "@/components/AddGuestReviewer";

/**
 * Cuts and reviewers, on a Film project's admin page.
 *
 * Two columns rather than one list because they answer different questions: the cuts say
 * where the work has got to, the reviewers say who is holding it up. On a delivery neither
 * exists, which is why this is its own component rather than a branch inside the page.
 */
export type CutRow = {
  id: string;
  version: number;
  sentAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  noteCount: number;
  unanswered: number;
  authors: string[];
};

export type ReviewerRow = {
  id: string;
  name: string;
  email: string;
  kind: "SEAT" | "GUEST";
  role: string | null;
  /** Sent notes on the latest cut, and whether they have opened it at all. */
  sentOnLatest: number;
  draftingOnLatest: boolean;
  lastOpenedAt: string | null;
  revoked: boolean;
  /** Guests only: their personal review link. */
  link: string | null;
};

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export function AdminFilmBlock({
  projectId,
  cuts,
  reviewers,
  hiddenCount,
}: {
  projectId: string;
  cuts: CutRow[];
  reviewers: ReviewerRow[];
  /** Files in the project that are internal, so they never became cuts. */
  hiddenCount: number;
}) {
  const active = reviewers.filter((r) => !r.revoked);

  return (
    <section className="bj-sx" data-testid="film-block">
      <span className="bj-mono bj-lab">
        Cuts<b>{cuts.length}</b>
      </span>
    <div className="grid md:grid-cols-2 gap-10 min-w-0">
      {/* Cuts */}
      <div className="min-w-0" data-testid="film-cuts">
        <div className="flex justify-between items-baseline pb-2.5 border-b border-line">
          <span className="bj-mono ink">
            Cuts · {cuts.length}
          </span>
          {cuts.length > 0 && (
            <Link
              href={`/admin/projects/${projectId}/review`}
              className="bj-link"
              data-testid="open-review"
            >
              Open review →
            </Link>
          )}
        </div>

        {cuts.length === 0 ? (
          // "No cuts yet" on a project that visibly holds a file reads as broken. An
          // internal asset is skipped on purpose — masters and working files are not
          // things anyone is asked to sign off on — but that rule is invisible from here,
          // so say it rather than let the page imply the project is empty.
          hiddenCount > 0 ? (
            <p className="text-[14px] text-muted leading-relaxed mt-3" data-testid="hidden-not-cut">
              No cuts yet. {hiddenCount} file{hiddenCount === 1 ? " is" : "s are"} hidden from
              the client, and hidden files never become cuts — show{" "}
              {hiddenCount === 1 ? "it" : "one"} in Files above to make it cut 1.
            </p>
          ) : (
            <p className="text-[14px] text-muted leading-relaxed mt-3">
              No cuts yet. The first export you drop in the inbox becomes cut 1, and every
              reviewer is emailed to watch it.
            </p>
          )
        ) : (
          <div className="divide-y divide-line">
            {[...cuts].reverse().map((c, i) => {
              const latest = i === 0;
              return (
                <div key={c.id} className="py-3 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold">Cut {c.version}</div>
                    <div className="bj-mono mt-1 truncate">
                      {c.noteCount > 0
                        ? `${c.noteCount} note${c.noteCount === 1 ? "" : "s"}${
                            c.authors.length ? ` from ${c.authors.join(", ")}` : ""
                          }`
                        : when(c.sentAt) || "Not sent yet"}
                    </div>
                  </div>
                  <span className="bj-mono whitespace-nowrap">
                    {c.approvedAt ? (
                      <span style={{ color: "var(--success)" }}>Approved</span>
                    ) : !c.sentAt ? (
                      <span className="text-dim2">Not sent</span>
                    ) : latest ? (
                      <span style={{ color: "var(--accentb)" }}>
                        {c.unanswered > 0 ? `${c.unanswered} in · reviewing` : "Reviewing"}
                      </span>
                    ) : (
                      <span className="text-dim2">Answered in cut {c.version + 1}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reviewers */}
      <div className="min-w-0">
        <div className="flex justify-between items-baseline pb-2.5 border-b border-line">
          <span className="bj-mono ink">
            Reviewers · {active.length}
          </span>
        </div>

        <div className="divide-y divide-line">
          {active.map((r) => (
            <div key={r.id} className="py-3 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[15px] truncate">{r.name || r.email}</div>
                <div className="text-[12px] text-muted truncate flex items-baseline gap-2">
                  <span className="truncate">
                    {r.kind === "SEAT" ? "Login" : "Guest link"}
                    {r.role ? ` · ${r.role}` : ""}
                  </span>
                  {r.link && <CopyGuestLink link={r.link} />}
                </div>
              </div>
              <span className="bj-mono whitespace-nowrap">
                {r.sentOnLatest > 0 ? (
                  <span style={{ color: "var(--success)" }}>
                    Sent {r.sentOnLatest} note{r.sentOnLatest === 1 ? "" : "s"}
                  </span>
                ) : r.draftingOnLatest ? (
                  // A count, never the words: a draft belongs to its author until sent.
                  <span className="text-muted">Watched · drafting</span>
                ) : r.lastOpenedAt ? (
                  <span className="text-dim2">Opened {when(r.lastOpenedAt)}</span>
                ) : (
                  <span className="text-dim2">Not opened yet</span>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-line">
          <AddGuestReviewer projectId={projectId} />
        </div>

        <p className="text-[13px] text-muted leading-relaxed mt-3">
          Client logins review automatically. Guests get a link and give their name once; no
          login, no downloads.
        </p>
      </div>
    </div>
    </section>
  );
}
