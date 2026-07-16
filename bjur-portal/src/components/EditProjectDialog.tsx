"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Portal } from "@/components/ui/Portal";

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  deliveredAt: string | null;
  expiresAt: string | null;
  clientType: "RETAINER" | "ONEOFF";
};

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function EditProjectDialog({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [status, setStatus] = useState(project.status);
  const [deliveredAt, setDeliveredAt] = useState(toDateInput(project.deliveredAt));
  const [expiresAt, setExpiresAt] = useState(toDateInput(project.expiresAt));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isRetainer = project.clientType === "RETAINER";

  async function submit() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        status,
        deliveredAt: deliveredAt || null,
        expiresAt: isRetainer ? null : expiresAt || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to save.");
      setLoading(false);
      return;
    }
    onSaved();
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[460px] bg-s2 border border-line2 p-7 bjrise">
        <div className="text-[22px] font-black tracking-tight mb-6">Edit project</div>

        <div className="flex flex-col gap-4">
          <Field label="Project title" htmlFor="etitle">
            <Input id="etitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <Field label="Status" htmlFor="estatus">
            <select
              id="estatus"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-bg border border-line2 px-4 py-3 text-sm text-text outline-none focus:border-accent"
            >
              <option value="DRAFT">Draft — hidden from client</option>
              <option value="LIVE">Live — visible to client</option>
            </select>
          </Field>

          <Field label="Delivered" htmlFor="edelivered">
            <Input id="edelivered" type="date" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
          </Field>

          {isRetainer ? (
            <div className="text-xs text-dim">Permanent library — retainer clients never expire.</div>
          ) : (
            <Field label="Expires" htmlFor="eexpires">
              <Input id="eexpires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
          )}
        </div>

        {error && <div className="text-xs text-accentb mt-4 font-semibold">{error}</div>}

        <div className="flex justify-end gap-2.5 mt-7">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
