"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Portal } from "@/components/ui/Portal";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ tempPassword: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/clients/${clientId}/users/${seatId}/reset-password`, {
      method: "POST",
    });
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
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade" onClick={result ? undefined : onClose}>
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] bg-s2 border border-line2 p-7 bjrise">
          {!result ? (
            <>
              <div className="text-xl font-black tracking-tight mb-1.5">Reset password</div>
              <div className="text-[13px] text-muted mb-6">
                Generates a new temp password for {seatName} ({seatEmail}) and immediately invalidates
                the old one.
              </div>
              {error && <div className="text-xs text-accentb mb-4 font-semibold">{error}</div>}
              <div className="flex justify-end gap-2.5">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={loading}>
                  {loading ? "Resetting…" : "Reset password"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-black tracking-tight mb-1.5">Password reset</div>
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
