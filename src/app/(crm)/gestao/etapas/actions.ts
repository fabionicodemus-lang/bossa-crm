"use server";
import { manualPilot } from '@/lib/homologation/manual-pilot';
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export async function setStageAutomation(form: FormData) {
  if (manualPilot()) throw new Error("Automação indisponível no piloto manual");
  const ctx = await getCurrentContext();
  if (!ctx || ctx.role !== "admin") redirect("/gestao/etapas?error=permission");
  const current = form.get("current");
  if (!["true", "false"].includes(String(current)) || form.get("confirmed") !== "yes") redirect("/gestao/etapas?error=invalid");
  const db = await createClient();
  const { error } = await db.from("commercial_settings")
    .update({ auto_stage_enabled: current !== "true", updated_at: new Date().toISOString() })
    .eq("organization_id", ctx.organization.id).eq("auto_stage_enabled", current === "true")
    .select("organization_id").single();
  if (error) redirect("/gestao/etapas?error=changed");
  revalidatePath("/gestao/etapas");
  revalidatePath("/gestao");
  redirect("/gestao/etapas?saved=1");
}
