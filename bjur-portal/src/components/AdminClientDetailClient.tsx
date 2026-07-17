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
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export function AdminClientDetailClient({
  client,
  seats,
  projects,
}: {
  client: ClientInfo;
  seats: Seat[];
  projects: ProjectRow[];
}) {
  const router = useRouter();
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);
  const [resetDialogFor, setResetDialogFor] = useState<Seat | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [uploadingTo, setUploadingTo] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="px-10 py-12 max-w-[1400px] mx-auto bjfade">
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
        <button
          onClick={toggleStatus}
          disabled={busy}
          className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-3.5 py-2 disabled:opacity-40"
        >
          {active ? "Disable client" : "Enable client"}
        </button>
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
          <div key={p.id} className="grid gap-4 px-5 py-4 border-b border-line last:border-b-0 items-center" style={{ gridTemplateColumns: "2.1fr .9fr 1fr 1.1fr auto" }}>
            <div>
              <Link href={`/admin/media?project=${p.id}`} className="font-semibold text-sm hover:text-accent">
                {p.title}
              </Link>
              <div className="text-[10.5px] font-mono text-dim mt-1 truncate" title={p.inboxPath}>
                {p.inboxPath}
              </div>
            </div>
            <span className="text-[13px] text-muted">{p.assetCount} assets</span>
            <span className={`text-[11px] font-bold tracking-wide uppercase ${STATUS_COLOR[p.status] ?? "text-muted"}`}>
              {p.status}
            </span>
            <span className="text-[13px] text-right text-muted">{fmtDate(p.expiresAt)}</span>
            <div className="flex gap-2 justify-end">
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
