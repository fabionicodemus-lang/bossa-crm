import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { rate } from "@/lib/commercial/model";
const number = (v: number | null) =>
  v === null
    ? "Não disponível"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
type Operations = {
  handoffs: {
    requested: number;
    accepted: number;
    pending: number;
    responded: number;
    accept_median_minutes: number | null;
    response_median_minutes: number | null;
    in_hours: number;
    within_sla: number;
    off_hours: number;
    missing_schedule: number;
  };
  brokers: {
    id: string;
    name: string;
    company: string | null;
    opportunities: number;
    proposals: number;
    contracts: number;
    contracted_value: number;
    buyer_visits: number;
    broker_visits: number;
    interactions: number;
    score: number;
    next_action: string | null;
  }[];
  costs: {
    source: string;
    media: number | null;
    total: number;
    opportunities: number;
    contracts: number;
  }[];
  reviews: { pending: number; confirmed: number };
};
export async function CommercialOperations({
  org,
  start,
  end,
}: {
  org: string;
  start: string;
  end: string;
}) {
  const db = await createClient();
  const { data, error } = await db.rpc("commercial_operations", {
    p_org: org,
    p_start: start,
    p_end: end,
  });
  if (error || !data)
    return (
      <section className="card card-body" style={{ marginTop: 16 }}>
        <h3>Operação e custos</h3>
        <p>
          Indicadores indisponíveis. Nenhum resultado foi presumido como zero.
        </p>
      </section>
    );
  const d = data as Operations;
  const h = d.handoffs;
  return (
    <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
      <p>
        As análises operacionais abaixo usam o período selecionado e toda a
        organização. Os filtros de oportunidade se aplicam aos blocos acima.
      </p>
      <section className="card card-body">
        <h3>Nara e transferências</h3>
        <p>
          {h.requested} solicitações · {h.accepted} aceitas · {h.pending}{" "}
          pendentes · {h.responded} com resposta humana.
        </p>
        <p>
          Tempo mediano até aceite: {number(h.accept_median_minutes)} min. Até
          primeira mensagem humana enviada: {number(h.response_median_minutes)}{" "}
          min.
        </p>
        <p>
          Prazo durante expediente: {number(rate(h.within_sla, h.in_hours))}% ·{" "}
          {h.within_sla}/{h.in_hours} casos com tempo suficiente para avaliação.
        </p>
        <small>
          Aceite e resposta são medidos separadamente. {h.off_hours}{" "}
          solicitações fora do expediente exigem análise da escala de plantão e
          ficam fora dessa taxa. {h.missing_schedule} sem configuração de
          horário. A resposta enviada não comprova leitura do cliente.
        </small>
        <p>
          <Link href="/ia">Abrir atendimentos</Link>
        </p>
      </section>
      <section className="card">
        <div className="card-head">
          <h3>Corretores — resultados documentados no período</h3>
          <Link href="/corretores">Relacionamento e ranking legado</Link>
        </div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <p>
            Pesos preservados e configuráveis. Revisões de proposta não aumentam
            pontos; interações precisam de evidência confirmada e têm limite
            mensal.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Corretor / imobiliária</th>
                <th>Intenções</th>
                <th>Propostas</th>
                <th>Visitas com / sem cliente</th>
                <th>Contratos líquidos</th>
                <th>Interações</th>
                <th>Pontos</th>
                <th>Próxima ação</th>
              </tr>
            </thead>
            <tbody>
              {d.brokers.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/leads/${b.id}`}>{b.name}</Link>
                    <small>{b.company}</small>
                  </td>
                  <td>{b.opportunities}</td>
                  <td>{b.proposals}</td>
                  <td>
                    {b.buyer_visits} / {b.broker_visits}
                  </td>
                  <td>{b.contracts}</td>
                  <td>{b.interactions}</td>
                  <td>{b.score}</td>
                  <td>{b.next_action ?? "Não registrada"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.brokers.length && (
            <p>
              Sem resultados documentados nas oportunidades vinculadas. O
              ranking legado continua acessível.
            </p>
          )}
        </div>
      </section>
      <section className="card card-body">
        <h3>Custos do período por origem</h3>
        <p>
          Despesas com início e fim exatamente iguais ao intervalo selecionado.
          Não é custo de aquisição por coorte nem prova de causalidade.
        </p>
        {d.costs.length ? (
          d.costs.map((c) => (
            <p key={c.source}>
              {c.source} · mídia:{" "}
              {c.media === null ? "não lançada" : `R$ ${number(c.media)}`} ·
              custo total registrado: R$ {number(c.total)} · por oportunidade
              criada:{" "}
              {c.opportunities
                ? `R$ ${number(c.total / c.opportunities)}`
                : "Sem base de comparação"}{" "}
              · por contrato:{" "}
              {c.contracts
                ? `R$ ${number(c.total / c.contracts)}`
                : "Sem base de comparação"}
            </p>
          ))
        ) : (
          <p>
            Custos indisponíveis: nenhum lançamento compatível com o período.
            Cadastre despesas documentadas nas configurações.
          </p>
        )}
      </section>
      <section className="card card-body">
        <h3>Qualidade das conversas</h3>
        <p>
          {d.reviews.pending} sinalizações aguardando revisão ·{" "}
          {d.reviews.confirmed} confirmadas no período.
        </p>
        <p>
          Uma sinalização automática permanece pendente até revisão humana com
          evidência literal.
        </p>
        <Link href="/gestao/configuracoes">Metas, pesos, custos e revisão</Link>
      </section>
    </div>
  );
}
