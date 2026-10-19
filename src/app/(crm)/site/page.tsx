import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDateTime } from '@/lib/format';
import { stageLabel } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';

// Painel de medição do site (bossa-site, pasta site/ do repositório).
// Lê as tabelas site_* e lead_site_links, criadas pela migração do site, e cruza
// com os marcos do funil do CRM (lead_funnel_milestones).

type Sessao = { visitor_code: string; utm: Record<string, string> | null; referrer: string | null; entry_page: string | null; visit_number: number; started_at: string; city: string | null; region: string | null; country: string | null };
type Evento = { visitor_code: string; name: string; props: Record<string, unknown> | null; page: string | null; created_at: string };
type Ligacao = { lead_id: string; visitor_code: string; method: string; linked_at: string };
type LeadInfo = { id: string; name: string | null; kind: LeadKind; stage: string; enterprise: string | null; created_at: string };
type Marco = { lead_id: string; qualified_at: string | null; meeting_at: string | null; proposal_at: string | null; won_at: string | null };
type Comportamento = {
  lead_id: string; plantas_vistas: number; trocas_planta: number; interacoes_galeria: number; viu_obra: boolean; viu_engenharia: boolean;
  viu_preco: boolean; simulou: boolean; baixou_material: boolean; viu_historia: boolean; viu_localizacao: boolean; visitas: number; sessoes: number; primeira_atividade: string;
};

const DAY = 86_400_000;
const PERIODOS = [{ k: '7', t: '7 dias' }, { k: '30', t: '30 dias' }, { k: '90', t: '90 dias' }, { k: '365', t: '12 meses' }];
const EMP: Record<string, string> = { 'alma-seahouses': 'Alma', 'flow-aptos': 'Flow', 'soul-residence': 'Soul', 'jazz-residence': 'Jazz' };
const METODO: Record<string, string> = { whatsapp: 'WhatsApp', formulario: 'Formulário', manual: 'Manual', provavel: 'Provável' };
const NOME_EVENTO: Record<string, string> = {
  page_view: 'Páginas vistas', view_project: 'Viu um empreendimento', view_floorplan: 'Viu planta', switch_floorplan: 'Trocou de planta',
  floorplan_zoom: 'Ampliou planta', gallery_interact: 'Galeria / vista por andar', video_play: 'Assistiu vídeo', view_location: 'Viu localização',
  click_route: 'Abriu rota', view_construction: 'Viu a obra', view_engineering: 'Viu engenharia', faq_open: 'Abriu pergunta', view_price: 'Viu condições',
  download_material: 'Pediu material', view_bossa_way: 'Viu Jeito Bossa', view_history: 'Viu história', return_visit: 'Voltou ao site',
  click_whatsapp: 'Clicou no WhatsApp', form_start: 'Começou formulário', lead_submit: 'Enviou formulário', request_visit: 'Pediu visita', scroll_depth: 'Rolagem',
};

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

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—');
const num = (n: number) => n.toLocaleString('pt-BR');
const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const fmt1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function ComparativoHistorico({ atual, referencia, percentual = false }: { atual: number | null; referencia: number | null; percentual?: boolean }) {
  const variacao = atual !== null && referencia !== null && referencia > 0 ? (atual / referencia - 1) * 100 : null;
  const referenciaTxt = referencia === null ? '—' : `${fmt1(referencia)}${percentual ? '%' : ''}`;
  const cor = variacao === null || Math.abs(variacao) < 0.05 ? 'var(--ink-3)' : variacao > 0 ? 'var(--green)' : 'var(--red)';
  const diferenca = variacao === null ? 'sem comparação' : `${variacao > 0 ? '+' : ''}${fmt1(variacao)}%`;
  return (
    <div className="kpi-note" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
      <span>Média histórica: {referenciaTxt}</span>
      <span style={{ color: cor, fontWeight: 700 }} title="Diferença relativa à média histórica do site para o mesmo intervalo">
        {variacao === null ? 'sem comparação' : `${variacao > 0 ? '↑ ' : variacao < 0 ? '↓ ' : ''}${diferenca}`}
      </span>
    </div>
  );
}

function origem(s: Sessao): string {
  const u = s.utm ?? {};
  if (u.utm_source) return `${u.utm_source}${u.utm_medium ? ` / ${u.utm_medium}` : ''}`;
  if (u.gclid) return 'google / anúncio';
  if (u.fbclid) return 'meta / anúncio';
  const r = (s.referrer ?? '').trim();
  if (!r) return 'Direto';
  try {
    const host = new URL(r).hostname.replace(/^www\./, '');
    if (/google\./.test(host)) return 'Google (orgânico)';
    if (/instagram|facebook|fb\.|l\.instagram/.test(host)) return 'Instagram / Facebook';
    if (/chatgpt|openai|perplexity|claude|gemini|copilot/.test(host)) return `IA · ${host}`;
    if (/bossaempreendimentos/.test(host)) return 'Direto';
    return host;
  } catch { return 'Direto'; }
}

const REGIOES_BR: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia',
  RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
function localizacao(s: Sessao): string {
  const cidade = s.city?.trim();
  const codigoRegiao = s.region?.trim().replace(/^BR-/, '').toUpperCase();
  const estado = codigoRegiao ? (REGIOES_BR[codigoRegiao] ?? s.region?.trim()) : null;
  let pais = s.country?.trim() ?? null;
  if (pais && /^[A-Z]{2}$/.test(pais)) {
    try { pais = new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(pais) ?? pais; } catch { /* mantém o código recebido */ }
  }
  return [cidade, estado, pais].filter(Boolean).join(' · ') || 'Localização não identificada';
}

function Barra({ valor, max, cor = 'var(--ink)' }: { valor: number; max: number; cor?: string }) {
  const w = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  return <span aria-hidden="true" style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--sunken)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${w}%`, background: cor }} /></span>;
}

export default async function SitePage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const params = await searchParams;
  const context = await getCurrentContext();
  if (!context || context.role === 'viewer') redirect('/hoje');
  const orgId = context.organization.id;
  const dias = PERIODOS.some((p) => p.k === params.dias) ? Number(params.dias) : 30;
  const inicio = inicioDoPeriodo(dias);
  const admin = createAdminClient();

  let erro: string | null = null;
  let totalVisitantesSite: number | null = null;
  let primeiraVisitaSite: string | null = null;
  let sessoes: Sessao[] = [], eventos: Evento[] = [], ligacoes: Ligacao[] = [];
  const leads: LeadInfo[] = [], marcos: Marco[] = [], comport: Comportamento[] = [];
  try {
    [sessoes, eventos, ligacoes] = await Promise.all([
      todas<Sessao>((a, b) => admin.from('site_sessions').select('visitor_code,utm,referrer,entry_page,visit_number,started_at,city,region,country').gte('started_at', inicio).order('started_at').range(a, b)),
      todas<Evento>((a, b) => admin.from('site_events').select('visitor_code,name,props,page,created_at').gte('created_at', inicio).neq('name', 'scroll_depth').order('id').range(a, b)),
      todas<Ligacao>((a, b) => admin.from('lead_site_links').select('lead_id,visitor_code,method,linked_at').eq('organization_id', orgId).order('linked_at', { ascending: false }).range(a, b)),
    ]);
    // Consultas leves para a média histórica, sem baixar todos os acessos do site.
    const [totalHistorico, primeiraVisita] = await Promise.all([
      admin.from('site_visitors').select('code', { count: 'exact', head: true }),
      admin.from('site_visitors').select('first_seen_at').order('first_seen_at', { ascending: true }).limit(1).maybeSingle(),
    ]);
    // Falhas no benchmark não podem impedir a leitura dos números principais.
    if (!totalHistorico.error && !primeiraVisita.error) {
      totalVisitantesSite = totalHistorico.count ?? 0;
      primeiraVisitaSite = primeiraVisita.data?.first_seen_at ?? null;
    }

    const ids = [...new Set(ligacoes.map((l) => l.lead_id))];
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const [l, m, c] = await Promise.all([
        admin.from('leads').select('id,name,kind,stage,enterprise,created_at').in('id', lote),
        admin.from('lead_funnel_milestones').select('lead_id,qualified_at,meeting_at,proposal_at,won_at').in('lead_id', lote),
        admin.from('site_comportamento_por_lead').select('*').in('lead_id', lote),
      ]);
      if (l.error) throw l.error; if (m.error) throw m.error; if (c.error) throw c.error;
      leads.push(...((l.data ?? []) as LeadInfo[])); marcos.push(...((m.data ?? []) as Marco[])); comport.push(...((c.data ?? []) as Comportamento[]));
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  }

  const leadPor = new Map(leads.map((l) => [l.id, l]));
  const marcoPor = new Map(marcos.map((m) => [m.lead_id, m]));
  const compPor = new Map(comport.map((c) => [c.lead_id, c]));
  const clientes = (id: string) => leadPor.get(id)?.kind !== 'corretor';

  // Visitantes e sessões do período
  const visitantes = new Set(sessoes.map((s) => s.visitor_code));
  const recorrentes = new Set(sessoes.filter((s) => s.visit_number > 1).map((s) => s.visitor_code));
  const porEvento = new Map<string, Set<string>>();
  const totalEvento = new Map<string, number>();
  for (const e of eventos) {
    if (!porEvento.has(e.name)) porEvento.set(e.name, new Set());
    porEvento.get(e.name)!.add(e.visitor_code);
    totalEvento.set(e.name, (totalEvento.get(e.name) ?? 0) + 1);
  }
  const quem = (n: string) => porEvento.get(n)?.size ?? 0;
  const contato = new Set([...(porEvento.get('click_whatsapp') ?? []), ...(porEvento.get('lead_submit') ?? [])]);

  // Leads ligados ao site no período (primeira ligação de cada lead)
  const primeiraLig = new Map<string, Ligacao>();
  for (const l of [...ligacoes].reverse()) if (!primeiraLig.has(l.lead_id)) primeiraLig.set(l.lead_id, l);
  const leadsPeriodo = [...primeiraLig.values()].filter((l) => l.linked_at >= inicio && clientes(l.lead_id));
  const marcosDe = (lista: Ligacao[]) => {
    const ms = lista.map((l) => marcoPor.get(l.lead_id));
    return { q: ms.filter((m) => m?.qualified_at).length, v: ms.filter((m) => m?.meeting_at).length, p: ms.filter((m) => m?.proposal_at).length, g: ms.filter((m) => m?.won_at).length };
  };
  const mp = marcosDe(leadsPeriodo);
  const todasLig = [...primeiraLig.values()].filter((l) => clientes(l.lead_id));
  const vendasTotal = todasLig.filter((l) => { const w = marcoPor.get(l.lead_id)?.won_at; return w && w >= l.linked_at.slice(0, 10); }).length;
  const corretoresPeriodo = [...primeiraLig.values()].filter((l) => l.linked_at >= inicio && !clientes(l.lead_id)).length;

  // A referência é todo o histórico desde a primeira visita, normalizado
  // para o filtro (7, 30, 90 ou 365 dias). Com menos histórico que a janela,
  // evitamos comparar um intervalo incompleto com uma janela inteira.
  const diasHistoricos = primeiraVisitaSite ? diasDesde(primeiraVisitaSite) : 0;
  const historicoSuficiente = totalVisitantesSite !== null && totalVisitantesSite > 0 && diasHistoricos >= dias;
  const mediaVisitantes = historicoSuficiente ? totalVisitantesSite! * dias / diasHistoricos : null;
  const mediaLeads = historicoSuficiente ? todasLig.length * dias / diasHistoricos : null;
  const mediaConversao = historicoSuficiente ? todasLig.length / totalVisitantesSite! * 100 : null;
  const conversaoAtual = visitantes.size > 0 ? leadsPeriodo.length / visitantes.size * 100 : null;

  const funil = [
    { t: 'Visitantes', n: visitantes.size, nota: 'pessoas diferentes no site' },
    { t: 'Viram uma planta', n: quem('view_floorplan'), nota: 'abriram ao menos uma planta' },
    { t: 'Chamaram a Bossa', n: contato.size, nota: 'WhatsApp ou formulário' },
    { t: 'Viraram lead no CRM', n: leadsPeriodo.length, nota: 'ligados pelo código de visita' },
    { t: 'Qualificados', n: mp.q, nota: 'chegaram à passagem/comercial' },
    { t: 'Visita ou reunião', n: mp.v, nota: '' },
    { t: 'Proposta', n: mp.p, nota: '' },
    { t: 'Venda', n: mp.g, nota: '' },
  ];

  // Comportamento: quem chegou a proposta/venda × demais (todos os leads ligados, sem corte de período)
  const avancados = comport.filter((c) => clientes(c.lead_id) && (marcoPor.get(c.lead_id)?.proposal_at || marcoPor.get(c.lead_id)?.won_at));
  const demais = comport.filter((c) => clientes(c.lead_id) && !(marcoPor.get(c.lead_id)?.proposal_at || marcoPor.get(c.lead_id)?.won_at));
  const linhaComp = (t: string, f: (c: Comportamento) => number, tipo: 'media' | 'pct') => {
    const a = avancados.map(f), d = demais.map(f);
    const va = tipo === 'media' ? fmt1(media(a)) : pct(a.filter(Boolean).length, a.length);
    const vd = tipo === 'media' ? fmt1(media(d)) : pct(d.filter(Boolean).length, d.length);
    return { t, va, vd };
  };
  const diasAteLead = (lista: Comportamento[]) => media(lista.map((c) => { const l = primeiraLig.get(c.lead_id); return l ? Math.max(0, (new Date(l.linked_at).getTime() - new Date(c.primeira_atividade).getTime()) / DAY) : 0; }));
  const comparacao = [
    linhaComp('Plantas vistas (média)', (c) => Number(c.plantas_vistas), 'media'),
    linhaComp('Trocas de planta (média)', (c) => Number(c.trocas_planta), 'media'),
    linhaComp('Interações com galeria e vista por andar (média)', (c) => Number(c.interacoes_galeria), 'media'),
    linhaComp('Visitas ao site antes do contato (média)', (c) => Number(c.visitas), 'media'),
    linhaComp('Viram a obra', (c) => (c.viu_obra ? 1 : 0), 'pct'),
    linhaComp('Viram a engenharia', (c) => (c.viu_engenharia ? 1 : 0), 'pct'),
    linhaComp('Viram condições', (c) => (c.viu_preco ? 1 : 0), 'pct'),
    linhaComp('Viram a localização', (c) => (c.viu_localizacao ? 1 : 0), 'pct'),
    linhaComp('Viram a história da Bossa', (c) => (c.viu_historia ? 1 : 0), 'pct'),
    linhaComp('Pediram material', (c) => (c.baixou_material ? 1 : 0), 'pct'),
    { t: 'Dias da primeira visita até o contato (média)', va: fmt1(diasAteLead(avancados)), vd: fmt1(diasAteLead(demais)) },
  ];

  // Origem
  const visitantesLigados = new Set(ligacoes.map((l) => l.visitor_code));
  const origens = new Map<string, { v: Set<string>; l: Set<string> }>();
  for (const s of sessoes) {
    const o = origem(s);
    if (!origens.has(o)) origens.set(o, { v: new Set(), l: new Set() });
    origens.get(o)!.v.add(s.visitor_code);
    if (visitantesLigados.has(s.visitor_code)) origens.get(o)!.l.add(s.visitor_code);
  }
  const listaOrigens = [...origens.entries()].map(([o, x]) => ({ o, v: x.v.size, l: x.l.size })).sort((a, b) => b.v - a.v).slice(0, 10);
  const porLocal = new Map<string, { acessos: number; visitantes: Set<string> }>();
  for (const s of sessoes) {
    const nome = localizacao(s);
    if (!porLocal.has(nome)) porLocal.set(nome, { acessos: 0, visitantes: new Set() });
    const local = porLocal.get(nome)!;
    local.acessos += 1;
    local.visitantes.add(s.visitor_code);
  }
  const listaLocais = [...porLocal.entries()]
    .map(([nome, dados]) => ({ nome, acessos: dados.acessos, visitantes: dados.visitantes.size }))
    .sort((a, b) => b.acessos - a.acessos)
    .slice(0, 15);

  // Conteúdo
  const plantas = new Map<string, number>();
  for (const e of eventos) if (e.name === 'view_floorplan' && e.props) {
    const k = `${EMP[String(e.props.empreendimento)] ?? e.props.empreendimento} · ${String(e.props.planta ?? '').replace(/-/g, ' ')}`;
    plantas.set(k, (plantas.get(k) ?? 0) + 1);
  }
  const listaPlantas = [...plantas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const projetos = new Map<string, Set<string>>();
  for (const e of eventos) if (e.name === 'view_project' && e.props?.empreendimento) {
    const k = String(e.props.empreendimento);
    if (!projetos.has(k)) projetos.set(k, new Set());
    projetos.get(k)!.add(e.visitor_code);
  }
  const acoes = ['click_whatsapp', 'lead_submit', 'request_visit', 'view_floorplan', 'switch_floorplan', 'gallery_interact', 'video_play', 'view_construction', 'view_engineering', 'view_price', 'view_location', 'click_route', 'faq_open', 'return_visit']
    .map((n) => ({ n, pessoas: quem(n), total: totalEvento.get(n) ?? 0 })).sort((a, b) => b.pessoas - a.pessoas);
  const maxAcao = Math.max(1, ...acoes.map((a) => a.pessoas));

  const recentes = [...primeiraLig.values()].sort((a, b) => b.linked_at.localeCompare(a.linked_at)).slice(0, 25);
  const periodoTxt = PERIODOS.find((p) => Number(p.k) === dias)?.t ?? `${dias} dias`;

  return (
    <>
      <PageTopbar title="Site" subtitle="O que acontece no site e quanto ele ajuda a vender" actions={
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODOS.map((p) => <Link key={p.k} href={`/site?dias=${p.k}`} className={`btn btn-sm ${Number(p.k) === dias ? 'btn-primary' : 'btn-ghost'}`}>{p.t}</Link>)}
        </div>
      } />
      <div className="page-content">
        {erro && <div className="error-box" style={{ marginBottom: 14 }}>Não foi possível ler os dados do site: {erro}</div>}
        {!erro && visitantes.size === 0 && <div className="info-box" style={{ marginBottom: 14 }}>Ainda não há visitas registradas nos últimos {periodoTxt}. Os números aparecem assim que o site novo recebe visitantes.</div>}

        <div className="kpis">
          <div className="kpi"><div className="kpi-label">Vendas com participação do site</div><div className="kpi-value">{num(vendasTotal)}</div><div className="kpi-note">desde o início · lead passou pelo site antes de comprar</div></div>
          <div className="kpi"><div className="kpi-label">Leads vindos do site</div><div className="kpi-value">{num(leadsPeriodo.length)}</div><div className="kpi-note">{periodoTxt}{corretoresPeriodo ? ` · + ${corretoresPeriodo} corretores` : ''}</div><ComparativoHistorico atual={leadsPeriodo.length} referencia={mediaLeads} /></div>
          <div className="kpi"><div className="kpi-label">Visitantes</div><div className="kpi-value">{num(visitantes.size)}</div><div className="kpi-note">{num(sessoes.length)} visitas · {num(recorrentes.size)} voltaram</div><ComparativoHistorico atual={visitantes.size} referencia={mediaVisitantes} /></div>
          <div className="kpi"><div className="kpi-label">Conversão visitante → lead</div><div className="kpi-value">{pct(leadsPeriodo.length, visitantes.size)}</div><div className="kpi-note">{periodoTxt}</div><ComparativoHistorico atual={conversaoAtual} referencia={mediaConversao} percentual /></div>
        </div>
        <div className="muted" style={{ fontSize: 11, margin: '-2px 0 14px' }}>
          Comparativos: variação sobre a média de todo o histórico do site, proporcional a {periodoTxt}. Na conversão, comparamos as taxas.
          {!historicoSuficiente && !erro ? ` A comparação ficará disponível após ${periodoTxt} completos de medição.` : ''}
        </div>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Do clique à venda · {periodoTxt}</h3></div>
          <div className="card-body">
            <div style={{ display: 'grid', gap: 10 }}>
              {funil.map((f, i) => (
                <div key={f.t} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) 1fr 70px 70px', gap: 12, alignItems: 'center' }}>
                  <div><strong style={{ fontSize: 13 }}>{f.t}</strong>{f.nota && <div className="muted" style={{ fontSize: 11 }}>{f.nota}</div>}</div>
                  <Barra valor={f.n} max={Math.max(1, funil[0].n)} cor={i < 3 ? 'var(--ink-3)' : 'var(--green)'} />
                  <strong style={{ textAlign: 'right', fontSize: 14 }}>{num(f.n)}</strong>
                  <span className="muted" style={{ textAlign: 'right', fontSize: 11 }}>{i === 0 ? '' : pct(f.n, funil[i - 1].n)}</span>
                </div>
              ))}
            </div>
            <div className="muted" style={{ marginTop: 12 }}>Visitantes, plantas e contatos são do período. As etapas do CRM acompanham os leads que vieram do site no período, com os marcos registrados no funil.</div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Como se comporta quem compra</h3><span className="muted">{avancados.length} chegaram a proposta ou venda · {demais.length} demais leads do site</span></div>
          <div className="card-body">
            {avancados.length < 5 && <div className="info-box" style={{ marginBottom: 12 }}>Amostra ainda pequena: com menos de 5 leads em proposta ou venda, as diferenças abaixo são só um indício.</div>}
            <div className="table-wrap"><table>
              <thead><tr><th>Comportamento no site antes do contato</th><th style={{ textAlign: 'right' }}>Chegaram a proposta/venda</th><th style={{ textAlign: 'right' }}>Demais leads</th></tr></thead>
              <tbody>{comparacao.map((c) => <tr key={c.t}><td>{c.t}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{c.va}</td><td style={{ textAlign: 'right' }}>{c.vd}</td></tr>)}</tbody>
            </table></div>
          </div>
        </section>

        <div className="grid grid-2" style={{ marginBottom: 14 }}>
          <section className="card">
            <div className="card-head"><h3>De onde vêm</h3><span className="muted">{periodoTxt}</span></div>
            <div className="card-body">
              {listaOrigens.length === 0 ? <div className="muted">Sem visitas no período.</div> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Origem</th><th style={{ textAlign: 'right' }}>Visitantes</th><th style={{ textAlign: 'right' }}>Viraram lead</th></tr></thead>
                  <tbody>{listaOrigens.map((o) => <tr key={o.o}><td>{o.o}</td><td style={{ textAlign: 'right' }}>{num(o.v)}</td><td style={{ textAlign: 'right' }}>{num(o.l)} <span className="muted">({pct(o.l, o.v)})</span></td></tr>)}</tbody>
                </table></div>
              )}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Empreendimentos e plantas</h3><span className="muted">{periodoTxt}</span></div>
            <div className="card-body">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {Object.entries(EMP).map(([slug, nome]) => <div key={slug} className="kpi" style={{ padding: '10px 14px', flex: '1 1 110px' }}><div className="kpi-label">{nome}</div><div className="kpi-value" style={{ fontSize: 20 }}>{num(projetos.get(slug)?.size ?? 0)}</div><div className="kpi-note">visitantes</div></div>)}
              </div>
              {listaPlantas.length === 0 ? <div className="muted">Nenhuma planta vista no período.</div> : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {listaPlantas.map(([k, n]) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 40px', gap: 10, alignItems: 'center', fontSize: 12 }}><span style={{ textTransform: 'capitalize' }}>{k}</span><Barra valor={n} max={listaPlantas[0][1]} /><strong style={{ textAlign: 'right' }}>{n}</strong></div>)}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Acessos por localização</h3><span className="muted">{periodoTxt}</span></div>
          <div className="card-body">
            {listaLocais.length === 0 ? <div className="muted">Sem visitas no período.</div> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Cidade · Estado · País</th><th style={{ textAlign: 'right' }}>Acessos</th><th style={{ textAlign: 'right' }}>Visitantes</th></tr></thead>
                <tbody>{listaLocais.map((l) => <tr key={l.nome}><td>{l.nome}</td><td style={{ textAlign: 'right' }}>{num(l.acessos)}</td><td style={{ textAlign: 'right' }}>{num(l.visitantes)}</td></tr>)}</tbody>
              </table></div>
            )}
            <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>A localização é estimada pela conexão e depende dos dados fornecidos pela Vercel. Visitas anteriores à ativação podem aparecer como não identificadas.</div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>O que as pessoas fazem no site</h3><span className="muted">pessoas diferentes · {periodoTxt}</span></div>
          <div className="card-body">
            <div style={{ display: 'grid', gap: 8 }}>
              {acoes.map((a) => <div key={a.n} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 240px) 1fr 60px 90px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                <span>{NOME_EVENTO[a.n] ?? a.n}</span><Barra valor={a.pessoas} max={maxAcao} cor="var(--blue)" /><strong style={{ textAlign: 'right' }}>{num(a.pessoas)}</strong><span className="muted" style={{ textAlign: 'right' }}>{num(a.total)} vezes</span>
              </div>)}
            </div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Leads que passaram pelo site</h3><span className="muted">os 25 mais recentes</span></div>
          <div className="card-body">
            {recentes.length === 0 ? <div className="muted">Nenhum lead ligado ao site ainda. A ligação acontece quando alguém envia um formulário ou chama no WhatsApp pelo site (a mensagem leva o código “ref.”).</div> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Lead</th><th>Como chegou</th><th>Etapa</th><th style={{ textAlign: 'right' }}>Plantas</th><th style={{ textAlign: 'right' }}>Visitas</th><th>Viu</th><th>Quando</th></tr></thead>
                <tbody>{recentes.map((l) => {
                  const lead = leadPor.get(l.lead_id); const c = compPor.get(l.lead_id);
                  const viu = c ? [c.viu_obra && 'obra', c.viu_engenharia && 'engenharia', c.viu_preco && 'condições', c.viu_localizacao && 'localização', c.baixou_material && 'material'].filter(Boolean).join(' · ') : '';
                  return (
                    <tr key={l.lead_id}>
                      <td><Link href={`/leads/${l.lead_id}`} style={{ fontWeight: 600 }}>{lead?.name || 'Lead'}</Link>{lead?.enterprise && <div className="muted" style={{ fontSize: 11 }}>{EMP[lead.enterprise] ?? lead.enterprise}</div>}</td>
                      <td>{METODO[l.method] ?? l.method}</td>
                      <td>{lead ? stageLabel(lead.kind, lead.stage) : '—'}{marcoPor.get(l.lead_id)?.won_at && <span style={{ marginLeft: 6, color: 'var(--green)', fontWeight: 600 }}>venda</span>}</td>
                      <td style={{ textAlign: 'right' }}>{c ? num(Number(c.plantas_vistas)) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{c ? num(Number(c.visitas)) : '—'}</td>
                      <td className="muted">{viu || '—'}</td>
                      <td className="muted">{formatDateTime(l.linked_at)}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </div>
        </section>

        <div className="muted" style={{ marginBottom: 24 }}>
          O site grava as visitas de forma anônima, por um código de visita. Quando a pessoa envia um formulário ou chama no WhatsApp pelo site, esse código é ligado ao lead e o comportamento anterior passa a aparecer aqui. “Vendas com participação do site” conta leads que passaram pelo site antes de a venda ser registrada no funil.
        </div>
      </div>
    </>
  );
}
