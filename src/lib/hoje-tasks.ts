import { createClient } from "@/lib/supabase/server";
import { brazilStart, DAY } from "./hoje-model";
import type { LeadKind, LeadTask, UserContext } from "./types";
export const taskGroups = [
  "overdue",
  "today",
  "upcoming",
  "no-due",
  "completed",
] as const;
export type TaskGroup = (typeof taskGroups)[number];
export type TaskCounts = Record<TaskGroup | "aiToday", number>;
export type TaskCountScopes = {
  team: Record<LeadKind, TaskCounts>;
  mine: Record<LeadKind, TaskCounts>;
};
export async function readTaskGroup(
  context: UserContext,
  kind: LeadKind,
  group: TaskGroup,
  mine: boolean,
  offset = 0,
) {
  const db = await createClient();
  const org = context.organization.id;
  const now = Date.now();
  const start = brazilStart(new Date(now));
  const end = start + DAY;
  let query = db
    .from("lead_tasks")
    .select("*,leads!inner(kind,archived_at)", { count: "exact" })
    .eq("organization_id", org)
    .eq("leads.kind", kind)
    .is("leads.archived_at", null);
  if (mine || context.role !== "admin")
    query = query.eq("assigned_to", context.userId);
  if (group === "overdue")
    query = query.or(
      `status.eq.overdue,and(status.eq.pending,due_at.lt.${new Date(now).toISOString()})`,
    );
  if (group === "today")
    query = query
      .eq("status", "pending")
      .gte("due_at", new Date(now).toISOString())
      .lt("due_at", new Date(end).toISOString());
  if (group === "upcoming")
    query = query
      .eq("status", "pending")
      .gte("due_at", new Date(end).toISOString())
      .lt("due_at", new Date(end + 7 * DAY).toISOString());
  if (group === "no-due")
    query = query.eq("status", "pending").is("due_at", null);
  if (group === "completed")
    query = query
      .eq("status", "completed")
      .gte("completed_at", new Date(start).toISOString())
      .lt("completed_at", new Date(end).toISOString());
  const result = await query
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("id")
    .range(offset, offset + 49);
  if (result.error) throw new Error(result.error.message);
  return { tasks: (result.data ?? []) as LeadTask[], count: result.count ?? 0 };
}
export async function loadTaskOverview(context: UserContext) {
  const db = await createClient();
  const kinds: LeadKind[] = ["cliente", "corretor", "geral"];
  const scopes = context.role === "admin" ? [false, true] : [true];
  const tasks = new Map<string, LeadTask>();
  const counts = { team: {}, mine: {} } as TaskCountScopes;
  await Promise.all(
    scopes.flatMap((mine) =>
      kinds.map(async (kind) => {
        const start = new Date(brazilStart(new Date())).toISOString();
        const end = new Date(brazilStart(new Date()) + DAY).toISOString();
        let ai = db
          .from("lead_tasks")
          .select("id,leads!inner(kind,archived_at)", {
            count: "exact",
            head: true,
          })
          .eq("organization_id", context.organization.id)
          .eq("leads.kind", kind)
          .is("leads.archived_at", null)
          .eq("created_by_kind", "ai")
          .gte("created_at", start)
          .lt("created_at", end);
        if (mine || context.role !== "admin")
          ai = ai.eq("assigned_to", context.userId);
        const [groups, aiResult] = await Promise.all([
          Promise.all(
            taskGroups.map(async (group) => ({
              group,
              ...(await readTaskGroup(context, kind, group, mine)),
            })),
          ),
          ai,
        ]);
        if (aiResult.error) throw new Error(aiResult.error.message);
        const value = { aiToday: aiResult.count ?? 0 } as TaskCounts;
        for (const result of groups) {
          value[result.group] = result.count;
          for (const task of result.tasks) tasks.set(task.id, task);
        }
        counts[mine ? "mine" : "team"][kind] = value;
      }),
    ),
  );
  if (context.role !== "admin") counts.team = counts.mine;
  return { tasks: [...tasks.values()], counts };
}
