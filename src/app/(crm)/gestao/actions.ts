"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { stages } from "@/lib/commercial/model";
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optional = (f: FormData, k: string) => text(f, k) || null;
function iso(f: FormData, k: string) {
  const raw = text(f, k);
  if (!raw) return null;
  const d = new Date(raw.length === 16 ? `${raw}:00-03:00` : raw);
  if (!Number.isFinite(d.getTime())) throw new Error("Data inválida");
  return d.toISOString();
}
export async function saveCommercial(form: FormData) {
  const context = await getCurrentContext();
  if (!context || context.role === "viewer") throw new Error("Sem permissão");
  const db = await createClient();
  const org = context.organization.id;
  const kind = text(form, "operation");
  const id = text(form, "opportunity_id");
  let destination = id ? `/gestao/oportunidades/${id}` : "/gestao/nova";
  try {
    if (["settings", "goal", "expense", "ranking", "review"].includes(kind)) {
      destination = "/gestao/configuracoes";
      if (context.role !== "admin")
        throw new Error("Somente administrador altera configurações");
      let result;
      if (kind === "settings")
        result = await db
          .from("commercial_settings")
          .update({
            minimum_sample: Number(text(form, "minimum_sample")),
            stalled_days: Number(text(form, "stalled_days")),
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", org);
      else if (kind === "goal")
        result = await db
          .from("commercial_goals")
          .insert({
            organization_id: org,
            metric: text(form, "metric"),
            starts_on: text(form, "starts_on"),
            ends_on: text(form, "ends_on"),
            target: Number(text(form, "target")),
            development_id: optional(form, "development_id"),
            owner_id: optional(form, "owner_id"),
            created_by: context.userId,
          });
      else if (kind === "expense")
        result = await db
          .from("commercial_expenses")
          .insert({
            organization_id: org,
            source: text(form, "source"),
            category: text(form, "category"),
            starts_on: text(form, "starts_on"),
            ends_on: text(form, "ends_on"),
            amount: Number(text(form, "amount")),
            document_reference: text(form, "document_reference"),
            created_by: context.userId,
          });
      else if (kind === "ranking")
        result = await db
          .from("commercial_ranking_settings")
          .update(
            Object.fromEntries(
              [
                "contract_points",
                "proposal_points",
                "buyer_visit_points",
                "broker_visit_points",
                "interaction_points",
                "monthly_interaction_cap",
              ].map((k) => [k, Number(text(form, k))]),
            ),
          )
          .eq("organization_id", org);
      else
        result = await db
          .from("commercial_conversation_reviews")
          .insert({
            organization_id: org,
            lead_id: text(form, "lead_id"),
            message_id: text(form, "message_id"),
            category: text(form, "category"),
            evidence: text(form, "evidence"),
            origin: "human",
            status: text(form, "status"),
          });
      if (result.error) throw new Error(result.error.message);
    } else if (kind === "opportunity") {
      const stage = text(form, "stage") || "new";
      if (!(stage in stages)) throw new Error("Etapa inválida");
      const payload = {
        organization_id: org,
        title: text(form, "title"),
        primary_contact_id: text(form, "primary_contact_id"),
        broker_id: optional(form, "broker_id"),
        owner_id: optional(form, "owner_id"),
        stage,
        source: optional(form, "source"),
        next_action: optional(form, "next_action"),
        next_action_due_at: iso(form, "next_action_due_at"),
        attribution_reason: optional(form, "attribution_reason"),
        loss_reason: optional(form, "loss_reason"),
        loss_note: optional(form, "loss_note"),
        qualification: Object.fromEntries(
          ["need", "product", "horizon", "commercial_fit"].map((k) => [
            k,
            text(form, k),
          ]),
        ),
      };
      const query = id
        ? db
            .from("commercial_opportunities")
            .update(payload)
            .eq("organization_id", org)
            .eq("id", id)
        : db.from("commercial_opportunities").insert(payload);
      const result = await query.select("id").single();
      if (result.error) throw new Error(result.error.message);
      destination = `/gestao/oportunidades/${result.data.id}`;
    } else {
      const opportunity = await db
        .from("commercial_opportunities")
        .select("id")
        .eq("organization_id", org)
        .eq("id", id)
        .single();
      if (opportunity.error) throw new Error("Oportunidade não encontrada");
      let result;
      if (kind === "participant")
        result = await db
          .from("commercial_participants")
          .insert({
            organization_id: org,
            opportunity_id: id,
            contact_id: text(form, "contact_id"),
            role: text(form, "role"),
          });
      else if (kind === "interest")
        result = await db
          .from("commercial_interests")
          .insert({
            organization_id: org,
            opportunity_id: id,
            development_id: text(form, "development_id"),
            unit_id: optional(form, "unit_id"),
            is_primary: form.get("is_primary") === "on",
          });
      else if (kind === "proposal")
        result = await db
          .from("proposals")
          .update({
            opportunity_id: id,
            commercial_primary: form.get("commercial_primary") === "on",
          })
          .eq("organization_id", org)
          .eq("id", text(form, "proposal_id"))
          .is("opportunity_id", null)
          .select("id")
          .single();
      else if (kind === "visit")
        result = await db
          .from("agenda_events")
          .update({
            opportunity_id: id,
            visit_kind: text(form, "visit_kind"),
            visit_outcome: optional(form, "visit_outcome"),
            commercial_result: optional(form, "commercial_result"),
            commercial_next_action: optional(form, "commercial_next_action"),
          })
          .eq("organization_id", org)
          .eq("id", text(form, "event_id"))
          .select("id")
          .single();
      else if (kind === "contract") {
        if (context.role !== "admin")
          throw new Error("Somente administrador confirma contratos");
        result = await db
          .from("commercial_contracts")
          .insert({
            organization_id: org,
            opportunity_id: id,
            unit_id: text(form, "unit_id"),
            proposal_id: optional(form, "proposal_id"),
            signed_at: iso(form, "signed_at"),
            amount: Number(text(form, "amount")),
            document_reference: text(form, "document_reference"),
            created_by: context.userId,
          });
      } else if (kind === "cancellation") {
        if (context.role !== "admin")
          throw new Error("Somente administrador confirma distratos");
        result = await db
          .from("commercial_contracts")
          .update({
            cancelled_at: iso(form, "cancelled_at"),
            cancellation_reason: text(form, "cancellation_reason"),
          })
          .eq("organization_id", org)
          .eq("opportunity_id", id)
          .eq("id", text(form, "contract_id"))
          .select("id")
          .single();
      } else if (kind === "receipt") {
        if (context.role !== "admin")
          throw new Error("Somente administrador confirma recebimentos");
        const contract = await db
          .from("commercial_contracts")
          .select("id")
          .eq("organization_id", org)
          .eq("opportunity_id", id)
          .eq("id", text(form, "contract_id"))
          .single();
        if (contract.error) throw new Error("Contrato inválido");
        result = await db
          .from("commercial_receipts")
          .insert({
            organization_id: org,
            contract_id: contract.data.id,
            received_at: iso(form, "received_at"),
            amount: Number(text(form, "amount")),
            kind: text(form, "kind"),
            source: "manual_verified",
            external_id: text(form, "external_id"),
            evidence: text(form, "evidence"),
            confirmed_by: context.userId,
          });
      } else throw new Error("Operação inválida");
      if (result.error) throw new Error(result.error.message);
    }
  } catch (error) {
    redirect(
      `${destination}?error=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível salvar")}`,
    );
  }
  revalidatePath("/gestao");
  revalidatePath(destination);
  redirect(destination);
}
