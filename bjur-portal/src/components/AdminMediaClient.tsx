"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gradientFor } from "@/lib/gradients";

type Asset = {
  id: string;
  name: string;
  kind: "PHOTO" | "VIDEO";
  format: string;
  size: string;
  proxyStatus: "PENDING" | "GENERATING" | "READY" | "FAILED";
  internal: boolean;
  licensable: boolean;
  basePrice: number | null;
  weekOf: string | null;
};

type ProjectOption = { id: string; title: string; clientName: string };

const STATUS_MAP: Record<Asset["proxyStatus"], { label: string; color: string }> = {
  READY: { label: "Ready", color: "#2ec36b" },
  GENERATING: { label: "Generating…", color: "var(--accentb)" },
  PENDING: { label: "Queued", color: "var(--muted)" },
  FAILED: { label: "Failed", color: "var(--accent)" },
};

export function AdminMediaClient({
  projects,
  selectedProjectId,
  assets,
}: {
  projects: ProjectOption[];
  selectedProjectId: string;
  assets: Asset[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(assets);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [weekOfDrafts, setWeekOfDrafts] = useState<Record<string, string>>({});

  // Switching projects is a client-side navigation (router.push), not a full reload —
  // useState's initial value only applies on first mount, so without this the table
  // silently keeps showing whichever project happened to load first and never
  // updates, even though selectedProjectId and the assets prop both change correctly.
  // Adjusting state during render (React's own pattern for this) instead of an effect
  // avoids an extra render pass.
  const [prevProjectId, setPrevProjectId] = useState(selectedProjectId);
  if (selectedProjectId !== prevProjectId) {
    setPrevProjectId(selectedProjectId);
    setRows(assets);
    setPriceDrafts({});
    setWeekOfDrafts({});
  }

  const ready = rows.filter((a) => a.proxyStatus === "READY").length;
  const generating = rows.filter((a) => a.proxyStatus === "GENERATING" || a.proxyStatus === "PENDING").length;
  const failed = rows.filter((a) => a.proxyStatus === "FAILED").length;

  function selectProject(id: string) {
    router.push(`/admin/media?project=${id}`);
  }

  async function toggleInternal(a: Asset) {
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, internal: !r.internal } : r)));
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internal: !a.internal }),
    });
  }

  async function toggleLicensable(a: Asset) {
    const next = !a.licensable;
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, licensable: next } : r)));
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licensable: next }),
    });
  }

  async function savePrice(a: Asset) {
    const raw = priceDrafts[a.id];
    if (raw === undefined) return;
    const price = raw === "" ? null : Number(raw);
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, basePrice: price } : r)));
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basePrice: price }),
    });
  }

  async function saveWeekOf(a: Asset) {
    const raw = weekOfDrafts[a.id];
    if (raw === undefined) return;
    const weekOf = raw === "" ? null : new Date(raw).toISOString();
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, weekOf } : r)));
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekOf }),
    });
  }

  async function retry(a: Asset) {
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, proxyStatus: "PENDING" } : r)));
    await fetch(`/api/admin/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retry: true }),
    });
  }

  return (
    <div className="px-10 py-12 max-w-[1400px] mx-auto bjfade">
      <div className="mb-6">
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">Pipeline</div>
        <h1 className="text-[34px] tracking-tight font-black">Media</h1>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-[11px] tracking-wide uppercase text-muted font-semibold">Project</span>
        <select
          value={selectedProjectId}
          onChange={(e) => selectProject(e.target.value)}
          className="bg-bg border border-line2 px-3.5 py-2.5 text-[13px] text-text outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.clientName} — {p.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-5 gap-3.5 mb-6">
        <div className="bg-s1 border border-line px-4 py-4">
          <div className="text-[26px] font-black tracking-tight tabular-nums">{rows.length}</div>
          <div className="text-[11px] tracking-wide uppercase text-muted font-semibold mt-1">Assets</div>
        </div>
        <div className="bg-s1 border border-line px-4 py-4">
          <div className="text-[26px] font-black tracking-tight tabular-nums text-success">{ready}</div>
          <div className="text-[11px] tracking-wide uppercase text-muted font-semibold mt-1">Proxies ready</div>
        </div>
        <div className="bg-s1 border border-line px-4 py-4">
          <div className={`text-[26px] font-black tracking-tight tabular-nums ${generating ? "text-accentb" : "text-dim"}`}>
            {generating}
          </div>
          <div className="text-[11px] tracking-wide uppercase text-muted font-semibold mt-1">In queue</div>
        </div>
        <div className="bg-s1 border border-line px-4 py-4">
          <div className={`text-[26px] font-black tracking-tight tabular-nums ${failed ? "text-accent" : "text-dim"}`}>
            {failed}
          </div>
          <div className="text-[11px] tracking-wide uppercase text-muted font-semibold mt-1">Failed</div>
        </div>
        <div className="bg-s1 border border-line px-4 py-4">
          <div className="text-[26px] font-black tracking-tight tabular-nums">1</div>
          <div className="text-[11px] tracking-wide uppercase text-muted font-semibold mt-1">Workers online</div>
        </div>
      </div>

      <div className="border border-line">
        <div
          className="grid gap-3.5 px-5 py-3.5 border-b-2 border-line2 text-[10.5px] tracking-wide uppercase text-muted font-bold items-center"
          style={{ gridTemplateColumns: "56px 2.2fr 1fr 1fr 1.4fr 1.6fr" }}
        >
          <span />
          <span>File</span>
          <span>Type</span>
          <span>Size</span>
          <span>Proxy / Thumb</span>
          <span className="text-right">Action</span>
        </div>
        {rows.map((a) => {
          const status = STATUS_MAP[a.proxyStatus];
          const isMaster = a.format === "Master";
          return (
            <div
              key={a.id}
              className="grid gap-3.5 px-5 py-3.5 border-b border-line last:border-b-0 items-center"
              style={{ gridTemplateColumns: "56px 2.2fr 1fr 1fr 1.4fr 1.6fr" }}
            >
              <div className="w-14 h-[34px] relative" style={{ background: gradientFor(a.id) }}>
                {a.kind === "VIDEO" && (
                  <div className="absolute inset-0 grid place-items-center text-white text-[9px]">▶</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-mono text-text truncate">{a.name}</span>
                  {a.internal && (
                    <span className="flex-none text-[9px] font-bold tracking-wide text-muted border border-line2 px-1.5 py-0.5">
                      INTERNAL
                    </span>
                  )}
                  {a.licensable && (
                    <span className="flex-none text-[9px] font-bold tracking-wide text-accentb border border-accent/40 px-1.5 py-0.5">
                      PAYWALLED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-dim uppercase tracking-wide">Week</span>
                  <input
                    type="date"
                    defaultValue={a.weekOf ? a.weekOf.slice(0, 10) : ""}
                    onChange={(e) => setWeekOfDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                    onBlur={() => saveWeekOf(a)}
                    className={`bg-bg border text-[11px] px-1.5 py-1 outline-none focus:border-accent ${
                      a.weekOf ? "border-line2 text-text" : "border-accent/50 text-accentb"
                    }`}
                  />
                </div>
              </div>
              <span className="text-[11px] font-bold tracking-wide text-muted">{a.format.toUpperCase()}</span>
              <span className="text-[13px] text-muted tabular-nums">{a.size}</span>
              <div className="flex items-center gap-2">
                {a.proxyStatus === "GENERATING" && (
                  <span className="w-3 h-3 border-2 border-line2 border-t-accent rounded-full bjspin inline-block" />
                )}
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: status.color }} />
                <span className="text-xs font-semibold" style={{ color: status.color }}>
                  {status.label}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex gap-2 items-center justify-end">
                  <button
                    onClick={() => toggleInternal(a)}
                    className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5 whitespace-nowrap"
                  >
                    {a.internal ? "Show client" : "Hide"}
                  </button>
                  {(a.proxyStatus === "FAILED" || a.proxyStatus === "PENDING") && (
                    <button
                      onClick={() => retry(a)}
                      className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5"
                    >
                      Retry
                    </button>
                  )}
                </div>
                {isMaster && (
                  <div className="flex gap-2 items-center justify-end">
                    <button
                      onClick={() => toggleLicensable(a)}
                      className={`cursor-pointer text-[11px] font-semibold px-2.5 py-1.5 border ${
                        a.licensable ? "text-accentb border-accent/40" : "text-muted border-line2 hover:text-text hover:border-text"
                      }`}
                    >
                      {a.licensable ? "Licensable" : "License off"}
                    </button>
                    {a.licensable && (
                      <input
                        defaultValue={a.basePrice ?? ""}
                        onChange={(e) => setPriceDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                        onBlur={() => savePrice(a)}
                        placeholder="Base $"
                        className="w-20 bg-bg border border-line2 text-text text-[11px] px-2 py-1.5 outline-none focus:border-accent"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted">No assets in this project yet.</div>
        )}
      </div>
    </div>
  );
}
