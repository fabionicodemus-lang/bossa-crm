import Link from "next/link";
import { PageTopbar } from "@/components/PageTopbar";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { stages } from "@/lib/commercial/model";
import { formatDateTime } from "@/lib/format";
import { setStageAutomation } from "./actions";
const reasons: Record<string, string> = {
  disabled: "Automação desativada no momento do registro",
  unconfirmed: "O fato ainda não foi confirmado",
  human_review_required: "Sem uma ação humana autorizada",
  unsupported_source: "Origem não habilitada para alterar etapa",
  cancellation_review: "Cancelamento, falta, remarcação ou distrato exige revisão",
  protected_stage: "Perdido, nutrição ou contrato assinado: etapa protegida",
  future_fact: "Data futura não comprova acontecimento",
  source_unavailable: "Documento de origem indisponível",
  automated_source_review: "Origem automática exige revisão humana específica",
  visit_evidence_incomplete: "Visita sem tipo, data ou desfecho compatíveis",
  proposal_evidence_incomplete: "Proposta sem unidade, data de envio ou status compatíveis",
  contract_evidence_incomplete: "Contrato sem confirmação administrativa ou dados compatíveis",
  older_than_stage: "Acontecimento anterior à última mudança de etapa",
  already_at_or_ahead: "Oportunidade já está nesta etapa ou mais adiante",
  documented_fact: "Avanço por registro confirmado e compatível",
};
const labels: Record<string, string> = { advanced: "Avançou", skipped: "Mantida", review: "Revisão necessária" };
const events: Record<string, string> = { visit_scheduled: "Agendamento", visit_confirmed: "Visita confirmada", visit_completed: "Visita realizada", visit_cancelled: "Visita cancelada", visit_no_show: "Falta", visit_rescheduled: "Remarcação", proposal_sent: "Envio de proposta", contract_signed: "Contrato documentado", contract_cancelled: "Distrato" };
const stage = (v: string | null) => v ? stages[v as keyof typeof stages] ?? v : "Sem avanço automático";
type Decision = { id: string; opportunity_id: string; event_id: string; event_type: string; previous_stage: string; target_stage: string | null; resulting_stage: string; decision: string; reason: string; actor_id: string | null; occurred_at: string; decided_at: string; commercial_opportunities: { title: string } | null };
export default async function StageAutomation({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getCurrentContext();
  const db = await createClient();
  const p = await searchParams;
  const raw = Number(p.offset);
  const offset = Number.isFinite(raw) ? Math.max(0, Math.min(100000, Math.floor(raw))) : 0;
  const filter = p.filter && Object.hasOwn(labels, p.filter) ? p.filter : "";
  let query = db.from("commercial_stage_decisions")
    .select("id,opportunity_id,event_id,event_type,previous_stage,target_stage,resulting_stage,decision,reason,actor_id,occurred_at,decided_at,commercial_opportunities(title)", { count: "exact" })
    .eq("organization_id", ctx!.organization.id).order("decided_at", { ascending: false }).order("id").range(offset, offset + 29);
  if (filter) query = query.eq("decision", filter);
  const [settings, result] = await Promise.all([
    db.from("commercial_settings").select("auto_stage_enabled").eq("organization_id", ctx!.organization.id).single(), query,
  ]);
  if (settings.error || result.error) return <div className="page-content"><h2>Atualização de etapas indisponível</h2><p role="alert">Confira a sexta migração e as permissões. Não foi presumida uma lista vazia.</p><Link href="/gestao">Voltar à Gestão</Link></div>;
  const rows = (result.data ?? []) as unknown as Decision[];
  const page = (n: number) => `/gestao/etapas?${new URLSearchParams({ filter, offset: String(n) })}`;
  return <><PageTopbar title="Etapas por fatos confirmados" subtitle="Registro do que avançou, do que foi mantido e do que precisa de revisão" />
    <div className="page-content">
      <p><Link href="/gestao">← Gestão</Link>{" · "}<Link href="/gestao/oportunidades">Oportunidades</Link>{" · "}<Link href="/gestao/vinculos">Revisar vínculos</Link></p>
      {p.error && <p role="alert">Não foi possível salvar. Atualize a página, confira sua permissão e confirme a alteração.</p>}
      {p.saved === "1" && <p role="status">Configuração salva. Nenhum evento anterior foi reprocessado.</p>}
      <section className="card card-body" style={{ marginBlock: 16 }}>
        <h3>Avanço automático: {settings.data.auto_stage_enabled ? "ativado" : "desativado"}</h3>
        <p>Funciona somente para novos registros confirmados e com usuário autorizado: visitas com comprador/remotas, propostas com unidade e data de envio e contratos documentados pelo administrador. A origem deve ser compatível e não pode ser inferência da IA.</p>
        <p>Não reabre perdido/nutrição, não retrocede etapas e não presume qualificação, negociação ou recebimento. Cancelamentos, faltas, remarcações e distratos ficam para revisão. Ativar não percorre o histórico.</p>
        {ctx!.role === "admin" && <form action={setStageAutomation} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="current" value={String(settings.data.auto_stage_enabled)} />
          <label><input type="checkbox" name="confirmed" value="yes" required /> Conferi as regras e autorizo alterar a configuração somente para os próximos registros.</label>
          <button className="btn btn-ghost">{settings.data.auto_stage_enabled ? "Desativar avanço automático" : "Ativar avanço por fatos elegíveis"}</button>
        </form>}
      </section>
      <form style={{ display: "flex", gap: 12, alignItems: "end", marginBottom: 16 }}>
        <label>Decisão<select className="input" name="filter" defaultValue={filter}><option value="">Todas</option>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <button className="btn btn-primary">Filtrar</button>
      </form>
      <p>{result.count ?? 0} decisões neste filtro. Até 30 por página. Este é um histórico imutável, não uma lista de tarefas concluídas.</p>
      {rows.length === 0 && <p>Nenhuma avaliação registrada nesta página. A coleta começa após a migração.</p>}
      {rows.map((d) => <section className="card card-body" key={d.id} style={{ marginBottom: 12 }}>
        <h3><Link href={`/gestao/oportunidades/${d.opportunity_id}`}>{d.commercial_opportunities?.title ?? "Abrir oportunidade"}</Link>{" · "}{labels[d.decision] ?? d.decision}</h3>
        <p>{events[d.event_type] ?? d.event_type}: {stage(d.previous_stage)} → {stage(d.resulting_stage)}.</p>
        <p>{reasons[d.reason] ?? d.reason}. Etapa avaliada: {stage(d.target_stage)}.</p>
        <p>Fato: {formatDateTime(d.occurred_at)} · avaliação: {formatDateTime(d.decided_at)}.</p>
        <small>Evento de origem: {d.event_id} · usuário: {d.actor_id ?? "sem sessão humana"}. Os detalhes da origem e das mudanças estão no histórico da oportunidade.</small>
      </section>)}
      {offset > 0 && <Link href={page(Math.max(0, offset - 30))}>← Anterior </Link>}
      {offset + 30 < (result.count ?? 0) && <Link href={page(offset + 30)}>Próxima →</Link>}
    </div></>;
}
