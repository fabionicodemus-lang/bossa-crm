import { loadTaskOverview } from "./hoje-tasks";
import { createClient } from "@/lib/supabase/server";
import type { TeamMember, UserContext } from "./types";
import {
  brazilStart,
  DAY,
  type TodayData,
  type TodayLead,
  type TodayProposal,
} from "./hoje-model";
// Paginação evita o limite padrão de 1.000 registros da Data API.
async function collect<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await query(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
export async function loadToday(context: UserContext): Promise<TodayData> {
  const db = await createClient();
  const org = context.organization.id;
  const now = new Date().toISOString();
  const start = new Date(brazilStart(now)).toISOString();
  const end = new Date(brazilStart(now) + DAY).toISOString();
  const [leads, taskOverview, proposals, members, messages] = await Promise.all(
    [
      collect<TodayLead>((from, to) =>
        db
          .from("leads")
          .select(
            "id,name,phone,kind,stage,enterprise,company,temperature,owner_id,owner_mode,ai_enabled,automation_paused,opt_out,next_action,next_action_due_at,last_inbound_at,last_outbound_at,last_human_activity_at,last_ai_activity_at,handoff_requested_at,handoff_accepted_at,created_at,updated_at,metadata",
          )
          .eq("organization_id", org)
          .is("archived_at", null)
          .order("id")
          .range(from, to),
      ),
      loadTaskOverview(context),
      collect<TodayProposal>((from, to) =>
        db
          .from("proposals")
          .select(
            "id,lead_id,status,proposed_price,created_at,updated_at,snapshot",
          )
          .eq("organization_id", org)
          .order("id")
          .range(from, to),
      ),
      db
        .from("memberships")
        .select("user_id,role,profiles(full_name,email)")
        .eq("organization_id", org)
        .order("created_at"),
      collect<{ lead_id: string }>((from, to) =>
        db
          .from("messages")
          .select("lead_id")
          .eq("organization_id", org)
          .eq("sender_kind", "ia")
          .eq("direction", "out")
          .gte("created_at", start)
          .lt("created_at", end)
          .order("id")
          .range(from, to),
      ),
    ],
  );
  if (members.error) throw new Error(members.error.message);
  const team: TeamMember[] = (members.data ?? []).map((row) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      user_id: row.user_id,
      role: row.role,
      full_name:
        p?.email === "contato@bossaempreendimentos.com.br"
          ? "Cíntia"
          : (p?.full_name ?? "Usuário"),
      email: p?.email ?? "",
    };
  });
  const automaticMessages: Record<string, number> = {};
  for (const m of messages)
    automaticMessages[m.lead_id] = (automaticMessages[m.lead_id] ?? 0) + 1;
  return {
    leads,
    tasks: taskOverview.tasks,
    taskCounts: taskOverview.counts,
    proposals,
    members: team,
    automaticMessages,
    now,
  };
}

export async function loadDirectory(context: UserContext) {
  const db = await createClient();
  const org = context.organization.id;
  const [leads, members] = await Promise.all([
    collect<TodayLead>((from, to) =>
      db
        .from("leads")
        .select(
          "id,name,phone,kind,stage,enterprise,company,temperature,owner_id,owner_mode,ai_enabled,automation_paused,opt_out,next_action,next_action_due_at,last_inbound_at,last_outbound_at,last_human_activity_at,last_ai_activity_at,handoff_requested_at,handoff_accepted_at,created_at,updated_at,metadata",
        )
        .eq("organization_id", org)
        .is("archived_at", null)
        .order("id")
        .range(from, to),
    ),
    db
      .from("memberships")
      .select("user_id,role,profiles(full_name,email)")
      .eq("organization_id", org)
      .order("created_at"),
  ]);
  if (members.error) throw new Error(members.error.message);
  const team: TeamMember[] = (members.data ?? []).map((row) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      user_id: row.user_id,
      role: row.role,
      full_name:
        p?.email === "contato@bossaempreendimentos.com.br"
          ? "Cíntia"
          : (p?.full_name ?? "Usuário"),
      email: p?.email ?? "",
    };
  });
  return { leads, members: team };
}
