"use client";

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
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[1100px] mx-auto bjfade print:px-0 print:py-0 print:max-w-none">
      <div className="print:hidden mb-6">
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">Reports</div>
        <h1 className="text-[34px] tracking-tight font-black mb-6">Client Attribution</h1>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] tracking-wide uppercase text-muted font-semibold">Client</span>
          <select
            value={selectedClientId ?? ""}
            onChange={(e) => e.target.value && navigate(e.target.value, fromDraft, toDraft)}
            className="bg-bg border border-line2 px-3.5 py-2.5 text-[13px] text-text outline-none"
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
              <span className="text-[11px] tracking-wide uppercase text-muted font-semibold ml-2">From</span>
              <input
                type="date"
                value={fromDraft}
                onChange={(e) => setFromDraft(e.target.value)}
                onBlur={() => navigate(selectedClientId, fromDraft, toDraft)}
                className="bg-bg border border-line2 px-2.5 py-2 text-[13px] text-text outline-none focus:border-accent"
              />
              <span className="text-[11px] tracking-wide uppercase text-muted font-semibold">To</span>
              <input
                type="date"
                value={toDraft}
                onChange={(e) => setToDraft(e.target.value)}
                onBlur={() => navigate(selectedClientId, fromDraft, toDraft)}
                className="bg-bg border border-line2 px-2.5 py-2 text-[13px] text-text outline-none focus:border-accent"
              />
              <button
                onClick={() => window.print()}
                className="cursor-pointer text-[11px] font-semibold text-bg bg-accent hover:bg-accentb px-3.5 py-2.5 ml-auto"
              >
                Print / Save as PDF
              </button>
            </>
          )}
        </div>
      </div>

      {!report && (
        <div className="border border-line px-6 py-16 text-center">
          <div className="text-sm text-muted">Select a client to generate an attribution report.</div>
        </div>
      )}

      {report && (
        <div className="report-print-scope">
          <div className="border-t-4 mb-6" style={{ borderColor: accent }}>
            <div className="pt-6">
              <div className="text-[11px] tracking-[0.2em] uppercase font-bold mb-2" style={{ color: accent }}>
                Bjur Media · Attribution Report
              </div>
              <h2 className="text-[28px] font-black tracking-tight mb-1">{report.clientName}</h2>
              <div className="text-[13px] text-muted">
                {formatDate(report.from)} – {formatDate(report.to)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-8">
            {FORMATS.map((fmt) => (
              <div key={fmt} className="bg-s1 border border-line px-4 py-4">
                <div className="text-[26px] font-black tracking-tight tabular-nums">{report.totalsByFormat[fmt] ?? 0}</div>
                <div className="text-[11px] tracking-wide uppercase text-muted font-semibold mt-1">{fmt}s delivered</div>
              </div>
            ))}
            <div className="bg-s1 border border-line px-4 py-4">
              <div className="text-[26px] font-black tracking-tight tabular-nums">{Math.round(report.publishRate * 100)}%</div>
              <div className="text-[11px] tracking-wide uppercase text-muted font-semibold mt-1">Publish rate</div>
            </div>
          </div>

          {report.platformStats.length > 0 && (
            <div className="mb-8">
              <div className="text-[13px] font-extrabold uppercase tracking-wide mb-3">Performance by platform</div>
              <div className="border border-line">
                <div
                  className="hidden md:grid gap-4 px-5 py-3 border-b-2 border-line2 text-[10.5px] tracking-wide uppercase text-muted font-bold"
                  style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}
                >
                  <span>Platform</span>
                  <span>Posts</span>
                  <span>Total views</span>
                  <span>Median views</span>
                </div>
                {report.platformStats.map((p) => (
                  <div
                    key={p.platform}
                    className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 px-5 py-3.5 border-b border-line last:border-b-0 text-[13px]"
                  >
                    <span className="font-semibold">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                    <span className="text-muted">{p.postCount}</span>
                    <span className="text-muted tabular-nums">{formatViews(p.totalViews)}</span>
                    <span className="text-muted tabular-nums">{formatViews(Math.round(p.medianViews))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.topAssets.length > 0 && (
            <div className="mb-8">
              <div className="text-[13px] font-extrabold uppercase tracking-wide mb-3">Top performing content</div>
              <div className="border border-line">
                {report.topAssets.map((a) => (
                  <div key={a.id} className="flex items-center gap-3.5 px-5 py-3.5 border-b border-line last:border-b-0">
                    <div className="w-14 h-14 bg-s3 flex-none overflow-hidden">
                      {a.thumbRelPath && (
                        // eslint-disable-next-line @next/next/no-img-element -- proxied binary, not a static asset Next can optimize
                        <img src={`/api/assets/${a.id}/thumb`} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{a.name}</div>
                      <div className="text-[11px] text-dim">{a.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(" · ")}</div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="text-[15px] font-black tabular-nums">{formatViews(a.totalViews)}</div>
                      {a.permalink && (
                        <a
                          href={a.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-accentb print:hidden"
                        >
                          View post ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.weeklyTrend.length > 1 && (
            <div>
              <div className="text-[13px] font-extrabold uppercase tracking-wide mb-3">Weekly trend</div>
              <WeeklyTrendChart weeks={report.weeklyTrend} accent={accent} />
            </div>
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
    <div className="border border-line px-5 py-5 flex flex-col gap-5">
      <BarRow label="Delivered" weeks={weeks} valueOf={(w) => w.delivered} max={maxDelivered} format={String} accent={accent} />
      <BarRow label="Views" weeks={weeks} valueOf={(w) => w.views} max={maxViews} format={formatViews} accent={accent} />
      <div className="flex gap-2 text-[10px] text-dim">
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
      <div className="text-[10px] tracking-wide uppercase text-dim font-bold mb-1.5">{label}</div>
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
