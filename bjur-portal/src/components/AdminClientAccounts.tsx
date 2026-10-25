"use client";

import Link from "next/link";
import { ClientLogo } from "@/components/ClientLogo";


export type ClientAccountRow = {
  id: string;
  name: string;
  channel: string;
  accentColor: string | null;
  logoUrl: string | null;
  instagram: PlatformState | null;
  youtube: PlatformState | null;
};

export type PlatformState = {
  handle: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function Platform({
  tag,
  state,
}: {
  tag: string;
  state: PlatformState | null;
}) {
  if (!state) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="bj-pill flex-none">
          {tag}
        </span>
        <span className="text-[11px] text-dim">Not connected</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="bj-pill ok flex-none">
        {tag}
      </span>
      <span className="text-[11px] text-text truncate">
        {state.handle || "connected"}
      </span>
      {state.lastSyncError ? (
        // A token that has expired or been revoked is otherwise completely silent: the
        // account still looks connected and the numbers just stop moving.
        <span
          className="text-[11px] text-accentb truncate"
          title={state.lastSyncError}
        >
          · sync failing
        </span>
      ) : (
        <span className="text-[11px] text-dim flex-none">
          ·{" "}
          {state.lastSyncedAt
            ? `synced ${ago(state.lastSyncedAt)}`
            : "never synced"}
        </span>
      )}
    </div>
  );
}

/**
 * §10b. The Integrations page configured the studio-wide YouTube key and the weekly
 * sync, but never said which clients were actually connected — and nothing can be
 * published or counted for a client whose account is missing. Connecting still happens
 * on the client's own page, which is where the credentials belong; this is the roll-up
 * that says where to go.
 */
export function AdminClientAccounts({ rows }: { rows: ClientAccountRow[] }) {
  const connected = rows.filter((r) => r.instagram || r.youtube).length;
  const failing = rows.filter(
    (r) => r.instagram?.lastSyncError || r.youtube?.lastSyncError,
  ).length;

  return (
    <div className="bj-adm" data-testid="client-accounts">
      <section className="bj-sx">
      <span className="bj-mono bj-lab">Client accounts</span>
      <div className="min-w-0">
        <p className="text-[15px] text-body mb-4 max-w-[60ch]">
          Nothing publishes or reports views for a client until their Instagram
          or YouTube account is connected.
        </p>
        <div className="flex items-center gap-3 flex-wrap pb-3 border-b border-line">
          <span className="bj-mono ink tabular-nums">
            {connected} of {rows.length} clients connected
          </span>
          {failing > 0 && (
            <span className="bj-pill red">
              {failing} needs reconnecting
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="py-6 text-[14px] text-muted">
            No active clients yet.
          </div>
        ) : (
          rows.map((c) => (
            <div
              key={c.id}
              data-testid={`account-row-${c.id}`}
              className="flex items-center gap-4 py-3.5 border-b border-line flex-wrap"
            >
              <ClientLogo client={{ name: c.name, logoUrl: c.logoUrl, logoColor: c.accentColor }} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold truncate">
                  {c.name}
                </div>
                <div className="bj-mono truncate mt-0.5" style={{ textTransform: "none" }}>
                  {c.channel || "No Slack channel set"}
                </div>
              </div>
              <div className="flex flex-col gap-1 min-w-0 basis-full sm:basis-auto sm:w-[280px]">
                <Platform tag="IG" state={c.instagram} />
                <Platform tag="YT" state={c.youtube} />
              </div>
              <Link
                href={`/admin/clients/${c.id}`}
                className="bj-ghost flex-none"
              >
                {c.instagram || c.youtube ? "Manage" : "Connect"}
              </Link>
            </div>
          ))
        )}
      </div>
      </section>
    </div>
  );
}
