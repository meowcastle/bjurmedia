"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Portal } from "@/components/ui/Portal";

export function NewClientDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [type, setType] = useState<"RETAINER" | "ONEOFF">("RETAINER");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ tempPassword: string; ownerEmail: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    if (!name.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      setError("Client name, owner name, and owner email are required.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), username: username.trim(), type, ownerName, ownerEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to create client.");
      setLoading(false);
      return;
    }
    setResult({ tempPassword: data.tempPassword, ownerEmail: ownerEmail.trim() });
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
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade" onClick={result ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[460px] bg-s2 border border-line2 p-7 bjrise">
        {!result ? (
          <>
            <div className="text-[22px] font-black tracking-tight mb-1.5">New client</div>
            <div className="text-[13px] text-muted mb-6">
              Creates a client org with an owner seat and a secure, hashed password.
            </div>

            <div className="flex flex-col gap-4">
              <Field label="Client name" htmlFor="cname">
                <Input
                  id="cname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Meridian Films"
                />
              </Field>
              <Field label="Username" htmlFor="cusername">
                <Input
                  id="cusername"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="auto from name"
                />
              </Field>
              <Field label="Type" htmlFor="ctype">
                <select
                  id="ctype"
                  value={type}
                  onChange={(e) => setType(e.target.value as "RETAINER" | "ONEOFF")}
                  className="w-full bg-bg border border-line2 px-4 py-3 text-sm text-text outline-none focus:border-accent"
                >
                  <option value="RETAINER">Retainer — permanent library</option>
                  <option value="ONEOFF">One-off — optional per-project expiry</option>
                </select>
              </Field>
              <Field label="Owner name" htmlFor="oname">
                <Input
                  id="oname"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g. Sasha Hale"
                />
              </Field>
              <Field label="Owner email" htmlFor="oemail">
                <Input
                  id="oemail"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="sasha@meridianfilms.com"
                />
              </Field>
            </div>

            {error && <div className="text-xs text-accentb mt-4 font-semibold">{error}</div>}

            <div className="flex justify-end gap-2.5 mt-7">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={loading}>
                {loading ? "Creating…" : "Create client"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[22px] font-black tracking-tight mb-1.5">Client created</div>
            <div className="text-[13px] text-muted mb-6">
              Send these to {result.ownerEmail} (see the onboarding email template) — this password
              is only shown once.
            </div>
            <div className="flex items-center gap-2 text-[13px] font-mono text-text bg-bg border border-line2 px-3.5 py-3 mb-2">
              {result.tempPassword}
            </div>
            <button
              onClick={copyPassword}
              className="text-xs font-semibold text-muted hover:text-accent cursor-pointer"
            >
              {copied ? "Copied ✓" : "Copy password"}
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
