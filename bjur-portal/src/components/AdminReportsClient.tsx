"use client";

import { FadeImg } from "@/components/ui/FadeImg";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatViews } from "@/lib/format";

type PlatformStat = { platform: string; totalViews: number; medianViews: number; postCount: number };
type TopAsset = {
  id: string;
  name: string;
  format: string;
  thumbRelPath: string | null;
  totalViews: number;
  platforms: string[];
  permalink: string | null;
};
type WeekBucket = { weekStart: string; delivered: number; views: number };
type ReportData = {
  clientName: string;
  accentColor: string | null;
  from: string;
  to: string;
  totalAssets: number;
  totalsByFormat: Record<string, number>;
  publishRate: number;
  platformStats: PlatformStat[];
  topAssets: TopAsset[];
  weeklyTrend: WeekBucket[];
};

const PLATFORM_LABEL: Record<string, string> = { INSTAGRAM: "Instagram", YOUTUBE: "YouTube" };
const DEFAULT_ACCENT = "#ec3013";
const FORMATS = ["Reel", "Film", "Still"] as const;

export function AdminReportsClient({
  clients,
  selectedClientId,
  report,
}: {
  clients: { id: string; name: string }[];
  selectedClientId: string | null;
  report: ReportData | null;
}) {
  const router = useRouter();
  const [fromDraft, setFromDraft] = useState(report ? report.from.slice(0, 10) : "");
  const [toDraft, setToDraft] = useState(report ? report.to.slice(0, 10) : "");

  function navigate(clientId: string, from: string, to: string) {
    const params = new URLSearchParams();
    params.set("client", clientId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/admin/reports?${params.toString()}`);
  }

  const accent = report?.accentColor ?? DEFAULT_ACCENT;

  return (
    <div className="bj-adm bjfade print:px-0 print:py-0 print:max-w-none">
      <div className="print:hidden">
        <section className="bj-adm-top">
          <div>
            <span className="bj-mono">Attribution · {clients.length} client{clients.length === 1 ? "" : "s"}</span>
            <h1 className="bj-big">Reports.</h1>
          </div>
        </section>

        <section className="bj-sx">
        <span className="bj-mono bj-lab">Report on</span>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="bj-mono">Client</span>
          <select
            aria-label="Client"
            value={selectedClientId ?? ""}
            onChange={(e) => e.target.value && navigate(e.target.value, fromDraft, toDraft)}
            className="bj-in"
          >
            <option value="" disabled>
              Select a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {selectedClientId && report && (
            <>
              <span className="bj-mono ml-2">From</span>
              <input
                aria-label="From"
                type="date"
                value={fromDraft}
                onChange={(e) => setFromDraft(e.target.value)}
                onBlur={() => navigate(selectedClientId, fromDraft, toDraft)}
                className="bj-in"
              />
              <span className="bj-mono">To</span>
              <input
                aria-label="To"
                type="date"
                value={toDraft}
                onChange={(e) => setToDraft(e.target.value)}
                onBlur={() => navigate(selectedClientId, fromDraft, toDraft)}
                className="bj-in"
              />
              <button type="button" onClick={() => window.print()} className="bj-cta ml-auto">
                Print / Save as PDF
              </button>
            </>
          )}
        </div>
        </section>
      </div>

      {!report && (
        <section className="bj-sx">
          <span className="bj-mono bj-lab">Report</span>
          <p className="bj-adm-empty">Select a client to generate an attribution report.</p>
        </section>
      )}

      {report && (
        <div className="report-print-scope">
          <div className="border-t-[3px] mb-6" style={{ borderColor: accent }}>
            <div className="pt-6">
              <div className="bj-mono mb-3">Bjur · Attribution report</div>
              <h2 className="bj-mid mb-2">{report.clientName}</h2>
              <div className="bj-mono">
                {formatDate(report.from)} – {formatDate(report.to)}
              </div>
            </div>
          </div>

          <div className="bj-stats mb-8">
            {FORMATS.map((fmt) => (
              <div key={fmt} data-testid="report-tile">
                <b>{report.totalsByFormat[fmt] ?? 0}</b>
                <span className="bj-mono">{fmt}s delivered</span>
              </div>
            ))}
            <div data-testid="report-tile">
              <b>{Math.round(report.publishRate * 100)}%</b>
              <span className="bj-mono" title="Files that went live">
                Publish rate
              </span>
            </div>
          </div>

          {report.platformStats.length > 0 && (
            <section className="bj-sx">
              <span className="bj-mono bj-lab">Performance by platform</span>
              <div className="bj-tblw">
                <table className="bj-tbl">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Posts</th>
                      <th>Total views</th>
                      <th className="hide r">Median views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.platformStats.map((p) => (
                      <tr key={p.platform}>
                        <td className="font-semibold">{PLATFORM_LABEL[p.platform] ?? p.platform}</td>
                        <td className="num">{p.postCount}</td>
                        <td className="num">{formatViews(p.totalViews)}</td>
                        <td className="num hide r">{formatViews(Math.round(p.medianViews))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {report.topAssets.length > 0 && (
            <section className="bj-sx">
              <span className="bj-mono bj-lab">Top performing content</span>
              <div>
                {report.topAssets.map((a) => (
                  <div key={a.id} className="flex items-center gap-3.5 py-3.5 border-b border-line">
                    <div className="w-16 h-10 bg-s2 flex-none overflow-hidden relative">
                      {a.thumbRelPath && (
                        <FadeImg src={`/api/assets/${a.id}/thumb`} className="absolute inset-0 w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold truncate">{a.name}</div>
                      <div className="bj-mono mt-1">{a.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(" · ")}</div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="bj-mono ink">{formatViews(a.totalViews)}</div>
                      {a.permalink && (
                        <a
                          href={a.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="bj-link print:hidden"
                        >
                          View post ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {report.weeklyTrend.length > 1 && (
            <section className="bj-sx">
              <span className="bj-mono bj-lab">Weekly trend</span>
              <WeeklyTrendChart weeks={report.weeklyTrend} accent={accent} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function WeeklyTrendChart({ weeks, accent }: { weeks: WeekBucket[]; accent: string }) {
  const maxDelivered = Math.max(1, ...weeks.map((w) => w.delivered));
  const maxViews = Math.max(1, ...weeks.map((w) => w.views));

  return (
    <div className="flex flex-col gap-5 min-w-0">
      <BarRow label="Delivered" weeks={weeks} valueOf={(w) => w.delivered} max={maxDelivered} format={String} accent={accent} />
      <BarRow label="Views" weeks={weeks} valueOf={(w) => w.views} max={maxViews} format={formatViews} accent={accent} />
      <div className="flex gap-2 bj-mono" style={{ fontSize: 10 }}>
        {weeks.map((w) => (
          <div key={w.weekStart} className="flex-1 text-center truncate">
            {formatDate(w.weekStart)}
          </div>
        ))}
      </div>
    </div>
  );
}

function BarRow({
  label,
  weeks,
  valueOf,
  max,
  format,
  accent,
}: {
  label: string;
  weeks: WeekBucket[];
  valueOf: (w: WeekBucket) => number;
  max: number;
  format: (v: number) => string;
  accent: string;
}) {
  return (
    <div>
      <div className="bj-mono mb-1.5">{label}</div>
      <div className="flex items-end gap-2 h-20">
        {weeks.map((w) => {
          const v = valueOf(w);
          const heightPct = Math.max(2, (v / max) * 100);
          return (
            <div key={w.weekStart} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="text-[9px] text-dim mb-1 tabular-nums">{v > 0 ? format(v) : ""}</div>
              <div className="w-full" style={{ height: `${heightPct}%`, background: accent }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
