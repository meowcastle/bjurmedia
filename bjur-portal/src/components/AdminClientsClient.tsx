"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NewClientDialog } from "@/components/NewClientDialog";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { Toast } from "@/components/ui/Toast";
import { ClientLogo, CLIENT_ASH } from "@/components/ClientLogo";

type ClientRow = {
  id: string;
  name: string;
  /** The Instagram or YouTube handle, or domain, the logo comes from. */
  handle: string;
  status: "ACTIVE" | "DISABLED";
  logoUrl: string | null;
  logoColor: string | null;
  logoLocked: boolean;
  /** "Instagram", "YouTube", "Website", "From email domain", "Brandfetch", "Uploaded", "Initials". */
  logoSource: string;
  projectCount: number;
  loginCount: number;
};

type Filter = "all" | "active" | "off";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "off", label: "Off" },
];

/**
 * Studio, Clients (PortalClients13). Each row is the client's logo (or initials on its
 * colour), name and handle, where the logo came from, counts and status. The row opens
 * the client; logins and Disable live on the client page. The row menu carries the two
 * logo actions: "Replace logo" (a hand upload, which the monthly job then leaves alone)
 * and "Refresh logo" (unlock and look again on the worker's next tick).
 */
export function AdminClientsClient({ clients, projectTotal }: { clients: ClientRow[]; projectTotal: number }) {
  const router = useRouter();
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [toast, setToast] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<ClientRow | null>(null);

  const shown = clients.filter((c) =>
    filter === "all" ? true : filter === "active" ? c.status === "ACTIVE" : c.status !== "ACTIVE"
  );

  async function replaceLogo(file: File) {
    const c = uploadFor.current;
    if (!c) return;
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/admin/clients/${c.id}/logo`, { method: "POST", body });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setToast(data.error ?? "That logo didn't upload. Try a PNG, JPG or SVG.");
      return;
    }
    setToast(`Logo replaced for ${c.name}`);
    router.refresh();
  }

  async function refreshLogo(c: ClientRow) {
    const res = await fetch(`/api/admin/clients/${c.id}/logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    });
    setToast(res.ok ? `Looking for a new logo for ${c.name}` : "Couldn't refresh the logo. Try again.");
    if (res.ok) router.refresh();
  }

  return (
    <div className="bj-adm bjfade">
      <section className="bj-adm-top">
        <div>
          <span className="bj-mono">
            {clients.length} client{clients.length === 1 ? "" : "s"} · {projectTotal} project
            {projectTotal === 1 ? "" : "s"}
          </span>
          <h1 className="bj-big">Clients.</h1>
        </div>
        <div className="acts">
          <button type="button" className="bj-cta" onClick={() => setNewClientOpen(true)}>
            + New client
          </button>
        </div>
      </section>

      <div className="bj-filters" role="group" aria-label="Show clients">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? "on" : undefined}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        // No scroll wrapper here: it would clip the row menu, and with the logo column
        // dropped on a phone and the name truncating, the table fits at 360px anyway.
        <div>
          <table className="bj-tbl bj-ctbl">
            <thead>
              <tr>
                <th>Client</th>
                <th className="hide">Logo + colour</th>
                <th>Projects</th>
                <th className="hide">Logins</th>
                <th className="r">Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const active = c.status === "ACTIVE";
                const colour = c.logoColor ?? CLIENT_ASH;
                return (
                  <tr
                    key={c.id}
                    data-testid={`client-row-${c.id}`}
                    className={`row bj-acc${active ? "" : " off"}`}
                    style={{ "--acc": colour } as React.CSSProperties}
                    onClick={() => router.push(`/admin/clients/${c.id}`)}
                  >
                    <td>
                      <div className="bj-cname">
                        <ClientLogo client={c} size={40} />
                        <div>
                          <Link href={`/admin/clients/${c.id}`}>
                            <b>{c.name}</b>
                          </Link>
                          <span className="bj-mono">{c.handle}</span>
                        </div>
                      </div>
                    </td>
                    <td className="hide">
                      <span className="bj-src">
                        <i style={{ background: colour }} />
                        <span className="bj-mono">{c.logoSource}</span>
                      </span>
                    </td>
                    <td className="num">{c.projectCount}</td>
                    <td className="num hide">{c.loginCount}</td>
                    <td className="r">
                      {active ? (
                        <span className="bj-mono bj-status-on">
                          <span className="bj-dot ok" />
                          <span className="bj-status-word">Active</span>
                        </span>
                      ) : (
                        <span className="bj-mono">Off</span>
                      )}
                    </td>
                    <td className="menu" onClick={(e) => e.stopPropagation()}>
                      <RowMenu label={`Actions for ${c.name}`}>
                        {(close) => (
                          <>
                            <RowMenuItem
                              onClick={() => {
                                uploadFor.current = c;
                                fileInput.current?.click();
                                close();
                              }}
                            >
                              Replace logo
                            </RowMenuItem>
                            <RowMenuItem
                              onClick={() => {
                                refreshLogo(c);
                                close();
                              }}
                            >
                              Refresh logo
                            </RowMenuItem>
                          </>
                        )}
                      </RowMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="bj-adm-empty">
          {clients.length === 0 ? "No clients yet." : filter === "off" ? "No clients are off." : "No active clients."}
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) replaceLogo(file);
        }}
      />

      {newClientOpen && (
        <NewClientDialog onClose={() => setNewClientOpen(false)} onCreated={() => router.refresh()} />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
