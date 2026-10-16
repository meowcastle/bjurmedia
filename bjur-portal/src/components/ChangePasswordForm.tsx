"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to update password.");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid place-items-center px-6 bjfade">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-3.5 h-3.5 bg-accent" />
          <span className="font-black text-[15px]">BJUR</span>
          <span className="font-semibold tracking-[0.3em] text-[11px] text-muted">MEDIA</span>
        </div>
        <h1 className="bj-serif text-[28px] font-normal mb-7">Set your password</h1>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Temporary password" htmlFor="current">
            <Input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="New password" htmlFor="next">
            <Input id="next" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm">
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>

          {error && <div className="text-xs text-accentb font-semibold">{error}</div>}

          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "Saving…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
