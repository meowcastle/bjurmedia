"use client";

import { useState } from "react";

type Config = {
  youtubeApiKey: string;
  weeklyDay: string;
  weeklyTime: string;
  autoWeekly: boolean;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      className={`w-10 h-[22px] border border-line2 relative cursor-pointer flex-none ${on ? "bg-accent" : "bg-s3"}`}
    >
      <div
        className="w-4 h-4 bg-bg absolute top-[2px] transition-transform"
        style={{ transform: on ? "translateX(20px)" : "translateX(2px)" }}
      />
    </div>
  );
}

export function AdminSocialIntegrationsClient({ initialConfig }: { initialConfig: Config }) {
  const [config, setConfig] = useState(initialConfig);
  const [keyDraft, setKeyDraft] = useState(initialConfig.youtubeApiKey);

  async function patch(fields: Partial<Config>) {
    setConfig((c) => ({ ...c, ...fields }));
    await fetch("/api/admin/social", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  }

  return (
    <div className="px-10 pb-12 max-w-[820px] mx-auto -mt-6">
      <div className="mb-5">
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
          Weekly insights
        </div>
        <h1 className="text-[26px] tracking-tight font-black">Instagram &amp; YouTube views</h1>
      </div>

      <div className="border border-line bg-s1 p-5 mb-5">
        <div className="text-[10.5px] tracking-wide uppercase text-muted font-bold mb-3">
          YouTube API key
        </div>
        <div className="flex gap-2.5">
          <input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="AIza…"
            className="flex-1 bg-bg border border-line2 text-text text-[13px] font-mono px-3.5 py-2.5 outline-none focus:border-accent"
          />
          <button
            onClick={() => patch({ youtubeApiKey: keyDraft.trim() })}
            className="cursor-pointer text-xs font-semibold text-bg bg-accent hover:bg-accentb px-4 py-2.5"
          >
            Save
          </button>
        </div>
        <div className="text-xs text-dim mt-2.5">
          A single Data API key covers every linked channel — view counts on public
          videos don&apos;t need per-channel OAuth. Instagram tokens are entered per
          client on that client&apos;s page (needs per-account access).
        </div>
      </div>

      <div className="border border-line bg-s1 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-semibold">Weekly sync</div>
            <div className="text-xs text-muted mt-0.5">
              Refreshes view counts and matches new posts for every linked account
            </div>
            {config.autoWeekly && (
              <div className="flex items-center gap-2 mt-3">
                <select
                  defaultValue={config.weeklyDay}
                  onChange={(e) => patch({ weeklyDay: e.target.value })}
                  className="bg-bg border border-line2 text-text text-[13px] px-2.5 py-1.5 outline-none"
                >
                  {DAYS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <span className="text-xs text-dim">at</span>
                <input
                  defaultValue={config.weeklyTime}
                  onBlur={(e) => patch({ weeklyTime: e.target.value })}
                  className="w-20 bg-bg border border-line2 text-text text-[13px] font-mono px-2.5 py-1.5 outline-none"
                />
              </div>
            )}
          </div>
          <Toggle on={config.autoWeekly} onChange={() => patch({ autoWeekly: !config.autoWeekly })} />
        </div>
      </div>
    </div>
  );
}
