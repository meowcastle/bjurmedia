"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Config = {
  youtubeApiKey: string;
};


export function AdminSocialIntegrationsClient({
  initialConfig,
}: {
  initialConfig: Config;
}) {
  const router = useRouter();
  const [, setConfig] = useState(initialConfig);
  const [keyDraft, setKeyDraft] = useState(initialConfig.youtubeApiKey);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    accountsSynced: number;
    failed: number;
  } | null>(null);

  async function syncNow() {
    setSyncing(true);
    setSyncResult(null);
    const res = await fetch("/api/admin/social/sync", { method: "POST" });
    setSyncing(false);
    if (!res.ok) {
      setSyncResult({ accountsSynced: 0, failed: 1 });
      return;
    }
    const body = (await res.json()) as {
      accountsSynced: number;
      failed: number;
    };
    setSyncResult(body);
    // A sync changes what the Client accounts roll-up above should be showing.
    router.refresh();
  }

  async function patch(fields: Partial<Config>) {
    setConfig((c) => ({ ...c, ...fields }));
    await fetch("/api/admin/social", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  }

  return (
    <div className="bj-adm">
      {/* A section of Integrations, not a second page title under the first. */}
      <section className="bj-sx">
      <span className="bj-mono bj-lab">Instagram &amp; YouTube</span>
      <div className="min-w-0 max-w-[720px]">
      <div className="mb-8">
        <div className="bj-mono mb-3">
          YouTube API key
        </div>
        <div className="flex gap-2.5">
          <input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="AIza…"
            aria-label="YouTube API key"
            className="bj-in flex-1 min-w-0 font-mono"
          />
          <button
            onClick={() => patch({ youtubeApiKey: keyDraft.trim() })}
            type="button"
            className="bj-cta"
          >
            Save
          </button>
        </div>
        <div className="text-[14px] text-muted mt-2.5 leading-relaxed">
          A single Data API key covers every linked channel. View counts on
          public videos don&apos;t need per-channel OAuth. Instagram tokens are
          entered per client on that client&apos;s page (needs per-account
          access).
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="text-[16px] font-semibold">Weekly sync</div>
            <div className="text-[14px] text-muted mt-1 leading-relaxed">
              Refreshes view counts and matches new posts for every linked account, every
              Tuesday morning. Sync now below if you cannot wait for it.
            </div>
          </div>
        </div>

        {/* Waiting until the scheduled day to find out whether a channel you just
            connected actually works is not a usable feedback loop. */}
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <button
            onClick={syncNow}
            disabled={syncing}
            data-testid="sync-now"
            type="button"
            className="bj-ghost disabled:opacity-40"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          {syncResult && (
            <span
              className={`text-[14px] ${syncResult.failed > 0 ? "text-accent" : "text-muted"}`}
              data-testid="sync-result"
            >
              {syncResult.accountsSynced === 0
                ? "No accounts connected yet."
                : syncResult.failed > 0
                  ? `${syncResult.accountsSynced} synced, ${syncResult.failed} failing. See Client accounts above.`
                  : `${syncResult.accountsSynced} account${syncResult.accountsSynced > 1 ? "s" : ""} synced.`}
            </span>
          )}
        </div>
      </div>
      </div>
      </section>
    </div>
  );
}
