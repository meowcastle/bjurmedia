"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddAdminDialog } from "@/components/AddAdminDialog";

type Admin = {
  id: string;
  name: string;
  email: string;
  lastLoginAt: string | null;
  createdAt: string;
};

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AdminTeamClient({
  admins,
  currentUserId,
}: {
  admins: Admin[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function removeAdmin(admin: Admin) {
    setRemovingId(admin.id);
    setError("");
    const res = await fetch(`/api/admin/staff/${admin.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setRemovingId(null);
    if (!res.ok) {
      setError(data.error ?? "Failed to remove admin.");
      return;
    }
    setConfirmingId(null);
    router.refresh();
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 py-8 md:py-12 max-w-[820px] mx-auto bjfade">
      <div className="flex items-end justify-between gap-4 flex-wrap border-b-2 border-line2 pb-6 mb-9">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Team</h1>
          <div className="text-[13px] text-muted mt-1.5">
            Staff logins with full access to this control panel.
          </div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="cursor-pointer whitespace-nowrap text-xs font-semibold text-muted hover:text-text border border-dashed border-line2 hover:border-text px-3.5 py-2"
        >
          + Add admin
        </button>
      </div>

      {error && <div className="text-xs text-accentb mb-4 font-semibold">{error}</div>}

      <div className="border border-line">
        {admins.map((a) => {
          const isSelf = a.id === currentUserId;
          const isLast = admins.length === 1;
          return (
            <div
              key={a.id}
              className="flex flex-col gap-2.5 px-4 py-4 border-b border-line last:border-b-0 md:grid md:gap-4 md:px-5 md:items-center"
              style={{ gridTemplateColumns: "1.6fr 1fr 18rem" }}
            >
              <div className="md:contents">
                <div className="min-w-0">
                  <span className="text-[13px] font-semibold">{a.name}</span>
                  {isSelf && <span className="text-[11px] text-dim"> · you</span>}
                  <div className="text-xs text-dim font-mono mt-0.5 truncate" title={a.email}>
                    {a.email}
                  </div>
                </div>
                <span className="text-[11px] text-dim md:text-right">
                  <span className="text-dim">Last login · </span>
                  {shortDate(a.lastLoginAt)}
                </span>
              </div>
              {/* Fixed-width action cell — see the seats list: the confirm step must not
                  reflow the row it belongs to. */}
              <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
                {confirmingId === a.id ? (
                  <>
                    <span className="text-[11px] text-muted">Revoke access?</span>
                    <button
                      onClick={() => removeAdmin(a)}
                      disabled={removingId === a.id}
                      className="cursor-pointer text-[11px] font-semibold text-accentb hover:text-text border border-accentb px-2.5 py-1.5"
                    >
                      {removingId === a.id ? "Removing…" : "Confirm remove"}
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text px-2.5 py-1.5"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setError("");
                      setConfirmingId(a.id);
                    }}
                    disabled={isSelf || isLast}
                    title={
                      isSelf
                        ? "Ask another admin to remove your access."
                        : isLast
                          ? "Add another admin before removing this one."
                          : undefined
                    }
                    className="cursor-pointer text-[11px] font-semibold text-muted hover:text-accentb border border-line2 hover:border-accentb px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-line2"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-dim mt-4">
        Removing an admin signs them out everywhere and blocks sign-in. Their account is kept, so
        anything they granted or uploaded still shows their name — adding the same email back
        reinstates the login with a fresh temp password.
      </div>

      {addOpen && (
        <AddAdminDialog
          onClose={() => setAddOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}
