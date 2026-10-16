"use client";

import { useState } from "react";
import { Dialog, useDialogExit } from "@/components/ui/Dialog";
import { IconCheck } from "@/components/ui/Icon";

export type ClientOption = { id: string; name: string; hasSlackChannel: boolean };

type ProjectType = "DELIVERY" | "CALENDAR" | "FILM";

const TYPES: { id: ProjectType; label: string }[] = [
  { id: "DELIVERY", label: "Delivery" },
  { id: "FILM", label: "Film" },
  { id: "CALENDAR", label: "Social calendar" },
];

/**
 * The create sheet: client, title, type — the three things that cannot wait.
 *
 * Everything else is set where it is owned: expiry and payment on the project page, guest
 * reviewers on a Film project's page (+ Add guest), upload links on the client page.
 */
export function NewProjectDialog({
  clients,
  onClose,
  onCreated,
}: {
  clients: ClientOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { close, closing } = useDialogExit(onClose, "drawer");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [type, setType] = useState<ProjectType>("DELIVERY");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ inboxPath: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const client = clients.find((c) => c.id === clientId);
  const calendarBlocked = type === "CALENDAR" && client !== undefined && !client.hasSlackChannel;


  async function submit() {
    if (!title.trim() || !clientId) {
      setError("Client and title are required.");
      return;
    }
    if (calendarBlocked) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        title: title.trim(),
        type,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to create project.");
      setLoading(false);
      return;
    }
    setResult({ inboxPath: data.inboxPath });
    setLoading(false);
    onCreated();
  }

  function copyInbox(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }


  return (
    <Dialog
      variant="drawer"
      closing={closing}
      onDismiss={result ? undefined : close}
      panelClassName="max-w-[460px] p-7"
    >
          {!result ? (
            <>
              <div className="text-[22px] font-black tracking-tight mb-6">New project</div>

              <div className="flex flex-col gap-5">
                {clients.length > 1 && (
                  <div>
                    <span className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-2">
                      Client
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {clients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setClientId(c.id)}
                          className={`text-[11px] font-semibold px-2.5 py-1.5 border cursor-pointer ${
                            c.id === clientId
                              ? "border-text text-text"
                              : "border-line2 text-muted hover:border-text"
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <span className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-2">
                    Type
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {TYPES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setType(t.id)}
                        data-testid={`type-${t.id.toLowerCase()}`}
                        className={`text-left border px-3.5 py-3 cursor-pointer ${
                          type === t.id ? "border-text" : "border-line2 hover:border-text"
                        }`}
                      >
                        <span className="block text-[12px] font-semibold">{t.label}</span>
                      </button>
                    ))}
                  </div>
                  {calendarBlocked && (
                    <div className="text-[11px] text-accentb mt-2 leading-relaxed" data-testid="calendar-blocked">
                      Add a Slack channel for {client?.name} under Integrations first.
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="title"
                    className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-2"
                  >
                    Title
                  </label>
                  <input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Winter Campaign"
                    className="w-full bg-bg border border-line2 focus:border-accent px-4 py-3 text-sm outline-none"
                  />
                </div>

              </div>

              {error && <div className="text-xs text-accentb mt-4 font-semibold">{error}</div>}

              <div className="flex items-center gap-2.5 mt-7">
                <button
                  onClick={submit}
                  disabled={loading || calendarBlocked}
                  data-testid="create-project"
                  className="cursor-pointer bg-text text-bg hover:bg-accent px-5 py-3 text-[12px] font-semibold uppercase tracking-[.08em] disabled:opacity-50 disabled:cursor-default"
                >
                  {loading ? "Creating…" : "Create project"}
                </button>
                <button
                  onClick={close}
                  className="cursor-pointer text-[12px] font-semibold text-muted hover:text-text px-2"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[22px] font-black tracking-tight mb-6">
                <IconCheck /> Created.
              </div>

              <div className="shadow-1 border border-line2 bg-s1 p-4 mb-3">
                <span className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-1.5">
                  Inbox
                </span>
                <span className="block text-[12px] font-mono text-body break-all mb-2.5">
                  {result.inboxPath}
                </span>
                <button
                  onClick={() => copyInbox(result.inboxPath)}
                  className="cursor-pointer border border-line2 hover:border-text text-[10px] font-semibold uppercase tracking-[.08em] text-muted hover:text-text px-2.5 py-1.5"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <button
                onClick={close}
                className="cursor-pointer bg-text text-bg hover:bg-accent px-5 py-3 text-[12px] font-semibold uppercase tracking-[.08em] mt-7"
              >
                Done
              </button>
            </>
          )}
    </Dialog>
  );
}
