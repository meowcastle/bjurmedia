"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Config = {
  connected: boolean;
  workspace: string | null;
  webhookUrl: string;
  defaultChannel: string;
  autoUpload: boolean;
  autoDownload: boolean;
  autoSubmission: boolean;
};

export type IntegrationRow = {
  id: string;
  name: string;
  accentColor: string | null;
  channel: string;
  /** "@57nyc · @57NYCtv", or empty when nothing is linked. */
  accounts: string;
  autoCaption: boolean;
};

function Knob({ on }: { on: boolean }) {
  return (
    <span
      className={`w-7 h-4 border relative flex-none ${on ? "border-text" : "border-line2"}`}
      aria-hidden
    >
      <span
        className={`w-2.5 h-2.5 absolute top-[2px] transition-transform ${on ? "bg-text" : "bg-line2"}`}
        style={{ transform: on ? "translateX(14px)" : "translateX(2px)" }}
      />
    </span>
  );
}

/**
 * Integrations: one row per client, and the only place any of it is edited.
 *
 * It used to be three stacked cards — Slack here, accounts there, captions on each
 * client's own page — which meant "what is switched on for this client" could only be
 * answered by visiting three screens and remembering. A table answers it by looking.
 *
 * Nothing here changes what a client sees in their portal. That is worth saying on the
 * page, because a row of toggles beside a client's name reads like it might.
 */
export function AdminIntegrationsClient({
  initialConfig,
  clientRows,
}: {
  initialConfig: Config;
  clientRows: IntegrationRow[];
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [webhookDraft, setWebhookDraft] = useState(initialConfig.webhookUrl);
  const [rows, setRows] = useState(clientRows);
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

  async function sendTest() {
    setTestMsg("Sending…");
    const res = await fetch("/api/admin/slack/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setTestMsg(res.ok ? `Posted to ${config.defaultChannel} ✓` : (data.error ?? "Failed."));
  }

  async function saveChannel(clientId: string, channel: string) {
    setRows((rs) => rs.map((r) => (r.id === clientId ? { ...r, channel } : r)));
    await fetch(`/api/admin/slack/channels/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
    router.refresh();
  }

  async function toggleCaptions(row: IntegrationRow) {
    const next = !row.autoCaption;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, autoCaption: next } : r)));
    const res = await fetch(`/api/admin/clients/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoCaption: next }),
    });
    if (!res.ok) setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, autoCaption: !next } : r)));
  }

  return (
    <div className="px-6 md:px-10 py-11 max-w-[1100px] mx-auto bjfade">
      <div className="flex justify-between items-end gap-6 flex-wrap pb-7 border-b border-line2 mb-2">
        <div>
          <div className="text-[11px] tracking-[0.14em] uppercase text-dim mb-3.5">
            Slack · Instagram · YouTube · Captions
          </div>
          <h1 className="bj-serif text-[36px] sm:text-[48px] font-light leading-none tracking-tight">
            Integrations.
          </h1>
        </div>
        <div className="text-[11px] text-dim flex gap-2 items-center">
          <span className={`w-1.5 h-1.5 ${config.connected ? "bg-success" : "bg-line2"}`} />
          {config.connected
            ? `${config.workspace ?? "Slack"} · connected`
            : "Slack not connected"}
        </div>
      </div>

      <p className="text-xs text-dim mt-0 mb-9 leading-relaxed max-w-[60ch]">
        Optional per client. A Social calendar project needs a Slack channel; captions and
        accounts are extras. Nothing here changes what a client sees. Turning AI captions
        on sends this client&apos;s audio to a third party to transcribe, which is why it
        is off until you say otherwise.
      </p>

      {!config.connected && (
        <div className="border border-line bg-s1 p-5 mb-9 flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="text-[10.5px] tracking-wide uppercase text-muted font-bold mb-2">
              Connect Slack
            </div>
            <input
              value={webhookDraft}
              onChange={(e) => setWebhookDraft(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              aria-label="Slack webhook URL"
              className="w-full bg-bg border border-line2 text-[13px] font-mono px-3.5 py-2.5 outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={connect}
            disabled={connecting || !webhookDraft.trim()}
            className="cursor-pointer font-bold text-[13px] text-bg bg-accent hover:bg-accentb px-4 py-2.5 disabled:opacity-50"
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </div>
      )}

      {/* The column headings only exist where there are columns. Under 768px each client
          becomes a stacked block instead — a five-column table on a phone is a horizontal
          scrollbar with a table hidden inside it. */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_170px_180px_120px_auto] gap-4 text-[10px] tracking-[0.1em] uppercase text-dim pb-2.5 border-b border-line2">
        <span>Client</span>
        <span>Slack</span>
        <span>Accounts</span>
        <span>AI captions</span>
        <span />
      </div>

      {rows.map((r) => (
        <div
          key={r.id}
          data-testid={`integration-row-${r.id}`}
          className="grid gap-3 md:gap-4 md:items-center md:grid-cols-[minmax(0,1fr)_170px_180px_120px_auto] py-4 border-b border-line"
        >
          <span className="flex gap-3 items-center text-sm">
            <span
              className="w-2 h-2 flex-none"
              style={{ background: r.accentColor ?? "var(--accent)" }}
            />
            {r.name}
          </span>

          {r.channel ? (
            <input
              defaultValue={r.channel}
              onBlur={(e) => saveChannel(r.id, e.target.value)}
              aria-label={`Slack channel for ${r.name}`}
              className="w-full bg-s1 border border-line text-[11.5px] font-mono px-2.5 py-[7px] outline-none focus:border-text"
            />
          ) : (
            <button
              onClick={() => saveChannel(r.id, `#${r.name.toLowerCase().replace(/[^a-z0-9]/g, "")}-content`)}
              data-testid={`add-channel-${r.id}`}
              className="cursor-pointer text-[10.5px] tracking-[.06em] uppercase text-dim border border-dashed border-line2 hover:text-text hover:border-text px-2.5 py-[7px]"
            >
              + Channel
            </button>
          )}

          <span className={`text-[11px] ${r.accounts ? "text-body" : "text-dim"}`}>
            {r.accounts || "Not connected"}
          </span>

          <button
            onClick={() => toggleCaptions(r)}
            aria-pressed={r.autoCaption}
            aria-label={`AI captions for ${r.name}`}
            data-testid={`captions-${r.id}`}
            className={`cursor-pointer inline-flex gap-2.5 items-center text-[10px] tracking-[.06em] uppercase justify-self-start min-h-[32px] py-2 ${
              r.autoCaption ? "text-muted" : "text-dim2"
            }`}
          >
            <Knob on={r.autoCaption} />
            {r.autoCaption ? "On" : "Off"}
          </button>

          <Link
            href={`/admin/clients/${r.id}`}
            className="inline-flex items-center min-h-[32px] py-2 text-[10.5px] tracking-[.06em] uppercase text-dim hover:text-text justify-self-start md:justify-self-auto"
          >
            Open →
          </Link>
        </div>
      ))}

      {config.connected && (
        <div className="mt-10 grid md:grid-cols-2 gap-px bg-line2 border border-line2">
          <div className="bg-s1 px-6 py-[22px]">
            <div className="text-[11px] tracking-[0.1em] uppercase text-dim mb-3">
              Default channel
            </div>
            <input
              defaultValue={config.defaultChannel}
              onBlur={(e) => patch({ defaultChannel: e.target.value })}
              aria-label="Default channel"
              className="w-full bg-bg border border-line2 text-sm font-mono px-3.5 py-2.5 outline-none focus:border-accent"
            />
            <div className="text-xs text-dim mt-2.5 leading-relaxed">
              Used for any client with no channel of their own.
            </div>
            <button
              onClick={sendTest}
              className="cursor-pointer mt-3.5 text-[10.5px] tracking-[.06em] uppercase font-semibold border border-line2 hover:border-text px-3 py-2"
            >
              Send test
            </button>
            {testMsg && <div className="text-xs text-muted mt-2.5">{testMsg}</div>}
          </div>

          <div className="bg-s1 px-6 py-[22px]">
            <div className="text-[11px] tracking-[0.1em] uppercase text-dim mb-3">
              Post to Slack when
            </div>
            {(
              [
                ["autoUpload", "New work is registered"],
                ["autoDownload", "A client downloads"],
                ["autoSubmission", "A client sends footage in"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => patch({ [key]: !config[key] } as Partial<Config>)}
                aria-pressed={config[key]}
                className="cursor-pointer w-full flex items-center justify-between gap-4 py-2.5 border-t border-line text-left"
              >
                <span className="text-xs text-body">{label}</span>
                <Knob on={config[key]} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
