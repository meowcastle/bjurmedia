"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Portal } from "@/components/ui/Portal";
import { IconCheck } from "@/components/ui/Icon";

type Role = "OWNER" | "DOWNLOADER" | "VIEWER";
type ProjectOption = { id: string; title: string };

export function AddSeatDialog({
  clientId,
  clientName,
  projects = [],
  onClose,
  onCreated,
}: {
  clientId: string;
  clientName: string;
  projects?: ProjectOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("DOWNLOADER");
  const [restricted, setRestricted] = useState(false);
  const [grants, setGrants] = useState<Map<string, Role>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleProject(projectId: string, checked: boolean) {
    setGrants((prev) => {
      const next = new Map(prev);
      if (checked) next.set(projectId, next.get(projectId) ?? "DOWNLOADER");
      else next.delete(projectId);
      return next;
    });
  }

  async function submit() {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (restricted && grants.size === 0) {
      setError("Select at least one project, or switch to all projects.");
      return;
    }
    setLoading(true);
    setError("");
    const projectAccess = restricted
      ? Array.from(grants.entries()).map(([projectId, r]) => ({
          projectId,
          role: r,
        }))
      : undefined;
    const res = await fetch(`/api/admin/clients/${clientId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        role,
        projectAccess,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to add seat.");
      setLoading(false);
      return;
    }
    setResult({ tempPassword: data.tempPassword });
    setLoading(false);
    onCreated();
  }

  function copyPassword() {
    if (!result) return;
    navigator.clipboard.writeText(result.tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade"
        onClick={result ? undefined : onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[460px] bg-s2 border border-line2 p-7 bjrise"
        >
          {!result ? (
            <>
              <div className="text-xl font-black tracking-tight mb-1.5">
                Add user seat
              </div>
              <div className="text-[13px] text-muted mb-6">
                New login for {clientName}.
              </div>

              <div className="flex flex-col gap-4">
                <Field label="Name" htmlFor="sname">
                  <Input
                    id="sname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Email" htmlFor="semail">
                  <Input
                    id="semail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field
                  label={restricted ? "Default role" : "Role"}
                  htmlFor="srole"
                >
                  <select
                    id="srole"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full bg-bg border border-line2 px-4 py-3 text-sm text-text outline-none focus:border-accent"
                  >
                    <option value="OWNER">
                      Owner — full access, manages seats
                    </option>
                    <option value="DOWNLOADER">
                      Downloader — view + download
                    </option>
                    <option value="VIEWER">Viewer — view/stream only</option>
                  </select>
                </Field>

                {projects.length > 0 && (
                  <>
                    <Field label="Access" htmlFor="saccess">
                      <div id="saccess" className="flex gap-2">
                        <button
                          type="button"
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
                          type="button"
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
                    </Field>

                    {restricted && (
                      <div className="border border-line2 max-h-[220px] overflow-y-auto">
                        {projects.map((p) => {
                          const checked = grants.has(p.id);
                          return (
                            <div
                              key={p.id}
                              className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-b-0"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  toggleProject(p.id, e.target.checked)
                                }
                                className="cursor-pointer"
                              />
                              <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">
                                {p.title}
                              </span>
                              {checked && (
                                <select
                                  value={grants.get(p.id)}
                                  onChange={(e) =>
                                    setGrants((prev) =>
                                      new Map(prev).set(
                                        p.id,
                                        e.target.value as Role,
                                      ),
                                    )
                                  }
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
                      </div>
                    )}
                  </>
                )}
              </div>

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
                  {loading ? "Adding…" : "Add seat"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-black tracking-tight mb-1.5">
                Seat added
              </div>
              <div className="text-[13px] text-muted mb-6">
                Send this temp password to {email} — shown only once.
              </div>
              <div className="flex items-center gap-2 text-[13px] font-mono text-text bg-bg border border-line2 px-3.5 py-3 mb-2">
                {result.tempPassword}
              </div>
              <button
                onClick={copyPassword}
                className="text-xs font-semibold text-muted hover:text-accent cursor-pointer"
              >
                {copied ? (
                  <span className="inline-flex items-center gap-1">
                    Copied <IconCheck />
                  </span>
                ) : (
                  "Copy password"
                )}
              </button>
              <div className="flex justify-end mt-7">
                <Button onClick={onClose}>Done</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
