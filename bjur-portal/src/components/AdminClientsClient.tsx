"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { NewClientDialog } from "@/components/NewClientDialog";
import { AddSeatDialog } from "@/components/AddSeatDialog";

type Seat = { id: string; name: string; email: string; role: string; lastLoginAt: string | null };
type ClientRow = {
  id: string;
  name: string;
  username: string;
  type: "RETAINER" | "ONEOFF";
  status: "ACTIVE" | "DISABLED";
  projectCount: number;
  seats: Seat[];
};

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const ROLE_COLOR: Record<string, string> = {
  OWNER: "#2ec36b",
  DOWNLOADER: "var(--accentb)",
  VIEWER: "var(--muted)",
};

export function AdminClientsClient({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [seatDialogFor, setSeatDialogFor] = useState<ClientRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleStatus(c: ClientRow) {
    setBusyId(c.id);
    await fetch(`/api/admin/clients/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: c.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="px-10 py-12 max-w-[1400px] mx-auto bjfade">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
            Accounts
          </div>
          <h1 className="text-[34px] tracking-tight font-black">Clients</h1>
        </div>
        <Button onClick={() => setNewClientOpen(true)}>+ New client</Button>
      </div>

      <div className="border border-line">
        <div
          className="grid gap-4 px-5 py-3.5 border-b-2 border-line2 text-[10.5px] tracking-wide uppercase text-muted font-bold"
          style={{ gridTemplateColumns: "1.9fr .9fr .6fr .9fr 1fr" }}
        >
          <span>Client</span>
          <span>Type</span>
          <span>Projects</span>
          <span>Users</span>
          <span className="text-right">Status</span>
        </div>
        {clients.map((c) => {
          const isExpanded = expanded.has(c.id);
          const active = c.status === "ACTIVE";
          return (
            <div key={c.id} className="border-b border-line last:border-b-0">
              <div
                className="grid gap-4 px-5 py-4 items-center"
                style={{ gridTemplateColumns: "1.9fr .9fr .6fr .9fr 1fr", background: active ? "transparent" : "rgba(255,255,255,.015)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-[30px] h-[30px] bg-s3 grid place-items-center text-[11px] font-bold flex-none ${active ? "text-text" : "text-dim"}`}
                  >
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm truncate ${active ? "text-text" : "text-dim"}`}>
                      {c.name}
                    </div>
                    <div className="text-[11px] text-dim font-mono">@{c.username}</div>
                  </div>
                </div>
                <span>
                  <span className="text-[10px] font-bold tracking-wide uppercase text-muted border border-line2 px-2 py-1">
                    {c.type === "RETAINER" ? "Retainer" : "One-off"}
                  </span>
                </span>
                <span className="text-[13px] text-muted">{c.projectCount}</span>
                <button
                  onClick={() => toggleExpand(c.id)}
                  className="cursor-pointer text-left text-[13px] text-muted hover:text-text inline-flex items-center gap-1.5"
                >
                  <span className="text-[11px]">{isExpanded ? "▾" : "▸"}</span>
                  {c.seats.length} seat{c.seats.length !== 1 ? "s" : ""}
                </button>
                <div className="flex items-center justify-end gap-3">
                  <span
                    className={`text-[11px] font-bold tracking-wide uppercase ${active ? "text-success" : "text-dim"}`}
                  >
                    {active ? "Active" : "Disabled"}
                  </span>
                  <button
                    onClick={() => toggleStatus(c)}
                    disabled={busyId === c.id}
                    className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5 disabled:opacity-40"
                  >
                    {active ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="px-5 pb-5 pt-1.5 bg-white/[0.02]">
                  <div className="text-[10px] tracking-wide uppercase text-dim font-bold py-2.5">
                    Client logins
                  </div>
                  {c.seats.map((u) => (
                    <div key={u.id} className="flex items-center gap-3.5 py-2.5 border-t border-line">
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-semibold">{u.name}</span>{" "}
                        <span className="text-xs text-dim font-mono">{u.email}</span>
                      </div>
                      <span
                        className="text-[11px] font-bold tracking-wide uppercase"
                        style={{ color: ROLE_COLOR[u.role] }}
                      >
                        {u.role}
                      </span>
                      <span className="text-[11px] text-dim w-16 text-right">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </span>
                    </div>
                  ))}
                  <button
                    onClick={() => setSeatDialogFor(c)}
                    className="cursor-pointer mt-3 text-xs font-semibold text-muted hover:text-text border border-dashed border-line2 hover:border-text px-3.5 py-2"
                  >
                    + Add user seat
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {clients.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted">No clients yet.</div>
        )}
      </div>

      {newClientOpen && (
        <NewClientDialog onClose={() => setNewClientOpen(false)} onCreated={() => router.refresh()} />
      )}
      {seatDialogFor && (
        <AddSeatDialog
          clientId={seatDialogFor.id}
          clientName={seatDialogFor.name}
          onClose={() => setSeatDialogFor(null)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}
