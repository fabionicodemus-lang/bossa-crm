"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { commercialUuid, intakeErrors, parseIntentInput } from "@/lib/commercial/intake";

export async function createVerifiedIntent(form: FormData) {
  const ctx = await getCurrentContext();
  if (!ctx || !["admin", "comercial"].includes(ctx.role)) redirect("/gestao/vinculos?error=Sem%20permiss%C3%A3o");
  const raw = Object.fromEntries(form.entries());
  const entity = String(raw.entity_type ?? ""), id = String(raw.entity_id ?? "");
  const base = `/gestao/vinculos/nova?${new URLSearchParams({ entity, id })}`;
  const input = parseIntentInput(raw);
  if (!input) redirect(`${base}&error=INTAKE_INVALID`);
  const db = await createClient();
  const { data, error } = await db.rpc("commercial_create_verified_intent", {
    p_org: ctx.organization.id,
    p_entity: input.entity_type,
    p_source: input.entity_id,
    p_buyer: input.buyer_id,
    p_title: input.title,
    p_next_action: input.next_action,
    p_evidence: input.evidence,
    p_revision: input.revision,
    p_confirmed: true,
  });
  if (error) {
    const code = Object.hasOwn(intakeErrors, error.message) ? error.message : "unavailable";
    redirect(`${base}&error=${code}`);
  }
  const result = data as { opportunity_id?: unknown } | null;
  if (typeof result?.opportunity_id !== "string" || !commercialUuid.test(result.opportunity_id)) {
    redirect(`${base}&error=unavailable`);
  }
  revalidatePath("/gestao");
  revalidatePath("/gestao/vinculos");
  revalidatePath("/gestao/oportunidades");
  revalidatePath(`/leads/${input.buyer_id}`);
  redirect(`/gestao/oportunidades/${result.opportunity_id}`);
}
