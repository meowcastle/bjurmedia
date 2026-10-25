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
    <div className="bj-adm bjfade">
      <section className="bj-adm-top">
        <div>
          <span className="bj-mono">
            <span className={`bj-dot${config.connected ? " ok" : ""}`} />
            {config.connected
              ? `${config.workspace ?? "Slack"} · connected`
              : "Slack not connected"}
          </span>
          <h1 className="bj-big">Integrations.</h1>
        </div>
      </section>

      {!config.connected && (
        <section className="bj-sx">
          <span className="bj-mono bj-lab">Connect Slack</span>
          <div className="flex items-end gap-3 flex-wrap max-w-[720px]">
            <input
              value={webhookDraft}
              onChange={(e) => setWebhookDraft(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              aria-label="Slack webhook URL"
              className="bj-in flex-1 min-w-[240px] font-mono"
            />
            <button
              type="button"
              onClick={connect}
              disabled={connecting || !webhookDraft.trim()}
              className="bj-cta"
            >
              {connecting ? "Connecting…" : "Connect"}
            </button>
          </div>
        </section>
      )}

      <section className="bj-sx">
        <span className="bj-mono bj-lab">
          Clients<b>{rows.length}</b>
        </span>
        <div className="min-w-0">

      {/* The column headings only exist where there are columns. Under 768px each client
          becomes a stacked block instead — a five-column table on a phone is a horizontal
          scrollbar with a table hidden inside it. */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_170px_180px_120px_auto] gap-4 bj-mono pb-2.5 border-b border-line">
        <span>Client</span>
        <span>Slack</span>
        <span>Accounts</span>
        {/* The one thing the old intro paragraph said that nobody would guess. */}
        <span title="Sends the client's audio to a third party to transcribe. Off until you turn it on.">
          AI captions
        </span>
        <span />
      </div>

      {rows.map((r) => (
        <div
          key={r.id}
          data-testid={`integration-row-${r.id}`}
          className="grid gap-3 md:gap-4 md:items-center md:grid-cols-[minmax(0,1fr)_170px_180px_120px_auto] py-4 border-b border-line"
        >
          <span className="flex gap-3 items-center text-[15px] font-semibold">
            <span
              className="w-2.5 h-2.5 flex-none [border-radius:2px!important]"
              style={{ background: r.accentColor ?? "var(--muted)" }}
            />
            {r.name}
          </span>

          {r.channel ? (
            <input
              defaultValue={r.channel}
              onBlur={(e) => saveChannel(r.id, e.target.value)}
              aria-label={`Slack channel for ${r.name}`}
              className="bj-in w-full font-mono !text-[12px]"
            />
          ) : (
            <button
              onClick={() => saveChannel(r.id, `#${r.name.toLowerCase().replace(/[^a-z0-9]/g, "")}-content`)}
              data-testid={`add-channel-${r.id}`}
              className="bj-ghost justify-self-start"
            >
              + Channel
            </button>
          )}

          <span className={`bj-mono ${r.accounts ? "ink" : ""}`} style={{ textTransform: "none" }}>
            {r.accounts || "Not connected"}
          </span>

          <button
            onClick={() => toggleCaptions(r)}
            aria-pressed={r.autoCaption}
            aria-label={`AI captions for ${r.name}`}
            data-testid={`captions-${r.id}`}
            className={`cursor-pointer inline-flex gap-2.5 items-center bj-mono justify-self-start min-h-[32px] py-2 ${
              r.autoCaption ? "ink" : ""
            }`}
          >
            <Knob on={r.autoCaption} />
            {r.autoCaption ? "On" : "Off"}
          </button>

          <Link
            href={`/admin/clients/${r.id}`}
            className="bj-link justify-self-start md:justify-self-auto"
          >
            Open →
          </Link>
        </div>
      ))}
        </div>
      </section>

      {config.connected && (
        <section className="bj-sx">
          <span className="bj-mono bj-lab">Slack</span>
        <div className="grid md:grid-cols-2 gap-10">
          <div>
            <div className="bj-mono mb-3">
              Default channel
            </div>
            <input
              defaultValue={config.defaultChannel}
              onBlur={(e) => patch({ defaultChannel: e.target.value })}
              aria-label="Default channel"
              className="bj-in w-full font-mono"
            />
            <div className="text-[14px] text-muted mt-2.5 leading-relaxed">
              Used for any client with no channel of their own.
            </div>
            <button
              onClick={sendTest}
              className="bj-ghost mt-3.5"
            >
              Send test
            </button>
            {testMsg && <div className="text-xs text-muted mt-2.5">{testMsg}</div>}
          </div>

          <div>
            <div className="bj-mono mb-3">
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
                <span className="text-[14px] text-body">{label}</span>
                <Knob on={config[key]} />
              </button>
            ))}
          </div>
        </div>
        </section>
      )}
    </div>
  );
}
