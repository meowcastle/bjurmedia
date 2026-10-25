"use client";

import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useRouter } from "next/navigation";
import { Seal } from "@/components/ui/Seal";

/**
 * Sign in (PortalLogin13): one centred column, no photo. The seal stamps in once per page
 * load (the Home11 press, 1.25s), then the copy and the form rise in at about 0.9s. An
 * error is a re-render, not a reload, so it never replays the stamp. Under reduced motion
 * the stamp is still and everything shows at once.
 */
export function LoginForm({
  portal,
  label,
  demoEmail,
  redirectTo,
  moved = false,
}: {
  portal: "client" | "admin";
  /** The mono label over the headline: "Client portal", or "Studio" for staff. */
  label: string;
  demoEmail: string;
  redirectTo: string;
  /** Arrived through the portal.justinbjur.com redirect (?from=jb). */
  moved?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [pre, setPre] = useState(true);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reduced motion: no stamp, everything at once (on the next tick, not mid-effect).
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const go = still ? undefined : setTimeout(() => stage.current?.classList.add("go"), 250);
    const rise = setTimeout(() => setPre(false), still ? 0 : 250 + 900);
    return () => { clearTimeout(go); clearTimeout(rise); };
  }, []);

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
    <div className="bj-page">
      <nav className="bj-nav" style={{ gridTemplateColumns: "1fr auto" }} aria-label="Primary">
        <a className="bj-mono" href="https://bjur.nyc">&larr; bjur.nyc</a>
        <div className="r"><ThemeToggle portal={portal} /></div>
      </nav>

      <section className={`bj-login ${pre ? "pre" : ""}`}>
        <div className="col">
          <div className="stage" ref={stage} role="img" aria-label="BJUR">
            <div className="shd" />
            <div className="ring" />
            <div className="st"><Seal className="" /></div>
          </div>
          {moved && <p className="bj-mono moved">We&apos;ve moved from portal.justinbjur.com. Same login.</p>}
          <span className="bj-mono kick after d1">{label}</span>
          <h1 className="bj-mid after d1">Your work,<br />ready when you are.</h1>
          <p className="bj-lead after d2">Review cuts, leave notes on the frame, and download your masters.</p>

          <form className="after d3" onSubmit={onSubmit}>
            <label className="fld">
              <span className="bj-mono">Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="username"
                placeholder={demoEmail}
                aria-invalid={error ? true : undefined}
              />
            </label>
            <label className="fld">
              <span className="bj-mono">Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                aria-invalid={error ? true : undefined}
              />
            </label>
            {error && <p className="err" role="alert">{error}</p>}
            <button className="bj-cta" type="submit" disabled={loading}>
              {loading ? "Signing in…" : <>Sign in <i aria-hidden="true">&rarr;</i></>}
            </button>
            <button type="button" className="bj-link forgot" onClick={requestReset}>Forgot password</button>
            {resetSent && (
              <p className="sent" role="status">
                We&apos;ve let the studio know you need a reset. You&apos;ll get an email from us shortly.
              </p>
            )}
          </form>
          <p className="note after d3">
            Your login is just for you. Need one for someone else on your team? <a href="mailto:hi@bjur.nyc">Ask us</a>.
          </p>
        </div>
      </section>

      <footer className="bj-foot"><span>Bjur · Brooklyn, NY</span><a className="c" href="mailto:hi@bjur.nyc">hi@bjur.nyc</a><span className="rr">portal.bjur.nyc</span></footer>
    </div>
  );
}
