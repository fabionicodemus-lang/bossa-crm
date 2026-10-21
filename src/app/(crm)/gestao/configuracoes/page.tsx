import Link from "next/link";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageTopbar } from "@/components/PageTopbar";
import { metricDefinitions } from "@/lib/commercial/model";
import { saveCommercial } from "../actions";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getCurrentContext();
  if (ctx!.role !== "admin") return <p>Área exclusiva do administrador.</p>;
  const db = await createClient();
  const org = ctx!.organization.id;
  const p = await searchParams;
  const [settings, ranking, goals, expenses, reviews] = await Promise.all([
    db
      .from("commercial_settings")
      .select("*")
      .eq("organization_id", org)
      .single(),
    db
      .from("commercial_ranking_settings")
      .select("*")
      .eq("organization_id", org)
      .single(),
    db
      .from("commercial_goals")
      .select("*")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("commercial_expenses")
      .select("*")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("commercial_conversation_reviews")
      .select("*")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (
    settings.error ||
    ranking.error ||
    goals.error ||
    expenses.error ||
    reviews.error
  )
    return (
      <div className="page-content">
        <p role="alert">
          Configurações indisponíveis. Confira a implantação da base comercial.
        </p>
        <Link href="/gestao">Voltar</Link>
      </div>
    );
  return (
    <>
      <PageTopbar
        title="Configurações comerciais"
        subtitle="Metas, custos, ranking e revisão de conversas"
      />
      <div className="page-content">
        <Link href="/gestao">← Gestão</Link>
        {p.error && <p role="alert">{p.error}</p>}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
            gap: 16,
            marginBlock: 16,
          }}
        >
          <form action={saveCommercial} className="card card-body">
            <h3>Parâmetros operacionais</h3>
            <input type="hidden" name="operation" value="settings" />
            <label>
              Amostra mínima
              <input
                className="input"
                type="number"
                name="minimum_sample"
                min={2}
                defaultValue={settings.data.minimum_sample}
              />
            </label>
            <label>
              Dias sem avanço para negociação parada
              <input
                className="input"
                type="number"
                name="stalled_days"
                min={1}
                defaultValue={settings.data.stalled_days}
              />
            </label>
            <button className="btn btn-primary">Salvar parâmetros</button>
          </form>
          <form action={saveCommercial} className="card card-body">
            <h3>Pesos do ranking</h3>
            <p>
              Preservados os pesos existentes: 100 / 20 / 10 / 4 / 1. Interações
              exigem evidência revisada; limite mensal configurável.
            </p>
            <input type="hidden" name="operation" value="ranking" />
            {[
              ["contract_points", "Contrato"],
              ["proposal_points", "Primeira proposta"],
              ["buyer_visit_points", "Visita com comprador"],
              ["broker_visit_points", "Visita sem comprador"],
              ["interaction_points", "Interação relevante"],
              ["monthly_interaction_cap", "Limite mensal de interações"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  className="input"
                  type="number"
                  name={key}
                  min={0}
                  defaultValue={ranking.data[key]}
                />
              </label>
            ))}
            <button className="btn btn-primary">Salvar pesos</button>
          </form>
          <form action={saveCommercial} className="card card-body">
            <h3>Nova meta da equipe</h3>
            <p>
              Planejamento editável, sem previsão automática. Os pilotos 12/6,
              20/10 e 28/14 não são ativados automaticamente.
            </p>
            <input type="hidden" name="operation" value="goal" />
            <label>
              Indicador
              <select className="input" name="metric">
                {Object.entries(metricDefinitions)
                  .filter(([k]) =>
                    [
                      "new",
                      "qualified",
                      "visits",
                      "proposals",
                      "contracts",
                      "value",
                    ].includes(k),
                  )
                  .map(([k, d]) => (
                    <option key={k} value={k}>
                      {d.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Início
              <input className="input" type="date" required name="starts_on" />
            </label>
            <label>
              Fim
              <input className="input" type="date" required name="ends_on" />
            </label>
            <label>
              Meta
              <input
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                required
                name="target"
              />
            </label>
            <button className="btn btn-primary">Cadastrar meta</button>
          </form>
          <form action={saveCommercial} className="card card-body">
            <h3>Registrar custo documentado</h3>
            <input type="hidden" name="operation" value="expense" />
            <label>
              Origem / canal (mesmo nome das oportunidades)
              <input className="input" name="source" required />
            </label>
            <label>
              Escopo
              <select className="input" name="category">
                <option value="media">Mídia</option>
                <option value="commercial">Operação comercial</option>
              </select>
            </label>
            <label>
              Início
              <input className="input" type="date" name="starts_on" required />
            </label>
            <label>
              Fim
              <input className="input" type="date" name="ends_on" required />
            </label>
            <label>
              Valor
              <input
                className="input"
                type="number"
                step="0.01"
                min={0}
                name="amount"
                required
              />
            </label>
            <label>
              Comprovante
              <input className="input" name="document_reference" required />
            </label>
            <button className="btn btn-primary">Registrar custo</button>
          </form>
          <form action={saveCommercial} className="card card-body">
            <h3>Revisar conversa com evidência</h3>
            <input type="hidden" name="operation" value="review" />
            <label>
              ID do contato
              <input className="input" name="lead_id" required />
            </label>
            <label>
              ID da mensagem
              <input className="input" name="message_id" required />
            </label>
            <label>
              Categoria
              <select className="input" name="category">
                {[
                  ["repeated_greeting", "Saudação repetida"],
                  ["answered_question", "Pergunta já respondida"],
                  ["incorrect_information", "Informação incorreta"],
                  ["repeated_image", "Imagem repetida"],
                  ["bad_handoff", "Transferência mal executada"],
                  ["lost_history", "Histórico perdido"],
                  ["visit_not_forwarded", "Visita sem encaminhamento"],
                  ["relevant_interaction", "Interação comercial relevante"],
                ].map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trecho literal da mensagem
              <textarea
                className="input"
                name="evidence"
                required
                minLength={8}
              />
            </label>
            <label>
              Revisão
              <select className="input" name="status">
                <option value="pending">Pendente</option>
                <option value="confirmed">Confirmada pelo administrador</option>
                <option value="rejected">Rejeitada</option>
              </select>
            </label>
            <button className="btn btn-primary">Registrar revisão</button>
          </form>
        </div>
        <section className="card card-body">
          <h3>Metas cadastradas</h3>
          {goals.data.map((g) => (
            <p key={g.id}>
              {g.metric} · {g.starts_on} a {g.ends_on} · {g.target}
            </p>
          ))}
          <h3>Custos documentados</h3>
          {expenses.data.map((e) => (
            <p key={e.id}>
              {e.source} · {e.category} · {e.starts_on} a {e.ends_on} · R${" "}
              {e.amount}
            </p>
          ))}
          <h3>Últimas revisões</h3>
          {reviews.data.map((r) => (
            <p key={r.id}>
              {r.category} · {r.status} · “{r.evidence}”
            </p>
          ))}
        </section>
      </div>
    </>
  );
}
