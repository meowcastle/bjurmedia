"use client";

import { useRef, useState } from "react";
import {
  entriesFromDataTransfer,
  entriesFromFileList,
  isJunkPath,
  uploadFile,
  type DroppedEntry,
  type QueueItem,
} from "@/lib/uploadEngine";

function fmtBytes(n: number) {
  const mb = n / (1024 * 1024);
  if (mb < 1000) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/**
 * The only screen a stranger sees.
 *
 * It carries the brand and nothing else — no header, no nav, no theme toggle, and dark
 * regardless of the client portal's light default, because a first-time visitor has no
 * stored preference and this is not part of the portal.
 *
 * Deliberately absent: the request name, who asked, what formats are accepted, a size
 * ceiling, an expiry date. If a request needs explaining, that belongs in the email or
 * the Slack message carrying the link. Here there is a wordmark and somewhere to drop
 * files.
 */
export function SendPageClient({
  state,
  clientName,
  token,
}: {
  state: "open" | "closed" | "missing";
  clientName: string;
  token: string;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [sender, setSender] = useState("");
  // What they are sending, in their words — it names the folder it lands in. Asked above
  // the drop zone, unlike the name, because it is about the work rather than the person.
  const [what, setWhat] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [sentAs, setSentAs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const base = `/api/send/${token}`;
  const staged = queue.filter((q) => q.status !== "done");

  function addEntries(raw: DroppedEntry[]) {
    const entries = raw.filter((e) => !isJunkPath(e.relativePath));
    if (entries.length === 0) return;
    setDone(false);
    setQueue((q) => {
      const seen = new Set(q.map((i) => `${i.relativePath}:${i.file.size}`));
      const additions: QueueItem[] = [];
      for (const { file, relativePath } of entries) {
        const key = `${relativePath}:${file.size}`;
        if (seen.has(key)) continue;
        seen.add(key);
        additions.push({
          file,
          relativePath,
          submissionId: null,
          receivedBytes: 0,
          sizeBytes: file.size,
          progress: 0,
          status: "pending",
        });
      }
      return [...q, ...additions];
    });
  }

  async function send() {
    if (sending || queue.length === 0) return;
    setSending(true);
    setError(null);

    let batch = batchId;
    if (!batch) {
      const res = await fetch(`${base}/upload-batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderName: sender.trim() || null, name: what.trim() || null }),
      });
      if (!res.ok) {
        setError(
          res.status === 410
            ? "This link has just closed. Ask for a new one."
            : "Could not start the upload. Try again."
        );
        setSending(false);
        return;
      }
      batch = (await res.json()).id as string;
      setBatchId(batch);
    }

    const pending = () => queue.filter((q) => q.status === "pending" || q.status === "uploading");
    let remaining = pending();
    // Snapshot per pass rather than iterating state: the array is replaced on every
    // progress update, and a stale closure would upload the wrong set.
    for (const item of remaining) {
      setQueue((q) => q.map((x) => (x.file === item.file ? { ...x, status: "uploading" } : x)));
      const result = await uploadFile(
        base,
        batch,
        item,
        (receivedBytes) =>
          setQueue((q) =>
            q.map((x) =>
              x.file === item.file
                ? { ...x, receivedBytes, progress: Math.round((receivedBytes / x.sizeBytes) * 100) }
                : x
            )
          ),
        () => false,
        (submissionId) =>
          setQueue((q) => q.map((x) => (x.file === item.file ? { ...x, submissionId } : x)))
      );
      setQueue((q) =>
        q.map((x) =>
          x.file === item.file
            ? { ...x, status: result.ok ? "done" : "error", note: result.note, progress: result.ok ? 100 : x.progress }
            : x
        )
      );
    }
    remaining = [];

    setSending(false);
    setSentAs(sender.trim() || null);
    setDone(true);
  }

  const brand = (
    <div className="mb-[54px] bjrise">
      <div className="bj-serif font-light leading-[.88] tracking-[-.035em] text-[clamp(54px,9vw,86px)]">
        BJUR
      </div>
      <div className="text-[11px] tracking-[.18em] uppercase text-dim mt-[18px]">{clientName}</div>
    </div>
  );

  // One state for both causes — a closed link and an expired one read the same, because
  // the difference is ours and not theirs.
  if (state !== "open") {
    return (
      <div
        data-theme="dark"
        className="min-h-screen bg-bg text-text grid place-items-center px-6 pt-[72px] pb-[120px]"
      >
        <div className="w-full max-w-[560px]">
          {brand}
          <div className="border-t border-line2 pt-6" data-testid="send-closed">
            <div className="text-[15px] text-body">This link is closed.</div>
            <div className="text-[11.5px] text-dim leading-[1.7] mt-2">
              Ask for a new one at{" "}
              <a href="mailto:hello@bjurmedia.nyc" className="text-muted border-b border-line2">
                hello@bjurmedia.nyc
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme="dark"
      className="min-h-screen bg-bg text-text grid place-items-center px-6 pt-[72px] pb-[120px]"
    >
      <div className="w-full max-w-[560px]">
        {brand}

        {/* Present in every live state, including after a successful send — the page
            never stops accepting files. */}
        {/* Above the drop zone: it names the folder everything below lands in, and
            asking afterwards would mean renaming a folder with bytes already in it. */}
        <div className="mb-[22px]">
          <label htmlFor="what" className="block text-[10px] tracking-[.1em] uppercase text-dim">
            What are you sending?
          </label>
          <input
            id="what"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            disabled={sending || done}
            placeholder="e.g. Xavier, Hurt footage and project files"
            data-testid="send-what"
            className="w-full bg-transparent border-b border-line2 focus:border-text text-[15px] pt-1.5 pb-2.5 outline-none disabled:opacity-60"
          />
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            addEntries(await entriesFromDataTransfer(e.dataTransfer));
          }}
          data-testid="send-dropzone"
          className={`w-full border border-dashed px-6 py-[62px] flex flex-col items-center gap-[11px] cursor-pointer ${
            dragging ? "border-text bg-inkA" : "border-line2 hover:border-text hover:bg-inkA"
          }`}
        >
          <span className="text-[13px] text-body">Drop files here</span>
          <span className="text-[11px] text-dim">or choose from your computer</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addEntries(entriesFromFileList(e.target.files));
            e.target.value = "";
          }}
        />

        {queue.length > 0 && (
          <div className="mt-7" data-testid="send-list">
            {queue.map((item) => (
              <div
                key={`${item.relativePath}:${item.sizeBytes}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-[5px] py-[13px] border-b border-line"
              >
                <span className="text-[12px] truncate">{item.relativePath}</span>
                <span
                  className={`text-[10.5px] tracking-[.06em] uppercase whitespace-nowrap ${
                    item.status === "done"
                      ? "text-ok"
                      : item.status === "error"
                        ? "text-accentb"
                        : item.status === "uploading"
                          ? "text-muted"
                          : "text-dim2"
                  }`}
                >
                  {item.status === "done"
                    ? "✓ Sent"
                    : item.status === "error"
                      ? "Failed"
                      : item.status === "uploading"
                        ? `${item.progress}%`
                        : sending
                          ? "Queued"
                          : "Ready"}
                </span>
                <span className="text-[10.5px] text-dim">{fmtBytes(item.sizeBytes)}</span>
                <span className="col-span-2 h-[2px] bg-white/10 mt-1">
                  <span
                    className="block h-full bg-text transition-[width] duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Only once files are staged, and gone again once they are sent: asking a
            stranger for their name before they have decided to send anything is a form. */}
        {staged.length > 0 && !sending && !done && (
          <div className="mt-[26px]">
            <label htmlFor="sender" className="block text-[10px] tracking-[.1em] uppercase text-dim">
              Who&apos;s sending? <span className="text-dim2">— optional</span>
            </label>
            <input
              id="sender"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="Your name"
              data-testid="send-sender"
              className="w-full bg-transparent border-b border-line2 focus:border-text text-[15px] pt-1.5 pb-2.5 outline-none"
            />
          </div>
        )}

        {staged.length > 0 && (
          <button
            onClick={send}
            disabled={sending}
            data-testid="send-submit"
            className="w-full bg-text text-bg px-4 py-[15px] mt-[26px] text-[11px] tracking-[.08em] uppercase font-semibold disabled:opacity-60 cursor-pointer disabled:cursor-default"
          >
            {sending
              ? "Sending…"
              : `Send ${staged.length} file${staged.length === 1 ? "" : "s"} →`}
          </button>
        )}

        {error && <div className="text-[11.5px] text-accentb mt-4">{error}</div>}

        {done && (
          <div className="text-[13px] text-body mt-[26px]" data-testid="send-done">
            Bjur has it.{sentAs ? ` Sent as ${sentAs}.` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
