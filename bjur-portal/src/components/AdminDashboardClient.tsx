"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { NewClientDialog } from "@/components/NewClientDialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";

type Stat = { value: string; label: string };
type ActivityRow = { id: string; who: string; action: string; when: string; dot: string };
type ExpiringRow = { id: string; title: string; client: string; expires: string };
type DeliveryRow = {
  id: string;
  title: string;
  client: string;
  count: string;
  delivered: string;
  statusColor: string;
};
type ClientOption = { id: string; name: string; type: "RETAINER" | "ONEOFF" };

export function AdminDashboardClient({
  dateLabel,
  stats,
  workerOnline,
  queueCount,
  failedCount,
  activity,
  expiring,
  recentDeliveries,
  clients,
}: {
  dateLabel: string;
  stats: Stat[];
  workerOnline: boolean;
  queueCount: number;
  failedCount: number;
  activity: ActivityRow[];
  expiring: ExpiringRow[];
  recentDeliveries: DeliveryRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"client" | "project" | null>(null);

  return (
    <div className="px-10 py-10 max-w-[1400px] mx-auto bjfade">
      <div className="flex items-end justify-between gap-5 flex-wrap mb-7">
        <div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
            {dateLabel}
          </div>
          <h1 className="text-4xl tracking-tight font-black">Dashboard</h1>
        </div>
        <div className="flex gap-2.5">
          <Button variant="secondary" onClick={() => setDialog("client")}>
            + Client
          </Button>
          <Button onClick={() => setDialog("project")}>+ New project</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-3.5">
        {stats.map((s) => (
          <div key={s.label} className="bg-s1 border border-line p-5">
            <div className="text-[34px] font-black tracking-tight tabular-nums">{s.value}</div>
            <div className="text-[11px] tracking-wide uppercase text-muted font-semibold mt-1.5">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 bg-s1 border border-line px-5 py-4 mb-7">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${workerOnline ? "bg-success" : "bg-dim"}`} />
          <span className="text-[13px] text-muted">
            ffmpeg worker {workerOnline ? "online" : "offline"} · 1 process
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] text-muted">Proxies in queue</span>
          <span className={`text-lg font-black tabular-nums ${queueCount > 0 ? "text-accentb" : "text-text"}`}>
            {queueCount}
          </span>
          <span className="w-px h-4 bg-line2 mx-1" />
          <span className="text-[13px] text-muted">Failed</span>
          <Link
            href="/admin/media"
            className={`text-lg font-black tabular-nums ${failedCount > 0 ? "text-accent" : "text-text"}`}
          >
            {failedCount}
          </Link>
          <Link
            href="/admin/library"
            className="text-xs font-semibold text-muted hover:text-text border border-line2 hover:border-text px-3 py-1.5 ml-1.5"
          >
            Import library →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-5 items-start mb-7">
        <div className="border border-line">
          <div className="px-5 py-3.5 border-b-2 border-line2 text-[11px] tracking-wide uppercase text-muted font-bold">
            Recent activity
          </div>
          {activity.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-5 py-3.5 border-b border-line last:border-b-0">
              <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-none" style={{ background: a.dot }} />
              <div className="flex-1 min-w-0 text-[13px]">
                <span className="font-bold">{a.who}</span> {a.action}
              </div>
              <span className="text-[11px] text-dim whitespace-nowrap">{a.when}</span>
            </div>
          ))}
          {activity.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted">No activity yet.</div>
          )}
        </div>
        <div className="border border-line">
          <div className="px-5 py-3.5 border-b-2 border-line2 text-[11px] tracking-wide uppercase text-muted font-bold">
            Expiring soon
          </div>
          {expiring.map((e) => (
            <div key={e.id} className="px-5 py-3.5 border-b border-line last:border-b-0">
              <div className="text-[13px] font-semibold truncate">{e.title}</div>
              <div className="text-xs text-muted mt-1">
                {e.client} · <span className="text-accentb">{e.expires}</span>
              </div>
            </div>
          ))}
          {expiring.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted">Nothing expiring.</div>
          )}
        </div>
      </div>

      <div className="border border-line">
        <div
          className="grid gap-4 px-5 py-3.5 border-b-2 border-line2 text-[10.5px] tracking-wide uppercase text-muted font-bold"
          style={{ gridTemplateColumns: "2.2fr 1.4fr 1fr 1.1fr" }}
        >
          <span>Recent delivery</span>
          <span>Client</span>
          <span>Files</span>
          <span className="text-right">Delivered</span>
        </div>
        {recentDeliveries.map((r) => (
          <div
            key={r.id}
            className="grid gap-4 px-5 py-4 border-b border-line last:border-b-0 items-center"
            style={{ gridTemplateColumns: "2.2fr 1.4fr 1fr 1.1fr" }}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: r.statusColor }} />
              <span className="text-sm font-semibold">{r.title}</span>
            </div>
            <span className="text-[13px] text-muted">{r.client}</span>
            <span className="text-[13px] text-muted">{r.count}</span>
            <span className="text-[13px] text-muted text-right">{r.delivered}</span>
          </div>
        ))}
        {recentDeliveries.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted">No projects yet.</div>
        )}
      </div>

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
