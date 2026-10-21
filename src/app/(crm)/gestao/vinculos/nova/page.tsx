import Link from "next/link";
import { PageTopbar } from "@/components/PageTopbar";
import { CommercialContactSelect } from "@/components/CommercialContactSelect";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { commercialUuid, intakeErrors } from "@/lib/commercial/intake";
import { formatDateTime } from "@/lib/format";
import { createVerifiedIntent } from "./actions";
import { SubmitIntent } from "./SubmitIntent";

type Params = Record<string, string | undefined>;
export default async function VerifiedIntent({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await getCurrentContext();
  if (!ctx || !["admin", "comercial"].includes(ctx.role)) return <div className="page-content">Sem permissão para confirmar intenções.</div>;
  const p = await searchParams;
  const valid = (p.entity === "proposals" || p.entity === "agenda_events") && commercialUuid.test(p.id ?? "");
  if (!valid) return <div className="page-content"><p>Origem inválida.</p><Link href="/gestao/vinculos">Voltar à revisão</Link></div>;
  const db = await createClient();
  const entity = p.entity!, id = p.id!, org = ctx.organization.id;
  const [sourceResult, readiness] = await Promise.all([
    db.from(entity).select("*").eq("organization_id", org).eq("id", id).maybeSingle(),
    db.from("commercial_intent_confirmations").select("id").eq("organization_id", org).limit(0),
  ]);
  if (sourceResult.error || readiness.error || !sourceResult.data) return <div className="page-content">
    <p role="alert">Revisão indisponível. Confira o registro, as permissões e a migração de intenção confirmada.</p>
    <Link href="/gestao/vinculos">Voltar</Link>
  </div>;
  const source = sourceResult.data as Record<string, unknown>;
  if (source.opportunity_id) return <div className="page-content">
    <p>Este registro já está vinculado. Nenhuma nova oportunidade precisa ser criada.</p>
    <Link href={`/gestao/oportunidades/${String(source.opportunity_id)}`}>Abrir oportunidade</Link>
  </div>;
  const contactResult = await db.from("leads").select("id,name,kind,archived_at")
    .eq("organization_id", org).eq("id", String(source.lead_id ?? "")).maybeSingle();
  const contact = contactResult.data;
  if (contactResult.error || !contact || contact.archived_at || !["cliente", "corretor"].includes(contact.kind)) return <div className="page-content">
    <p role="alert">É necessário identificar e revisar um cliente ou corretor ativo antes de criar a oportunidade.</p>
    <Link href="/gestao/vinculos">Voltar</Link>
  </div>;
  const revision = typeof source.updated_at === "string" ? source.updated_at : "";
  const available = entity === "proposals"
    ? ["rascunho", "enviada", "aprovada"].includes(String(source.status))
    : source.status === "scheduled" && ["visita", "apresentacao", "reuniao_cliente"].includes(String(source.event_type))
      && typeof source.starts_at === "string" && new Date(source.starts_at).getTime() >= Date.now();
  const detail = entity === "proposals" ? `Proposta #${String(source.proposal_number ?? "—")}` : String(source.title ?? "Compromisso comercial");
  const price = source.proposed_price === null || source.proposed_price === undefined ? null : Number(source.proposed_price);
  return <>
    <PageTopbar title="Confirmar intenção de compra" subtitle="Criar oportunidade e vincular a origem em uma operação" />
    <div className="page-content" style={{ maxWidth: 900 }}>
      <Link href="/gestao/vinculos">← Revisão de vínculos</Link>
      {p.error && <p role="alert">{Object.hasOwn(intakeErrors, p.error) ? intakeErrors[p.error] : intakeErrors.unavailable}</p>}
      <section className="card card-body" style={{ marginBlock: 16 }}>
        <h3>{detail} · {contact.name}</h3>
        <p>Status no cadastro: {String(source.status ?? "não informado")}. Esse status, sozinho, não comprova envio, visita realizada ou venda.</p>
        {entity === "proposals" && <p>Valor proposto: {price === null || !Number.isFinite(price) ? "Não informado" : price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>}
        {entity === "agenda_events" && typeof source.starts_at === "string" && <p>Agendado para {formatDateTime(source.starts_at)}</p>}
        {typeof source.notes === "string" && <p style={{ whiteSpace: "pre-wrap" }}>{source.notes}</p>}
        <p>Referência: {id} · última alteração: {revision ? formatDateTime(revision) : "indisponível"}</p>
        <p><Link href={`/leads/${contact.id}`}>Conferir conversa do contato</Link>{" · "}<Link href={entity === "proposals" ? "/propostas" : "/agenda"}>Conferir documento ou compromisso</Link></p>
      </section>
      {!available || !revision ? <p role="alert">Este registro está encerrado, é passado ou não possui versão verificável. Revise o histórico sem criar outra intenção por este atalho.</p> : <form action={createVerifiedIntent} className="card card-body" style={{ display: "grid", gap: 16 }}>
        <input type="hidden" name="entity_type" value={entity} />
        <input type="hidden" name="entity_id" value={id} />
        <input type="hidden" name="revision" value={revision} />
        {contact.kind === "cliente" ? <div><strong>Comprador: {contact.name}</strong><input type="hidden" name="buyer_id" value={contact.id} /></div> : <div>
          <p><strong>Corretor: {contact.name}.</strong> Identifique o comprador real cadastrado. O nome genérico “cliente do corretor” não é suficiente.</p>
          <label>Comprador identificado<CommercialContactSelect name="buyer_id" kind="cliente" /></label>
        </div>}
        <label>Intenção concreta<input className="input" name="title" required minLength={3} maxLength={200} placeholder="Ex.: apartamento para morar com a família" /></label>
        <label>Próxima ação<input className="input" name="next_action" required minLength={3} maxLength={500} placeholder="Ex.: confirmar horário da visita com o comprador" /></label>
        <label>Evidência conferida<textarea className="input" name="evidence" required minLength={20} maxLength={2000} rows={4} placeholder="Descreva o que foi confirmado e indique a mensagem, data ou documento conferido." /></label>
        <p>Responsável inicial: {ctx.fullName}. A oportunidade será registrada agora, em atendimento, sem inventar uma data histórica ou alterar o responsável do contato.</p>
        <p>Se já houver oportunidade deste comprador em aberto ou em nutrição, a criação será recusada. Volte à revisão e vincule a existente; uma compra independente exige análise separada.</p>
        <label style={{ display: "flex", alignItems: "start", gap: 10 }}><input type="checkbox" name="confirmed" value="yes" required />Conferi a origem, o comprador e a intenção concreta de compra. Não estou apenas aceitando uma inferência da IA.</label>
        <SubmitIntent />
        <small>Criação, vínculo, interesse da proposta e evidência são salvos juntos. Repetir a mesma confirmação não cria outra oportunidade. Isso não confirma envio, qualificação, contrato ou recebimento.</small>
      </form>}
    </div>
  </>;
}
