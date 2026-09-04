"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";

type Role = "OWNER" | "DOWNLOADER" | "VIEWER";
type ProjectOption = { id: string; title: string };
type ProjectAccessGrant = { projectId: string; role: string };

export function SeatAccessDialog({
  clientId,
  seatId,
  seatName,
  projects,
  initialAccess,
  onClose,
  onSaved,
}: {
  clientId: string;
  seatId: string;
  seatName: string;
  projects: ProjectOption[];
  initialAccess: ProjectAccessGrant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = new Map(
    initialAccess.map((a) => [a.projectId, a.role as Role]),
  );
  const [restricted, setRestricted] = useState(initialAccess.length > 0);
  const [grants, setGrants] = useState<Map<string, Role>>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleProject(projectId: string, checked: boolean) {
    setGrants((prev) => {
      const next = new Map(prev);
      if (checked) next.set(projectId, next.get(projectId) ?? "DOWNLOADER");
      else next.delete(projectId);
      return next;
    });
  }

  function setRole(projectId: string, role: Role) {
    setGrants((prev) => new Map(prev).set(projectId, role));
  }

  async function submit() {
    setLoading(true);
    setError("");
    const projectAccess = restricted
      ? Array.from(grants.entries()).map(([projectId, role]) => ({
          projectId,
          role,
        }))
      : [];
    if (restricted && projectAccess.length === 0) {
      setError("Select at least one project, or switch to all projects.");
      setLoading(false);
      return;
    }
    const res = await fetch(
      `/api/admin/clients/${clientId}/users/${seatId}/access`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectAccess }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to update access.");
      setLoading(false);
      return;
    }
    setLoading(false);
    onSaved();
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[460px] bg-s2 border border-line2 p-7 bjrise"
        >
          <div className="text-xl font-black tracking-tight mb-1.5">
            Manage access
          </div>
          <div className="text-[13px] text-muted mb-6">{seatName}</div>

          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setRestricted(false)}
              className={`flex-1 text-xs font-semibold px-3 py-2.5 border cursor-pointer ${
                !restricted
                  ? "border-accent text-accent bg-accent/10"
                  : "border-line2 text-muted hover:text-text"
              }`}
            >
              All projects
            </button>
            <button
              onClick={() => setRestricted(true)}
              className={`flex-1 text-xs font-semibold px-3 py-2.5 border cursor-pointer ${
                restricted
                  ? "border-accent text-accent bg-accent/10"
                  : "border-line2 text-muted hover:text-text"
              }`}
            >
              Specific projects
            </button>
          </div>

          {restricted && (
            <div className="border border-line2 max-h-[320px] overflow-y-auto">
              {projects.map((p) => {
                const checked = grants.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleProject(p.id, e.target.checked)}
                      className="cursor-pointer"
                    />
                    <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">
                      {p.title}
                    </span>
                    {checked && (
                      <select
                        value={grants.get(p.id)}
                        onChange={(e) => setRole(p.id, e.target.value as Role)}
                        className="bg-bg border border-line2 px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
                      >
                        <option value="OWNER">Owner</option>
                        <option value="DOWNLOADER">Downloader</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    )}
                  </div>
                );
              })}
              {projects.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted">
                  No projects yet.
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-accentb mt-4 font-semibold">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2.5 mt-7">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading ? "Saving…" : "Save access"}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
