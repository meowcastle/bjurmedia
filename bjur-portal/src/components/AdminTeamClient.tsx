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
    <div className="bj-adm bjfade">
      <section className="bj-adm-top">
        <div>
          <span className="bj-mono">Admin logins with full access.</span>
          <h1 className="bj-big">Team.</h1>
        </div>
        <div className="acts">
          <button type="button" onClick={() => setAddOpen(true)} className="bj-ghost">
            + Add admin
          </button>
        </div>
      </section>

      <section className="bj-sx">
      <span className="bj-mono bj-lab">
        Admins<b>{admins.length}</b>
      </span>
      <div className="min-w-0">
      {error && <div className="text-[14px] text-accent mb-4 font-semibold">{error}</div>}

      <div>
        {admins.map((a) => {
          const isSelf = a.id === currentUserId;
          const isLast = admins.length === 1;
          return (
            <div
              key={a.id}
              className="flex flex-col gap-2.5 py-4 border-b border-line md:grid md:gap-4 md:items-center"
              style={{ gridTemplateColumns: "1.6fr 1fr 18rem" }}
            >
              <div className="md:contents">
                <div className="min-w-0">
                  <span className="text-[16px] font-semibold">{a.name}</span>
                  {isSelf && <span className="text-[14px] text-muted"> · you</span>}
                  <div className="bj-mono mt-1 truncate" style={{ textTransform: "none" }} title={a.email}>
                    {a.email}
                  </div>
                </div>
                <span className="bj-mono md:text-right">
                  <span>Last login · </span>
                  {shortDate(a.lastLoginAt)}
                </span>
              </div>
              {/* Fixed-width action cell — see the seats list: the confirm step must not
                  reflow the row it belongs to. */}
              <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
                {confirmingId === a.id ? (
                  <>
                    <span className="text-[14px] text-muted">Revoke access?</span>
                    <button
                      onClick={() => removeAdmin(a)}
                      disabled={removingId === a.id}
                      className="bj-cta"
                    >
                      {removingId === a.id ? "Removing…" : "Confirm remove"}
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="bj-ghost"
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
                    className="bj-ghost disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[14px] text-muted mt-4 leading-relaxed max-w-[64ch]">
        Removing an admin signs them out everywhere and blocks sign-in. Their login is kept, so
        anything they granted or uploaded still shows their name. Adding the same email back
        reinstates the login with a fresh temp password.
      </div>
      </div>
      </section>

      {addOpen && (
        <AddAdminDialog
          onClose={() => setAddOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}
