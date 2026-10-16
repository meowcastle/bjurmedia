"use client";

import { haptic } from "@/lib/haptics";
import { FadeImg } from "@/components/ui/FadeImg";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/Toast";
import { AdminFilmBlock, type CutRow, type ReviewerRow } from "@/components/AdminFilmBlock";
import { AdminProxyViewer, type ProxyViewerAsset } from "@/components/AdminProxyViewer";

type FileRow = ProxyViewerAsset & {
  thumbReady: boolean;
  markStatus: "NONE" | "PENDING" | "GENERATING" | "READY" | "FAILED";
};


type ProjectRow = {
  id: string;
  title: string;
  type: "DELIVERY" | "CALENDAR" | "FILM";
  paymentHold: boolean;
  deliveredAt: string | null;
  expiresAt: string | null;
  inboxPath: string;
  slug: string;
  fileCount: number;
  isEmpty: boolean;
  hasSlackChannel: boolean;
};


function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

const Kicker = ({ children }: { children: React.ReactNode }) => (
  <span className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-1.5">{children}</span>
);

/**
 * The admin's view of one project.
 *
 * Replaced the Edit dialog on the client page. A dialog made every field feel like a
 * setting you were about to change; most of the time you are here to read what this
 * project is and see whether the footage arrived. So the facts are on the page and the
 * two editable dates edit in place — blur or Enter saves, Escape puts it back.
 *
 * What the project *is* — its type, and whether it runs a review loop — is not here at
 * all, because it cannot be changed. It is stated once, next to the title, with the
 * reason.
 */
export function AdminProjectDetailClient({
  film,
  project,
  client,
  assets,
}: {
  /** Null on anything that is not a Film project. */
  film: { cuts: CutRow[]; reviewers: ReviewerRow[] } | null;
  project: ProjectRow;
  client: { id: string; name: string };
  assets: FileRow[];
}) {
  const router = useRouter();

  // Refresh while anything is mid-encode, and only then.
  //
  // The percentage is written by the worker every few seconds, but the page is a server
  // component — without this it shows whatever was true when you opened it, so a 20 GB
  // master sat at "Encoding 2%" for a quarter of an hour while the database said 15%. A
  // progress number that does not progress is worse than none: it is the exact shape of
  // "is this thing stuck?".
  //
  // Stops dead once everything is READY, so a settled page costs nothing.
  const anyEncoding = assets.some(
    (a) => a.proxyStatus === "PENDING" || a.proxyStatus === "GENERATING"
  );
  useEffect(() => {
    if (!anyEncoding) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [anyEncoding, router]);
  const [toast, setToast] = useState<string | null>(null);
  // Deliberately not held in state. useState(initialRequests) only reads its argument on
  // the first render, so after router.refresh() re-ran the server component the list
  // would still be the one this page loaded with — a request you just asked for would
  // never appear. The server is the source; refresh is what updates it.
  const [held, setHeld] = useState(project.paymentHold);
  const [busy, setBusy] = useState(false);

  /**
   * Escape reverts, and must not also save.
   *
   * setTitle() has not flushed by the time blur() fires synchronously underneath it, so
   * the blur handler would read the abandoned value out of a stale closure and commit
   * exactly the edit the user just cancelled. A ref is checked instead of state for the
   * same reason: it is readable immediately.
   */
  const revertingRef = useRef(false);

  const [title, setTitle] = useState(project.title);
  const [delivered, setDelivered] = useState(toDateInput(project.deliveredAt));
  const [expires, setExpires] = useState(toDateInput(project.expiresAt));

  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function patch(data: Record<string, unknown>, note: string) {
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setToast(body.error ?? "Could not save that.");
      return false;
    }
    setToast(note);
    router.refresh();
    return true;
  }

  async function togglePay() {
    setBusy(true);
    const next = !held;
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentHold: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setToast("Could not save that.");
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { released?: number };
    setHeld(next);
    setToast(
      next
        ? "Awaiting payment · downloads watermarked"
        : body.released
          ? `Paid · clean downloads · ${body.released} owner${body.released === 1 ? "" : "s"} emailed`
          : "Paid · clean downloads"
    );
    router.refresh();
  }

  async function deleteProject() {
    setBusy(true);
    const res = await fetch(`/api/admin/projects/${project.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setToast(body.error ?? "Could not delete that.");
      return;
    }
    router.push(`/admin/clients/${client.id}`);
  }

  const internalCount = assets.filter((a) => a.internal).length;
  const failed = assets.filter((a) => a.proxyStatus === "FAILED").length;
  const encoding = assets.filter(
    (a) => a.proxyStatus === "PENDING" || a.proxyStatus === "GENERATING"
  ).length;
  const markPending = assets.filter(
    (a) => !a.internal && a.markStatus !== "READY" && a.proxyStatus === "READY"
  ).length;


  return (
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[1100px] mx-auto bjfade">
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link
          href={`/admin/clients/${client.id}`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-text"
        >
          ← {client.name}
        </Link>
        {/* The way into Media now that it has no picker of its own. */}
        <Link
          href={`/admin/media?project=${project.id}`}
          data-testid="open-media"
          className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted hover:text-text border border-line2 hover:border-text px-3 py-1.5"
        >
          Media
        </Link>
      </div>

      <div className="border-b-2 border-line2 pb-6 mb-9">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (revertingRef.current) {
              revertingRef.current = false;
              return;
            }
            const next = title.trim();
            if (!next || next === project.title) {
              setTitle(project.title);
              return;
            }
            patch({ title: next }, "Title saved");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              revertingRef.current = true;
              setTitle(project.title);
              e.currentTarget.blur();
            }
          }}
          aria-label="Project title"
          data-testid="project-title"
          className="bj-serif text-[28px] sm:text-4xl font-normal bg-transparent w-full outline-none border-b border-transparent focus:border-line2 mb-3"
        />
        <div className="flex items-center gap-2.5 flex-wrap text-[10px] font-extrabold uppercase tracking-[.06em]">
          <span className="text-muted border border-line2 px-[7px] py-[3px]" data-testid="project-type">
            {project.type === "CALENDAR"
              ? "Social calendar"
              : project.type === "FILM"
                ? "Film"
                : "Delivery"}
          </span>

        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line2 border border-line2 mb-1">
        <div className="bg-s1 px-[18px] py-4">
          <Kicker>Delivered</Kicker>
          <input
            type="date"
            value={delivered}
            onChange={(e) => setDelivered(e.target.value)}
            onBlur={() => {
              if (revertingRef.current) {
                revertingRef.current = false;
                return;
              }
              if (delivered === toDateInput(project.deliveredAt)) return;
              patch({ deliveredAt: delivered || null }, "Delivered date saved");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                revertingRef.current = true;
                setDelivered(toDateInput(project.deliveredAt));
                e.currentTarget.blur();
              }
            }}
            aria-label="Delivered"
            data-testid="project-delivered"
            className="w-full bg-transparent text-[13px] font-mono outline-none"
          />
        </div>
        <div className="bg-s1 px-[18px] py-4">
          <Kicker>Expires</Kicker>
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            onBlur={() => {
              if (revertingRef.current) {
                revertingRef.current = false;
                return;
              }
              if (expires === toDateInput(project.expiresAt)) return;
              patch({ expiresAt: expires || null }, expires ? "Expiry saved" : "Expiry cleared");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                revertingRef.current = true;
                setExpires(toDateInput(project.expiresAt));
                e.currentTarget.blur();
              }
            }}
            aria-label="Expires"
            data-testid="project-expires"
            className="w-full bg-transparent text-[13px] font-mono outline-none"
            placeholder="Never"
          />
        </div>
        <div className="bg-s1 px-[18px] py-4">
          <Kicker>Files</Kicker>
          <span className="text-[13px]">{project.fileCount}</span>
        </div>
        <div className="bg-s1 px-[18px] py-4 min-w-0">
          <Kicker>Inbox</Kicker>
          <span className="text-[12px] text-body font-mono break-all">{project.inboxPath}</span>
        </div>
      </div>

      {project.type === "CALENDAR" && !project.hasSlackChannel && (
        <div className="shadow-1 text-[11px] text-accentb border border-line2 bg-s1 px-[18px] py-3 mb-1">
          No Slack channel for {client.name} yet.{" "}
          <Link href="/admin/integrations" className="text-text tracking-[.06em] font-semibold">
            Add one
          </Link>
        </div>
      )}

      {/* One switch. It was a status, a sentence restating the status and a button
          naming the opposite state. What a held download looks like is the client's
          concern; the admin needs only to say whether the invoice is open. */}
      <div className="shadow-1 flex items-center justify-between gap-4 border border-line2 bg-s1 px-[18px] py-4">
        <span className="text-[11px] tracking-[0.1em] uppercase text-dim">Awaiting payment</span>
        <button
          onClick={togglePay}
          disabled={busy}
          role="switch"
          aria-checked={held}
          aria-label="Awaiting payment"
          data-testid="payment-toggle"
          className="cursor-pointer text-[10.5px] font-semibold uppercase tracking-[.06em] border px-2.5 py-1.5 disabled:opacity-50"
          style={
            held
              ? { borderColor: "var(--accentb)", color: "var(--accentb)" }
              : { borderColor: "var(--line2)", color: "var(--muted)" }
          }
        >
          {held ? "On" : "Off"}
        </button>
      </div>

      {/* What is actually in the project, and what state it is in.
          The client's gallery shows finished work; this shows the pipeline — which files
          still have no proxy, which failed, and (on a held project) which have their
          watermarked copy yet. "Is anything weird" is the question this answers, and
          without it the only way to ask was the media table on another screen. */}
      {assets.length > 0 && (
        <div className="mt-10">
          <div className="text-[11px] tracking-[0.1em] uppercase text-dim pb-2.5 border-b border-line2 flex justify-between items-baseline">
            <span>
              Files <span className="text-dim2">· {assets.length}</span>
              {internalCount > 0 && (
                // The facts row above counts what the client can see. This counts what is
                // here. Saying so stops the two numbers reading as a contradiction.
                <span className="text-dim2 normal-case tracking-normal">
                  {" "}
                  ({internalCount} internal)
                </span>
              )}
            </span>
            <span className="text-dim2 normal-case tracking-normal text-[11px]" data-testid="proxy-progress">
              {[
                encoding > 0 ? `${encoding} processing` : null,
                failed > 0 ? `${failed} failed` : null,
                held && markPending > 0 ? `${markPending} awaiting watermark` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>

          <div
            className="grid gap-px bg-line2 border border-line2 border-t-0 mt-0"
            style={{ gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))" }}
          >
            {assets.map((a) => (
              // Every tile opens, whatever state it is in. Gating this on READY put the
              // one Retry button in the app — the viewer's — behind a click that was
              // disabled for exactly the assets needing it, so a failed encode was a dead
              // end you could only leave by editing the database. The viewer already
              // renders the failed and still-encoding states; it just never got reached.
              <button
                key={a.id}
                onClick={() => setOpenFileId(a.id)}
                data-testid={`file-${a.id}`}
                className="bg-s1 text-left cursor-pointer hover:bg-s2"
              >
                <span className="block relative aspect-video bg-s0 overflow-hidden">
                  {a.thumbReady ? (
                    <FadeImg
                      src={`/api/assets/${a.id}/thumb`}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-[10px] tracking-[.1em] uppercase text-dim2">
                      {a.proxyStatus === "FAILED" ? "No preview" : "Encoding…"}
                    </span>
                  )}
                  {a.internal && (
                    <span className="absolute top-2 left-2 text-[9px] font-bold tracking-wide text-dim2 border border-line2 bg-bg/80 px-1.5 py-0.5">
                      INTERNAL
                    </span>
                  )}
                  {held && a.markStatus === "READY" && !a.internal && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold tracking-wide text-muted border border-line2 bg-bg/80 px-1.5 py-0.5">
                      MARKED
                    </span>
                  )}
                </span>
                <span className="block px-3 pt-2.5 pb-3">
                  <span className="block text-[12px] truncate">{a.name}</span>
                  <span className="block text-[10.5px] text-dim mt-1">
                    {a.proxyStatus === "READY"
                      ? [a.dims, a.proxyRes, a.size].filter(Boolean).join(" · ")
                      : a.proxyStatus === "FAILED"
                        ? "Proxy failed"
                        : a.proxyStatus === "GENERATING"
                          ? a.proxyProgress !== null
                            ? `Encoding ${a.proxyProgress}%`
                            : "Encoding now"
                          : "Waiting to encode"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {film && (
        <AdminFilmBlock
          projectId={project.id}
          cuts={film.cuts}
          reviewers={film.reviewers}
          hiddenCount={internalCount}
        />
      )}

      <div className="mt-12 pt-5 border-t border-line">
        {project.isEmpty ? (
          confirmingDelete ? (
            <span className="flex items-center gap-3">
              <span className="text-[11px] text-muted">Delete {project.title}?</span>
              <button
                onClick={() => {
                  haptic(20);
                  void deleteProject();
                }}
                disabled={busy}
                data-testid="confirm-delete-project"
                className="cursor-pointer text-[11px] font-semibold text-accentb hover:text-text border border-accentb px-2.5 py-1.5 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              data-testid="delete-project"
              className="cursor-pointer text-[11px] font-semibold text-muted hover:text-accentb disabled:opacity-50"
            >
              Delete this project
            </button>
          )
        ) : (
          // Only delivered work stands in the way now. Footage used to as well, which is
          // how a review project became undeletable because somebody else's rushes had
          // been filed under it.
          <span className="text-[11px] text-dim2">
            Holds {project.fileCount} file{project.fileCount === 1 ? "" : "s"} · empty it to
            delete.
          </span>
        )}
      </div>

      {openFileId && (
        <AdminProxyViewer
          assets={assets}
          activeId={openFileId}
          onNavigate={setOpenFileId}
          onClose={() => setOpenFileId(null)}
          onRegenerate={async (a) => {
            await fetch(`/api/admin/assets/${a.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ retry: true }),
            });
            setToast(`Re-encoding ${a.name}`);
            router.refresh();
          }}
          onDelete={async (a) => {
            // Move the viewer off the row before the refresh drops it: leaving activeId
            // pointing at a deleted asset renders the viewer with nothing in it.
            const i = assets.findIndex((x) => x.id === a.id);
            setOpenFileId(assets[i + 1]?.id ?? assets[i - 1]?.id ?? null);
            const res = await fetch(`/api/admin/assets/${a.id}`, { method: "DELETE" });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              setToast(body.error ?? "Could not delete that.");
              setOpenFileId(a.id);
              return;
            }
            setToast(`Deleted ${a.name}`);
            router.refresh();
          }}
          onToggleInternal={async (a) => {
            await fetch(`/api/admin/assets/${a.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ internal: !a.internal }),
            });
            setToast(a.internal ? `${a.name} shown to client` : `${a.name} hidden from client`);
            router.refresh();
          }}
        />
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
