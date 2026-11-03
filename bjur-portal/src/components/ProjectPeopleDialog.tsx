"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Dialog, useDialogExit } from "@/components/ui/Dialog";
import type { ProjectPerson } from "@/lib/projectPeople";

/**
 * People on one project, for its owners: who can see it, and adding or removing the
 * people they brought in. Two grants only, View and View and download; owners and the
 * studio's guests are listed but changed through us (lib/projectPeople.ts).
 */
export function ProjectPeopleDialog({
  projectId,
  projectTitle,
  isFilm,
  onClose,
}: {
  projectId: string;
  projectTitle: string;
  isFilm: boolean;
  onClose: () => void;
}) {
  const { close, closing } = useDialogExit(onClose);
  const [people, setPeople] = useState<ProjectPerson[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"VIEWER" | "DOWNLOADER">("VIEWER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    fetch(`/api/client/projects/${projectId}/people`)
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((d) => setPeople(d.people))
      .catch(() => setPeople([]));
  }, [projectId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setDone("");
    const res = await fetch(`/api/client/projects/${projectId}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) {
      setError(data?.error ?? "That did not save. Try again.");
      return;
    }
    setPeople(data.people);
    setName("");
    setEmail("");
    setDone(
      data.mailed === "cut"
        ? `${data.name} is in. We emailed them the latest cut with their login.`
        : data.mailed === "welcome"
          ? `${data.name} is in. We emailed them their login.`
          : `${data.name} can now open ${projectTitle}.`
    );
  }

  async function remove(person: ProjectPerson) {
    setError("");
    setDone("");
    const res = await fetch(`/api/client/projects/${projectId}/people/${person.id}`, { method: "DELETE" }).catch(
      () => null
    );
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setError(data?.error ?? "That did not save. Try again.");
      return;
    }
    setPeople(data.people);
    setDone(`${person.name} no longer has access to ${projectTitle}.`);
  }

  const access = (p: ProjectPerson) =>
    p.kind === "GUEST"
      ? "Guest link"
      : p.role === "OWNER"
        ? "Owner"
        : p.role === "DOWNLOADER"
          ? "View and download"
          : "View";

  return (
    <Dialog closing={closing} onDismiss={close} panelClassName="max-w-[520px] p-7">
      <div data-testid="people-dialog">
        <div className="text-xl font-black tracking-tight mb-1.5">People on {projectTitle}</div>
        <p className="text-[13px] text-muted mb-5">
          {isFilm
            ? "Anyone you add can watch the cuts and leave notes. Only owners approve a cut."
            : "Anyone you add sees this project only."}
        </p>

        <ul className="border-t border-line mb-6" data-testid="people-list">
          {people === null && <li className="py-3 text-[13px] text-muted">Loading…</li>}
          {people?.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3 border-b border-line">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold truncate">{p.name}</div>
                <div className="text-[12px] text-muted truncate">
                  {p.email}
                  {p.invited ? " · invited" : ""}
                </div>
              </div>
              <span className="bj-mono text-[11px] text-muted whitespace-nowrap">
                {access(p)}
                {p.allProjects ? " · all projects" : ""}
              </span>
              {p.removable && (
                <button
                  type="button"
                  className="bj-link text-[12px]"
                  onClick={() => void remove(p)}
                  aria-label={`Remove ${p.name}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={add} className="flex flex-col gap-4">
          <div className="text-[13px] font-semibold">Add someone</div>
          <Field label="Name" htmlFor="pname">
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="pemail">
            <Input id="pemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Access" htmlFor="prole">
            <select
              id="prole"
              value={role}
              onChange={(e) => setRole(e.target.value as "VIEWER" | "DOWNLOADER")}
              className="w-full bg-bg border border-line2 px-4 py-3 text-sm text-text outline-none focus:border-accent"
            >
              <option value="VIEWER">View{isFilm ? " and leave notes" : ""}</option>
              <option value="DOWNLOADER">View{isFilm ? ", leave notes" : ""} and download</option>
            </select>
          </Field>
          {error && (
            <p className="text-[13px] text-accent" role="alert" data-testid="people-error">
              {error}
            </p>
          )}
          {done && (
            <p className="text-[13px]" role="status" data-testid="people-done">
              {done}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={close}>
              Done
            </Button>
            <Button type="submit" loading={busy} disabled={!name.trim() || !email.trim()}>
              Add and email them
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
