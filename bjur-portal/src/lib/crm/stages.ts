/** The pipeline's columns, in order, with the words the board shows for them. */
export const STAGES = [
  ["LEAD", "Lead"],
  ["QUOTED", "Quoted"],
  ["ACTIVE", "Active"],
  ["DELIVERED", "Delivered"],
  ["PAID", "Paid"],
  ["WON", "Won"],
  ["LOST", "Lost"],
] as const;

export type Stage = (typeof STAGES)[number][0];
export const STAGE_IDS = STAGES.map(([id]) => id) as Stage[];
export const CLOSED_STAGES = new Set<Stage>(["PAID", "WON", "LOST"]);

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGE_IDS as string[]).includes(v);
}
