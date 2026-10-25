import Anthropic from "@anthropic-ai/sdk";

/**
 * The CRM's writer (CRM.md §4): a follow-up email for a person to approve, and the
 * Monday brief. Everything it produces is a draft — the sender only sends what a person
 * approved — so its job is to save typing, never to decide anything.
 *
 * Same non-negotiables as the caption drafter (captionDraft.ts): never invent a fact,
 * name, date, price or commitment that is not in the context; if the context is thin,
 * be short and general.
 */

export type OutreachKind = "FOLLOW_UP" | "PAYMENT_NUDGE" | "NEXT_STEP";

export type OutreachInput = {
  kind: OutreachKind;
  /** First name or full name of the person being written to. */
  recipientName: string;
  clientName: string | null;
  dealTitle: string;
  projectTitle: string | null;
  /** The plain fact that triggered this: "quote sent 6 days ago, no reply". */
  trigger: string;
  /** Free notes a person kept on the deal. */
  notes: string | null;
};

export type Outreach = { subject: string; body: string };

export type DigestInput = {
  weekOf: string;
  pipeline: { stage: string; count: number; titles: string[] }[];
  unpaid: { title: string; client: string | null; days: number }[];
  tasksDue: { title: string; due: string | null }[];
  pendingDrafts: number;
  cutsAwaiting: { title: string; version: number; days: number }[];
};

export type CrmDrafter = {
  outreach: (input: OutreachInput) => Promise<Outreach>;
  digest: (input: DigestInput) => Promise<string>;
};

export function crmDraftingConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Overridable per deployment; the skill's default for new work otherwise. */
const MODEL = process.env.CRM_MODEL || "claude-opus-5-5";

const RULES = `You write on behalf of Bjur, a small Brooklyn based video production studio.

Rules that never bend:
- Write only from the facts you are given. Never invent a name, date, price, figure,
  deliverable, deadline or commitment. Never mention money amounts at all.
- If the context is thin, be short and general rather than padding with invention.
- First person as the studio ("we", "I" for the owner), warm and plain. No em-dashes.
  Write "Brooklyn based" without a hyphen. No exclamation marks in a row, no emoji.
- Never claim something was sent, approved, scheduled or agreed unless the facts say so.`;

const OUTREACH_GUIDE: Record<OutreachKind, string> = {
  FOLLOW_UP:
    "A warm check-in on a quote that has had no reply. No pressure, no discount, no deadline. Two to four sentences.",
  PAYMENT_NUDGE:
    "A gentle reminder that the delivered work is waiting and the clean, unwatermarked files unlock once the invoice is settled. Kind, never accusing. Two to four sentences. No amounts.",
  NEXT_STEP:
    "A short note after finished, paid work: glad it went well, and an open offer to help with whatever comes next. Do not propose a specific project unless the notes name one. Two to four sentences.",
};

// An org-level key has to name the workspace to bill against, as in captionDraft.ts; a
// workspace-scoped key carries it already. Supporting both means either key just works.
const client = () =>
  new Anthropic(
    process.env.ANTHROPIC_WORKSPACE_ID
      ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } }
      : {},
  );

/**
 * One Messages call with a JSON-schema reply. Opted into the server-side default fallback,
 * so a classifier decline is retried on the recommended model rather than failing the
 * draft; a refusal that survives that is an error, which the caller turns into a task.
 */
async function jsonCall<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T> {
  const response = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 2048,
    betas: ["server-side-fallback-2026-07-01"],
    // Anthropic's recommended fallback, routed by refusal category.
    fallbacks: "default",
    // Short, factual writing: medium effort is plenty and keeps a draft fast.
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new Error("The drafter declined this one.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("The drafter returned no text.");
  return JSON.parse(text.text) as T;
}

export const claudeCrmDrafter: CrmDrafter = {
  async outreach(input) {
    const facts = [
      `To: ${input.recipientName}${input.clientName ? ` (${input.clientName})` : ""}`,
      `About: ${input.dealTitle}${input.projectTitle && input.projectTitle !== input.dealTitle ? ` (project: ${input.projectTitle})` : ""}`,
      `Why now: ${input.trigger}`,
      input.notes ? `Notes we kept: ${input.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const out = await jsonCall<Outreach>(
      `${RULES}\n\nYou are drafting one email for a person at the studio to read, edit and approve before it is sent.\n${OUTREACH_GUIDE[input.kind]}`,
      `${facts}\n\nReply with the subject line and the email body. Sign off as "Justin". No placeholders like [Name].`,
      {
        type: "object",
        properties: { subject: { type: "string" }, body: { type: "string" } },
        required: ["subject", "body"],
        additionalProperties: false,
      },
    );
    return { subject: out.subject.trim(), body: out.body.trim() };
  },

  async digest(input) {
    const out = await jsonCall<{ brief: string }>(
      `${RULES}\n\nYou are writing the studio's own Monday brief for Slack: a short, plain read of the week from the numbers given. Lead with what needs doing. Under 180 words. Slack formatting: *bold* sparingly, simple "•" bullets. Mention only what is in the data; if a section is empty, skip it.`,
      `Week of ${input.weekOf}.\n\nData:\n${JSON.stringify(input, null, 2)}`,
      {
        type: "object",
        properties: { brief: { type: "string" } },
        required: ["brief"],
        additionalProperties: false,
      },
    );
    return out.brief.trim();
  },
};
