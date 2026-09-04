"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { NewClientDialog } from "@/components/NewClientDialog";
import { AddSeatDialog } from "@/components/AddSeatDialog";
import { ResetSeatPasswordDialog } from "@/components/ResetSeatPasswordDialog";
import { lighten } from "@/lib/color";
import { initials } from "@/lib/initials";

type Seat = {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
};
type ClientRow = {
  id: string;
  name: string;
  username: string;
  type: "RETAINER" | "ONEOFF";
  status: "ACTIVE" | "DISABLED";
  accentColor: string | null;
  logoUrl: string | null;
  projectCount: number;
  seats: Seat[];
};

const DEFAULT_ACCENT = "#ec3013";

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
  const [resetDialogFor, setResetDialogFor] = useState<{
    client: ClientRow;
    seat: Seat;
  } | null>(null);
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
      body: JSON.stringify({
        status: c.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
      }),
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[1400px] mx-auto bjfade">
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
          className="hidden md:grid gap-4 px-5 py-3.5 border-b-2 border-line2 text-[10.5px] tracking-wide uppercase text-muted font-bold"
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
          const accent = c.accentColor ?? DEFAULT_ACCENT;
          return (
            <div
              key={c.id}
              className="border-b border-line last:border-b-0"
              style={{
                borderLeft: `3px solid ${active ? accent : "var(--line2)"}`,
              }}
            >
              <div
                className="flex flex-col gap-3 px-4 py-5 md:grid md:gap-4 md:px-5 md:py-5 md:items-center"
                style={{
                  gridTemplateColumns: "1.9fr .9fr .6fr .9fr 1fr",
                  background: active ? "transparent" : "rgba(255,255,255,.015)",
                }}
              >
                {/* Identity + type share a row on mobile (display:contents at md: restores
                    the plain 5-col grid, same as the Media pipeline table). */}
                <div className="flex items-center gap-3.5 md:contents">
                  <Link
                    href={`/admin/clients/${c.id}`}
                    className="flex items-center gap-3.5 min-w-0 flex-1 group"
                  >
                    <div
                      className="w-12 h-12 flex-none grid place-items-center overflow-hidden"
                      style={
                        !c.logoUrl
                          ? {
                              background: `linear-gradient(135deg, ${accent}, ${lighten(accent, 0.6)})`,
                            }
                          : { background: "var(--s3)" }
                      }
                    >
                      {c.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external brand logo, not a static asset Next can optimize
                        <img
                          src={c.logoUrl}
                          alt=""
                          className="w-full h-full object-contain bg-bg"
                        />
                      ) : (
                        <span
                          className={`text-sm font-black ${active ? "text-bg" : "text-dim"}`}
                        >
                          {initials(c.name)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`font-bold text-base truncate group-hover:text-accent ${active ? "text-text" : "text-dim"}`}
                      >
                        {c.name}
                      </div>
                      <div className="text-[11px] text-dim font-mono">
                        @{c.username}
                      </div>
                    </div>
                  </Link>
                  <span className="flex-none">
                    <span className="text-[10px] font-bold tracking-wide uppercase text-muted border border-line2 px-2 py-1">
                      {c.type === "RETAINER" ? "Retainer" : "One-off"}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 md:contents">
                  <span className="text-[12px] text-dim">
                    <span className="md:hidden">Projects · </span>
                    {c.projectCount}
                  </span>
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="cursor-pointer text-left text-[12px] text-dim hover:text-text inline-flex items-center gap-1.5"
                  >
                    <span className="text-[11px]">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                    {c.seats.length} seat{c.seats.length !== 1 ? "s" : ""}
                  </button>
                </div>
                <div className="flex items-center gap-3 md:justify-end">
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
                    <div
                      key={u.id}
                      className="flex items-center gap-3.5 py-2.5 border-t border-line"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-semibold">
                          {u.name}
                        </span>{" "}
                        <span className="text-xs text-dim font-mono">
                          {u.email}
                        </span>
                      </div>
                      <span
                        className="text-[11px] font-bold tracking-wide uppercase"
                        style={{ color: ROLE_COLOR[u.role] }}
                      >
                        {u.role}
                      </span>
                      <span className="text-[11px] text-dim w-16 text-right">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" },
                            )
                          : "—"}
                      </span>
                      <button
                        onClick={() =>
                          setResetDialogFor({ client: c, seat: u })
                        }
                        className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
                      >
                        Reset password
                      </button>
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
          <div className="px-5 py-10 text-center text-sm text-muted">
            No clients yet.
          </div>
        )}
      </div>

      {newClientOpen && (
        <NewClientDialog
          onClose={() => setNewClientOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
      {seatDialogFor && (
        <AddSeatDialog
          clientId={seatDialogFor.id}
          clientName={seatDialogFor.name}
          onClose={() => setSeatDialogFor(null)}
          onCreated={() => router.refresh()}
        />
      )}
      {resetDialogFor && (
        <ResetSeatPasswordDialog
          clientId={resetDialogFor.client.id}
          seatId={resetDialogFor.seat.id}
          seatName={resetDialogFor.seat.name}
          seatEmail={resetDialogFor.seat.email}
          onClose={() => setResetDialogFor(null)}
        />
      )}
    </div>
  );
}
