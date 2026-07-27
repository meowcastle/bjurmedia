"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Portal } from "@/components/ui/Portal";
import { CHANNEL_OPTIONS, composeCustomScope, type ChannelKey } from "@/lib/licensing";

type Seat = { id: string; name: string; email: string };

export function GrantLicenseDialog({
  assetId,
  assetName,
  clientName,
  seats,
  onClose,
  onGranted,
}: {
  assetId: string;
  assetName: string;
  clientName: string;
  seats: Seat[];
  onClose: () => void;
  onGranted: () => void;
}) {
  const [userId, setUserId] = useState(seats[0]?.id ?? "");
  const [termMonths, setTermMonths] = useState("");
  const [territory, setTerritory] = useState("");
  const [channels, setChannels] = useState<ChannelKey[]>([]);
  const [exclusive, setExclusive] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const scopePreview = composeCustomScope({
    termMonths: termMonths ? Number(termMonths) : null,
    territory: territory || null,
    channels,
    exclusive,
  });

  function toggleChannel(key: ChannelKey) {
    setChannels((cs) => (cs.includes(key) ? cs.filter((c) => c !== key) : [...cs, key]));
  }

  async function submit() {
    if (!userId) {
      setError("Select a seat to attribute this license to.");
      return;
    }
    if (!amount.trim() || Number(amount) < 0) {
      setError("Enter a valid amount.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId,
        userId,
        termMonths: termMonths ? Number(termMonths) : null,
        territory: territory || null,
        channels,
        exclusive,
        amount: Number(amount),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to grant license.");
      setLoading(false);
      return;
    }
    setLoading(false);
    onGranted();
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[480px] bg-s2 border border-line2 p-7 bjrise">
          <div className="text-xl font-black tracking-tight mb-1.5">Grant custom license</div>
          <div className="text-[13px] text-muted mb-6">
            {assetName} · {clientName}
          </div>

          <div className="flex flex-col gap-4">
            <Field label="Attribute to" htmlFor="gl-seat">
              <select
                id="gl-seat"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full bg-bg border border-line2 px-4 py-3 text-sm text-text outline-none focus:border-accent"
              >
                {seats.length === 0 && <option value="">No seats on this client yet</option>}
                {seats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Term (months)" htmlFor="gl-term">
                <Input
                  id="gl-term"
                  type="number"
                  min={0}
                  placeholder="Blank = perpetuity"
                  value={termMonths}
                  onChange={(e) => setTermMonths(e.target.value)}
                />
              </Field>
              <Field label="Territory" htmlFor="gl-territory">
                <Input
                  id="gl-territory"
                  placeholder="Blank = Worldwide"
                  value={territory}
                  onChange={(e) => setTerritory(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Media channels" htmlFor="gl-channels">
              <div id="gl-channels" className="flex flex-wrap gap-2">
                {CHANNEL_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleChannel(c.key)}
                    className={`cursor-pointer text-[11px] font-semibold px-3 py-2 border ${
                      channels.includes(c.key)
                        ? "text-bg bg-accent border-accent"
                        : "text-muted border-line2 hover:text-text hover:border-text"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-text">Exclusive</span>
            </label>

            <Field label="Amount ($)" htmlFor="gl-amount">
              <Input id="gl-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>

            <div className="bg-bg border border-line2 px-3.5 py-3 text-[12px] text-muted">
              <span className="text-[10px] uppercase tracking-widest text-dim block mb-1">Scope preview</span>
              {scopePreview}
            </div>
          </div>

          {error && <div className="text-xs text-accentb mt-4 font-semibold">{error}</div>}

          <div className="flex justify-end gap-2.5 mt-7">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading || seats.length === 0}>
              {loading ? "Granting…" : "Grant license"}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
