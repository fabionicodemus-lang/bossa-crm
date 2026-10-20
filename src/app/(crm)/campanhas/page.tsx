import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDateTime } from '@/lib/format';
import { stageLabel } from '@/lib/stages';

// Painel das campanhas: leads que chegaram por anúncio (Meta clique para WhatsApp,
// formulário de Lead Ads ou outra origem marcada como anúncio) e até onde foram
// no funil (lead_funnel_milestones). Mesma lógica de leitura do painel do Site.

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : null);
type LeadRow = {
  id: string; name: string | null; stage: string; enterprise: string | null; source: string | null;
  created_at: string; ai_classification: string | null; ad: unknown; mla: unknown;
};
type Marco = { lead_id: string; qualified_at: string | null; meeting_at: string | null; proposal_at: string | null; won_at: string | null };
type Origem = { tipo: string; campanha: string; anuncio: string };

const DAY = 86_400_000;
const PERIODOS = [{ k: '7', t: '7 dias' }, { k: '30', t: '30 dias' }, { k: '90', t: '90 dias' }, { k: '365', t: '12 meses' }];
const EMPREENDIMENTOS = ['Alma', 'Flow', 'Soul', 'Jazz'];
const TEMPERATURAS: Array<{ k: string; t: string; cor: string }> = [
  { k: 'quente', t: 'Quente', cor: 'var(--red)' },
  { k: 'agendamento', t: 'Agendado', cor: 'var(--green)' },
  { k: 'morno', t: 'Morno', cor: 'var(--amber)' },
  { k: 'frio', t: 'Frio', cor: 'var(--blue)' },
  { k: 'sem_interesse', t: 'Sem interesse', cor: 'var(--ink-3)' },
];

async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>, limite = 60_000): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < limite; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// Fora do componente: a regra de pureza do React não aceita Date.now() no corpo da página.
function inicioDoPeriodo(dias: number) { return new Date(Date.now() - dias * DAY).toISOString(); }
function diasDesde(iso: string) { return Math.max(0, (Date.now() - new Date(iso).getTime()) / DAY); }
function agoraMs() { return Date.now(); }

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—');
const num = (n: number) => n.toLocaleString('pt-BR');
const fmt1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** De qual campanha o lead veio, ou null se não veio de anúncio. */
function origemCampanha(l: LeadRow): Origem | null {
  const mla = obj(l.mla);
  if (mla) {
    return {
      tipo: 'Formulário Meta',
      campanha: txt(mla.campaign_name) || txt(mla.ad_name) || txt(mla.form_name) || 'Formulário sem nome',
      anuncio: txt(mla.ad_name) || txt(mla.form_name),
    };
  }
  const ad = obj(l.ad);
  if (ad) {
    const headline = txt(ad.headline);
    const id = txt(ad.source_id);
    return {
      tipo: 'Clique para WhatsApp',
      campanha: headline || (id ? `Anúncio ${id}` : 'Anúncio sem título'),
      anuncio: txt(ad.body).slice(0, 80),
    };
  }
  const source = txt(l.source);
  if (/^meta\b|an[uú]ncio|campanha|google ads|meta ads|facebook ads|instagram ads|tr[aá]fego pago/i.test(source)) {
    return { tipo: 'Outra campanha', campanha: source, anuncio: '' };
  }
  return null;
}

function empreendimento(l: LeadRow, o: Origem | null): string {
  const texto = `${l.enterprise ?? ''} ${o?.campanha ?? ''} ${o?.anuncio ?? ''}`.toLowerCase();
  const achados = EMPREENDIMENTOS.filter((e) => texto.includes(e.toLowerCase()));
  return achados.length === 1 ? achados[0] : l.enterprise?.trim() || 'Não informado';
}

function ComparativoHistorico({ atual, referencia }: { atual: number; referencia: number | null }) {
  const variacao = referencia !== null && referencia > 0 ? (atual / referencia - 1) * 100 : null;
  const cor = variacao === null || Math.abs(variacao) < 0.05 ? 'var(--ink-3)' : variacao > 0 ? 'var(--green)' : 'var(--red)';
  return (
    <div className="kpi-note" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
      <span>Média histórica: {referencia === null ? '—' : fmt1(referencia)}</span>
      <span style={{ color: cor, fontWeight: 700 }}>{variacao === null ? 'sem comparação' : `${variacao > 0 ? '↑ +' : variacao < 0 ? '↓ ' : ''}${fmt1(variacao)}%`}</span>
    </div>
  );
}

function Barra({ valor, max, cor = 'var(--ink)' }: { valor: number; max: number; cor?: string }) {
  const w = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  return <span aria-hidden="true" style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--sunken)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${w}%`, background: cor }} /></span>;
}

export default async function CampanhasPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const params = await searchParams;
  const context = await getCurrentContext();
  if (!context || context.role === 'viewer') redirect('/hoje');
  const orgId = context.organization.id;
  const dias = PERIODOS.some((p) => p.k === params.dias) ? Number(params.dias) : 30;
  const inicio = inicioDoPeriodo(dias);
  const admin = createAdminClient();

  let erro: string | null = null;
  let leads: LeadRow[] = [];
  let marcos: Marco[] = [];
  try {
    [leads, marcos] = await Promise.all([
      todas<LeadRow>((a, b) => admin.from('leads')
        .select('id,name,stage,enterprise,source,created_at,ai_classification,ad:metadata->ad,mla:metadata->meta_lead_ads')
        .eq('organization_id', orgId).eq('kind', 'cliente').order('created_at').range(a, b) as unknown as PromiseLike<{ data: LeadRow[] | null; error: unknown }>),
      todas<Marco>((a, b) => admin.from('lead_funnel_milestones')
        .select('lead_id,qualified_at,meeting_at,proposal_at,won_at')
        .eq('organization_id', orgId).order('lead_id').range(a, b)),
    ]);
  } catch (e) {
    erro = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  }

  const marcoPor = new Map(marcos.map((m) => [m.lead_id, m]));
  const origemPor = new Map(leads.map((l) => [l.id, origemCampanha(l)]));
  const daCampanha = leads.filter((l) => origemPor.get(l.id));
  const doPeriodo = (lista: LeadRow[]) => lista.filter((l) => l.created_at >= inicio);
  const campanhaPeriodo = doPeriodo(daCampanha);
  const outrasPeriodo = doPeriodo(leads.filter((l) => !origemPor.get(l.id)));
  // Venda só conta se aconteceu depois de o lead chegar pela campanha (exclui vendas antigas importadas).
  const vendeu = (l: LeadRow) => { const w = marcoPor.get(l.id)?.won_at; return Boolean(w && w >= l.created_at.slice(0, 10)); };
  const marcosDe = (lista: LeadRow[]) => ({
    q: lista.filter((l) => marcoPor.get(l.id)?.qualified_at).length,
    v: lista.filter((l) => marcoPor.get(l.id)?.meeting_at).length,
    p: lista.filter((l) => marcoPor.get(l.id)?.proposal_at).length,
    g: lista.filter(vendeu).length,
  });
  const mc = marcosDe(campanhaPeriodo);
  const mo = marcosDe(outrasPeriodo);
  const vendasTotal = daCampanha.filter(vendeu).length;
  const quentes = campanhaPeriodo.filter((l) => ['quente', 'agendamento'].includes(l.ai_classification ?? '')).length;

  // Média histórica de leads de campanha, proporcional ao período escolhido.
  const primeira = daCampanha[0]?.created_at ?? null;
  const diasHistoricos = primeira ? diasDesde(primeira) : 0;
  const mediaLeads = diasHistoricos >= dias ? daCampanha.length * dias / diasHistoricos : null;

  const funil = [
    { t: 'Leads de campanha', n: campanhaPeriodo.length, nota: 'chegaram por anúncio' },
    { t: 'Qualificados', n: mc.q, nota: 'chegaram à passagem/comercial' },
    { t: 'Visita ou reunião', n: mc.v, nota: '' },
    { t: 'Proposta', n: mc.p, nota: '' },
    { t: 'Venda', n: mc.g, nota: '' },
  ];

  // Por campanha
  type Linha = { chave: string; tipo: string; campanha: string; emp: Map<string, number>; leads: LeadRow[] };
  const porCampanha = new Map<string, Linha>();
  for (const l of campanhaPeriodo) {
    const o = origemPor.get(l.id)!;
    const chave = `${o.tipo}|${o.campanha}`;
    if (!porCampanha.has(chave)) porCampanha.set(chave, { chave, tipo: o.tipo, campanha: o.campanha, emp: new Map(), leads: [] });
    const linha = porCampanha.get(chave)!;
    linha.leads.push(l);
    const e = empreendimento(l, o);
    linha.emp.set(e, (linha.emp.get(e) ?? 0) + 1);
  }
  const campanhas = [...porCampanha.values()].map((c) => {
    const m = marcosDe(c.leads);
    const emp = [...c.emp.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e).slice(0, 2).join(', ');
    const q = c.leads.filter((l) => ['quente', 'agendamento'].includes(l.ai_classification ?? '')).length;
    return { ...c, n: c.leads.length, quentes: q, empTxt: emp, ...m };
  }).sort((a, b) => b.n - a.n);

  // Por empreendimento e por tipo de anúncio
  const porEmp = new Map<string, LeadRow[]>();
  for (const l of campanhaPeriodo) {
    const e = empreendimento(l, origemPor.get(l.id) ?? null);
    if (!porEmp.has(e)) porEmp.set(e, []);
    porEmp.get(e)!.push(l);
  }
  const listaEmp = [...porEmp.entries()].map(([e, ls]) => ({ e, n: ls.length, ...marcosDe(ls) })).sort((a, b) => b.n - a.n);
  const porTipo = new Map<string, number>();
  for (const l of campanhaPeriodo) { const t = origemPor.get(l.id)!.tipo; porTipo.set(t, (porTipo.get(t) ?? 0) + 1); }

  // Temperatura dada pela Nara
  const temp = TEMPERATURAS.map((t) => ({ ...t, n: campanhaPeriodo.filter((l) => (l.ai_classification ?? '') === t.k).length }));
  const semTemp = campanhaPeriodo.length - temp.reduce((s, t) => s + t.n, 0);

  // Evolução: por dia (até 30 dias) ou por semana
  const passo = dias <= 30 ? DAY : 7 * DAY;
  const fim = agoraMs();
  const baldes = Math.ceil((dias * DAY) / passo);
  const serie = Array.from({ length: baldes }, (_, i) => {
    const de = fim - (baldes - i) * passo;
    const ate = de + passo;
    const n = campanhaPeriodo.filter((l) => { const t = new Date(l.created_at).getTime(); return t >= de && t < ate; }).length;
    return { rotulo: new Date(de).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), n };
  });
  const maxSerie = Math.max(1, ...serie.map((s) => s.n));

  const comparacao = [
    { t: 'Viraram qualificados', a: pct(mc.q, campanhaPeriodo.length), b: pct(mo.q, outrasPeriodo.length) },
    { t: 'Chegaram a visita ou reunião', a: pct(mc.v, campanhaPeriodo.length), b: pct(mo.v, outrasPeriodo.length) },
    { t: 'Chegaram a proposta', a: pct(mc.p, campanhaPeriodo.length), b: pct(mo.p, outrasPeriodo.length) },
    { t: 'Compraram', a: pct(mc.g, campanhaPeriodo.length), b: pct(mo.g, outrasPeriodo.length) },
  ];

  const recentes = [...campanhaPeriodo].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 25);
  const periodoTxt = PERIODOS.find((p) => Number(p.k) === dias)?.t ?? `${dias} dias`;
  const totalPeriodo = campanhaPeriodo.length + outrasPeriodo.length;

  return (
    <>
      <PageTopbar title="Campanhas" subtitle="Leads que chegam por anúncio e quanto eles viram venda" actions={
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODOS.map((p) => <Link key={p.k} href={`/campanhas?dias=${p.k}`} className={`btn btn-sm ${Number(p.k) === dias ? 'btn-primary' : 'btn-ghost'}`}>{p.t}</Link>)}
        </div>
      } />
      <div className="page-content">
        {erro && <div className="error-box" style={{ marginBottom: 14 }}>Não foi possível ler os leads: {erro}</div>}
        {!erro && campanhaPeriodo.length === 0 && <div className="info-box" style={{ marginBottom: 14 }}>Nenhum lead de campanha nos últimos {periodoTxt}.</div>}

        <div className="kpis">
          <div className="kpi"><div className="kpi-label">Vendas vindas de campanha</div><div className="kpi-value">{num(vendasTotal)}</div><div className="kpi-note">desde o início · lead chegou por anúncio antes de comprar</div></div>
          <div className="kpi"><div className="kpi-label">Leads de campanha</div><div className="kpi-value">{num(campanhaPeriodo.length)}</div><div className="kpi-note">{periodoTxt} · {pct(campanhaPeriodo.length, totalPeriodo)} de todos os leads</div><ComparativoHistorico atual={campanhaPeriodo.length} referencia={mediaLeads} /></div>
          <div className="kpi"><div className="kpi-label">Quentes ou agendados</div><div className="kpi-value">{num(quentes)}</div><div className="kpi-note">{pct(quentes, campanhaPeriodo.length)} dos leads de campanha · avaliação da Nara</div></div>
          <div className="kpi"><div className="kpi-label">Conversão lead → qualificado</div><div className="kpi-value">{pct(mc.q, campanhaPeriodo.length)}</div><div className="kpi-note">outras origens: {pct(mo.q, outrasPeriodo.length)}</div></div>
        </div>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Do anúncio à venda · {periodoTxt}</h3></div>
          <div className="card-body">
            <div style={{ display: 'grid', gap: 10 }}>
              {funil.map((f, i) => (
                <div key={f.t} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) 1fr 70px 70px', gap: 12, alignItems: 'center' }}>
                  <div><strong style={{ fontSize: 13 }}>{f.t}</strong>{f.nota && <div className="muted" style={{ fontSize: 11 }}>{f.nota}</div>}</div>
                  <Barra valor={f.n} max={Math.max(1, funil[0].n)} cor={i === 0 ? 'var(--ink-3)' : 'var(--green)'} />
                  <strong style={{ textAlign: 'right', fontSize: 14 }}>{num(f.n)}</strong>
                  <span className="muted" style={{ textAlign: 'right', fontSize: 11 }}>{i === 0 ? '' : pct(f.n, funil[i - 1].n)}</span>
                </div>
              ))}
            </div>
            <div className="muted" style={{ marginTop: 12 }}>Acompanha os leads que chegaram por anúncio no período, com os marcos registrados no funil do CRM.</div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Desempenho por campanha</h3><span className="muted">{periodoTxt}</span></div>
          <div className="card-body">
            {campanhas.length === 0 ? <div className="muted">Sem leads de campanha no período.</div> : (
              <div className="table-wrap"><table>
                <thead><tr>
                  <th>Campanha ou anúncio</th><th>Empreendimento</th>
                  <th style={{ textAlign: 'right' }}>Leads</th><th style={{ textAlign: 'right' }}>Quentes</th><th style={{ textAlign: 'right' }}>Qualificados</th>
                  <th style={{ textAlign: 'right' }}>Visitas</th><th style={{ textAlign: 'right' }}>Propostas</th><th style={{ textAlign: 'right' }}>Vendas</th>
                </tr></thead>
                <tbody>{campanhas.map((c) => (
                  <tr key={c.chave}>
                    <td><strong>{c.campanha}</strong><div className="muted" style={{ fontSize: 11 }}>{c.tipo}</div></td>
                    <td>{c.empTxt || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(c.n)}</td>
                    <td style={{ textAlign: 'right' }}>{num(c.quentes)} <span className="muted">({pct(c.quentes, c.n)})</span></td>
                    <td style={{ textAlign: 'right' }}>{num(c.q)} <span className="muted">({pct(c.q, c.n)})</span></td>
                    <td style={{ textAlign: 'right' }}>{num(c.v)}</td>
                    <td style={{ textAlign: 'right' }}>{num(c.p)}</td>
                    <td style={{ textAlign: 'right', color: c.g ? 'var(--green)' : undefined, fontWeight: c.g ? 700 : undefined }}>{num(c.g)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>
              Anúncios de clique para WhatsApp aparecem pelo título do anúncio; formulários da Meta, pelo nome da campanha. O custo por lead entra aqui quando o CRM for ligado aos gastos da conta de anúncios.
            </div>
          </div>
        </section>

        <div className="grid grid-2" style={{ marginBottom: 14 }}>
          <section className="card">
            <div className="card-head"><h3>Por empreendimento</h3><span className="muted">{periodoTxt}</span></div>
            <div className="card-body">
              {listaEmp.length === 0 ? <div className="muted">Sem leads de campanha no período.</div> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Empreendimento</th><th style={{ textAlign: 'right' }}>Leads</th><th style={{ textAlign: 'right' }}>Qualificados</th><th style={{ textAlign: 'right' }}>Vendas</th></tr></thead>
                  <tbody>{listaEmp.map((e) => <tr key={e.e}><td>{e.e}</td><td style={{ textAlign: 'right' }}>{num(e.n)}</td><td style={{ textAlign: 'right' }}>{num(e.q)} <span className="muted">({pct(e.q, e.n)})</span></td><td style={{ textAlign: 'right' }}>{num(e.g)}</td></tr>)}</tbody>
                </table></div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                {[...porTipo.entries()].map(([t, n]) => <div key={t} className="kpi" style={{ padding: '10px 14px', flex: '1 1 140px' }}><div className="kpi-label">{t}</div><div className="kpi-value" style={{ fontSize: 20 }}>{num(n)}</div><div className="kpi-note">{pct(n, campanhaPeriodo.length)} dos leads</div></div>)}
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Temperatura dada pela Nara</h3><span className="muted">{periodoTxt}</span></div>
            <div className="card-body">
              <div style={{ display: 'grid', gap: 10 }}>
                {temp.map((t) => <div key={t.k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 50px 60px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <span>{t.t}</span><Barra valor={t.n} max={Math.max(1, campanhaPeriodo.length)} cor={t.cor} /><strong style={{ textAlign: 'right' }}>{num(t.n)}</strong><span className="muted" style={{ textAlign: 'right' }}>{pct(t.n, campanhaPeriodo.length)}</span>
                </div>)}
                {semTemp > 0 && <div className="muted" style={{ fontSize: 11 }}>{num(semTemp)} ainda sem avaliação da Nara.</div>}
              </div>
            </div>
          </section>
        </div>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Leads de campanha por {dias <= 30 ? 'dia' : 'semana'}</h3><span className="muted">{periodoTxt}</span></div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }} role="img" aria-label={`Leads de campanha por ${dias <= 30 ? 'dia' : 'semana'}`}>
              {serie.map((s, i) => (
                <div key={i} title={`${s.rotulo}: ${s.n} leads`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ height: `${Math.round((s.n / maxSerie) * 100)}%`, minHeight: s.n ? 3 : 0, background: 'var(--ink)', borderRadius: '3px 3px 0 0' }} />
                </div>
              ))}
            </div>
            <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 6 }}>
              <span>{serie[0]?.rotulo}</span><span>maior: {num(maxSerie)} leads</span><span>{serie.at(-1)?.rotulo}</span>
            </div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Campanha × outras origens</h3><span className="muted">{num(campanhaPeriodo.length)} de campanha · {num(outrasPeriodo.length)} de outras origens · {periodoTxt}</span></div>
          <div className="card-body">
            <div className="table-wrap"><table>
              <thead><tr><th>Dos leads que chegaram no período</th><th style={{ textAlign: 'right' }}>De campanha</th><th style={{ textAlign: 'right' }}>Outras origens</th></tr></thead>
              <tbody>{comparacao.map((c) => <tr key={c.t}><td>{c.t}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{c.a}</td><td style={{ textAlign: 'right' }}>{c.b}</td></tr>)}</tbody>
            </table></div>
            <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>Outras origens incluem indicação, site, Instagram orgânico, importações e contatos diretos.</div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Leads de campanha mais recentes</h3><span className="muted">os 25 mais recentes do período</span></div>
          <div className="card-body">
            {recentes.length === 0 ? <div className="muted">Nenhum lead de campanha no período.</div> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Lead</th><th>Campanha</th><th>Etapa</th><th>Nara</th><th>Chegou</th></tr></thead>
                <tbody>{recentes.map((l) => {
                  const o = origemPor.get(l.id)!;
                  const t = TEMPERATURAS.find((x) => x.k === l.ai_classification);
                  return (
                    <tr key={l.id}>
                      <td><Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.name || 'Lead'}</Link><div className="muted" style={{ fontSize: 11 }}>{empreendimento(l, o)}</div></td>
                      <td>{o.campanha}<div className="muted" style={{ fontSize: 11 }}>{o.tipo}</div></td>
                      <td>{stageLabel('cliente', l.stage)}{vendeu(l) && <span style={{ marginLeft: 6, color: 'var(--green)', fontWeight: 600 }}>venda</span>}</td>
                      <td>{t ? <span style={{ color: t.cor, fontWeight: 600 }}>{t.t}</span> : <span className="muted">—</span>}</td>
                      <td className="muted">{formatDateTime(l.created_at)}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </div>
        </section>

        <div className="muted" style={{ marginBottom: 24 }}>
          Um lead conta como “de campanha” quando chega por um anúncio de clique para WhatsApp da Meta, por um formulário de Lead Ads ou quando a origem registrada no CRM indica anúncio. “Vendas vindas de campanha” só conta vendas registradas depois da chegada do lead, então vendas antigas importadas ficam de fora.
        </div>
      </div>
    </>
  );
}
