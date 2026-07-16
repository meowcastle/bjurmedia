"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { EditProjectDialog } from "@/components/EditProjectDialog";

type ProjectRow = {
  id: string;
  title: string;
  clientName: string;
  clientType: "RETAINER" | "ONEOFF";
  status: string;
  deliveredAt: string | null;
  expiresAt: string | null;
  assetCount: number;
  inboxPath: string;
};

type ClientOption = { id: string; name: string; type: "RETAINER" | "ONEOFF" };

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

const STATUS_COLOR: Record<string, string> = {
  LIVE: "text-success",
  DRAFT: "text-muted",
};

const GRID_COLS = "2.1fr 1.4fr .9fr 1fr 1.1fr auto";

export function AdminProjectsClient({
  projects,
  clients,
}: {
  projects: ProjectRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);

  return (
    <div className="px-10 py-12 max-w-[1400px] mx-auto bjfade">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
            Galleries
          </div>
          <h1 className="text-[34px] tracking-tight font-black">Projects</h1>
        </div>
        <Button onClick={() => setNewOpen(true)}>+ New project</Button>
      </div>

      <div className="border border-line">
        <div
          className="grid gap-4 px-5 py-3.5 border-b-2 border-line2 text-[10.5px] tracking-wide uppercase text-muted font-bold"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <span>Project</span>
          <span>Client</span>
          <span>Assets</span>
          <span>Status</span>
          <span className="text-right">Expires</span>
          <span />
        </div>
        {projects.map((p) => (
          <div
            key={p.id}
            className="grid gap-4 px-5 py-4 border-b border-line last:border-b-0 items-center"
            style={{ gridTemplateColumns: GRID_COLS }}
          >
            <div>
              <div className="font-semibold text-sm">{p.title}</div>
              <div className="text-[10.5px] font-mono text-dim mt-1 truncate" title={p.inboxPath}>
                {p.inboxPath}
              </div>
            </div>
            <span className="text-[13px] text-muted">{p.clientName}</span>
            <span className="text-[13px] text-muted">{p.assetCount} assets</span>
            <span
              className={`text-[11px] font-bold tracking-wide uppercase ${STATUS_COLOR[p.status] ?? "text-muted"}`}
            >
              {p.status}
            </span>
            <span className="text-[13px] text-right text-muted">{fmtDate(p.expiresAt)}</span>
            <button
              onClick={() => setEditing(p)}
              className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
            >
              Edit
            </button>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted">No projects yet.</div>
        )}
      </div>

      {newOpen && (
        <NewProjectDialog clients={clients} onClose={() => setNewOpen(false)} onCreated={() => router.refresh()} />
      )}
      {editing && (
        <EditProjectDialog
          project={{
            id: editing.id,
            title: editing.title,
            status: editing.status,
            deliveredAt: editing.deliveredAt,
            expiresAt: editing.expiresAt,
            clientType: editing.clientType,
          }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
