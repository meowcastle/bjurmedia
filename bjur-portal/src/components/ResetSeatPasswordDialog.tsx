"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, useDialogExit } from "@/components/ui/Dialog";
import { IconCheck } from "@/components/ui/Icon";

export function ResetSeatPasswordDialog({
  clientId,
  seatId,
  seatName,
  seatEmail,
  onClose,
}: {
  clientId: string;
  seatId: string;
  seatName: string;
  seatEmail: string;
  onClose: () => void;
}) {
  const { close, closing } = useDialogExit(onClose);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    tempPassword: string;
    emailed: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const res = await fetch(
      `/api/admin/clients/${clientId}/users/${seatId}/reset-password`,
      {
        method: "POST",
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to reset password.");
      setLoading(false);
      return;
    }
    setResult({ tempPassword: data.tempPassword, emailed: data.emailed });
    setLoading(false);
  }

  function copyPassword() {
    if (!result) return;
    navigator.clipboard.writeText(result.tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <Dialog closing={closing} onDismiss={result ? undefined : close} panelClassName="max-w-[420px] p-7">
          {!result ? (
            <>
              <div className="text-xl font-black tracking-tight mb-1.5">
                Reset password
              </div>
              <div className="text-[13px] text-muted mb-6">
                Generates a new temp password for {seatName} ({seatEmail}) and
                immediately invalidates the old one.
              </div>
              {error && (
                <div className="text-xs text-accentb mb-4 font-semibold">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2.5">
                <Button variant="secondary" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={loading}>
                  {loading ? "Resetting…" : "Reset password"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-black tracking-tight mb-1.5">
                Password reset
              </div>
              <div className="text-[13px] text-muted mb-6">
                {result.emailed
                  ? `Emailed to ${seatEmail}. Also shown here once, in case it doesn't land:`
                  : `SMTP isn't configured, so this wasn't emailed — send it to ${seatEmail} yourself. Shown only once:`}
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
                <Button onClick={close}>Done</Button>
              </div>
            </>
          )}
    </Dialog>
  );
}
