"use client";

import { useEffect, useState } from "react";
import { Portal } from "@/components/ui/Portal";
import { IconCheck } from "@/components/ui/Icon";

export type ClientOption = { id: string; name: string; hasSlackChannel: boolean };

type ProjectType = "DELIVERY" | "CALENDAR" | "FILM";

const TYPES: { id: ProjectType; label: string; blurb: string }[] = [
  { id: "DELIVERY", label: "Delivery", blurb: "A gig you hand over. Files land, the client takes them." },
  { id: "FILM", label: "Film", blurb: "Cuts & notes. One piece, reviewed cut by cut." },
  { id: "CALENDAR", label: "Social calendar", blurb: "Ongoing. Reels go on the board and post to Slack." },
];

/**
 * Defined at module scope, not inside the sheet: a component created during render is a
 * new type on every keystroke, so React throws its DOM away and rebuilds it — which in a
 * form means the focused field loses focus mid-typing.
 */
function Toggle({
  on,
  onChange,
  label,
  hint,
  disabled = false,
  testId,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
  hint: string;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      aria-pressed={on}
      aria-disabled={disabled}
      data-testid={testId}
      className={`text-left border px-3.5 py-3 ${
        disabled
          ? "border-line opacity-50 cursor-default"
          : on
            ? "border-text cursor-pointer"
            : "border-line2 hover:border-text cursor-pointer"
      }`}
    >
      <span className="flex items-center gap-2 text-[12px] font-semibold">
        <span className={`w-3 h-3 flex-none border ${on ? "bg-text border-text" : "border-line2"}`} />
        {label}
      </span>
      <span className="block text-[11px] text-dim mt-1 leading-relaxed">{hint}</span>
    </button>
  );
}

/**
 * The create sheet.
 *
 * A project's shape is fixed here and nowhere else, so this is the only screen that asks
 * what kind of thing it is. Everything on it either cannot be changed later (type,
 * review) or is a convenience for the first five minutes (start with a footage request,
 * hold for payment) — which is why it reads as a set of decisions rather than a form.
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
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [type, setType] = useState<ProjectType>("DELIVERY");
  const [guests, setGuests] = useState("");
  const [withRequest, setWithRequest] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [hold, setHold] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ inboxPath: string; sendPath: string | null } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const client = clients.find((c) => c.id === clientId);
  const calendarBlocked = type === "CALENDAR" && client !== undefined && !client.hasSlackChannel;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !result) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, result]);

  // Comma, space or newline — people paste addresses out of a mail client and the
  // separator is whatever that client used.
  const guestEmails = guests
    .split(/[,\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));

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
        guests: type === "FILM" ? guestEmails.map((email) => ({ email })) : undefined,
        startRequest: withRequest && requestName.trim() ? requestName.trim() : null,
        expiresAt: expiresAt || null,
        paymentHold: hold,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to create project.");
      setLoading(false);
      return;
    }
    setResult({ inboxPath: data.inboxPath, sendPath: data.sendPath ?? null });
    setLoading(false);
    onCreated();
  }

  function copy(value: string, key: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    });
  }


  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/70 flex justify-end bjfade"
        onClick={result ? undefined : onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[460px] h-full overflow-y-auto bg-s2 border-l border-line2 p-7"
        >
          {!result ? (
            <>
              <div className="text-[22px] font-black tracking-tight mb-1.5">New project</div>
              <div className="text-[13px] text-muted mb-6">
                Type is set here and cannot be changed later. Reviewers, title, payment and
                footage requests can change any time.
              </div>

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
                        <span className="block text-[11px] text-dim mt-1 leading-relaxed">
                          {t.blurb}
                        </span>
                      </button>
                    ))}
                  </div>
                  {calendarBlocked && (
                    <div className="text-[11px] text-accentb mt-2 leading-relaxed" data-testid="calendar-blocked">
                      Add a Slack channel for {client?.name} under Integrations first.
                    </div>
                  )}
                </div>

                {type === "FILM" && (
                  <div data-testid="reviewers-block">
                    <span className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-2">
                      Reviewers
                    </span>
                    <p className="text-[11.5px] text-muted leading-relaxed mb-2">
                      {client?.name ?? "The client"}&apos;s seats review automatically. Add anyone
                      else below — they get a link, no account.
                    </p>
                    <input
                      value={guests}
                      onChange={(e) => setGuests(e.target.value)}
                      placeholder="director@studio.com, label@records.com"
                      data-testid="guest-emails"
                      className="w-full bg-transparent border border-line2 focus:border-text outline-none px-3 py-2 text-[13px]"
                    />
                    {guestEmails.length > 0 && (
                      <div className="text-[11px] text-muted mt-1.5">
                        {guestEmails.length} guest{guestEmails.length === 1 ? "" : "s"} · they give
                        a name once and can never download anything.
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <span className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-2">
                    Add to it
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <Toggle
                      testId="add-request"
                      on={withRequest}
                      onChange={() => setWithRequest((v) => !v)}
                      label="Start with a footage request"
                      hint="Makes a send link the client can use without a login."
                    />
                    {withRequest && (
                      <input
                        value={requestName}
                        onChange={(e) => setRequestName(e.target.value)}
                        placeholder="What are they sending?"
                        aria-label="What are they sending?"
                        data-testid="request-name"
                        className="w-full bg-bg border border-line2 focus:border-accent px-3.5 py-2.5 text-[13px] outline-none"
                      />
                    )}
                  </div>
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
                  {title.trim() && (
                    <div className="text-[10.5px] font-mono text-dim2 mt-1.5 truncate">
                      _inbox/…/{title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-xxxx/
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="expires"
                    className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-2"
                  >
                    Expires (optional)
                  </label>
                  <input
                    id="expires"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full bg-bg border border-line2 focus:border-accent px-4 py-3 text-sm font-mono outline-none"
                  />
                </div>

                <div>
                  <span className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-2">
                    Payment
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { on: false, label: "Clear", hint: "Downloads are clean." },
                      { on: true, label: "Hold", hint: "Downloads carry a mark until you release." },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => setHold(o.on)}
                        data-testid={`pay-${o.label.toLowerCase()}`}
                        className={`text-left border px-3.5 py-3 cursor-pointer ${
                          hold === o.on ? "border-text" : "border-line2 hover:border-text"
                        }`}
                      >
                        <span className="block text-[12px] font-semibold">{o.label}</span>
                        <span className="block text-[11px] text-dim mt-1 leading-relaxed">
                          {o.hint}
                        </span>
                      </button>
                    ))}
                  </div>
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
                  onClick={onClose}
                  className="cursor-pointer text-[12px] font-semibold text-muted hover:text-text px-2"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[22px] font-black tracking-tight mb-1.5">
                <IconCheck /> Project created
              </div>
              <div className="text-[13px] text-muted mb-6">
                Point exports at the inbox. It goes live when the first file lands.
              </div>

              <div className="border border-line2 bg-s1 p-4 mb-3">
                <span className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-1.5">
                  Inbox
                </span>
                <span className="block text-[12px] font-mono text-body break-all mb-2.5">
                  {result.inboxPath}
                </span>
                <button
                  onClick={() => copy(result.inboxPath, "inbox")}
                  className="cursor-pointer border border-line2 hover:border-text text-[10px] font-semibold uppercase tracking-[.08em] text-muted hover:text-text px-2.5 py-1.5"
                >
                  {copied === "inbox" ? "Copied" : "Copy"}
                </button>
              </div>

              {result.sendPath && (
                <div className="border border-line2 bg-s1 p-4" data-testid="send-link">
                  <span className="block text-[10px] tracking-[0.1em] uppercase text-dim mb-1.5">
                    Send link
                  </span>
                  <span className="block text-[12px] font-mono text-body break-all mb-2.5">
                    {result.sendPath}
                  </span>
                  <button
                    onClick={() =>
                      copy(`${window.location.origin}${result.sendPath}`, "send")
                    }
                    className="cursor-pointer border border-line2 hover:border-text text-[10px] font-semibold uppercase tracking-[.08em] text-muted hover:text-text px-2.5 py-1.5"
                  >
                    {copied === "send" ? "Copied" : "Copy"}
                  </button>
                </div>
              )}

              <button
                onClick={onClose}
                className="cursor-pointer bg-text text-bg hover:bg-accent px-5 py-3 text-[12px] font-semibold uppercase tracking-[.08em] mt-7"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
