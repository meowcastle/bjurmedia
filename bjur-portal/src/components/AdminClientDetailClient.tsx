"use client";

import { haptic } from "@/lib/haptics";
import { EmptyState } from "@/components/ui/EmptyState";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminIntakeBlock, type IntakeBatch, type IntakeLink } from "@/components/AdminIntakeBlock";
import { AddSeatDialog } from "@/components/AddSeatDialog";
import { ResetSeatPasswordDialog } from "@/components/ResetSeatPasswordDialog";
import { SeatAccessDialog } from "@/components/SeatAccessDialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { UploadDialog } from "@/components/UploadDialog";
import { ClientLogo } from "@/components/ClientLogo";

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
  assetCount: number;
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
  footageUploads: boolean;
  logoUrl: string | null;
  logoColor: string | null;
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
  intake,
}: {
  client: ClientInfo;
  topPosts: TopPost[];
  postsSyncedAt: string | null;
  seats: Seat[];
  projects: ProjectRow[];
  intake: { batches: IntakeBatch[]; links: IntakeLink[] };
}) {
  const router = useRouter();
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);
  const [resetDialogFor, setResetDialogFor] = useState<Seat | null>(null);
  const [accessDialogFor, setAccessDialogFor] = useState<Seat | null>(null);
  const [confirmingRemoveSeat, setConfirmingRemoveSeat] = useState<
    string | null
  >(null);
  const [removingSeat, setRemovingSeat] = useState<string | null>(null);
  const [seatError, setSeatError] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [uploadingTo, setUploadingTo] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDisable, setConfirmingDisable] = useState(false);

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
      setSeatError(data.error ?? "Failed to remove login.");
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
    setConfirmingDisable(false);
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
    <div className="bj-adm bjfade">
      <section className="bj-adm-top">
        <div className="min-w-0">
          <Link href="/admin/clients" className="bj-mono inline-flex items-center gap-2 min-h-[30px] hover:!text-[var(--text)]">
            ← All clients
          </Link>
          <div className="flex items-center gap-4 mt-3">
            <ClientLogo client={{ name: client.name, logoUrl, logoColor: client.logoColor }} size={56} />
            <div className="min-w-0">
              <h1 className="bj-big !mt-0">{client.name}</h1>
              <span className="bj-mono block mt-2">
                {seats.length} login{seats.length === 1 ? "" : "s"} · {projects.length} project
                {projects.length === 1 ? "" : "s"}
                {!active && <span className="bj-pill ml-2">Disabled</span>}
              </span>
            </div>
          </div>
        </div>
        <div className="acts">
        {/* Set once per client and rarely touched again, so they wait behind one
            disclosure instead of sharing the header with the name. */}
        <details className="group relative" data-testid="client-settings">
          <summary className="bj-ghost list-none select-none">
            Settings
          </summary>
          <div className="absolute right-0 max-[1000px]:left-0 max-[1000px]:right-auto z-20 mt-2 w-[320px] max-w-[calc(100vw-2rem)] bg-s1 border border-line [border-radius:3px!important] p-4 flex flex-col gap-3.5 shadow-2">
          <div className="flex items-center gap-2">
            <span className="bj-mono w-20 flex-none">
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
              className="bj-in flex-1 min-w-0 font-mono !text-[12px] disabled:opacity-40"
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
            <span className="bj-mono w-20 flex-none">
              Accent
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
          {confirmingDisable ? (
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-muted">Disable {client.name}?</span>
              <button
                onClick={() => {
                  haptic(20);
                  void toggleStatus();
                }}
                disabled={busy}
                className="bj-cta"
              >
                {busy ? "Disabling…" : "Confirm disable"}
              </button>
              <button
                onClick={() => setConfirmingDisable(false)}
                className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text px-2.5 py-2"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              // Disabling signs every login out, so it asks once. Enabling is the safe
              // direction and stays one click.
              onClick={active ? () => setConfirmingDisable(true) : toggleStatus}
              disabled={busy}
              className="bj-ghost disabled:opacity-40"
            >
              {active ? "Disable client" : "Enable client"}
            </button>
          )}
          </div>
        </details>
        </div>
      </section>

      <section className="bj-sx">
      <span className="bj-mono bj-lab">
        Logins<b>{seats.length}</b>
      </span>
      <div className="min-w-0">
      <div className="flex items-end justify-end mb-3">
        <button
          type="button"
          onClick={() => setSeatDialogOpen(true)}
          className="bj-ghost"
        >
          + Add login
        </button>
      </div>
      {seatError && (
        <div className="text-[14px] text-accent font-semibold mb-3">
          {seatError}
        </div>
      )}
      <div className="border-t border-line">
        {seats.map((u) => (
          <div
            key={u.id}
            data-testid={`seat-row-${u.id}`}
            className="flex flex-col gap-2.5 py-4 border-b border-line md:grid md:gap-4 md:items-center"
            style={{ gridTemplateColumns: "2.1fr .9fr 1fr 3.5rem 24rem" }}
          >
            <div className="md:contents">
              <div className="min-w-0">
                <span className="text-[16px] font-semibold">{u.name}</span>
                <div
                  className="bj-mono mt-1 truncate"
                  style={{ textTransform: "none" }}
                  title={u.email}
                >
                  {u.email}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
              <span
                className="bj-mono"
                style={{ color: ROLE_COLOR[u.role] }}
              >
                {u.role}
              </span>
              <span className="bj-mono">
                {u.projectAccess.length === 0
                  ? "All projects"
                  : `${u.projectAccess.length} project${u.projectAccess.length !== 1 ? "s" : ""}`}
              </span>
              <span className="bj-mono md:text-right">
                <span className="md:hidden">Last login · </span>
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
                  <span className="text-[14px] text-muted">Revoke access?</span>
                  <button
                    onClick={() => {
                      haptic(20);
                      void removeSeat(u);
                    }}
                    disabled={removingSeat === u.id}
                    className="bj-cta"
                  >
                    {removingSeat === u.id ? "Removing…" : "Confirm remove"}
                  </button>
                  <button
                    onClick={() => setConfirmingRemoveSeat(null)}
                    className="bj-ghost"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setAccessDialogFor(u)}
                    className="bj-ghost bj-sm"
                  >
                    Manage access
                  </button>
                  <button
                    onClick={() => setResetDialogFor(u)}
                    className="bj-ghost bj-sm"
                  >
                    Reset password
                  </button>
                  <button
                    onClick={() => {
                      setSeatError("");
                      setConfirmingRemoveSeat(u.id);
                    }}
                    className="bj-ghost bj-sm"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {seats.length === 0 && (
          <EmptyState icon="logins" className="px-5 py-8">
            No logins yet.
          </EmptyState>
        )}
      </div>
      </div>
      </section>

      {/* §10c. Which delivered files are actually performing — the question a
          retainer conversation opens with. No change-vs-last-period figure: only the
          current viewCount is stored, so a delta would have to be invented. */}
      {topPosts.length > 0 && (
        <section className="bj-sx" data-testid="top-posts">
          <span className="bj-mono bj-lab">
            Top posts · last 30 days
            {postsSyncedAt && (
              <span className="block mt-2">
                synced {new Date(postsSyncedAt).toISOString().slice(0, 10)}
              </span>
            )}
          </span>
          <div className="min-w-0">
            {topPosts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-4 py-3.5 border-b border-line flex-wrap"
              >
                <span className="bj-pill flex-none">
                  {p.platform}
                </span>
                <div className="min-w-0 flex-1">
                  {p.permalink ? (
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[15px] font-semibold text-text hover:text-accent truncate block"
                    >
                      {p.title} ↗
                    </a>
                  ) : (
                    <span className="text-[15px] font-semibold truncate block">
                      {p.title}
                    </span>
                  )}
                  <div className="bj-mono mt-1 truncate" style={{ textTransform: "none" }}>
                    {p.handle} ·{" "}
                    {new Date(p.postedAt).toISOString().slice(0, 10)}
                  </div>
                </div>
                <div className="text-right flex-none">
                  <div className="text-[18px] font-bold tracking-[-0.02em] tabular-nums">
                    {p.views.toLocaleString("en-US")}
                  </div>
                  <div className="bj-mono">
                    views
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* One line, not a column of cards. What is switched on for this client is worth
          knowing at a glance; changing it is rare enough to be a trip to Integrations,
          which is now the only place any of it is edited. */}
      <section className="bj-sx">
        <span className="bj-mono bj-lab">Integrations</span>
      <div className="flex items-center gap-2.5 flex-wrap bj-mono">
        <span className={`bj-dot${integrationParts.length ? " ok" : ""}`} />
        <span data-testid="integrations-line">
          {integrationParts.length ? integrationParts.join(" · ") : "No integrations"}
        </span>
        <Link href="/admin/integrations" className="bj-link !normal-case !tracking-normal" style={{ color: "var(--text)" }}>
          {integrationParts.length ? "Manage →" : "Add →"}
        </Link>
      </div>
      </section>

      <section className="bj-sx">
      <span className="bj-mono bj-lab">
        Projects<b>{projects.length}</b>
      </span>
      <div className="min-w-0">
      <div className="flex items-end justify-end mb-3">
        <button type="button" className="bj-cta" onClick={() => setNewProjectOpen(true)}>
          + New project
        </button>
      </div>
      <div className="border-t border-line">
        {projects.map((p) => (
          <div
            key={p.id}
            data-testid={`project-row-${p.id}`}
            className="flex flex-col gap-2.5 py-4 border-b border-line md:grid md:gap-4 md:items-center"
            style={{ gridTemplateColumns: "2.1fr .9fr 1fr 1.1fr auto" }}
          >
            <div className="md:contents">
              <div>
                {/* The project page, not the media table: what a project is, what it
                    owes and what has been sent to it all live there now. */}
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="font-semibold text-[16px] hover:text-accent inline-flex items-center min-h-[30px]"
                >
                  {p.title}
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] md:contents">
              <span className="bj-mono">{p.assetCount} files</span>
              {/* What each project is, visible from the list rather than only by
                  opening it. Set at creation and never changes. */}
              <span className="bj-pill justify-self-start">
                {p.type === "CALENDAR" ? "Calendar" : p.type === "FILM" ? "Film" : "Delivery"}
              </span>
              {/* One flag per project, in the order that decides what to do about it:
                  money owed first, then footage you are waiting on, then the date it
                  closes. Draft/Live is gone from here — it is automatic and says nothing
                  a person can act on. */}
              {p.paymentHold ? (
                <span className="bj-pill red justify-self-start">
                  Awaiting payment
                </span>
              ) : null}
              {/* Labelled at every width: the column holds whichever date matters, and
                  a bare date could not say which one it was. */}
              <span className="bj-mono md:text-right">
                {p.expiresAt
                  ? `Expires ${fmtDate(p.expiresAt)}`
                  : p.deliveredAt
                    ? `Delivered ${fmtDate(p.deliveredAt)}`
                    : "—"}
              </span>
            </div>
            <div className="flex gap-2 justify-start md:justify-end">
              <button
                onClick={() => setUploadingTo(p)}
                className="bj-ghost bj-sm"
              >
                Upload
              </button>
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <EmptyState icon="projects">No projects yet.</EmptyState>
        )}
      </div>
      </div>
      </section>

      {/* What they have sent us, under what we are making for them. Both belong to the
          client; neither belongs to the other. */}
      <AdminIntakeBlock
        clientId={client.id}
        clientName={client.name}
        footageUploads={client.footageUploads}
        batches={intake.batches}
        links={intake.links}
        onChanged={() => router.refresh()}
      />

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

      {uploadingTo && (
        <UploadDialog
          projectId={uploadingTo.id}
          onClose={() => setUploadingTo(null)}
          onUploaded={() => router.refresh()}
        />
      )}
    </div>
  );
}
