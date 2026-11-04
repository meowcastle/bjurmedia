"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

/**
 * The page an emailed reset link opens. `email` is null when the link is spent or
 * expired, and then the only thing to offer is the way back to ask for another.
 */
export function ResetPasswordForm({
  token,
  email,
  redirectTo = "/",
}: {
  token: string;
  email: string | null;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(email == null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      if (data?.expired) setExpired(true);
      setError(data?.error ?? "That did not save. Try again.");
      setLoading(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="min-h-dvh grid place-items-center px-6 bjfade">
      <div className="w-full max-w-[400px]" data-testid="reset-page">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-3.5 h-3.5 bg-accent" />
          <span className="font-black text-[15px]">BJUR</span>
          <span className="font-semibold tracking-[0.3em] text-[11px] text-muted">MEDIA</span>
        </div>

        {expired ? (
          <div data-testid="reset-expired">
            <h1 className="bj-serif text-[28px] font-normal mb-4">This link has run out</h1>
            <p className="text-[14px] text-muted mb-7">
              Reset links work once, for 30 minutes. Ask for a new one from the sign in page.
            </p>
            <Button type="button" onClick={() => router.push("/login")}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <>
            <h1 className="bj-serif text-[28px] font-normal mb-2">Choose a new password</h1>
            <p className="text-[13px] text-muted mb-7">For {email}</p>
            <form onSubmit={submit} className="flex flex-col gap-4">
              {/* Lets a password manager save the new password against the right login. */}
              <input type="email" name="email" value={email ?? ""} autoComplete="username" readOnly hidden />
              <Field label="New password" htmlFor="new-password">
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </Field>
              <Field label="Confirm new password" htmlFor="confirm-password">
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>

              {error && (
                <div className="text-xs text-accentb font-semibold" role="alert" data-testid="reset-error">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading} className="mt-2">
                {loading ? "Saving…" : "Save and sign in"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
