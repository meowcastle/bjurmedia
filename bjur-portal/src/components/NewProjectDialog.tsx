"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Portal } from "@/components/ui/Portal";

type ClientOption = { id: string; name: string; type: "RETAINER" | "ONEOFF" };

export function NewProjectDialog({
  clients,
  onClose,
  onCreated,
}: {
  clients: ClientOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ inboxPath: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const isRetainer = selectedClient?.type === "RETAINER";

  async function submit() {
    if (!title.trim() || !clientId) {
      setError("Client and title are required.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        title: title.trim(),
        expiresAt: !isRetainer && expiresAt ? expiresAt : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to create project.");
      setLoading(false);
      return;
    }
    setResult({ inboxPath: data.inboxPath });
    setLoading(false);
    onCreated();
  }

  function copyPath() {
    if (!result) return;
    navigator.clipboard.writeText(result.inboxPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade" onClick={result ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[460px] bg-s2 border border-line2 p-7 bjrise">
        {!result ? (
          <>
            <div className="text-[22px] font-black tracking-tight mb-1.5">New project</div>
            <div className="text-[13px] text-muted mb-6">
              Creates a gallery and assigns it to a client.
            </div>

            <div className="flex flex-col gap-4">
              <Field label="Assign to client" htmlFor="client">
                <select
                  id="client"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-bg border border-line2 px-4 py-3 text-sm text-text outline-none focus:border-accent"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.type === "RETAINER" ? "Retainer" : "One-off"}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Project title" htmlFor="title">
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Winter Campaign"
                />
              </Field>

              {isRetainer ? (
                <div className="text-xs text-dim">Permanent library — retainer clients never expire.</div>
              ) : (
                <Field label="Expires (optional)" htmlFor="expires">
                  <Input
                    id="expires"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </Field>
              )}
            </div>

            {error && <div className="text-xs text-accentb mt-4 font-semibold">{error}</div>}

            <div className="flex justify-end gap-2.5 mt-7">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={loading}>
                {loading ? "Creating…" : "Create project"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[22px] font-black tracking-tight mb-1.5">Project created</div>
            <div className="text-[13px] text-muted mb-6">
              Point HandBrake&apos;s and your image editor&apos;s export destination at this folder —
              anything dropped there is auto-organized and appears in the client&apos;s gallery.
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-text bg-bg border border-line2 px-3.5 py-3 mb-2 break-all">
              {result.inboxPath}
            </div>
            <button
              onClick={copyPath}
              className="text-xs font-semibold text-muted hover:text-accent cursor-pointer"
            >
              {copied ? "Copied ✓" : "Copy path"}
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
