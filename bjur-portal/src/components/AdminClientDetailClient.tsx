"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AddSeatDialog } from "@/components/AddSeatDialog";
import { ResetSeatPasswordDialog } from "@/components/ResetSeatPasswordDialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { UploadDialog } from "@/components/UploadDialog";

type Seat = { id: string; name: string; email: string; role: string; lastLoginAt: string | null };
type ProjectRow = {
  id: string;
  title: string;
  status: string;
  deliveredAt: string | null;
  expiresAt: string | null;
  assetCount: number;
  inboxPath: string;
};
type ClientInfo = {
  id: string;
  name: string;
  username: string;
  type: "RETAINER" | "ONEOFF";
  status: "ACTIVE" | "DISABLED";
  accentColor: string | null;
};
type SocialAccountRow = {
  platform: "INSTAGRAM" | "YOUTUBE";
  externalId: string;
  handle: string;
  hasToken: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

const DEFAULT_ACCENT = "#ec3013";

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
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export function AdminClientDetailClient({
  client,
  seats,
  projects,
  socialAccounts,
}: {
  client: ClientInfo;
  seats: Seat[];
  projects: ProjectRow[];
  socialAccounts: SocialAccountRow[];
}) {
  const router = useRouter();
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);
  const [resetDialogFor, setResetDialogFor] = useState<Seat | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [uploadingTo, setUploadingTo] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [accentColor, setAccentColor] = useState(client.accentColor ?? DEFAULT_ACCENT);
  const [savingAccent, setSavingAccent] = useState(false);
  const [social, setSocial] = useState(socialAccounts);

  function socialRow(platform: "INSTAGRAM" | "YOUTUBE"): SocialAccountRow {
    return social.find((s) => s.platform === platform) ?? {
      platform,
      externalId: "",
      handle: "",
      hasToken: false,
      lastSyncedAt: null,
      lastSyncError: null,
    };
  }

  const [igDraft, setIgDraft] = useState(() => {
    const r = socialRow("INSTAGRAM");
    return { externalId: r.externalId, handle: r.handle, accessToken: "" };
  });
  const [ytDraft, setYtDraft] = useState(() => {
    const r = socialRow("YOUTUBE");
    return { externalId: r.externalId, handle: r.handle };
  });
  const [savingSocial, setSavingSocial] = useState<"INSTAGRAM" | "YOUTUBE" | null>(null);

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
    await saveSocialAccount("YOUTUBE", { externalId: ytDraft.externalId, handle: ytDraft.handle });
    setSavingSocial(null);
  }

  async function unlinkSocial(platform: "INSTAGRAM" | "YOUTUBE") {
    setSavingSocial(platform);
    await saveSocialAccount(platform, { externalId: "", handle: "" });
    if (platform === "INSTAGRAM") setIgDraft({ externalId: "", handle: "", accessToken: "" });
    else setYtDraft({ externalId: "", handle: "" });
    setSavingSocial(null);
  }

  async function saveSocialAccount(
    platform: "INSTAGRAM" | "YOUTUBE",
    fields: { externalId: string; handle: string; accessToken?: string }
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
          hasToken: fields.accessToken !== undefined ? !!fields.accessToken.trim() : rows.find((r) => r.platform === platform)?.hasToken ?? false,
          lastSyncedAt: null,
          lastSyncError: null,
        });
      }
      return next;
    });
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

  return (
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[1400px] mx-auto bjfade">
      <Link href="/admin/clients" className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-text mb-6">
        ← All clients
      </Link>

      <div className="flex items-end justify-between gap-6 flex-wrap border-b-2 border-line2 pb-6 mb-9">
        <div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
            @{client.username}
          </div>
          <h1 className="text-4xl tracking-tight font-black mb-3">{client.name}</h1>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold tracking-wide uppercase text-muted border border-line2 px-2 py-1">
              {client.type === "RETAINER" ? "Retainer" : "One-off"}
            </span>
            <span className={`text-[11px] font-bold tracking-wide uppercase ${active ? "text-success" : "text-dim"}`}>
              {active ? "Active" : "Disabled"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted">Portal accent</span>
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
              Business/Creator Account ID + a long-lived access token — powers weekly
              view counts, matched automatically to delivered reels/stills.
            </div>
            <div className="flex flex-wrap gap-2.5">
              <input
                value={igDraft.handle}
                onChange={(e) => setIgDraft((d) => ({ ...d, handle: e.target.value }))}
                placeholder="@handle"
                className="w-32 bg-bg border border-line2 text-text text-[13px] px-2.5 py-2 outline-none focus:border-accent"
              />
              <input
                value={igDraft.externalId}
                onChange={(e) => setIgDraft((d) => ({ ...d, externalId: e.target.value }))}
                placeholder="IG Business Account ID"
                className="w-52 bg-bg border border-line2 text-text text-[13px] font-mono px-2.5 py-2 outline-none focus:border-accent"
              />
              <input
                value={igDraft.accessToken}
                onChange={(e) => setIgDraft((d) => ({ ...d, accessToken: e.target.value }))}
                placeholder={socialRow("INSTAGRAM").hasToken ? "•••• (saved — paste to replace)" : "Long-lived access token"}
                className="flex-1 min-w-[220px] bg-bg border border-line2 text-text text-[13px] font-mono px-2.5 py-2 outline-none focus:border-accent"
              />
              <button
                onClick={saveIg}
                disabled={savingSocial === "INSTAGRAM" || !igDraft.externalId.trim()}
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
              <div className="text-xs text-accentb mt-2">{socialRow("INSTAGRAM").lastSyncError}</div>
            )}
          </div>

          <div className="border-t border-line pt-5">
            <div className="text-sm font-bold mb-1">YouTube</div>
            <div className="text-xs text-muted mb-3">
              Channel ID only — view counts are pulled with the shared YouTube API key
              set on the Integrations page.
            </div>
            <div className="flex flex-wrap gap-2.5">
              <input
                value={ytDraft.handle}
                onChange={(e) => setYtDraft((d) => ({ ...d, handle: e.target.value }))}
                placeholder="Channel name"
                className="w-32 bg-bg border border-line2 text-text text-[13px] px-2.5 py-2 outline-none focus:border-accent"
              />
              <input
                value={ytDraft.externalId}
                onChange={(e) => setYtDraft((d) => ({ ...d, externalId: e.target.value }))}
                placeholder="YouTube Channel ID"
                className="flex-1 min-w-[220px] bg-bg border border-line2 text-text text-[13px] font-mono px-2.5 py-2 outline-none focus:border-accent"
              />
              <button
                onClick={saveYt}
                disabled={savingSocial === "YOUTUBE" || !ytDraft.externalId.trim()}
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
              <div className="text-xs text-accentb mt-2">{socialRow("YOUTUBE").lastSyncError}</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between mb-4">
        <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-muted">Seats</h2>
        <button
          onClick={() => setSeatDialogOpen(true)}
          className="cursor-pointer text-xs font-semibold text-muted hover:text-text border border-dashed border-line2 hover:border-text px-3.5 py-2"
        >
          + Add user seat
        </button>
      </div>
      <div className="border border-line mb-9">
        {seats.map((u) => (
          <div key={u.id} className="flex items-center gap-3.5 px-5 py-3.5 border-b border-line last:border-b-0">
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-semibold">{u.name}</span>{" "}
              <span className="text-xs text-dim font-mono">{u.email}</span>
            </div>
            <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: ROLE_COLOR[u.role] }}>
              {u.role}
            </span>
            <span className="text-[11px] text-dim w-16 text-right">
              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
            </span>
            <button
              onClick={() => setResetDialogFor(u)}
              className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
            >
              Reset password
            </button>
          </div>
        ))}
        {seats.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted">No seats yet.</div>}
      </div>

      <div className="flex items-end justify-between mb-4">
        <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-muted">Projects</h2>
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
                <Link href={`/admin/media?project=${p.id}`} className="font-semibold text-sm hover:text-accent">
                  {p.title}
                </Link>
                <div className="text-[10.5px] font-mono text-dim mt-1 truncate" title={p.inboxPath}>
                  {p.inboxPath}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] md:contents">
              <span className="text-muted">{p.assetCount} assets</span>
              <span className={`text-[11px] font-bold tracking-wide uppercase ${STATUS_COLOR[p.status] ?? "text-muted"}`}>
                {p.status}
              </span>
              <span className="text-muted md:text-right">
                <span className="md:hidden text-dim">Expires · </span>
                {fmtDate(p.expiresAt)}
              </span>
            </div>
            <div className="flex gap-2 justify-start md:justify-end">
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
          <div className="px-5 py-10 text-center text-sm text-muted">No projects yet.</div>
        )}
      </div>

      {seatDialogOpen && (
        <AddSeatDialog
          clientId={client.id}
          clientName={client.name}
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
    </div>
  );
}
