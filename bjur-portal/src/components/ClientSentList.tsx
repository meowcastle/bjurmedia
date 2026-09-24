import { formatBytes } from "@/lib/format";

/**
 * What this client has sent us. A record, and nothing more.
 *
 * No filenames, no links, nothing openable. Submissions are working material on our
 * server — rushes, project files, audio stems — not a library the client browses back
 * through. The rule is enforced by no route serving these files to a client session;
 * this list simply has nothing to offer because there is nothing it could offer.
 */
export function ClientSentList({
  batches,
}: {
  batches: {
    id: string;
    name: string;
    who: string;
    fileCount: number;
    complete: boolean;
    receivedBytes: string;
    kinds: string[];
    createdAt: string;
  }[];
}) {
  if (batches.length === 0) return null;

  return (
    <div className="px-4 sm:px-6 md:px-10 pb-24 max-w-[720px] mx-auto" data-testid="client-sent">
      <div className="flex items-baseline justify-between gap-4 pb-2.5 border-b border-line2 mb-1">
        <span className="text-[11px] tracking-[0.1em] uppercase text-dim">Sent</span>
        <span className="text-[11px] text-dim2">
          {batches.length} batch{batches.length === 1 ? "" : "es"}
        </span>
      </div>

      {batches.map((b) => (
        <div
          key={b.id}
          data-testid={`sent-${b.id}`}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1 py-3.5 border-b border-line"
        >
          <span className="text-[14px] truncate">{b.name}</span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-[.08em] whitespace-nowrap ${
              b.complete ? "text-dim2" : "text-success"
            }`}
          >
            {b.complete ? "Received" : "Uploading"}
          </span>
          <span className="text-[11px] text-muted">
            {b.who} · {b.fileCount} file{b.fileCount === 1 ? "" : "s"} ·{" "}
            {formatBytes(Number(b.receivedBytes))}
            {b.kinds.length ? ` · ${b.kinds.join(" · ")}` : ""}
          </span>
          <span className="text-[11px] text-dim2 justify-self-end">
            {new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}
          </span>
        </div>
      ))}
    </div>
  );
}
