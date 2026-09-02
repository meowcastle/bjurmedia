"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Portal } from "@/components/ui/Portal";

export function AddAdminDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to add admin.");
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
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] bg-s2 border border-line2 p-7 bjrise">
          {!result ? (
            <>
              <div className="text-xl font-black tracking-tight mb-1.5">Add admin</div>
              <div className="text-[13px] text-muted mb-6">
                Full staff access: every client, project and integration.
              </div>

              <div className="flex flex-col gap-4">
                <Field label="Name" htmlFor="aname">
                  <Input id="aname" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Email" htmlFor="aemail">
                  <Input id="aemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>

              {error && <div className="text-xs text-accentb mt-4 font-semibold">{error}</div>}

              <div className="flex justify-end gap-2.5 mt-7">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={loading}>
                  {loading ? "Adding…" : "Add admin"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-black tracking-tight mb-1.5">Admin added</div>
              <div className="text-[13px] text-muted mb-6">
                Send this temp password to {email} — shown only once. They sign in at /admin/login
                and are asked to change it.
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
