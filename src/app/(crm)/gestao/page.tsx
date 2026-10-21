import { Suspense } from "react";
import { CommercialOperations } from "@/components/CommercialOperations";
import { CommercialDevelopments } from "@/components/CommercialDevelopments";
import { CommercialStageDuration } from "@/components/CommercialStageDuration";
import { CommercialContactSelect } from "@/components/CommercialContactSelect";
import Link from "next/link";
import { PageTopbar } from "@/components/PageTopbar";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  metricDefinitions,
  periodRange,
  relativeChange,
  rate,
  stages,
  type Metric,
  type Dashboard,
} from "@/lib/commercial/model";
import { formatDateTime } from "@/lib/format";
type Params = Record<string, string | undefined>;
const num = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default async function Management({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const context = await getCurrentContext();
  const db = await createClient();
  const p = await searchParams;
  let range;
  try {
    range = periodRange(p);
  } catch {
    return (
      <div className="page-content">
        <p>Período inválido.</p>
        <Link href="/gestao">Redefinir filtros</Link>
      </div>
    );
  }
  const filters = Object.fromEntries(
    ["development", "owner", "broker", "source", "format"]
      .filter((k) => p[k])
      .map((k) => [k, p[k]]),
  );
  const [response, developments, team] = await Promise.all([
    db.rpc("commercial_dashboard", {
      p_org: context!.organization.id,
      p_start: range.start,
      p_end: range.end,
      p_filters: filters,
    }),
    db
      .from("developments")
      .select("id,name")
      .eq("organization_id", context!.organization.id)
      .order("name"),
    db
      .from("memberships")
      .select("user_id,profiles(full_name)")
      .eq("organization_id", context!.organization.id),
  ]);
  const selectedBroker = p.broker
    ? await db
        .from("leads")
        .select("id,name,kind,phone,enterprise,company,group_name")
        .eq("organization_id", context!.organization.id)
        .eq("kind", "corretor")
        .eq("id", p.broker)
        .maybeSingle()
    : null;
  const data = response.data as Dashboard | null;
  const query = new URLSearchParams(
    Object.entries(p).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
  const href = (metric: string) => {
    const q = new URLSearchParams(query);
    q.set("metric", metric);
    q.delete("offset");
    return `/gestao?${q}`;
  };
  let detail: {
    total: number;
    rows: {
      opportunity_id: string;
      entity_id: string;
      title: string;
      occurred_at: string;
      amount: number;
    }[];
  } | null = null;
  if (p.metric && Object.hasOwn(metricDefinitions, p.metric)) {
    const r = await db.rpc("commercial_detail", {
      p_org: context!.organization.id,
      p_start: range.start,
      p_end: range.end,
      p_metric: p.metric,
      p_filters: filters,
      p_offset: Number(p.offset) || 0,
    });
    if (r.error) throw r.error;
    detail = r.data;
  }
  const goals = await db
    .from("commercial_goals")
    .select("*")
    .eq("organization_id", context!.organization.id)
    .eq("starts_on", range.startDay)
    .eq("ends_on", range.endDay);
  return (
    <>
      <PageTopbar
        title="Gestão comercial"
        subtitle="Oportunidades, ações e resultados comprovados"
        actions={
          <Link className="btn btn-primary" href="/gestao/nova">
            Nova oportunidade
          </Link>
        }
      />
      <div className="page-content">
        <form
          className="card card-body"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "end",
            marginBottom: 16,
          }}
        >
          <label>
            Período
            <select
              name="period"
              defaultValue={p.period ?? "30"}
              className="input"
            >
              <option value="today">Hoje</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="month">Mês atual</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
          <label>
            Início
            <input
              type="date"
              name="start"
              defaultValue={range.startDay}
              className="input"
            />
          </label>
          <label>
            Fim
            <input
              type="date"
              name="end"
              defaultValue={range.endDay}
              className="input"
            />
          </label>
          <label>
            Empreendimento
            <select
              name="development"
              defaultValue={p.development ?? ""}
              className="input"
            >
              <option value="">Todos</option>
              {developments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsável
            <select name="owner" defaultValue={p.owner ?? ""} className="input">
              <option value="">Todos</option>
              {team.data?.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {String(
                    (m.profiles as unknown as { full_name: string } | null)
                      ?.full_name ?? m.user_id,
                  )}
                </option>
              ))}
            </select>
          </label>
          <label>
            Corretor
            <CommercialContactSelect
              name="broker"
              kind="corretor"
              initial={selectedBroker?.data ? { ...selectedBroker.data, kind: "corretor" as const } : null}
            />
          </label>
          <label>
            Origem
            <input
              name="source"
              defaultValue={p.source ?? ""}
              placeholder="Todas; unknown = desconhecida"
              className="input"
            />
          </label>
          <label>
            Formato
            <select
              name="format"
              defaultValue={p.format ?? ""}
              className="input"
            >
              <option value="">Todos</option>
              <option value="buyer">Com comprador</option>
              <option value="remote">Apresentação remota</option>
            </select>
          </label>
          <button className="btn btn-primary">Aplicar</button>
          <Link href="/gestao" className="btn btn-ghost">
            Limpar
          </Link>
        </form>
        <p>
          <Link href="/gestao/oportunidades">Todas as oportunidades</Link> ·{" "}
          <Link href="/gestao/configuracoes">Metas e configurações</Link>
        </p>
        <p>
          {range.startDay.split("-").reverse().join("/")} a{" "}
          {range.endDay.split("-").reverse().join("/")} · America/Sao_Paulo ·
          período atual limitado ao momento da consulta.
        </p>
        {response.error || !data ? (
          <section className="card card-body" role="alert">
            <h3>Indicadores indisponíveis</h3>
            <p>
              {response.error?.code === "PGRST202"
                ? "A base de métricas aguarda implantação das migrações."
                : "Não foi possível consultar a base de métricas. Tente novamente."}
            </p>
            <p>Nenhum resultado zero foi presumido.</p>
          </section>
        ) : (
          <>
            {data.history_incomplete && (
              <div className="card card-body" role="status">
                Histórico incompleto. A coleta comprovada começou em{" "}
                {data.tracking_started_at
                  ? formatDateTime(data.tracking_started_at)
                  : "data ainda não configurada"}
                . Os números abaixo representam apenas registros documentados;
                contatos antigos não foram convertidos automaticamente em
                oportunidades.
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
                gap: 12,
                marginBlock: 16,
              }}
            >
              {(
                Object.entries(metricDefinitions) as [
                  Metric,
                  (typeof metricDefinitions)[Metric],
                ][]
              ).map(([key, definition]) => {
                const metric = data.metrics[key];
                const variation = data.comparison_incomplete
                  ? null
                  : relativeChange(metric.value, metric.previous);
                const matchingGoals = goals.data?.filter(
                  (g) =>
                    g.metric === key &&
                    (g.development_id ?? "") === (filters.development ?? "") &&
                    (g.owner_id ?? "") === (filters.owner ?? ""),
                );
                const goal =
                  matchingGoals?.length === 1
                    ? Number(matchingGoals[0].target)
                    : null;
                return (
                  <Link
                    key={key}
                    href={href(key)}
                    className="card card-body"
                    style={{ color: "inherit", textDecoration: "none" }}
                    title={`${definition.formula} Data: ${definition.date}.`}
                  >
                    <div className="kpi-label">{definition.label}</div>
                    <div className="kpi-value">
                      {key === "value" || key === "receipts"
                        ? money(metric.value)
                        : num(metric.value)}
                    </div>
                    <p className="kpi-note">
                      {variation === null
                        ? "Sem base de comparação"
                        : `${variation > 0 ? "+" : ""}${num(variation)}% vs. período anterior de mesma duração`}
                    </p>
                    {goal && (
                      <p>
                        Meta: {num(goal)} · {num((metric.value / goal) * 100)}%
                      </p>
                    )}
                    <small>{definition.date} · ver registros</small>
                  </Link>
                );
              })}
            </div>
            {detail && (
              <section className="card" id="registros">
                <div className="card-head">
                  <h3>
                    {metricDefinitions[p.metric as Metric].label}:{" "}
                    {num(detail.total)} registros
                  </h3>
                  <a
                    className="btn btn-ghost"
                    href={`/api/commercial/export?${query}`}
                  >
                    Exportar esta página CSV
                  </a>
                </div>
                <div className="card-body">
                  <p>
                    {metricDefinitions[p.metric as Metric].formula} Data:{" "}
                    {metricDefinitions[p.metric as Metric].date}.
                  </p>
                  <div style={{ overflowX: "auto" }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Oportunidade</th>
                          <th>Data</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.rows.map((r) => (
                          <tr key={r.entity_id}>
                            <td>
                              <Link
                                href={`/gestao/oportunidades/${r.opportunity_id}?return=${encodeURIComponent(query.toString())}`}
                              >
                                {r.title}
                              </Link>
                            </td>
                            <td>{formatDateTime(r.occurred_at)}</td>
                            <td>{r.amount ? money(r.amount) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {detail.rows.length === 0 && (
                    <p>Nenhum registro documentado neste intervalo.</p>
                  )}
                  {Number(p.offset || 0) > 0 && (
                    <Link
                      href={`/gestao?${new URLSearchParams({ ...Object.fromEntries(query), offset: String(Math.max(0, Number(p.offset || 0) - 50)) })}`}
                    >
                      ← Anterior{" "}
                    </Link>
                  )}
                  {Number(p.offset || 0) + 50 < detail.total && (
                    <Link
                      href={`/gestao?${new URLSearchParams({ ...Object.fromEntries(query), offset: String(Number(p.offset || 0) + 50) })}`}
                    >
                      Próxima →
                    </Link>
                  )}
                </div>
              </section>
            )}
            <section className="card" style={{ marginBlock: 16 }}>
              <div className="card-head">
                <h3>Precisa de ação</h3>
              </div>
              <div className="card-body">
                {data.actions.length === 0 ? (
                  <p>Nenhuma pendência nas oportunidades cadastradas.</p>
                ) : (
                  data.actions.map((a) => (
                    <p key={a.id}>
                      <Link href={`/gestao/oportunidades/${a.id}`}>
                        {a.title}
                      </Link>{" "}
                      · {a.reason} ·{" "}
                      <Link href={`/leads/${a.lead_id}`}>
                        Abrir atendimento e tarefas
                      </Link>
                    </p>
                  ))
                )}
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h3>Funil atual</h3>
              </div>
              <div className="card-body">
                <p>
                  Estoque atual, independente do intervalo de atividade.
                  Empreendimento, origem e responsável seguem os filtros.
                </p>
                {Object.entries(stages).map(([key, label]) => {
                  const n =
                    data.stages.find((s) => s.stage === key)?.count ?? 0;
                  return (
                    <div
                      key={key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "150px 1fr 40px",
                        gap: 12,
                        alignItems: "center",
                        marginBlock: 8,
                      }}
                    >
                      <span>{label}</span>
                      <div
                        style={{
                          height: 8,
                          background: "var(--border)",
                          borderRadius: 8,
                        }}
                      >
                        <div
                          style={{
                            width: `${(n / Math.max(1, ...data.stages.map((s) => s.count))) * 100}%`,
                            height: 8,
                            background: "var(--green)",
                            borderRadius: 8,
                          }}
                        />
                      </div>
                      <strong>{n}</strong>
                    </div>
                  );
                })}
              </div>
            </section>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
                gap: 16,
                marginBlock: 16,
              }}
            >
              <section className="card card-body">
                <h3>Coorte de primeiras propostas</h3>
                <p>
                  {num(data.proposal_cohort.converted)} contratos de{" "}
                  {num(data.proposal_cohort.size)} oportunidades ·{" "}
                  {rate(
                    data.proposal_cohort.converted,
                    data.proposal_cohort.size,
                  ) === null
                    ? "Sem base de comparação"
                    : `${num(rate(data.proposal_cohort.converted, data.proposal_cohort.size)!)}%`}
                </p>
                <p>
                  {num(data.proposal_cohort.open)} em aberto. Corte:{" "}
                  {formatDateTime(data.proposal_cohort.cutoff)}.
                </p>
                <small>
                  Primeiras propostas enviadas no intervalo e contratos
                  posteriores até o corte. Coorte em maturação.
                </small>
              </section>
              <section className="card card-body">
                <h3>Visita → primeira proposta posterior</h3>
                <p>
                  {data.visit_cohort.converted} de {data.visit_cohort.size}{" "}
                  oportunidades ·{" "}
                  {rate(data.visit_cohort.converted, data.visit_cohort.size) ===
                  null
                    ? "Sem base de comparação"
                    : `${num(rate(data.visit_cohort.converted, data.visit_cohort.size)!)}%`}
                </p>
                <small>
                  Oportunidades distintas com visita realizada no intervalo.
                  Propostas anteriores à visita não entram na conversão.
                </small>
              </section>
              <section className="card card-body">
                <h3>Comparecimento</h3>
                <p>
                  {rate(
                    data.attendance.completed,
                    data.attendance.completed + data.attendance.no_show,
                  ) === null
                    ? "Sem base de comparação"
                    : `${num(rate(data.attendance.completed, data.attendance.completed + data.attendance.no_show)!)}%`}
                </p>
                <p>
                  {data.attendance.completed} realizadas ·{" "}
                  {data.attendance.no_show} faltas · {data.attendance.cancelled}{" "}
                  canceladas · {data.attendance.pending} sem desfecho.
                </p>
                <small>
                  Realizadas ÷ (realizadas + faltas). Ocorrências substituídas
                  não contam como falta.
                </small>
              </section>
            </div>
            <section className="card card-body">
              <h3>Qualidade da base de oportunidades</h3>
              <p>
                Sem origem: {data.quality.without_source} · Sem responsável:{" "}
                {data.quality.without_owner} · Sem próxima ação:{" "}
                {data.quality.without_action} · Eventos aguardando confirmação:{" "}
                {data.quality.pending_events}.
              </p>
              <p>
                Atualizado em {formatDateTime(data.updated_at)}. Entradas
                confirmadas são lançamentos documentados; sincronização
                financeira automática ainda não disponível.
              </p>
            </section>
          </>
        )}
        {!response.error && data && (
          <Suspense fallback={<p>Carregando comparativo de empreendimentos…</p>}>
            <CommercialDevelopments
              org={context!.organization.id}
              start={range.start}
              end={range.end}
              filters={filters}
              developments={developments.data ?? []}
              baseQuery={query.toString()}
            />
          </Suspense>
        )}
        {!response.error && data && (
          <Suspense fallback={<p>Calculando duração das etapas…</p>}>
            <CommercialStageDuration
              org={context!.organization.id}
              start={range.start}
              end={range.end}
              filters={filters}
            />
          </Suspense>
        )}
        <Suspense fallback={<p>Carregando operação e custos…</p>}>
          <CommercialOperations
            org={context!.organization.id}
            start={range.start}
            end={range.end}
          />
        </Suspense>
        <section className="card card-body" style={{ marginTop: 16 }}>
          <h3>Operação existente</h3>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              ["/agenda", "Agenda"],
              ["/propostas", "Propostas"],
              ["/corretores", "Corretores"],
              ["/nara", "Nara"],
              ["/site", "Site"],
              ["/campanhas", "Campanhas"],
              ["/empreendimentos", "Empreendimentos"],
            ].map(([url, label]) => (
              <Link key={url} href={url}>
                {label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
