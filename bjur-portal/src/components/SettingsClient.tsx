"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

type SessionRow = {
  id: string;
  device: string;
  location: string | null;
  lastSeenAt: string;
  isCurrent: boolean;
};

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      className={`w-10 h-[22px] border border-line2 relative cursor-pointer flex-none ${
        on ? "bg-accent" : "bg-bg"
      }`}
    >
      <div
        className="w-4 h-4 bg-bg absolute top-[2px] transition-transform"
        style={{ transform: on ? "translateX(20px)" : "translateX(2px)" }}
      />
    </div>
  );
}

export function SettingsClient({
  companyName,
  initialName,
  initialEmail,
  initialNotifyDelivery,
  initialNotifyExpiry,
  initialSessions,
}: {
  companyName: string;
  initialName: string;
  initialEmail: string;
  initialNotifyDelivery: boolean;
  initialNotifyExpiry: boolean;
  initialSessions: SessionRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [profileMsg, setProfileMsg] = useState("");

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const [notifyDelivery, setNotifyDelivery] = useState(initialNotifyDelivery);
  const [notifyExpiry, setNotifyExpiry] = useState(initialNotifyExpiry);

  const [sessions, setSessions] = useState(initialSessions);

  async function saveProfile() {
    setProfileMsg("Saving…");
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    setProfileMsg(res.ok ? "Saved." : "Failed to save.");
  }

  async function savePassword() {
    if (pwNext !== pwConfirm) {
      setPwMsg("New passwords don't match.");
      return;
    }
    setPwMsg("Updating…");
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: pwCurrent, next: pwNext }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPwMsg(data.error ?? "Failed to update password.");
      return;
    }
    setPwCurrent("");
    setPwNext("");
    setPwConfirm("");
    setPwMsg("Updated. Other sessions were signed out.");
    setSessions((s) => s.filter((x) => x.isCurrent));
  }

  async function toggleNotify(key: "notifyDelivery" | "notifyExpiry") {
    const nextVal = key === "notifyDelivery" ? !notifyDelivery : !notifyExpiry;
    if (key === "notifyDelivery") setNotifyDelivery(nextVal);
    else setNotifyExpiry(nextVal);
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: nextVal }),
    });
  }

  async function revoke(id: string) {
    setSessions((s) => s.filter((x) => x.id !== id));
    await fetch(`/api/me/sessions/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="px-10 pt-8 pb-32 max-w-[820px] mx-auto bjfade">
      <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-text mb-6">
        ← All projects
      </Link>
      <div className="border-b-2 border-line2 pb-6 mb-8">
        <div className="text-[11px] tracking-[0.2em] uppercase text-accent font-bold mb-3">
          {companyName}
        </div>
        <h1 className="text-[38px] tracking-[-0.025em] font-black">Account settings</h1>
      </div>

      <div className="border border-line bg-s1 p-6 mb-5">
        <div className="text-[11px] tracking-wide uppercase text-muted font-bold mb-4">Profile</div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="Display name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={saveProfile}>Save profile</Button>
          {profileMsg && <span className="text-xs text-muted">{profileMsg}</span>}
        </div>
      </div>

      <div className="border border-line bg-s1 p-6 mb-5">
        <div className="text-[11px] tracking-wide uppercase text-muted font-bold mb-4">Security</div>
        <div className="flex flex-col gap-3.5 max-w-[360px] mb-4">
          <Field label="Current password" htmlFor="pwCur">
            <Input id="pwCur" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} />
          </Field>
          <Field label="New password" htmlFor="pwNext">
            <Input id="pwNext" type="password" value={pwNext} onChange={(e) => setPwNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="pwConfirm">
            <Input id="pwConfirm" type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={savePassword}>Update password</Button>
          {pwMsg && <span className="text-xs text-muted">{pwMsg}</span>}
        </div>
        <div className="mt-3 text-[11px] text-dim">
          Argon2 hashed · updating your password signs out all other sessions.
        </div>
      </div>

      <div className="border border-line bg-s1 p-6 mb-5">
        <div className="text-[11px] tracking-wide uppercase text-muted font-bold mb-1.5">Notifications</div>
        <div className="flex items-center justify-between gap-4 py-3.5 border-b border-line">
          <span className="text-sm">Email me when new work is delivered</span>
          <Toggle on={notifyDelivery} onChange={() => toggleNotify("notifyDelivery")} />
        </div>
        <div className="flex items-center justify-between gap-4 py-3.5">
          <span className="text-sm">Remind me before a gallery expires</span>
          <Toggle on={notifyExpiry} onChange={() => toggleNotify("notifyExpiry")} />
        </div>
      </div>

      <div className="border border-line bg-s1 p-6">
        <div className="text-[11px] tracking-wide uppercase text-muted font-bold mb-1.5">Active sessions</div>
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-4 py-3.5 border-b border-line last:border-b-0">
            <div>
              <div className="text-sm font-semibold">{s.device}</div>
              <div className="text-xs text-muted mt-0.5">
                {s.location ?? "Unknown location"} ·{" "}
                <span>{new Date(s.lastSeenAt).toLocaleString()}</span>
              </div>
            </div>
            {s.isCurrent ? (
              <span className="text-[11px] font-bold tracking-wide uppercase text-success">This device</span>
            ) : (
              <button
                onClick={() => revoke(s.id)}
                className="text-[11px] font-semibold text-muted border border-line2 px-3 py-1.5 hover:text-accentb hover:border-accentb cursor-pointer"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
