"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AddSeatDialog } from "@/components/AddSeatDialog";
import { ResetSeatPasswordDialog } from "@/components/ResetSeatPasswordDialog";
import { SeatAccessDialog } from "@/components/SeatAccessDialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { UploadDialog } from "@/components/UploadDialog";
import { ClientSubmissionsDialog } from "@/components/ClientSubmissionsDialog";
import { lighten } from "@/lib/color";
import { initials } from "@/lib/initials";

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
  assetCount: number;
  submissionCount: number;
  inboxPath: string;
};
type ClientInfo = {
  id: string;
  name: string;
  username: string;
  type: "RETAINER" | "ONEOFF";
  status: "ACTIVE" | "DISABLED";
  approvalRequired: boolean;
  approvalAutoHours: number;
  accentColor: string | null;
  logoUrl: string | null;
};

type SocialAccountRow = {
  platform: "INSTAGRAM" | "YOUTUBE";
  externalId: string;
  handle: string;
  hasToken: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};
type LicenseRow = {
  id: string;
  assetName: string;
  tier: "SOCIAL" | "COMMERCIAL" | "BUYOUT" | "CUSTOM";
  amount: number;
  scope: string;
  purchasedAt: string;
  expiresAt: string | null;
  userName: string;
};

const DEFAULT_ACCENT = "#ec3013";

const TIER_LABEL: Record<LicenseRow["tier"], string> = {
  SOCIAL: "Social & Digital",
  COMMERCIAL: "Commercial & Broadcast",
  BUYOUT: "Full Buyout",
  CUSTOM: "Custom",
};

const ROLE_COLOR: Record<string, string> = {
  OWNER: "#2ec36b",
  DOWNLOADER: "var(--accentb)",
  VIEWER: "var(--muted)",
};

const STATUS_COLOR: Record<string, string> = {
  LIVE: "text-success",
  DRAFT: "text-muted",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export type TopPost = {
  id: string;
  title: string;
  platform: "IG" | "YT";
  handle: string;
  postedAt: string;
  views: number;
  permalink: string | null;
};

export function AdminClientDetailClient({
  client,
  seats,
  projects,
  socialAccounts,
  licenses,
  topPosts,
  postsSyncedAt,
}: {
  client: ClientInfo;
  seats: Seat[];
  projects: ProjectRow[];
  socialAccounts: SocialAccountRow[];
  licenses: LicenseRow[];
  topPosts: TopPost[];
  postsSyncedAt: string | null;
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
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [uploadingTo, setUploadingTo] = useState<ProjectRow | null>(null);
  const [submissionsFor, setSubmissionsFor] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(
    client.approvalRequired,
  );
  const [approvalHours, setApprovalHours] = useState(
    String(client.approvalAutoHours),
  );
  const [approvalError, setApprovalError] = useState<string | null>(null);

  async function saveApproval(fields: {
    approvalRequired?: boolean;
    approvalAutoHours?: number;
  }) {
    setApprovalError(null);
    const res = await fetch(`/api/admin/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setApprovalError(body.error ?? "Could not save that.");
      // Put the control back rather than showing a state the database never took.
      setApprovalRequired(client.approvalRequired);
      setApprovalHours(String(client.approvalAutoHours));
    }
  }

  const [accentColor, setAccentColor] = useState(
    client.accentColor ?? DEFAULT_ACCENT,
  );
  const [savingAccent, setSavingAccent] = useState(false);
  const [logoUrl, setLogoUrl] = useState(client.logoUrl);
  const [logoDraft, setLogoDraft] = useState(client.logoUrl ?? "");
  const [savingLogo, setSavingLogo] = useState(false);
  const [social, setSocial] = useState(socialAccounts);

  function socialRow(platform: "INSTAGRAM" | "YOUTUBE"): SocialAccountRow {
    return (
      social.find((s) => s.platform === platform) ?? {
        platform,
        externalId: "",
        handle: "",
        hasToken: false,
        lastSyncedAt: null,
        lastSyncError: null,
      }
    );
  }

  const [igDraft, setIgDraft] = useState(() => {
    const r = socialRow("INSTAGRAM");
    return { externalId: r.externalId, handle: r.handle, accessToken: "" };
  });
  const [ytDraft, setYtDraft] = useState(() => {
    const r = socialRow("YOUTUBE");
    return { externalId: r.externalId, handle: r.handle };
  });
  const [savingSocial, setSavingSocial] = useState<
    "INSTAGRAM" | "YOUTUBE" | null
  >(null);

  async function saveIg() {
    setSavingSocial("INSTAGRAM");
    await saveSocialAccount("INSTAGRAM", {
      externalId: igDraft.externalId,
      handle: igDraft.handle,
      accessToken: igDraft.accessToken || undefined,
    });
    setIgDraft((d) => ({ ...d, accessToken: "" }));
    setSavingSocial(null);
  }

  async function saveYt() {
    setSavingSocial("YOUTUBE");
    await saveSocialAccount("YOUTUBE", {
      externalId: ytDraft.externalId,
      handle: ytDraft.handle,
    });
    setSavingSocial(null);
  }

  async function unlinkSocial(platform: "INSTAGRAM" | "YOUTUBE") {
    setSavingSocial(platform);
    await saveSocialAccount(platform, { externalId: "", handle: "" });
    if (platform === "INSTAGRAM")
      setIgDraft({ externalId: "", handle: "", accessToken: "" });
    else setYtDraft({ externalId: "", handle: "" });
    setSavingSocial(null);
  }

  async function saveSocialAccount(
    platform: "INSTAGRAM" | "YOUTUBE",
    fields: { externalId: string; handle: string; accessToken?: string },
  ) {
    await fetch(`/api/admin/clients/${client.id}/social`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, ...fields }),
    });
    setSocial((rows) => {
      const next = rows.filter((r) => r.platform !== platform);
      if (fields.externalId.trim()) {
        next.push({
          platform,
          externalId: fields.externalId.trim(),
          handle: fields.handle.trim(),
          hasToken:
            fields.accessToken !== undefined
              ? !!fields.accessToken.trim()
              : (rows.find((r) => r.platform === platform)?.hasToken ?? false),
          lastSyncedAt: null,
          lastSyncError: null,
        });
      }
      return next;
    });
  }

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
            <h1 className="text-4xl tracking-tight font-black mb-3">
              {client.name}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-wide uppercase text-muted border border-line2 px-2 py-1">
                {client.type === "RETAINER" ? "Retainer" : "One-off"}
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

      <div className="mb-9">
        <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-muted mb-4">
          Social accounts
        </h2>
        <div className="border border-line bg-s1 p-5 flex flex-col gap-5">
          <div>
            <div className="text-sm font-bold mb-1">Instagram</div>
            <div className="text-xs text-muted mb-3">
              Business/Creator Account ID + a long-lived access token — powers
              weekly view counts, matched automatically to delivered
              reels/stills.
            </div>
            <div className="flex flex-wrap gap-2.5">
              <input
                value={igDraft.handle}
                onChange={(e) =>
                  setIgDraft((d) => ({ ...d, handle: e.target.value }))
                }
                placeholder="@handle"
                className="w-32 bg-bg border border-line2 text-text text-[13px] px-2.5 py-2 outline-none focus:border-accent"
              />
              <input
                value={igDraft.externalId}
                onChange={(e) =>
                  setIgDraft((d) => ({ ...d, externalId: e.target.value }))
                }
                placeholder="IG Business Account ID"
                className="w-52 bg-bg border border-line2 text-text text-[13px] font-mono px-2.5 py-2 outline-none focus:border-accent"
              />
              <input
                value={igDraft.accessToken}
                onChange={(e) =>
                  setIgDraft((d) => ({ ...d, accessToken: e.target.value }))
                }
                placeholder={
                  socialRow("INSTAGRAM").hasToken
                    ? "•••• (saved — paste to replace)"
                    : "Long-lived access token"
                }
                className="flex-1 min-w-[220px] bg-bg border border-line2 text-text text-[13px] font-mono px-2.5 py-2 outline-none focus:border-accent"
              />
              <button
                onClick={saveIg}
                disabled={
                  savingSocial === "INSTAGRAM" || !igDraft.externalId.trim()
                }
                className="cursor-pointer text-xs font-semibold text-bg bg-accent hover:bg-accentb px-3.5 py-2 disabled:opacity-50"
              >
                Save
              </button>
              {socialRow("INSTAGRAM").externalId && (
                <button
                  onClick={() => unlinkSocial("INSTAGRAM")}
                  disabled={savingSocial === "INSTAGRAM"}
                  className="cursor-pointer text-xs font-semibold text-muted hover:text-accentb border border-line2 hover:border-accentb px-3.5 py-2 disabled:opacity-40"
                >
                  Unlink
                </button>
              )}
            </div>
            {socialRow("INSTAGRAM").lastSyncError && (
              <div className="text-xs text-accentb mt-2">
                {socialRow("INSTAGRAM").lastSyncError}
              </div>
            )}
          </div>

          <div className="border-t border-line pt-5">
            <div className="text-sm font-bold mb-1">YouTube</div>
            <div className="text-xs text-muted mb-3">
              Channel ID only — view counts are pulled with the shared YouTube
              API key set on the Integrations page.
            </div>
            <div className="flex flex-wrap gap-2.5">
              <input
                value={ytDraft.handle}
                onChange={(e) =>
                  setYtDraft((d) => ({ ...d, handle: e.target.value }))
                }
                placeholder="Channel name"
                className="w-32 bg-bg border border-line2 text-text text-[13px] px-2.5 py-2 outline-none focus:border-accent"
              />
              <input
                value={ytDraft.externalId}
                onChange={(e) =>
                  setYtDraft((d) => ({ ...d, externalId: e.target.value }))
                }
                placeholder="YouTube Channel ID"
                className="flex-1 min-w-[220px] bg-bg border border-line2 text-text text-[13px] font-mono px-2.5 py-2 outline-none focus:border-accent"
              />
              <button
                onClick={saveYt}
                disabled={
                  savingSocial === "YOUTUBE" || !ytDraft.externalId.trim()
                }
                className="cursor-pointer text-xs font-semibold text-bg bg-accent hover:bg-accentb px-3.5 py-2 disabled:opacity-50"
              >
                Save
              </button>
              {socialRow("YOUTUBE").externalId && (
                <button
                  onClick={() => unlinkSocial("YOUTUBE")}
                  disabled={savingSocial === "YOUTUBE"}
                  className="cursor-pointer text-xs font-semibold text-muted hover:text-accentb border border-line2 hover:border-accentb px-3.5 py-2 disabled:opacity-40"
                >
                  Unlink
                </button>
              )}
            </div>
            {socialRow("YOUTUBE").lastSyncError && (
              <div className="text-xs text-accentb mt-2">
                {socialRow("YOUTUBE").lastSyncError}
              </div>
            )}
          </div>
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

      {/* §13. The policy the approval loop runs on. Without a control here these two
          columns existed but nothing could change them, so every client was pinned to
          "approval required, 24 hours". */}
      <div className="mb-9" data-testid="approval-policy">
        <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-muted mb-4">
          Publishing approval
        </h2>
        <div className="border border-line bg-s1 p-5 flex flex-col gap-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={approvalRequired}
              onChange={(e) => {
                setApprovalRequired(e.target.checked);
                saveApproval({ approvalRequired: e.target.checked });
              }}
              className="mt-1 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold">
                Ask before publishing
              </span>
              <span className="block text-xs text-muted mt-1">
                Scheduled posts go to this client&apos;s owner for sign-off.
                Turn this off and they publish on their date without asking.
              </span>
            </span>
          </label>

          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-dim">
              Auto-approve after
            </span>
            <input
              type="number"
              min={1}
              max={168}
              value={approvalHours}
              disabled={!approvalRequired}
              aria-label="Auto-approve after (hours)"
              onChange={(e) => setApprovalHours(e.target.value)}
              onBlur={() => {
                const n = Number(approvalHours);
                if (Number.isInteger(n) && n >= 1 && n <= 168)
                  saveApproval({ approvalAutoHours: n });
                else {
                  setApprovalHours(String(client.approvalAutoHours));
                  setApprovalError(
                    "Hours must be a whole number between 1 and 168.",
                  );
                }
              }}
              className="w-20 bg-bg border border-line2 text-text text-[12px] px-2 py-1.5 outline-none focus:border-accent disabled:opacity-40"
            />
            <span className="text-[11px] text-dim">
              hours of silence — never later than the post&apos;s own publish
              time
            </span>
          </div>

          {approvalError && (
            <div className="text-[12px] text-accentb">{approvalError}</div>
          )}
        </div>
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
            className="flex flex-col gap-2.5 px-4 py-4 border-b border-line last:border-b-0 md:grid md:gap-4 md:px-5 md:items-center"
            style={{ gridTemplateColumns: "2.1fr .9fr 1fr 1.1fr auto" }}
          >
            <div className="md:contents">
              <div>
                <Link
                  href={`/admin/media?project=${p.id}`}
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
              <span
                className={`text-[11px] font-bold tracking-wide uppercase ${STATUS_COLOR[p.status] ?? "text-muted"}`}
              >
                {p.status}
              </span>
              <span className="text-muted md:text-right">
                <span className="md:hidden text-dim">Expires · </span>
                {fmtDate(p.expiresAt)}
              </span>
            </div>
            <div className="flex gap-2 justify-start md:justify-end">
              {p.submissionCount > 0 && (
                <button
                  onClick={() => setSubmissionsFor(p)}
                  className="cursor-pointer text-[11px] font-semibold text-accentb hover:text-text border border-accent/40 hover:border-text px-2.5 py-1.5"
                >
                  Client uploads ({p.submissionCount})
                </button>
              )}
              <button
                onClick={() => setUploadingTo(p)}
                className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
              >
                Upload
              </button>
              <button
                onClick={() => setEditing(p)}
                className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
              >
                Edit
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

      <div className="mt-9">
        <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-muted mb-4">
          Licenses
        </h2>
        <div className="border border-line">
          {licenses.map((l) => {
            const now = new Date();
            const expired = l.expiresAt != null && new Date(l.expiresAt) < now;
            const statusLabel =
              l.expiresAt == null
                ? "Perpetual"
                : expired
                  ? "Expired"
                  : "Active";
            const statusColor = expired
              ? "text-accent"
              : l.expiresAt == null
                ? "text-muted"
                : "text-success";
            return (
              <div
                key={l.id}
                className="flex flex-col gap-1.5 px-5 py-4 border-b border-line last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm font-semibold">{l.assetName}</span>
                  <span
                    className={`text-[11px] font-bold tracking-wide uppercase ${statusColor}`}
                  >
                    {statusLabel}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {TIER_LABEL[l.tier]} · ${l.amount} · {l.scope}
                </div>
                <div className="text-[11px] text-dim">
                  {fmtDate(l.purchasedAt)} · {l.userName}
                  {l.expiresAt && ` · expires ${fmtDate(l.expiresAt)}`}
                </div>
              </div>
            );
          })}
          {licenses.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted">
              No licenses yet.
            </div>
          )}
        </div>
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
          clients={[{ id: client.id, name: client.name, type: client.type }]}
          onClose={() => setNewProjectOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
      {editing && (
        <EditProjectDialog
          project={{
            id: editing.id,
            title: editing.title,
            status: editing.status,
            deliveredAt: editing.deliveredAt,
            expiresAt: editing.expiresAt,
            clientType: client.type,
            assetCount: editing.assetCount,
          }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
          onDeleted={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {uploadingTo && (
        <UploadDialog
          projectId={uploadingTo.id}
          projectTitle={uploadingTo.title}
          onClose={() => setUploadingTo(null)}
          onUploaded={() => router.refresh()}
        />
      )}
      {submissionsFor && (
        <ClientSubmissionsDialog
          projectId={submissionsFor.id}
          projectTitle={submissionsFor.title}
          onClose={() => setSubmissionsFor(null)}
        />
      )}
    </div>
  );
}
