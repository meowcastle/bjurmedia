"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Dialog, useDialogExit } from "@/components/ui/Dialog";
import { IconCheck } from "@/components/ui/Icon";

export function NewClientDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { close, closing } = useDialogExit(onClose);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    /** Null when the owner already had a login and was linked rather than created. */
    tempPassword: string | null;
    ownerEmail: string;
    emailed: boolean;
  } | null>(null);
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
      body: JSON.stringify({
        name: name.trim(),
        ownerName,
        ownerEmail,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to create client.");
      setLoading(false);
      return;
    }
    setResult({
      tempPassword: data.tempPassword ?? null,
      ownerEmail: ownerEmail.trim(),
      emailed: data.emailed === true,
    });
    setLoading(false);
    onCreated();
  }

  function copyPassword() {
    if (!result?.tempPassword) return;
    navigator.clipboard.writeText(result.tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <Dialog closing={closing} onDismiss={result ? undefined : close} panelClassName="max-w-[460px] p-7">
          {!result ? (
            <>
              <div className="text-[22px] font-black tracking-tight mb-6">
                New client
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

              {error && (
                <div className="text-xs text-accentb mt-4 font-semibold">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2.5 mt-7">
                <Button variant="secondary" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={loading}>
                  {loading ? "Creating…" : "Create client"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[22px] font-black tracking-tight mb-1.5">
                Client created
              </div>
              {/* Says what actually happened. It used to tell the admin to send the
                  credentials by hand, beside an email the route had already sent. */}
              <div className="text-[13px] text-muted mb-6" data-testid="client-created-note">
                {!result.tempPassword
                  ? `${result.ownerEmail} already has a login, now with access to this client.`
                  : result.emailed
                    ? `Login details sent to ${result.ownerEmail}.`
                    : `Email not sent — give ${result.ownerEmail} this password. It is only shown once.`}
              </div>
              {result.tempPassword && (
              <>
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
              </>
              )}
              <div className="flex justify-end mt-7">
                <Button onClick={close}>Done</Button>
              </div>
            </>
          )}
    </Dialog>
  );
}
