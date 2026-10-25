// A CRM email a person approved (lib/crm/agents.ts). It reads as a note from the studio,
// not a notification: no kicker, no headline, no button, just the approved text as
// paragraphs on the shared card. The masthead says "Bjur" rather than "Client portal",
// since the person reading may never have had a login.

import { renderShell } from "@/emails/shell";

export function renderOutreachEmailHtml(subject: string, body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return renderShell({
    preheader: paragraphs[0]?.slice(0, 120) ?? subject,
    masthead: { title: "Bjur", sub: "bjur.nyc" },
    body: paragraphs,
    unsubscribe: "If you would rather not hear from us, reply and say so.",
  });
}
