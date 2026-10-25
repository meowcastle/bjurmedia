"use client";

import { CountUp } from "@/components/ui/CountUp";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NewClientDialog } from "@/components/NewClientDialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { ClientLogo, type ClientMark } from "@/components/ClientLogo";

type ActivityRow = { id: string; who: string; action: string; when: string };
type DeliveryRow = {
  id: string;
  title: string;
  client: ClientMark;
  coverAssetId: string | null;
  count: string;
  delivered: string;
};
type ClientOption = { id: string; name: string; hasSlackChannel: boolean };
type SystemState = {
  /** The Slack workspace when connected, null when not. */
  slack: string | null;
  socialAccounts: number;
  socialErrors: string[];
  /** Free space on the media volume, null where it can't be read. */
  storageFree: string | null;
};

type AttentionRow = {
  id: string;
  kind: "expiry" | "unscheduled" | "cut-ready" | "notes-in" | "approved" | "landed" | "caption-edited" | "drafts";
  subject: string;
  body: string;
  client: ClientMark | null;
  href: string;
  action: string;
};

/**
 * Studio, Today (PortalAdmin13). The date and "Today.", four numbers, then the label-grid
 * sections: what needs you, what happened, and the latest projects.
 */
export function AdminDashboardClient({
  dateLine,
  activeClients,
  attention,
  workerOnline,
  queueCount,
  failedCount,
  failedHref,
  activity,
  recentDeliveries,
  clients,
  system,
}: {
  dateLine: string;
  activeClients: number;
  attention: AttentionRow[];
  workerOnline: boolean;
  queueCount: number;
  failedCount: number;
  failedHref: string | null;
  activity: ActivityRow[];
  recentDeliveries: DeliveryRow[];
  clients: ClientOption[];
  system: SystemState;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"client" | "project" | null>(null);

  return (
    <div className="bj-adm bjfade">
      <section className="bj-adm-top">
        <div>
          <span className="bj-mono">{dateLine}</span>
          <h1 className="bj-big">Today.</h1>
        </div>
        <div className="acts">
          <button type="button" className="bj-ghost" onClick={() => setDialog("client")}>
            + Client
          </button>
          <button type="button" className="bj-cta" onClick={() => setDialog("project")}>
            + New project
          </button>
        </div>
      </section>

      <div className="bj-stats">
        <div>
          <b>
            <CountUp value={activeClients} />
          </b>
          <span className="bj-mono">Active clients</span>
        </div>
        <div>
          <b className={attention.length > 0 ? "red" : undefined}>
            <CountUp value={attention.length} />
          </b>
          <span className="bj-mono">Needs you</span>
        </div>
        <div>
          <b>
            <CountUp value={queueCount} />
            {failedCount > 0 && failedHref && (
              <Link href={failedHref} className="bj-stats-fail">
                {failedCount} failed
              </Link>
            )}
          </b>
          <span className="bj-mono">In the queue</span>
        </div>
        <div>
          <b className={workerOnline ? "ok" : "off"}>{workerOnline ? "On" : "Off"}</b>
          <span className="bj-mono">Worker · {workerOnline ? "online" : "offline"}</span>
        </div>
      </div>

      {attention.length > 0 && (
        <section className="bj-sx">
          <span className="bj-mono bj-lab">Needs you</span>
          <div>
            {attention.map((a) => (
              <div key={a.id} data-testid={`attention-${a.kind}`} className="bj-att">
                <div>
                  <b className="bj-cl">
                    {a.client && <ClientLogo client={a.client} size={22} />}
                    <span>{a.subject}</span>
                    <span className="bj-dot red" aria-hidden />
                  </b>
                  {/* A client's note is the whole reason the row is here, so it reads as
                      prose. Everything else is a one-line summary in mono. */}
                  <span className={a.kind === "notes-in" ? "bj-att-note" : "bj-mono"}>{a.body}</span>
                </div>
                <Link href={a.href} className="bj-cta">
                  {a.action} <i aria-hidden>→</i>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bj-sx">
        <span className="bj-mono bj-lab">Activity</span>
        <div className="bj-two">
          {activity.length > 0 ? (
            <ul className="bj-feed">
              {activity.map((a) => (
                <li key={a.id}>
                  <span>
                    <b>{a.who}</b> {a.action}
                  </span>
                  <span className="bj-mono">{a.when}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bj-adm-empty">No activity yet.</p>
          )}
          <div>
            <span className="bj-mono ink">System</span>
            <div className="bj-sys">
              <div>
                <span>Worker</span>
                <span className="bj-mono">
                  <span className={`bj-dot${workerOnline ? " ok" : ""}`} />
                  {workerOnline ? "Online" : "Offline"} · {queueCount} queued
                </span>
              </div>
              <div>
                <span>Slack</span>
                {system.slack ? (
                  <span className="bj-mono">
                    <span className="bj-dot ok" />
                    {system.slack}
                  </span>
                ) : (
                  <Link className="bj-link" href="/admin/integrations">
                    Connect Slack
                  </Link>
                )}
              </div>
              <div>
                <span>Social insights</span>
                {system.socialErrors.length > 0 ? (
                  <Link
                    className="bj-mono bj-sys-err"
                    href="/admin/integrations"
                    title={system.socialErrors.join("\n")}
                  >
                    <span className="bj-dot red" />
                    {system.socialErrors.length} sync failed
                  </Link>
                ) : system.socialAccounts > 0 ? (
                  <span className="bj-mono">
                    <span className="bj-dot ok" />
                    {system.socialAccounts} account{system.socialAccounts === 1 ? "" : "s"}
                  </span>
                ) : (
                  <Link className="bj-link" href="/admin/integrations">
                    Connect an account
                  </Link>
                )}
              </div>
              {system.storageFree && (
                <div>
                  <span>Storage</span>
                  <span className="bj-mono">{system.storageFree} free</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bj-sx">
        <span className="bj-mono bj-lab">Recent projects</span>
        {recentDeliveries.length > 0 ? (
          <div className="bj-tblw">
            <table className="bj-tbl">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th className="hide">Files</th>
                  <th className="r">Delivered</th>
                </tr>
              </thead>
              <tbody>
                {recentDeliveries.map((r) => (
                  <tr key={r.id} className="row" onClick={() => router.push(`/admin/projects/${r.id}`)}>
                    <td>
                      <div className="bj-thumbs">
                        {r.coverAssetId ? (
                          // eslint-disable-next-line @next/next/no-img-element -- auth-gated thumbnail route
                          <img src={`/api/assets/${r.coverAssetId}/thumb`} alt="" loading="lazy" />
                        ) : (
                          <span className="ph" aria-hidden />
                        )}
                        <div className="t">
                          <Link href={`/admin/projects/${r.id}`}>
                            <b>{r.title}</b>
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="bj-cl">
                        <ClientLogo client={r.client} size={20} />
                        <span className="bj-mono">{r.client.name}</span>
                      </span>
                    </td>
                    <td className="num hide">{r.count}</td>
                    <td className="num r">{r.delivered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="bj-adm-empty">No projects yet.</p>
        )}
      </section>

      {dialog === "client" && (
        <NewClientDialog onClose={() => setDialog(null)} onCreated={() => router.refresh()} />
      )}
      {dialog === "project" && (
        <NewProjectDialog
          clients={clients}
          onClose={() => setDialog(null)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}
