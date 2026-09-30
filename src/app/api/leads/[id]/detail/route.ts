import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context)
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params;
  const db = await createClient();
  const org = context.organization.id;
  const leadResult = await db
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org)
    .maybeSingle();
  if (leadResult.error)
    return NextResponse.json(
      { error: "Não foi possível carregar o lead." },
      { status: 500 },
    );
  if (!leadResult.data)
    return NextResponse.json(
      { error: "Lead não encontrado." },
      { status: 404 },
    );
  const lead = leadResult.data;
  const [messages, activities, tasks, members, connections] = await Promise.all(
    [
      db
        .from("messages")
        .select("*")
        .eq("lead_id", id)
        .eq("organization_id", org)
        .order("created_at")
        .limit(1000),
      db
        .from("activities")
        .select("*")
        .eq("lead_id", id)
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("lead_tasks")
        .select("*")
        .eq("lead_id", id)
        .eq("organization_id", org)
        .order("due_at")
        .limit(500),
      db
        .from("memberships")
        .select("user_id,role,profiles(full_name,email)")
        .eq("organization_id", org)
        .order("created_at"),
      createAdminClient()
        .from("whatsapp_connections")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org)
        .eq("channel", lead.kind === "cliente" ? "clientes" : "corretores")
        .eq("status", "connected"),
    ],
  );
  if ([messages, activities, tasks, members, connections].some((r) => r.error))
    return NextResponse.json(
      { error: "Não foi possível carregar a ficha completa. Tente novamente." },
      { status: 500 },
    );
  const teamMembers = (members.data ?? []).map((row) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      user_id: row.user_id,
      role: row.role,
      email: p?.email ?? "",
      full_name:
        p?.email === "contato@bossaempreendimentos.com.br"
          ? "Cíntia"
          : (p?.full_name ?? "Usuário"),
    };
  });
  return NextResponse.json(
    {
      lead,
      messages: messages.data,
      activities: activities.data,
      tasks: tasks.data,
      teamMembers,
      whatsappConnected: (connections.count ?? 0) > 0,
      canEdit: context.role !== "viewer" && !lead.archived_at,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
