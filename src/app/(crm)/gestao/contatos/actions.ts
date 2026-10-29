"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { commercialUuid } from "@/lib/commercial/intake";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const fail = (message: string): never => redirect(`/gestao/contatos?error=${encodeURIComponent(message)}`);

export async function proposeContactReconciliation(form: FormData) {
  const ctx = await getCurrentContext();
  if (!ctx || !["admin", "comercial"].includes(ctx.role)) fail("Sem permissão para propor uma reconciliação.");
  const first = value(form, "first");
  const second = value(form, "second");
  const preferred = value(form, "preferred");
  const reason = value(form, "reason");
  const evidence = value(form, "evidence");
  if (!commercialUuid.test(first) || !commercialUuid.test(second) || first === second || ![first, second].includes(preferred)
      || reason.length < 20 || reason.length > 2000 || evidence.length < 8 || evidence.length > 500) {
    fail("Informe duas fichas diferentes, qual manter como referência, justificativa e evidência conferível.");
  }
  const db = await createClient();
  const { error } = await db.rpc("commercial_propose_contact_reconciliation", {
    p_org: ctx!.organization.id, p_first: first, p_second: second, p_preferred: preferred,
    p_reason: reason, p_evidence: evidence,
  });
  if (error) fail("Não foi possível registrar a proposta. Confira organização, contatos, histórico e pedidos existentes.");
  revalidatePath("/gestao/contatos");
  redirect("/gestao/contatos?ok=1");
}

export async function reviewContactReconciliation(form: FormData) {
  const ctx = await getCurrentContext();
  if (!ctx || ctx.role !== "admin") fail("Somente outro administrador pode concluir a revisão.");
  const id = value(form, "id");
  const decision = value(form, "decision");
  const reason = value(form, "reason");
  if (!commercialUuid.test(id) || !["confirm", "reject"].includes(decision) || reason.length < 20 || reason.length > 2000) {
    fail("Informe decisão e justificativa detalhada.");
  }
  const db = await createClient();
  const { error } = await db.rpc("commercial_review_contact_reconciliation", {
    p_org: ctx!.organization.id, p_id: id, p_confirm: decision === "confirm", p_reason: reason,
  });
  if (error) fail("Revisão recusada. Atualize a página; confira as duas fichas, o autor e eventuais decisões concorrentes.");
  revalidatePath("/gestao/contatos");
  redirect("/gestao/contatos?ok=1");
}
