// Staff alert. The things that need a person and would otherwise only ever appear in a
// Slack channel nobody was watching at the time: a publish that gave up after retries,
// an Instagram token about to expire, a client submission batch that finished uploading.
//
// Same shell as the client mail, with the staff masthead. It is read on a phone at an
// awkward moment, so the only things on it are what happened and where to go.

import { renderShell } from "@/emails/shell";

export type StaffAlertKind = "publish-failed" | "token-expiring" | "submission-complete";

export type StaffAlertEmailProps = {
  kind: StaffAlertKind;
  /** One line: what happened. */
  headline: string;
  /** Supporting facts, rendered as label rows. */
  facts: { label: string; value: string }[];
  /** Error text or other verbatim detail, shown monospaced. Optional. */
  detail?: string | null;
  actionUrl: string;
  actionLabel: string;
};

const KICKER: Record<StaffAlertKind, string> = {
  "publish-failed": "Publish failed",
  "token-expiring": "Action needed soon",
  "submission-complete": "Upload complete",
};

export function renderStaffAlertEmailHtml({
  kind,
  headline,
  facts,
  detail,
  actionUrl,
  actionLabel,
}: StaffAlertEmailProps): string {
  return renderShell({
    preheader: headline,
    masthead: { title: "Studio", sub: "portal.bjur.nyc" },
    kicker: KICKER[kind],
    headline,
    facts,
    detail,
    cta: { label: actionLabel, url: actionUrl },
  });
}
