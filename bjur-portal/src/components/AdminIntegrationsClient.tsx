"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Config = {
  connected: boolean;
  webhookUrl: string;
  defaultChannel: string;
  weeklyDay: string;
  weeklyTime: string;
  autoWeekly: boolean;
  autoUpload: boolean;
  autoDownload: boolean;
  autoLicense: boolean;
};

type ClientRow = { id: string; name: string; channel: string };

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

export function AdminIntegrationsClient({
  initialConfig,
  clientRows,
}: {
  initialConfig: Config;
  clientRows: ClientRow[];
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [webhookDraft, setWebhookDraft] = useState(initialConfig.webhookUrl);
  const [channels, setChannels] = useState(clientRows);
  const [testMsg, setTestMsg] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function patch(fields: Partial<Config>) {
    setConfig((c) => ({ ...c, ...fields }));
    await fetch("/api/admin/slack", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  }

  async function connect() {
    if (!webhookDraft.trim()) return;
    setConnecting(true);
    await patch({ connected: true, webhookUrl: webhookDraft.trim() });
    setConnecting(false);
    router.refresh();
  }

  async function disconnect() {
    await patch({ connected: false });
    router.refresh();
  }

  async function sendTest() {
    setTestMsg("Sending…");
    const res = await fetch("/api/admin/slack/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setTestMsg(res.ok ? `Posted to ${config.defaultChannel} ✓` : (data.error ?? "Failed."));
  }

  async function saveChannel(clientId: string, channel: string) {
    setChannels((rows) => rows.map((r) => (r.id === clientId ? { ...r, channel } : r)));
    await fetch(`/api/admin/slack/channels/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
  }

  return (
    <div className="px-10 py-12 max-w-[820px] mx-auto bjfade">
      <div className="mb-7">
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
          Integrations
        </div>
        <h1 className="text-[34px] tracking-tight font-black">Slack</h1>
      </div>

      <div className="border border-line bg-s1 p-5 mb-5 flex items-center gap-4">
        <div className="w-11 h-11 bg-s3 grid place-items-center flex-none">
          <div className="grid grid-cols-2 gap-[3px] w-[22px] h-[22px]">
            <div className="bg-accent" />
            <div className="bg-text" />
            <div className="bg-text" />
            <div className="bg-accent" />
          </div>
        </div>
        {config.connected ? (
          <>
            <div className="flex-1">
              <div className="text-[15px] font-bold flex items-center gap-2">
                Bjur Media
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                <span className="text-xs font-semibold text-success">Connected</span>
              </div>
              <div className="text-xs text-muted mt-1">
                Incoming webhook · posts as <span className="font-mono">Bjur Delivery Bot</span>
              </div>
            </div>
            <button
              onClick={sendTest}
              className="cursor-pointer text-xs font-semibold text-text border border-line2 hover:border-text px-3.5 py-2.5"
            >
              Send test
            </button>
            <button
              onClick={disconnect}
              className="cursor-pointer text-xs font-semibold text-muted hover:text-accentb border border-line2 hover:border-accentb px-3.5 py-2.5"
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <div className="flex-1">
              <div className="text-[15px] font-bold">Not connected</div>
              <div className="text-xs text-muted mt-1">
                Paste a Slack Incoming Webhook URL to post delivery updates automatically.
              </div>
              <input
                value={webhookDraft}
                onChange={(e) => setWebhookDraft(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                className="mt-3 w-full bg-bg border border-line2 text-text text-[13px] font-mono px-3.5 py-2.5 outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={connect}
              disabled={connecting || !webhookDraft.trim()}
              className="cursor-pointer font-bold text-[13px] text-bg bg-accent hover:bg-accentb px-4 py-2.5 disabled:opacity-50"
            >
              {connecting ? "Connecting…" : "Connect Slack"}
            </button>
          </>
        )}
      </div>

      {testMsg && <div className="text-xs text-muted mb-5 -mt-3">{testMsg}</div>}

      {config.connected && (
        <>
          <div className="border border-line bg-s1 p-5 mb-5">
            <div className="text-[10.5px] tracking-wide uppercase text-muted font-bold mb-3">
              Default channel
            </div>
            <input
              defaultValue={config.defaultChannel}
              onBlur={(e) => patch({ defaultChannel: e.target.value })}
              className="w-64 bg-bg border border-line2 text-text text-sm font-mono px-3.5 py-2.5 outline-none focus:border-accent"
            />
            <div className="text-xs text-dim mt-2.5">
              Fallback channel for any client without a dedicated channel below.
            </div>
          </div>

          <div className="border border-line bg-s1 p-5 pb-2 mb-5">
            <div className="text-[10.5px] tracking-wide uppercase text-muted font-bold mb-1.5">
              Automations
            </div>

            <div className="flex items-center justify-between gap-4 py-4 border-b border-line">
              <div className="flex-1">
                <div className="text-sm font-semibold">Weekly calendar post</div>
                <div className="text-xs text-muted mt-0.5">
                  Posts the upcoming week&apos;s delivery schedule
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

            <div className="flex items-center justify-between gap-4 py-4 border-b border-line">
              <div>
                <div className="text-sm font-semibold">New delivery / upload</div>
                <div className="text-xs text-muted mt-0.5">Ping the channel when new media is registered</div>
              </div>
              <Toggle on={config.autoUpload} onChange={() => patch({ autoUpload: !config.autoUpload })} />
            </div>

            <div className="flex items-center justify-between gap-4 py-4 border-b border-line">
              <div>
                <div className="text-sm font-semibold">Client download</div>
                <div className="text-xs text-muted mt-0.5">Notify when a client downloads a master or ZIP</div>
              </div>
              <Toggle on={config.autoDownload} onChange={() => patch({ autoDownload: !config.autoDownload })} />
            </div>

            <div className="flex items-center justify-between gap-4 py-4">
              <div>
                <div className="text-sm font-semibold">BRAW license purchased</div>
                <div className="text-xs text-muted mt-0.5">Alert when a master is licensed</div>
              </div>
              <Toggle on={config.autoLicense} onChange={() => patch({ autoLicense: !config.autoLicense })} />
            </div>
          </div>

          <div className="border border-line bg-s1 p-5">
            <div className="text-[10.5px] tracking-wide uppercase text-muted font-bold mb-3.5">
              Per-client channels
            </div>
            {channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 py-2.5 border-t border-line">
                <span className="text-sm font-semibold">{c.name}</span>
                <input
                  defaultValue={c.channel}
                  onBlur={(e) => saveChannel(c.id, e.target.value)}
                  placeholder={config.defaultChannel}
                  className="w-56 bg-bg border border-line2 text-text text-[13px] font-mono px-2.5 py-2 outline-none focus:border-accent"
                />
              </div>
            ))}
            <div className="text-xs text-dim mt-3.5">
              Route each client&apos;s updates to their own channel. Blank = default channel.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
