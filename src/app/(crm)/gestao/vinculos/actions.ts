"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const fail = (message: string): never => redirect(`/gestao/vinculos?error=${encodeURIComponent(message)}`);

export async function resolveCommercialLink(form: FormData) {
  const ctx = await getCurrentContext();
  if (!ctx || !["admin", "comercial"].includes(ctx.role)) fail("Sem permissão para vincular.");
  const entity = value(form, "entity_type");
  const id = value(form, "entity_id");
  const opportunity = value(form, "opportunity_id");
  if (!["proposals", "agenda_events"].includes(entity) || !uuid.test(id) || !uuid.test(opportunity)) {
    fail("Selecione uma oportunidade válida.");
  }
  const db = await createClient();
  const { error } = await db.rpc("commercial_resolve_link", {
    p_org: ctx!.organization.id,
    p_entity: entity,
    p_id: id,
    p_opportunity: opportunity,
  });
  if (error) fail("Não foi possível vincular. Atualize a página e confira o contato, a etapa e as permissões.");
  revalidatePath("/gestao");
  revalidatePath("/gestao/vinculos");
  revalidatePath(`/gestao/oportunidades/${opportunity}`);
  redirect("/gestao/vinculos?ok=1");
}

export async function setCommercialAutoLink(form: FormData) {
  const ctx = await getCurrentContext();
  if (!ctx || ctx.role !== "admin") fail("Somente administrador altera esta configuração.");
  const enabled = value(form, "enabled");
  if (!["true", "false"].includes(enabled)) fail("Configuração inválida.");
  const db = await createClient();
  const { error } = await db.from("commercial_settings")
    .update({ auto_link_enabled: enabled === "true", updated_at: new Date().toISOString() })
    .eq("organization_id", ctx!.organization.id).select("organization_id").single();
  if (error) fail("Não foi possível salvar a configuração. Nenhum vínculo retroativo foi realizado.");
  revalidatePath("/gestao/vinculos");
  redirect("/gestao/vinculos?ok=1");
}
