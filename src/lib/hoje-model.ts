import type { TaskCountScopes } from "./hoje-tasks";
import type { Lead, LeadTask, TeamMember } from "./types";
export type TodayLead = Pick<
  Lead,
  | "id"
  | "name"
  | "phone"
  | "kind"
  | "stage"
  | "enterprise"
  | "company"
  | "temperature"
  | "owner_id"
  | "owner_mode"
  | "ai_enabled"
  | "automation_paused"
  | "opt_out"
  | "next_action"
  | "next_action_due_at"
  | "last_inbound_at"
  | "last_outbound_at"
  | "last_human_activity_at"
  | "last_ai_activity_at"
  | "handoff_requested_at"
  | "handoff_accepted_at"
  | "created_at"
  | "updated_at"
  | "metadata"
>;
export type TodayProposal = {
  id: string;
  lead_id: string | null;
  status: string;
  proposed_price: number;
  created_at: string;
  updated_at: string;
  snapshot: Record<string, unknown>;
};
export type TodayData = {
  taskCounts: TaskCountScopes;
  leads: TodayLead[];
  tasks: LeadTask[];
  members: TeamMember[];
  proposals: TodayProposal[];
  automaticMessages: Record<string, number>;
  now: string;
};
export const DAY = 86_400_000;
export function brazilDay(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function brazilStart(value: string | Date) {
  return new Date(`${brazilDay(value)}T00:00:00-03:00`).getTime();
}
export function isOpenTask(task: LeadTask) {
  return task.status === "pending" || task.status === "overdue";
}
export function isOverdueTask(task: LeadTask, now: number) {
  return (
    isOpenTask(task) &&
    (task.status === "overdue" ||
      Boolean(task.due_at && Date.parse(task.due_at) < now))
  );
}
export function lastInteraction(lead: TodayLead) {
  return Math.max(
    0,
    ...[
      lead.last_inbound_at,
      lead.last_outbound_at,
      lead.last_human_activity_at,
      lead.last_ai_activity_at,
    ].map((t) => (t ? Date.parse(t) || 0 : 0)),
  );
}
export function locationOf(lead: TodayLead) {
  const m = lead.metadata;
  return [m.city || m.cidade, m.state || m.estado, m.country || m.pais]
    .filter((v) => typeof v === "string" && v)
    .join(", ");
}
export function elapsed(value: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - value) / 60000));
  return minutes < 60
    ? `${minutes} min`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
      : `${Math.floor(minutes / 1440)} dias`;
}
