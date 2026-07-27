export type CalendarAsset = {
  weekOf: Date;
  contentTitle: string | null;
  caption: string | null;
  captionYT: string | null;
};

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}TH`;
  switch (n % 10) {
    case 1:
      return `${n}ST`;
    case 2:
      return `${n}ND`;
    case 3:
      return `${n}RD`;
    default:
      return `${n}TH`;
  }
}

function dayHeader(d: Date): string {
  const weekday = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toUpperCase();
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }).toUpperCase();
  return `${weekday} ${month} ${ordinal(d.getUTCDate())}`;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Reproduces the day-by-day Slack scheduling block Justin hand-types every
 * week (`MONDAY MAY 18TH - OPEN`, `TUESDAY MAY 19TH - TOVA (FAM ONLY)` +
 * caption). Always walks Monday-Friday; Saturday/Sunday only appear when an
 * asset actually falls on that date, matching the sample (occasional
 * Saturday posts, never an unprompted weekend "OPEN" line).
 */
export function buildWeeklySlackPost(weekStart: Date, assets: CalendarAsset[]): string {
  const byDate = new Map<string, CalendarAsset>();
  for (const a of assets) {
    const key = dateKey(a.weekOf);
    if (!byDate.has(key)) byDate.set(key, a);
  }

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
    const isWeekday = i < 5; // Monday..Friday
    if (isWeekday || byDate.has(dateKey(d))) days.push(d);
  }

  const blocks = days.map((d) => {
    const asset = byDate.get(dateKey(d));
    const title = asset?.contentTitle?.trim() || "OPEN";
    let block = `${dayHeader(d)} - ${title}`;

    const caption = asset?.caption?.trim();
    const captionYT = asset?.captionYT?.trim();
    if (caption && captionYT) {
      block += `\n\nIG: ${caption}\n\nYT: ${captionYT}`;
    } else if (caption) {
      block += `\n\nIG & YT: ${caption}`;
    }

    return block;
  });

  return blocks.join("\n\n");
}
