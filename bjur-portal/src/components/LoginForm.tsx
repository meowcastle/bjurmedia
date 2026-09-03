"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function LoginForm({
  portal,
  kicker,
  headA,
  headB,
  blurb,
  eyebrow,
  formTitle,
  demoEmail,
  switchHref,
  switchLabel,
  redirectTo,
}: {
  portal: "client" | "admin";
  kicker: string;
  headA: string;
  headB: string;
  blurb: string;
  eyebrow: string;
  formTitle: string;
  demoEmail: string;
  switchHref: string;
  switchLabel: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function requestReset() {
    // Fire and forget: the endpoint answers the same either way, so there is nothing
    // to branch on and nothing useful to say about a failure.
    setResetSent(true);
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, portal }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Sign in failed.");
        setLoading(false);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1.15fr_.85fr]">
      {/* left: cinematic panel */}
      <div className="relative hidden md:flex flex-col justify-center px-[6vw] bg-s1 border-r-2 border-line2">
        <div className="absolute top-9 left-[6vw] flex items-center gap-3">
          <div className="w-4 h-4 bg-accent" />
          <span className="font-black tracking-wide text-base">BJUR</span>
          <span className="font-semibold tracking-[0.34em] text-sm text-muted">MEDIA</span>
        </div>
        <div className="max-w-[520px] bjrise">
          <div className="text-[11px] tracking-[0.28em] uppercase text-accent font-bold mb-6">
            {kicker}
          </div>
          <h1 className="text-[clamp(42px,5.6vw,76px)] leading-[0.94] tracking-[-0.03em] font-black mb-5">
            {headA}
            <br />
            {headB}
          </h1>
          <p className="text-base leading-relaxed text-muted max-w-[420px]">{blurb}</p>
        </div>
        <div className="absolute bottom-8 left-[6vw] text-[11px] text-dim tracking-wide">
          Self-hosted · Synology NAS · © Bjur Media 2026
        </div>
      </div>

      {/* right: sign-in form */}
      <div className="flex flex-col justify-center px-[5vw] bg-s1 md:bg-transparent">
        <div className="w-full max-w-[360px] mx-auto bjfade">
          <div className="text-[11px] tracking-[0.2em] uppercase text-muted font-bold mb-2.5">
            {eyebrow}
          </div>
          <h2 className="text-[28px] tracking-[-0.02em] font-black mb-7">{formTitle}</h2>

          <form onSubmit={onSubmit}>
            <div className="mb-4">
              <label htmlFor="login-email" className="block text-[11px] tracking-wide uppercase text-muted font-semibold mb-2">
                Email
              </label>
              <input
                id="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="username"
                placeholder={demoEmail}
                className={`w-full bg-bg border text-text text-[15px] px-3.5 py-3.5 outline-none focus:border-accent transition-colors ${
                  error ? "border-accentb" : "border-line2"
                }`}
              />
            </div>
            <div className="mb-5">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <label htmlFor="login-password" className="block text-[11px] tracking-wide uppercase text-muted font-semibold">
                  Password
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="cursor-pointer text-[11px] font-bold uppercase text-muted hover:text-text py-2"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={requestReset}
                    className="cursor-pointer text-[11px] font-bold uppercase text-accentb hover:text-accent py-2"
                  >
                    Forgot?
                  </button>
                </div>
              </div>
              <input
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                className={`w-full bg-bg border text-text text-[15px] px-3.5 py-3.5 outline-none focus:border-accent transition-colors ${
                  error ? "border-accentb" : "border-line2"
                }`}
              />
              {resetSent && (
                <div className="mt-3 border border-success/50 p-3 text-xs text-muted">
                  We&apos;ve told the studio you need a reset. You&apos;ll get an email from Bjur
                  Media shortly.
                </div>
              )}
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-accentb mb-4 font-semibold">
                <span className="w-3.5 h-3.5 border-[1.5px] border-accentb rounded-full grid place-items-center text-[9px]">
                  !
                </span>
                {error}
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2">
              {loading ? "Signing in…" : "Sign in →"}
            </Button>
          </form>

          <div className="mt-4 text-[11px] text-dim">
            Need access or a new login?{" "}
            <a href="mailto:hello@bjur.media" className="font-bold text-muted hover:text-accent">
              Contact Bjur Media
            </a>
          </div>

          <div className="mt-6 pt-5 border-t border-line flex items-center justify-between gap-3 text-[11px] text-dim">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-success" />
              Secure connection
            </span>
            <a href={switchHref} className="cursor-pointer text-dim font-semibold hover:text-accent">
              {switchLabel}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
