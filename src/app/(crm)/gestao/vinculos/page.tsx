import Link from "next/link";
import { PageTopbar } from "@/components/PageTopbar";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { stages } from "@/lib/commercial/model";
import { resolveCommercialLink, setCommercialAutoLink } from "./actions";

type Candidate = { id: string; title: string; stage: string };
type Row = {
  entity_type: string; entity_id: string; contact_id: string | null;
  initial_reason: string; candidate_count: number; status: string;
  opportunity_id: string | null; created_at: string;
  leads: { name: string; kind: string } | null;
};
const reasons: Record<string, string> = {
  unique_customer: "Uma oportunidade ativa do comprador identificado",
  explicit: "Vínculo explícito informado na criação",
  manual_existing: "Vínculo revisado em registro existente",
  no_candidate: "Nenhuma oportunidade ativa do comprador",
  ambiguous: "Mais de uma oportunidade: escolha humana necessária",
  buyer_not_identified: "Contato não identifica sozinho o comprador",
  missing_contact: "Sem contato identificado",
  archived_contact: "Contato arquivado",
  automation_review: "Detecção automática precisa de revisão",
  system_review: "Integração sem sessão humana: revisar",
  historical_or_closed: "Registro anterior ou encerrado: revisar",
  disabled: "Vinculação automática desativada",
};

export default async function CommercialLinks({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getCurrentContext();
  const db = await createClient();
  const p = await searchParams;
  const state = p.state === "linked" ? "linked" : "pending";
  const parsedOffset = Number(p.offset);
  const offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.min(100000, Math.floor(parsedOffset))) : 0;
  const org = ctx!.organization.id;
  const canEdit = ["admin", "comercial"].includes(ctx!.role);
  const [settings, queue] = await Promise.all([
    db.from("commercial_settings").select("auto_link_enabled").eq("organization_id", org).single(),
    db.from("commercial_link_reviews")
      .select("entity_type,entity_id,contact_id,initial_reason,candidate_count,status,opportunity_id,created_at,leads(name,kind)", { count: "exact" })
      .eq("organization_id", org).eq("status", state)
      .order("created_at", { ascending: false }).order("entity_type").order("entity_id")
      .range(offset, offset + 19),
  ]);
  if (settings.error || queue.error) return <div className="page-content">
    <h2>Revisão de vínculos indisponível</h2>
    <p role="alert">Confira a migração comercial e as permissões. Ausência de acesso não foi tratada como fila vazia.</p>
    <Link href="/gestao">Voltar à Gestão</Link>
  </div>;
  const rows = (queue.data ?? []) as unknown as Row[];
  const items = await Promise.all(rows.map(async (row) => {
    if (!canEdit || row.status !== "pending" || !row.contact_id) return { row, candidates: [] as Candidate[], failed: false };
    const result = await db.rpc("commercial_link_candidates", { p_org: org, p_contact: row.contact_id });
    return { row, candidates: (result.data ?? []) as Candidate[], failed: Boolean(result.error) };
  }));
  const page = (n: number) => `/gestao/vinculos?state=${state}&offset=${n}`;
  return <>
    <PageTopbar title="Vínculos comerciais" subtitle="Propostas e visitas ligadas à intenção de compra correta" />
    <div className="page-content">
      <p><Link href="/gestao">← Gestão</Link> · <Link href="/gestao/oportunidades">Oportunidades</Link></p>
      {p.error && <p role="alert">{p.error}</p>}
      {p.ok === "1" && <p role="status">Alteração salva.</p>}
      <section className="card card-body" style={{ marginBlock: 16 }}>
        <h3>Vinculação automática: {settings.data.auto_link_enabled ? "ativada" : "desativada"}</h3>
        <p>Apenas novos registros de um comprador identificado, feitos com sessão humana e com uma única oportunidade ativa, podem ser vinculados automaticamente. A automação não cria compras nem mescla contatos.</p>
        <p>Nara, integrações sem sessão humana, corretores sem comprador e casos ambíguos ficam para revisão. Ativar não reprocessa o histórico nem comprova envios anteriores.</p>
        {ctx!.role === "admin" && <form action={setCommercialAutoLink}>
          <input type="hidden" name="enabled" value={settings.data.auto_link_enabled ? "false" : "true"} />
          <button className="btn btn-ghost">{settings.data.auto_link_enabled ? "Desativar vínculos automáticos" : "Ativar somente para novos registros elegíveis"}</button>
        </form>}
      </section>
      <p><Link href="/gestao/vinculos">Pendentes</Link> · <Link href="/gestao/vinculos?state=linked">Vinculados e origem</Link></p>
      <p>{queue.count ?? 0} registros {state === "pending" ? "pendentes" : "vinculados"} na coleta nova. Até 20 por página.</p>
      {items.length === 0 && <p>Nenhum registro nesta página. A coleta não reconstrói o histórico anterior à implantação.</p>}
      {items.map(({ row, candidates, failed }) => <section className="card card-body" style={{ marginBottom: 12 }} key={`${row.entity_type}:${row.entity_id}`}>
        <h3>{row.entity_type === "proposals" ? "Proposta" : "Visita / apresentação"} · {row.leads?.name ?? "Contato não identificado"}</h3>
        <p>{reasons[row.initial_reason] ?? row.initial_reason} · registrado em {formatDateTime(row.created_at)}</p>
        <small>Referência: {row.entity_id} · candidatas no registro: {row.candidate_count}</small>
        <p>{row.contact_id && <Link href={`/leads/${row.contact_id}`}>Abrir contato e histórico</Link>}{" · "}<Link href={row.entity_type === "proposals" ? "/propostas" : "/agenda"}>Conferir documento / compromisso</Link></p>
        {row.opportunity_id ? <Link href={`/gestao/oportunidades/${row.opportunity_id}`}>Abrir oportunidade vinculada</Link> : canEdit && (
          failed ? <p role="alert">Candidatas indisponíveis. Nenhum vínculo foi presumido.</p> : candidates.length ?
          <form action={resolveCommercialLink} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input type="hidden" name="entity_type" value={row.entity_type} />
            <input type="hidden" name="entity_id" value={row.entity_id} />
            <label>Oportunidade conferida<select name="opportunity_id" required className="input" defaultValue="">
              <option value="" disabled>Selecione após conferir o documento e o comprador</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.title} · {stages[c.stage as keyof typeof stages] ?? c.stage}</option>)}
            </select></label>
            <button className="btn btn-primary">Confirmar vínculo</button>
          </form> : <p>Nenhuma oportunidade ativa compatível. {row.leads?.kind === "cliente" && row.contact_id && <Link href={`/gestao/nova?lead_id=${row.contact_id}`}>Cadastrar intenção de compra e depois voltar para vincular</Link>}</p>
        )}
        {row.status === "pending" && <small>Vincular organiza o histórico; não transforma detecção da IA em envio comprovado nem altera comissão, responsável, etapa ou data.</small>}
      </section>)}
      {offset > 0 && <Link href={page(Math.max(0, offset - 20))}>← Anterior </Link>}
      {offset + 20 < (queue.count ?? 0) && <Link href={page(offset + 20)}>Próxima →</Link>}
    </div>
  </>;
}
