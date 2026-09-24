"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AddSeatDialog } from "@/components/AddSeatDialog";
import { ResetSeatPasswordDialog } from "@/components/ResetSeatPasswordDialog";
import { SeatAccessDialog } from "@/components/SeatAccessDialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { UploadDialog } from "@/components/UploadDialog";
import { lighten } from "@/lib/color";
import { initials } from "@/lib/initials";
import { Toast } from "@/components/ui/Toast";

type ProjectAccessGrant = { projectId: string; role: string };
type Seat = {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
  projectAccess: ProjectAccessGrant[];
};
type ProjectRow = {
  id: string;
  title: string;
  status: string;
  deliveredAt: string | null;
  expiresAt: string | null;
  type: "DELIVERY" | "CALENDAR" | "FILM";
  paymentHold: boolean;
  openRequests: number;
  assetCount: number;
  submissionCount: number;
  inboxPath: string;
};
type ClientInfo = {
  id: string;
  name: string;
  username: string;
  status: "ACTIVE" | "DISABLED";
  accentColor: string | null;
  hasSlackChannel: boolean;
  slackChannel: string | null;
  accountCount: number;
  autoCaption: boolean;
  logoUrl: string | null;
};

type TopPost = {
  id: string;
  title: string;
  platform: "IG" | "YT";
  handle: string;
  postedAt: string;
  views: number;
  permalink: string | null;
};

const DEFAULT_ACCENT = "#ec3013";

const ROLE_COLOR: Record<string, string> = {
  OWNER: "#2ec36b",
  DOWNLOADER: "var(--accentb)",
  VIEWER: "var(--muted)",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function AdminClientDetailClient({
  client,
  topPosts,
  postsSyncedAt,
  seats,
  projects,
}: {
  client: ClientInfo;
  topPosts: TopPost[];
  postsSyncedAt: string | null;
  seats: Seat[];
  projects: ProjectRow[];
}) {
  const router = useRouter();
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);
  const [resetDialogFor, setResetDialogFor] = useState<Seat | null>(null);
  const [accessDialogFor, setAccessDialogFor] = useState<Seat | null>(null);
  // Owned by the page: a save closes the dialog, so a toast inside it would unmount
  // with the action it is reporting.
  const [toast, setToast] = useState<string | null>(null);
  const [confirmingRemoveSeat, setConfirmingRemoveSeat] = useState<
    string | null
  >(null);
  const [removingSeat, setRemovingSeat] = useState<string | null>(null);
  const [seatError, setSeatError] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [uploadingTo, setUploadingTo] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);

  const [accentColor, setAccentColor] = useState(
    client.accentColor ?? DEFAULT_ACCENT,
  );
  const [savingAccent, setSavingAccent] = useState(false);
  const [logoUrl, setLogoUrl] = useState(client.logoUrl);
  const [logoDraft, setLogoDraft] = useState(client.logoUrl ?? "");
  const [savingLogo, setSavingLogo] = useState(false);

  async function removeSeat(seat: Seat) {
    setRemovingSeat(seat.id);
    setSeatError("");
    const res = await fetch(
      `/api/admin/clients/${client.id}/users/${seat.id}`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    setRemovingSeat(null);
    if (!res.ok) {
      setSeatError(data.error ?? "Failed to remove seat.");
      return;
    }
    setConfirmingRemoveSeat(null);
    router.refresh();
  }

  const active = client.status === "ACTIVE";

  async function toggleStatus() {
    setBusy(true);
    await fetch(`/api/admin/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: active ? "DISABLED" : "ACTIVE" }),
    });
    setBusy(false);
    router.refresh();
  }

  async function saveAccentColor(value: string | null) {
    setSavingAccent(true);
    setAccentColor(value ?? DEFAULT_ACCENT);
    await fetch(`/api/admin/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accentColor: value }),
    });
    setSavingAccent(false);
    router.refresh();
  }

  async function saveLogoUrl(value: string) {
    const trimmed = value.trim();
    setSavingLogo(true);
    await fetch(`/api/admin/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: trimmed || null }),
    });
    setLogoUrl(trimmed || null);
    setSavingLogo(false);
  }

  const integrationParts = [
    client.slackChannel ? `Slack ${client.slackChannel}` : null,
    client.accountCount > 0
      ? `${client.accountCount} account${client.accountCount === 1 ? "" : "s"}`
      : null,
    client.autoCaption ? "AI captions" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[1400px] mx-auto bjfade">
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-text mb-6"
      >
        ← All clients
      </Link>

      <div className="flex items-end justify-between gap-6 flex-wrap border-b-2 border-line2 pb-6 mb-9">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 flex-none grid place-items-center overflow-hidden bg-s3"
            style={
              !logoUrl
                ? {
                    background: `linear-gradient(135deg, ${accentColor}, ${lighten(accentColor, 0.6)})`,
                  }
                : undefined
            }
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary external brand logo, not a static asset Next can optimize
              <img
                src={logoUrl}
                alt=""
                className="w-full h-full object-contain bg-bg"
              />
            ) : (
              <span className="text-lg font-black text-bg">
                {initials(client.name)}
              </span>
            )}
          </div>
          <div>
            <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
              @{client.username}
            </div>
            <h1 className="bj-serif text-4xl font-normal mb-3">
              {client.name}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-wide uppercase text-muted border border-line2 px-2 py-1">
              </span>
              <span
                className={`text-[11px] font-bold tracking-wide uppercase ${active ? "text-success" : "text-dim"}`}
              >
                {active ? "Active" : "Disabled"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted">
              Logo URL
            </span>
            <input
              value={logoDraft}
              onChange={(e) => setLogoDraft(e.target.value)}
              onBlur={() =>
                logoDraft.trim() !== (logoUrl ?? "") && saveLogoUrl(logoDraft)
              }
              placeholder="https://…"
              disabled={savingLogo}
              className="w-44 bg-bg border border-line2 text-text text-[12px] font-mono px-2.5 py-2 outline-none focus:border-accent disabled:opacity-40"
            />
            {logoUrl && (
              <button
                onClick={() => {
                  setLogoDraft("");
                  saveLogoUrl("");
                }}
                disabled={savingLogo}
                className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text disabled:opacity-40"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted">
              Portal accent
            </span>
            <input
              type="color"
              value={accentColor}
              disabled={savingAccent}
              onChange={(e) => saveAccentColor(e.target.value)}
              className="w-7 h-7 cursor-pointer bg-transparent border border-line2 disabled:opacity-40"
              title="Set this client's portal accent color"
            />
            {client.accentColor && (
              <button
                onClick={() => saveAccentColor(null)}
                disabled={savingAccent}
                className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text disabled:opacity-40"
              >
                Reset
              </button>
            )}
          </div>
          <button
            onClick={toggleStatus}
            disabled={busy}
            className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-3.5 py-2 disabled:opacity-40"
          >
            {active ? "Disable client" : "Enable client"}
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between mb-4">
        <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-muted">
          Seats
        </h2>
        <button
          onClick={() => setSeatDialogOpen(true)}
          className="cursor-pointer text-xs font-semibold text-muted hover:text-text border border-dashed border-line2 hover:border-text px-3.5 py-2"
        >
          + Add user seat
        </button>
      </div>
      {seatError && (
        <div className="text-xs text-accentb font-semibold mb-3">
          {seatError}
        </div>
      )}
      <div className="border border-line mb-9">
        {seats.map((u) => (
          <div
            key={u.id}
            data-testid={`seat-row-${u.id}`}
            className="flex flex-col gap-2.5 px-4 py-4 border-b border-line last:border-b-0 md:grid md:gap-4 md:px-5 md:items-center"
            style={{ gridTemplateColumns: "2.1fr .9fr 1fr 3.5rem 21rem" }}
          >
            <div className="md:contents">
              <div className="min-w-0">
                <span className="text-[13px] font-semibold">{u.name}</span>
                <div
                  className="text-xs text-dim font-mono mt-0.5 truncate"
                  title={u.email}
                >
                  {u.email}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
              <span
                className="text-[11px] font-bold tracking-wide uppercase"
                style={{ color: ROLE_COLOR[u.role] }}
              >
                {u.role}
              </span>
              <span className="text-[11px] text-dim">
                {u.projectAccess.length === 0
                  ? "All projects"
                  : `${u.projectAccess.length} project${u.projectAccess.length !== 1 ? "s" : ""}`}
              </span>
              <span className="text-[11px] text-dim md:text-right">
                <span className="md:hidden text-dim">Last login · </span>
                {u.lastLoginAt
                  ? new Date(u.lastLoginAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </span>
            </div>
            {/* Fixed-width action cell: the confirm step swaps the buttons out, and a
                sized column keeps the rest of the row from shifting under the cursor. */}
            <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
              {confirmingRemoveSeat === u.id ? (
                <>
                  <span className="text-[11px] text-muted">Revoke access?</span>
                  <button
                    onClick={() => removeSeat(u)}
                    disabled={removingSeat === u.id}
                    className="cursor-pointer text-[11px] font-semibold text-accentb hover:text-text border border-accentb px-2.5 py-1.5"
                  >
                    {removingSeat === u.id ? "Removing…" : "Confirm remove"}
                  </button>
                  <button
                    onClick={() => setConfirmingRemoveSeat(null)}
                    className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text px-2.5 py-1.5"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setAccessDialogFor(u)}
                    className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
                  >
                    Manage access
                  </button>
                  <button
                    onClick={() => setResetDialogFor(u)}
                    className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
                  >
                    Reset password
                  </button>
                  <button
                    onClick={() => {
                      setSeatError("");
                      setConfirmingRemoveSeat(u.id);
                    }}
                    className="cursor-pointer text-[11px] font-semibold text-muted hover:text-accentb border border-line2 hover:border-accentb px-2.5 py-1.5"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {seats.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted">
            No seats yet.
          </div>
        )}
      </div>

      {/* §10c. Which delivered files are actually performing — the question a
          retainer conversation opens with. No change-vs-last-period figure: only the
          current viewCount is stored, so a delta would have to be invented. */}
      {topPosts.length > 0 && (
        <div className="mb-9" data-testid="top-posts">
          <div className="flex items-baseline justify-between gap-4 mb-4 flex-wrap">
            <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-muted">
              Top posts · last 30 days
            </h2>
            {postsSyncedAt && (
              <span className="text-[11px] text-dim">
                synced {new Date(postsSyncedAt).toISOString().slice(0, 10)}
              </span>
            )}
          </div>
          <div className="border border-line bg-s1">
            {topPosts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0 flex-wrap"
              >
                <span className="text-[9px] font-bold tracking-wide text-accentb border border-accent/40 px-1.5 py-0.5 flex-none">
                  {p.platform}
                </span>
                <div className="min-w-0 flex-1">
                  {p.permalink ? (
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13px] font-semibold text-text hover:text-accentb truncate block"
                    >
                      {p.title} ↗
                    </a>
                  ) : (
                    <span className="text-[13px] font-semibold truncate block">
                      {p.title}
                    </span>
                  )}
                  <div className="text-[11px] text-dim truncate">
                    {p.handle} ·{" "}
                    {new Date(p.postedAt).toISOString().slice(0, 10)}
                  </div>
                </div>
                <div className="text-right flex-none">
                  <div className="text-[15px] font-black tabular-nums">
                    {p.views.toLocaleString("en-US")}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-dim">
                    views
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* One line, not a column of cards. What is switched on for this client is worth
          knowing at a glance; changing it is rare enough to be a trip to Integrations,
          which is now the only place any of it is edited. */}
      <div className="flex items-center gap-2.5 flex-wrap text-[10px] font-semibold uppercase tracking-[.08em] text-dim mb-9 -mt-4">
        <span className={`w-1.5 h-1.5 ${integrationParts.length ? "bg-success" : "bg-line2"}`} />
        <span data-testid="integrations-line">
          {integrationParts.length ? integrationParts.join(" · ") : "No integrations"}
        </span>
        <Link href="/admin/integrations" className="text-text hover:text-accent">
          {integrationParts.length ? "Manage →" : "Add →"}
        </Link>
      </div>

      <div className="flex items-end justify-between mb-4">
        <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-muted">
          Projects
        </h2>
        <Button onClick={() => setNewProjectOpen(true)}>+ New project</Button>
      </div>
      <div className="border border-line">
        {projects.map((p) => (
          <div
            key={p.id}
            data-testid={`project-row-${p.id}`}
            className="flex flex-col gap-2.5 px-4 py-4 border-b border-line last:border-b-0 md:grid md:gap-4 md:px-5 md:items-center"
            style={{ gridTemplateColumns: "2.1fr .9fr 1fr 1.1fr auto" }}
          >
            <div className="md:contents">
              <div>
                {/* The project page, not the media table: what a project is, what it
                    owes and what has been sent to it all live there now. */}
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="font-semibold text-sm hover:text-accent"
                >
                  {p.title}
                </Link>
                <div
                  className="text-[10.5px] font-mono text-dim mt-1 truncate"
                  title={p.inboxPath}
                >
                  {p.inboxPath}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] md:contents">
              <span className="text-muted">{p.assetCount} assets</span>
              {/* What each project is, visible from the list rather than only by
                  opening it. Set at creation and never changes. */}
              <span className="text-[10px] font-extrabold uppercase tracking-[.06em] text-muted border border-line2 px-[7px] py-[3px]">
                {p.type === "CALENDAR" ? "Calendar" : p.type === "FILM" ? "Film" : "Delivery"}
              </span>
              {/* One flag per project, in the order that decides what to do about it:
                  money owed first, then footage you are waiting on, then the date it
                  closes. Draft/Live is gone from here — it is automatic and says nothing
                  a person can act on. */}
              {p.paymentHold ? (
                <span className="text-[10px] font-extrabold uppercase tracking-[.06em] text-accentb border border-accentb px-[7px] py-[3px]">
                  Held for payment
                </span>
              ) : p.openRequests > 0 ? (
                <span className="text-[10px] font-extrabold uppercase tracking-[.06em] text-success border border-success/40 px-[7px] py-[3px]">
                  Awaiting footage
                </span>
              ) : null}
              <span className="text-muted md:text-right">
                <span className="md:hidden text-dim">Expires · </span>
                {p.expiresAt ? fmtDate(p.expiresAt) : fmtDate(p.deliveredAt)}
              </span>
            </div>
            <div className="flex gap-2 justify-start md:justify-end">
              <button
                onClick={() => setUploadingTo(p)}
                className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
              >
                Upload
              </button>
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted">
            No projects yet.
          </div>
        )}
      </div>

      {seatDialogOpen && (
        <AddSeatDialog
          clientId={client.id}
          clientName={client.name}
          projects={projects.map((p) => ({ id: p.id, title: p.title }))}
          onClose={() => setSeatDialogOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
      {resetDialogFor && (
        <ResetSeatPasswordDialog
          clientId={client.id}
          seatId={resetDialogFor.id}
          seatName={resetDialogFor.name}
          seatEmail={resetDialogFor.email}
          onClose={() => setResetDialogFor(null)}
        />
      )}
      {accessDialogFor && (
        <SeatAccessDialog
          clientId={client.id}
          seatId={accessDialogFor.id}
          seatName={accessDialogFor.name}
          projects={projects.map((p) => ({ id: p.id, title: p.title }))}
          initialAccess={accessDialogFor.projectAccess}
          onClose={() => setAccessDialogFor(null)}
          onSaved={() => {
            setAccessDialogFor(null);
            router.refresh();
          }}
        />
      )}
      {newProjectOpen && (
        <NewProjectDialog
          clients={[{ id: client.id, name: client.name, hasSlackChannel: client.hasSlackChannel }]}
          onClose={() => setNewProjectOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />

      {uploadingTo && (
        <UploadDialog
          projectId={uploadingTo.id}
          projectTitle={uploadingTo.title}
          onClose={() => setUploadingTo(null)}
          onUploaded={() => router.refresh()}
        />
      )}
    </div>
  );
}
