"use client";

import Link from "next/link";
import { initials } from "@/lib/initials";
import { lighten } from "@/lib/color";

const DEFAULT_ACCENT = "#ec3013";

export type ClientAccountRow = {
  id: string;
  name: string;
  type: string;
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
        <span className="text-[9px] font-bold tracking-wide text-dim border border-line2 px-1.5 py-0.5 flex-none">
          {tag}
        </span>
        <span className="text-[11px] text-dim">Not connected</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[9px] font-bold tracking-wide text-accentb border border-accent/40 px-1.5 py-0.5 flex-none">
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
    <div
      className="px-10 pb-12 max-w-[820px] mx-auto -mt-6"
      data-testid="client-accounts"
    >
      <div className="mb-5">
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-2.5">
          Connections
        </div>
        <h1 className="text-[26px] tracking-tight font-black">
          Client accounts
        </h1>
        <p className="text-[13px] text-muted mt-2">
          Nothing publishes or reports views for a client until their Instagram
          or YouTube account is connected.
        </p>
      </div>

      <div className="border border-line bg-s1">
        <div className="flex items-center gap-3 flex-wrap px-5 py-3 border-b border-line">
          <span className="text-[12px] font-semibold tabular-nums">
            {connected} of {rows.length} clients connected
          </span>
          {failing > 0 && (
            <span className="text-[11px] font-semibold text-accentb border border-accent/40 px-2 py-0.5">
              {failing} needs reconnecting
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-6 text-[13px] text-muted">
            No active clients yet.
          </div>
        ) : (
          rows.map((c) => (
            <div
              key={c.id}
              data-testid={`account-row-${c.id}`}
              className="flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0 flex-wrap"
            >
              {/* Same avatar treatment as the clients list — logo if the client has
                  one, otherwise initials on their own accent. */}
              <div
                className="w-9 h-9 grid place-items-center overflow-hidden flex-none"
                style={
                  c.logoUrl
                    ? { background: "var(--s3)" }
                    : {
                        background: `linear-gradient(135deg, ${c.accentColor ?? DEFAULT_ACCENT}, ${lighten(
                          c.accentColor ?? DEFAULT_ACCENT,
                          0.6,
                        )})`,
                      }
                }
              >
                {c.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary external brand logo, not a static asset Next can optimize
                  <img
                    src={c.logoUrl}
                    alt=""
                    className="w-full h-full object-contain bg-bg"
                  />
                ) : (
                  <span className="text-[11px] font-black text-bg">
                    {initials(c.name)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate">
                  {c.name}
                </div>
                <div className="text-[11px] text-dim truncate">
                  {c.type}
                  {c.channel ? ` · ${c.channel}` : ""}
                </div>
              </div>
              <div className="flex flex-col gap-1 min-w-0 basis-full sm:basis-auto sm:w-[280px]">
                <Platform tag="IG" state={c.instagram} />
                <Platform tag="YT" state={c.youtube} />
              </div>
              <Link
                href={`/admin/clients/${c.id}`}
                className="text-[11px] font-semibold text-muted hover:text-text border border-line2 hover:border-text px-2.5 py-1.5 flex-none"
              >
                {c.instagram || c.youtube ? "Manage" : "Connect"}
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
