"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Portal } from "@/components/ui/Portal";

export type FolderRow = { id: string; name: string; assetCount: number };

export function ManageFoldersDialog({
  projectId,
  folders,
  onClose,
  onChanged,
}: {
  projectId: string;
  folders: FolderRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addFolder() {
    if (!newName.trim()) return;
    setAdding(true);
    setError("");
    const res = await fetch(`/api/admin/projects/${projectId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to add folder.");
      setAdding(false);
      return;
    }
    setNewName("");
    setAdding(false);
    onChanged();
  }

  function startRename(f: FolderRow) {
    setRenamingId(f.id);
    setRenameDraft(f.name);
  }

  async function saveRename(id: string) {
    if (!renameDraft.trim()) {
      setRenamingId(null);
      return;
    }
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/admin/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameDraft.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to rename folder.");
      setBusyId(null);
      return;
    }
    setRenamingId(null);
    setBusyId(null);
    onChanged();
  }

  async function deleteFolder(id: string) {
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/admin/folders/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to delete folder.");
      setBusyId(null);
      return;
    }
    setConfirmingDeleteId(null);
    setBusyId(null);
    onChanged();
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6 bjfade"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[460px] bg-s2 border border-line2 p-7 bjrise"
        >
          <div className="text-xl font-black tracking-tight mb-1.5">
            Folders
          </div>
          <div className="text-[13px] text-muted mb-6">
            Client-facing sections within this project. Deleting a folder
            doesn&apos;t delete its assets — they just become Unsorted.
          </div>

          <div className="border border-line2 mb-4">
            {folders.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-b-0"
              >
                {renamingId === f.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => saveRename(f.id)}
                    onKeyDown={(e) => e.key === "Enter" && saveRename(f.id)}
                    className="flex-1 bg-bg border border-accent text-[13px] text-text px-2 py-1.5 outline-none"
                  />
                ) : (
                  <button
                    onClick={() => startRename(f)}
                    className="flex-1 min-w-0 text-left text-[13px] font-semibold truncate cursor-pointer hover:text-accent"
                  >
                    {f.name}
                  </button>
                )}
                <span className="text-[11px] text-dim flex-none">
                  {f.assetCount} asset{f.assetCount !== 1 ? "s" : ""}
                </span>
                {confirmingDeleteId === f.id ? (
                  <div className="flex items-center gap-1.5 flex-none">
                    <button
                      onClick={() => deleteFolder(f.id)}
                      disabled={busyId === f.id}
                      className="cursor-pointer text-[11px] font-semibold text-accentb hover:text-text border border-accentb px-2 py-1"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="cursor-pointer text-[11px] font-semibold text-muted hover:text-text px-1.5 py-1"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDeleteId(f.id)}
                    className="cursor-pointer flex-none text-[11px] font-semibold text-muted hover:text-accentb px-1.5 py-1"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
            {folders.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted">
                No folders yet.
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFolder()}
              placeholder="New folder name"
            />
            <Button onClick={addFolder} disabled={adding || !newName.trim()}>
              Add
            </Button>
          </div>

          {error && (
            <div className="text-xs text-accentb mt-4 font-semibold">
              {error}
            </div>
          )}

          <div className="flex justify-end mt-7">
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
