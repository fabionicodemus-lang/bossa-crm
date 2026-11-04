import Link from "next/link";
import { PageTopbar } from "@/components/PageTopbar";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { proposeContactReconciliation, reviewContactReconciliation } from "./actions";

type Contact = { id: string; name: string; phone: string | null; kind: string };
type Review = {
  id: string; contact_low_id: string; contact_high_id: string; preferred_contact_id: string;
  proposed_by: string; proposed_at: string; proposal_reason: string; evidence_reference: string;
  contact_snapshot: { first: Contact; second: Contact }; status: string;
  reviewed_by: string | null; reviewed_at: string | null; review_reason: string | null;
};

export default async function ContactReconciliation({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getCurrentContext();
  const params = await searchParams;
  const db = await createClient();
  const org = ctx!.organization.id;
  const state = params.state === "confirmed" || params.state === "rejected" ? params.state : "pending";
  const reviews = await db.from("commercial_contact_reconciliations").select("*").eq("organization_id", org)
    .eq("status", state).order("proposed_at", { ascending: false }).limit(50);
  if (reviews.error) return <div className="page-content"><h2>Reconciliação indisponível</h2>
    <p role="alert">Confira a migração e as permissões. Não presuma que a fila está vazia.</p></div>;
  const rows = (reviews.data ?? []) as Review[];
  const canPropose = ctx!.role === "admin" || ctx!.role === "comercial";
  return <>
    <PageTopbar title="Reconciliação de contatos" subtitle="Revisão explícita de fichas com histórico comercial" />
    <div className="page-content">
      <p><Link href="/gestao">← Gestão</Link></p>
      <p>Uma confirmação registra a relação entre duas fichas. Propostas, visitas, mensagens, eventos e seus contatos originais permanecem separados. Telefone igual, por si só, não comprova identidade.</p>
      {params.error && <p role="alert">{params.error}</p>}
      {params.ok === "1" && <p role="status">Decisão registrada.</p>}
      {canPropose && <section className="card card-body"><h2>Propor reconciliação</h2>
        <p>Abra as duas fichas e confira evidências independentes antes de propor. Informe os IDs exibidos nas fichas.</p>
        <form action={proposeContactReconciliation}>
          <label>ID da primeira ficha<input className="input" name="first" required defaultValue={params.first ?? ""} /></label>
          <label>ID da segunda ficha<input className="input" name="second" required defaultValue={params.second ?? ""} /></label>
          <label>ID da ficha de referência<input className="input" name="preferred" required defaultValue={params.first ?? ""} /></label>
          <label>Por que representam a mesma pessoa?<textarea className="input" name="reason" minLength={20} maxLength={2000} required /></label>
          <label>Referência verificável da evidência<textarea className="input" name="evidence" minLength={8} maxLength={500} required /></label>
          <button className="btn btn-primary">Enviar para revisão de outro administrador</button>
        </form>
      </section>}
      <p><Link href="/gestao/contatos">Pendentes</Link> · <Link href="/gestao/contatos?state=confirmed">Confirmadas</Link> · <Link href="/gestao/contatos?state=rejected">Rejeitadas</Link></p>
      <p>{rows.length} registros exibidos (até 50).</p>
      {rows.map(r => <section className="card card-body" key={r.id} style={{ marginBlock: 12 }}>
        <h3>{r.contact_snapshot.first.name} / {r.contact_snapshot.second.name}</h3>
        <p><Link href={`/leads/${r.contact_low_id}`}>Primeira ficha</Link> · <Link href={`/leads/${r.contact_high_id}`}>Segunda ficha</Link> · referência proposta: <Link href={`/leads/${r.preferred_contact_id}`}>{r.preferred_contact_id}</Link></p>
        <p>Dados preservados na proposta: {r.contact_snapshot.first.name} ({r.contact_snapshot.first.phone ?? "sem telefone"}) / {r.contact_snapshot.second.name} ({r.contact_snapshot.second.phone ?? "sem telefone"}). Compare com as fichas atuais; o telefone sozinho não confirma identidade.</p>
        <p>Justificativa: {r.proposal_reason}</p><p>Evidência: {r.evidence_reference}</p>
        <small>Proposto por {r.proposed_by} em {r.proposed_at}. Estado: {r.status}.</small>
        {r.reviewed_by && <p>Revisado por {r.reviewed_by} em {r.reviewed_at}: {r.review_reason}</p>}
        {r.status === "pending" && ctx!.role === "admin" && ctx!.userId !== r.proposed_by && <form action={reviewContactReconciliation}>
          <input type="hidden" name="id" value={r.id} />
          <label>Conclusão após conferir as fichas e a evidência<textarea className="input" name="reason" minLength={20} maxLength={2000} required /></label>
          <button className="btn btn-primary" name="decision" value="confirm">Confirmar relação</button>{" "}
          <button className="btn btn-ghost" name="decision" value="reject">Rejeitar</button>
        </form>}
      </section>)}
    </div>
  </>;
}
