'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Filters = { from: string; to: string; kind: 'cliente' | 'corretor' };
type Counter = { events: number | null; unique_leads: number | null; collection: string };
export type FunnelSummary = {
  counts: Record<string, Counter>;
  collection_catalog: Record<string, { mode: string; note: string }>;
  coverage: { observed_from: string | null; observed_until: string | null; records_examined: number;
    accepted_events: number; ignored_records: number; duplicate_records: number; truncated: boolean; max_records: number };
  conversion_rates: null;
};
const cards = [
  ['compromisso_solicitado', 'Compromisso solicitado'], ['compromisso_confirmado', 'Compromisso confirmado'],
  ['compromisso_realizado', 'Compromisso realizado'], ['proposta_enviada', 'Proposta enviada'],
  ['proposta_apresentada', 'Proposta apresentada'], ['encaminhado', 'Encaminhado ao humano'], ['assumido', 'Assumido pelo humano'],
] as const;
const dayMs = 86400000;

/** Days are inclusive in the UI; the existing API receives an exclusive end, in Brasília time. */
export function buildNaraFunnelQuery(filters: Filters) {
  for (const value of [filters.from, filters.to]) {
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error('Informe datas válidas.');
    }
  }
  if (filters.kind !== 'cliente' && filters.kind !== 'corretor') throw new Error('Selecione clientes ou corretores.');
  const start = Date.parse(`${filters.from}T00:00:00-03:00`);
  const end = Date.parse(`${filters.to}T00:00:00-03:00`) + dayMs;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 93 * dayMs) {
    throw new Error('Selecione um período de até 93 dias, com início anterior ou igual ao fim.');
  }
  return new URLSearchParams({ from: new Date(start).toISOString(), to: new Date(end).toISOString(), kind: filters.kind }).toString();
}

export async function fetchNaraFunnelSummary(query: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<FunnelSummary> {
  const response = await fetcher(`/api/nara/funnel?${query}`, { method: 'GET', cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o funil.');
  if (!data.counts || !data.coverage || !data.collection_catalog || data.conversion_rates !== null) throw new Error('Resposta de medição inválida. Atualize a consulta.');
  return data as FunnelSummary;
}

function observedDate(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Sem evento registrado no período';
}

export function NaraFunnelReport({ summary, kind }: { summary: FunnelSummary; kind: Filters['kind'] }) {
  return <div className="grid" style={{ gap: 16 }}>
    <h2>{kind === 'cliente' ? 'Clientes' : 'Corretores'} · contatos únicos por marco</h2>
    <p className="faint">Cada contato pode aparecer em vários marcos. Os cards não são etapas obrigatórias nem devem ser somados como um total de pessoas.</p>
    {summary.coverage.truncated && <div className="error-box" role="alert">Leitura limitada aos primeiros {summary.coverage.max_records.toLocaleString('pt-BR')} registros. Estes números são parciais; reduza o período antes de comparar resultados.</div>}
    <div className="grid grid-4">
      {cards.map(([event, label]) => {
        const counter = summary.counts[event];
        return <section className="kpi" key={event} aria-label={label}>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>{counter?.unique_leads == null ? 'Não coletado' : counter.unique_leads.toLocaleString('pt-BR')}</div>
          <div className="faint">{counter?.events == null ? 'Sem coletor disponível' : `${counter.events.toLocaleString('pt-BR')} evento(s) explícito(s)`}</div>
          <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>{summary.collection_catalog[event]?.note ?? 'Cobertura não informada.'}</p>
        </section>;
      })}
    </div>
    <section className="card"><div className="card-head"><h3>Origem e limites desta leitura</h3></div><div className="card-body">
      <p>Fonte: eventos explícitos da Nara no histórico de atividades desta empresa. As métricas legadas baseadas em estágio não entram aqui; o histórico anterior não foi reconstruído.</p>
      <p>Registros examinados: {summary.coverage.records_examined.toLocaleString('pt-BR')} · Eventos aceitos: {summary.coverage.accepted_events.toLocaleString('pt-BR')} · Ignorados: {summary.coverage.ignored_records.toLocaleString('pt-BR')} · Duplicados: {summary.coverage.duplicate_records.toLocaleString('pt-BR')}.</p>
      <p>Primeiro evento observado: {observedDate(summary.coverage.observed_from)}. Último: {observedDate(summary.coverage.observed_until)}.</p>
      <p>Pessoas únicas usam o contato canônico do CRM; cadastros duplicados ainda precisam ser conciliados. Zero significa nenhum evento encontrado nesta consulta, não ausência comprovada de atuação em todos os fluxos.</p>
      <details><summary>Ver marcos ainda não coletados</summary><ul>
        {Object.entries(summary.collection_catalog).filter(([, value]) => value.mode === 'not_instrumented').map(([event, value]) => <li key={event}><strong>{event.replaceAll('_', ' ')}</strong> — Não coletado. {value.note}</li>)}
      </ul></details>
    </div></section>
  </div>;
}

export function NaraFunnelPanel({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const [filters, setFilters] = useState<Filters>({ from: initialFrom, to: initialTo, kind: 'cliente' });
  const [query, setQuery] = useState(() => buildNaraFunnelQuery({ from: initialFrom, to: initialTo, kind: 'cliente' }));
  const [summary, setSummary] = useState<FunnelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const appliedParams = new URLSearchParams(query);
  const appliedKind = appliedParams.get('kind') === 'corretor' ? 'corretor' : 'cliente';
  const appliedFrom = appliedParams.get('from')!.slice(0, 10);
  const appliedTo = new Date(Date.parse(appliedParams.get('to')!) - dayMs).toISOString().slice(0, 10);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchNaraFunnelSummary(query, controller.signal);
        if (!controller.signal.aborted) setSummary(data);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha ao consultar o funil.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [query, reload]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    try {
      const next = buildNaraFunnelQuery(filters);
      setError(''); setSummary(null); setLoading(true); setQuery(next); setReload((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Período inválido.'); }
  }
  return <div className="page-content grid" style={{ gap: 20 }}>
    <div className="info-box"><strong>Medição parcial, somente leitura.</strong> Solicitar, confirmar e realizar são ações distintas. Gerar PDF não é enviar proposta; enviar não é apresentar. Encaminhar não é assumir nem fazer o primeiro contato humano. <strong>Taxas de conversão não disponíveis</strong>: ainda não há coorte elegível completa. Nenhum experimento A/B está ativo nesta tela.</div>
    <form className="card" onSubmit={applyFilters}><div className="card-body grid grid-4">
      <div className="field"><label htmlFor="funnel-from">De</label><input id="funnel-from" className="input" type="date" required value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></div>
      <div className="field"><label htmlFor="funnel-to">Até (inclusive)</label><input id="funnel-to" className="input" type="date" required value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></div>
      <div className="field"><label htmlFor="funnel-kind">Tipo de contato</label><select id="funnel-kind" className="select" value={filters.kind} onChange={(event) => setFilters((current) => ({ ...current, kind: event.target.value === 'corretor' ? 'corretor' : 'cliente' }))}><option value="cliente">Clientes</option><option value="corretor">Corretores</option></select></div>
      <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Consultando…' : 'Consultar'}</button></div>
      <p className="faint" style={{ gridColumn: '1 / -1' }}>Até 93 dias por consulta. Datas no horário de Brasília (UTC−3); o último dia é incluído.</p>
    </div></form>
    {error && <div className="error-box" role="alert">{error} Nenhum resultado foi substituído por zeros.</div>}
    {loading && <p role="status">Consultando somente os eventos explícitos autorizados para sua empresa…</p>}
    {!loading && summary && <><p className="faint">Consulta exibida: {appliedFrom} a {appliedTo}, inclusive.</p><NaraFunnelReport summary={summary} kind={appliedKind} /></>}
  </div>;
}
