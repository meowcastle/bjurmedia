"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { NewClientDialog } from "@/components/NewClientDialog";
import { lighten } from "@/lib/color";
import { initials } from "@/lib/initials";

type ClientRow = {
  id: string;
  name: string;
  username: string;
  status: "ACTIVE" | "DISABLED";
  accentColor: string | null;
  logoUrl: string | null;
  projectCount: number;
  seats: { id: string }[];
};

const DEFAULT_ACCENT = "#ec3013";
const COLS = "2fr .7fr .7fr .8fr";

/**
 * Name, counts and status — the row is a link to the client. Logins (add, reset, remove)
 * and Disable each live on the client page and nowhere else; this list used to expand to
 * a second copy of the login controls.
 */
export function AdminClientsClient({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [newClientOpen, setNewClientOpen] = useState(false);

  return (
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[1400px] mx-auto bjfade">
      <div className="flex items-end justify-between mb-7">
        <h1 className="bj-serif text-[34px] font-normal">Clients</h1>
        <Button onClick={() => setNewClientOpen(true)}>+ New client</Button>
      </div>

      <div className="border border-line">
        <div
          className="hidden md:grid gap-4 px-5 py-3.5 border-b-2 border-line2 text-[10.5px] tracking-wide uppercase text-muted font-bold"
          style={{ gridTemplateColumns: COLS }}
        >
          <span>Client</span>
          <span>Projects</span>
          <span>Logins</span>
          <span className="text-right">Status</span>
        </div>
        {clients.map((c) => {
          const active = c.status === "ACTIVE";
          const accent = c.accentColor ?? DEFAULT_ACCENT;
          return (
            <Link
              key={c.id}
              href={`/admin/clients/${c.id}`}
              data-testid={`client-row-${c.id}`}
              className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-5 md:grid md:gap-4 md:px-5 border-b border-line last:border-b-0 hover:bg-s1"
              style={{
                gridTemplateColumns: COLS,
                borderLeft: `3px solid ${active ? accent : "var(--line2)"}`,
                background: active ? undefined : "var(--s1)",
              }}
            >
              <div className="flex items-center gap-3.5 min-w-0 basis-full md:basis-auto">
                <div
                  className="w-12 h-12 flex-none grid place-items-center overflow-hidden"
                  style={
                    !c.logoUrl
                      ? { background: `linear-gradient(135deg, ${accent}, ${lighten(accent, 0.6)})` }
                      : { background: "var(--s3)" }
                  }
                >
                  {c.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external brand logo, not a static asset Next can optimize
                    <img src={c.logoUrl} alt="" className="w-full h-full object-contain bg-bg" />
                  ) : (
                    <span className={`text-sm font-black ${active ? "text-bg" : "text-dim"}`}>
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
                  <div className="text-[11px] text-dim font-mono">@{c.username}</div>
                </div>
              </div>
              <span className="text-[12px] text-dim">
                <span className="md:hidden">Projects · </span>
                {c.projectCount}
              </span>
              <span className="text-[12px] text-dim">
                <span className="md:hidden">Logins · </span>
                {c.seats.length}
              </span>
              <span
                className={`text-[11px] font-bold tracking-wide uppercase md:text-right ml-auto md:ml-0 ${active ? "text-success" : "text-dim"}`}
              >
                {active ? "Active" : "Disabled"}
              </span>
            </Link>
          );
        })}
        {clients.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted">No clients yet.</div>
        )}
      </div>

      {newClientOpen && (
        <NewClientDialog onClose={() => setNewClientOpen(false)} onCreated={() => router.refresh()} />
      )}
    </div>
  );
}
