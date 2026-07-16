export function formatDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export function timeAgo(d: Date | string) {
  const date = new Date(d);
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return formatDate(date);
}

export function isRecentlyActive(lastSeen: Date, timeoutMs: number) {
  return Date.now() - lastSeen.getTime() < timeoutMs;
}

export function formatBytes(bytes: number | bigint) {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  const gb = n / 1_000_000_000;
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(n / 1_000_000).toFixed(1)} MB`;
}
