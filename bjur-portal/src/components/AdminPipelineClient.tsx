"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog, useDialogExit } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { Toast } from "@/components/ui/Toast";
import { STAGES, type Stage } from "@/lib/crm/stages";

type DealCard = {
  id: string;
  title: string;
  stage: Stage;
  stageChangedAt: string;
  amount: number | null;
  who: string | null;
  clientName: string | null;
  projectId: string | null;
  unpaid: boolean;
};
type TaskRow = { id: string; title: string; dueAt: string | null; dealTitle: string | null; agent: boolean };

function daysIn(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The pipeline (CRM.md §4): one column per stage, a card per deal. A card moves by drag
 * on a desktop and by its stage menu anywhere — a phone has no drag, and neither does a
 * keyboard. Moving it restarts the follow-up agent's clock for that deal.
 */
export function AdminPipelineClient({
  deals: serverDeals,
  tasks,
  clients,
}: {
  deals: DealCard[];
  tasks: TaskRow[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  // Moves not yet confirmed by the server, laid over its list. The list itself always
  // comes from the server, so a refresh brings in new deals instead of a stale copy.
  const [moving, setMoving] = useState<Record<string, Stage>>({});
  const deals = serverDeals.map((d) =>
    moving[d.id] && moving[d.id] !== d.stage ? { ...d, stage: moving[d.id], stageChangedAt: new Date().toISOString() } : d,
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function move(id: string, stage: Stage) {
    const current = deals.find((d) => d.id === id);
    if (!current || current.stage === stage) return;
    setMoving((m) => ({ ...m, [id]: stage }));
    const res = await fetch(`/api/admin/crm/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      // The card goes back where it was.
      setToast("Could not move that.");
      setMoving((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
      return;
    }
    // On success the overlay stays until the refreshed list agrees with it (and is ignored
    // from then on), so the card never flickers back while the refresh is in flight.
    router.refresh();
  }

  return (
    <div className="bj-adm bjfade">
      <section className="bj-adm-top">
        <div>
          <span className="bj-mono">
            {deals.length} deal{deals.length === 1 ? "" : "s"} · {tasks.length} to do
          </span>
          <h1 className="bj-big">Pipeline.</h1>
        </div>
        <div className="acts">
          <button type="button" className="bj-cta" onClick={() => setNewOpen(true)}>
            + Deal
          </button>
        </div>
      </section>

      <TaskList tasks={tasks} onChanged={() => router.refresh()} />

      <section className="bj-sx">
        <span className="bj-mono bj-lab">
          Deals<b>{deals.length}</b>
        </span>
      <div className="bj-chips bj-stages flex gap-3 overflow-x-auto pb-4" data-testid="pipeline">
        {STAGES.map(([stage, label]) => {
          const inStage = deals.filter((d) => d.stage === stage);
          return (
            <section
              key={stage}
              data-testid={`stage-${stage}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) void move(id, stage);
              }}
              // Columns share the width on a wide screen (all seven in view) and keep a
              // readable minimum on a narrow one, where the row scrolls instead.
              className={`bj-stage flex-1 min-w-[170px] transition-colors ${
                over === stage && dragging ? "over" : ""
              }`}
            >
              <div className="flex items-baseline justify-between py-2.5 bj-mono">
                <span>{label}</span>
                <span className="tabular-nums">{inStage.length}</span>
              </div>
              <div className="flex flex-col gap-2 py-2 min-h-24">
                {inStage.map((d, i) => (
                  <article
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", d.id);
                      setDragging(d.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    data-testid={`deal-${d.id}`}
                    style={{ "--i": i } as React.CSSProperties}
                    className={`bj-row bj-deal px-3 py-2.5 cursor-grab active:cursor-grabbing transition-colors ${
                      dragging === d.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="text-[14px] font-semibold leading-snug">{d.title}</div>
                    {d.who && <div className="bj-mono mt-1 truncate">{d.who}</div>}
                    <div className="flex items-center justify-between gap-2 mt-2 bj-mono">
                      <span className={d.unpaid ? "bj-pill red" : ""}>
                        {d.unpaid ? "Unpaid · " : ""}
                        {daysIn(d.stageChangedAt)}d
                      </span>
                      {d.amount != null && <span className="tabular-nums">${d.amount.toLocaleString("en-US")}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <select
                        value={d.stage}
                        onChange={(e) => void move(d.id, e.target.value as Stage)}
                        aria-label={`Stage for ${d.title}`}
                        className="bg-bg border border-line2 text-[11px] text-muted px-1.5 py-1 outline-none focus:border-accent"
                      >
                        {STAGES.map(([id, l]) => (
                          <option key={id} value={id}>
                            {l}
                          </option>
                        ))}
                      </select>
                      {d.projectId && (
                        <Link href={`/admin/projects/${d.projectId}`} className="bj-link">
                          Project
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      </section>

      {newOpen && (
        <NewDealDialog
          clients={clients}
          onClose={() => setNewOpen(false)}
          onCreated={(title) => {
            setToast(`Added "${title}"`);
            router.refresh();
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function TaskList({ tasks, onChanged }: { tasks: TaskRow[]; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    await fetch("/api/admin/crm/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueAt: due || null }),
    });
    setBusy(false);
    setTitle("");
    setDue("");
    onChanged();
  }

  async function done(id: string) {
    await fetch(`/api/admin/crm/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    onChanged();
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="bj-sx" data-testid="tasks">
      <span className="bj-mono bj-lab">
        To do<b>{tasks.length}</b>
      </span>
      <div>
      {tasks.map((t, i) => (
        <div
          key={t.id}
          className="bj-row flex items-center gap-3 py-2.5 border-b border-line"
          style={{ "--i": i } as React.CSSProperties}
        >
          <input
            type="checkbox"
            onChange={() => void done(t.id)}
            aria-label={`Done: ${t.title}`}
            className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
          />
          <span className="text-[15px] flex-1 min-w-0 truncate">
            {t.title}
            {t.agent && <span className="bj-pill ml-2">agent</span>}
          </span>
          {t.dueAt && (
            <span className={`bj-mono tabular-nums ${t.dueAt.slice(0, 10) < today ? "bj-sys-err" : ""}`}>
              {fmtDay(t.dueAt)}
            </span>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="Call Adam Friday"
          aria-label="New task"
          className="bj-in flex-1 min-w-0"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due"
          className="bj-in"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={!title.trim() || busy}
          className="bj-ghost disabled:opacity-40"
        >
          Add
        </button>
      </div>
      </div>
    </section>
  );
}

function NewDealDialog({
  clients,
  onClose,
  onCreated,
}: {
  clients: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (title: string) => void;
}) {
  const { close, closing } = useDialogExit(onClose);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<Stage>("LEAD");
  const [clientId, setClientId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/crm/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        stage,
        clientId: clientId || null,
        contactName,
        contactEmail,
        amount: amount ? Number(amount) : null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not add that deal.");
      return;
    }
    onCreated(title);
    close();
  }

  return (
    <Dialog closing={closing} onDismiss={close} panelClassName="max-w-[460px] p-7">
      <div className="text-[22px] font-black tracking-tight mb-6">New deal</div>
      <div className="flex flex-col gap-4">
        <Field label="Title" htmlFor="deal-title">
          <Input id="deal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring promo for Acme" />
        </Field>
        <Field label="Stage" htmlFor="deal-stage">
          <select
            id="deal-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage)}
            className="w-full bg-s2 border border-line px-4 py-3 text-sm text-text outline-none focus:border-accentb"
          >
            {STAGES.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Client" htmlFor="deal-client">
          <select
            id="deal-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full bg-s2 border border-line px-4 py-3 text-sm text-text outline-none focus:border-accentb"
          >
            <option value="">None yet (a lead)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contact name" htmlFor="deal-contact">
          <Input id="deal-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </Field>
        <Field label="Contact email" htmlFor="deal-email">
          <Input id="deal-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </Field>
        <Field label="Amount ($)" htmlFor="deal-amount">
          <Input id="deal-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
      </div>
      {error && <div className="text-xs text-accentb mt-4 font-semibold">{error}</div>}
      <div className="flex justify-end gap-2.5 mt-7">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button onClick={() => void create()} disabled={!title.trim()} loading={busy}>
          Add deal
        </Button>
      </div>
    </Dialog>
  );
}
