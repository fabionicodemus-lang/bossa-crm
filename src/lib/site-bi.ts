import {
  AMBIENTES_SITE, ambienteDoSite, empreendimentoDoPasseio, localizacaoDaSessao,
  noAmbiente, NOMES_EVENTOS_SITE, origemDaSessao, type AmbienteSite,
} from './site-analytics';

export const DIMENSOES_BI = [
  ['origem', 'Origem'], ['canal', 'Canal'], ['cidade', 'Cidade'], ['estado', 'Estado'],
  ['pais', 'País'], ['dia', 'Dia'], ['mes', 'Mês'], ['hora', 'Hora'],
  ['campanha', 'Campanha (UTM)'], ['entrada', 'Página de entrada'], ['pagina', 'Página acessada'],
  ['empreendimento', 'Empreendimento'], ['acao', 'Ação realizada'],
  ['dispositivo', 'Dispositivo'], ['visita', 'Tipo de visita'], ['ambiente', 'Ambiente'],
] as const;
export const METRICAS_BI = [
  ['visitantes', 'Visitantes únicos'], ['visitas', 'Visitas'], ['paginas', 'Páginas vistas'],
  ['eventos', 'Eventos'], ['passeios', 'Visitantes de passeios 3D'], ['aberturas', 'Aberturas de passeios 3D'],
  ['whatsapp', 'Cliques no WhatsApp'], ['formularios', 'Formulários enviados'],
  ['contatos', 'Visitantes que fizeram contato'], ['vinculados', 'Visitantes vinculados a leads'],
  ['leads', 'Leads vinculados'], ['qualificados', 'Leads qualificados'], ['reunioes', 'Leads com reunião'],
  ['propostas', 'Leads com proposta'], ['vendas', 'Leads com venda'], ['conversao', 'Taxa de contato'],
] as const;
export type DimensaoBi = (typeof DIMENSOES_BI)[number][0];
export type MetricaBi = (typeof METRICAS_BI)[number][0];
export type FiltrosBi = Partial<Record<DimensaoBi, string[]>>;
export type ConfigBi = {
  de: string;
  ate: string;
  ambiente: AmbienteSite;
  linhas: DimensaoBi[];
  coluna: DimensaoBi | null;
  metricas: MetricaBi[];
  filtros: FiltrosBi;
};

export const MAX_LINHAS_BI = 3;
const DIA_MS = 86_400_000;
const relogio = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
});
const rotuloAmbiente = Object.fromEntries(AMBIENTES_SITE.map(({ k, t }) => [k, t]));
const empreendimentos: Record<string, string> = {
  'flow-aptos': 'Flow Aptos', 'alma-seahouses': 'Alma Seahouses',
  'soul-residence': 'Soul Residence', 'jazz-residence': 'Jazz Residence',
};
const NAO_IDENTIFICADO = 'Não identificado';

export const nomeDimensao = (d: DimensaoBi) => DIMENSOES_BI.find(([k]) => k === d)![1];
export const nomeMetrica = (m: MetricaBi) => METRICAS_BI.find(([k]) => k === m)![1];
export const dimensaoValida = (d: unknown): d is DimensaoBi => DIMENSOES_BI.some(([k]) => k === d);
const metricaValida = (m: unknown): m is MetricaBi => METRICAS_BI.some(([k]) => k === m);

function dataHora(iso: string | Date) {
  const partes = Object.fromEntries(relogio.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, mes: `${partes.year}-${partes.month}`, hora: `${partes.hour}h` };
}

export function periodoBi(dias = 30, agora = new Date()) {
  const ate = dataHora(agora).dia;
  const de = new Date(Date.parse(`${ate}T12:00:00Z`) - (dias - 1) * DIA_MS).toISOString().slice(0, 10);
  return { de, ate };
}

export function configuracaoBi(dias = 30, ambiente: AmbienteSite = 'oficial', agora = new Date()): ConfigBi {
  return {
    ...periodoBi(dias, agora), ambiente, linhas: ['origem', 'cidade'], coluna: null,
    metricas: ['visitantes', 'visitas', 'passeios', 'contatos'], filtros: {},
  };
}

function dataValida(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function limitesBi(config: Pick<ConfigBi, 'de' | 'ate'>) {
  if (!dataValida(config.de) || !dataValida(config.ate)) throw new Error('Informe datas válidas.');
  const inicio = Date.parse(`${config.de}T00:00:00-03:00`);
  const fim = Date.parse(`${config.ate}T00:00:00-03:00`) + DIA_MS;
  if (fim <= inicio || fim - inicio > 366 * DIA_MS) throw new Error('Escolha um período válido de até 12 meses.');
  return { inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString() };
}

export function validarConfigBi(input: unknown): ConfigBi {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Consulta inválida.');
  const v = input as Record<string, unknown>;
  if (!dataValida(v.de) || !dataValida(v.ate)) throw new Error('Informe datas válidas.');
  limitesBi({ de: v.de, ate: v.ate });
  if (!AMBIENTES_SITE.some((a) => a.k === v.ambiente)) throw new Error('Ambiente do site inválido.');
  if (!Array.isArray(v.linhas) || v.linhas.length > MAX_LINHAS_BI || !v.linhas.every(dimensaoValida)
      || new Set(v.linhas).size !== v.linhas.length) throw new Error('Escolha até três dimensões diferentes nas linhas.');
  const coluna = v.coluna ?? null;
  if (coluna !== null && (!dimensaoValida(coluna) || v.linhas.includes(coluna))) throw new Error('Escolha uma coluna diferente das dimensões das linhas.');
  if (!Array.isArray(v.metricas) || !v.metricas.length || !v.metricas.every(metricaValida)
      || new Set(v.metricas).size !== v.metricas.length) throw new Error('Escolha pelo menos um indicador válido.');
  const filtros: FiltrosBi = {};
  const entrada = v.filtros ?? {};
  if (typeof entrada !== 'object' || Array.isArray(entrada) || !entrada) throw new Error('Filtros inválidos.');
  for (const [d, valores] of Object.entries(entrada)) {
    if (!dimensaoValida(d) || !Array.isArray(valores) || valores.length > 3000 ||
        !valores.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 500)) throw new Error('Filtro inválido.');
    if (valores.length) filtros[d] = [...new Set(valores)];
  }
  return { de: v.de, ate: v.ate, ambiente: v.ambiente as AmbienteSite,
    linhas: v.linhas, coluna, metricas: v.metricas, filtros };
}

export type SessaoBi = {
  id: string; visitor_code: string; hostname: string | null; started_at: string;
  visit_number: number; referrer: string | null; utm: Record<string, string> | null;
  entry_page: string | null; city: string | null; region: string | null; country: string | null;
  visitante: { device: string | null } | null;
};
export type EventoBi = {
  visitor_code: string; session_id: string | null; hostname: string | null; name: string;
  props: Record<string, unknown> | null; page: string | null; created_at: string;
};
type Campos = Record<DimensaoBi, string>;
export type LeadBi = { id: string; qualificado: boolean; reuniao: boolean; proposta: boolean; venda: boolean };
type Registro = { visitante: string; sessao: string | null; evento: string | null; campos: Campos; leads: readonly LeadBi[] };
type Valores = (number | null)[];
type Acumulador = {
  visitantes: Set<string>; visitas: Set<string>; passeios: Set<string>; contatos: Set<string>; vinculados: Set<string>;
  paginas: number; eventos: number; aberturas: number; whatsapp: number; formularios: number;
  leads?: Map<string, LeadBi>;
};
type Grupo = { rotulos: string[]; total: Acumulador; celulas: Map<string, Acumulador> };
export type ResultadoBi = {
  config: ConfigBi;
  opcoes: Record<DimensaoBi, string[]>;
  linhas: { id: string; rotulos: string[]; total: Valores; celulas: Record<string, Valores> }[];
  colunas: { id: string; total: Valores }[];
  total: Valores;
  cobertura: { registros: number; selecionados: number; eventosSemSessao: number; dataInicial: string | null };
};

function novoTotal(): Acumulador {
  return { visitantes: new Set(), visitas: new Set(), passeios: new Set(), contatos: new Set(), vinculados: new Set(),
    paginas: 0, eventos: 0, aberturas: 0, whatsapp: 0, formularios: 0 };
}

function somar(total: Acumulador, r: Registro) {
  total.visitantes.add(r.visitante);
  if (r.sessao) total.visitas.add(r.sessao);
  if (r.leads.length) {
    total.vinculados.add(r.visitante);
    total.leads ??= new Map();
    for (const lead of r.leads) total.leads.set(lead.id, lead);
  }
  if (!r.evento) return;
  total.eventos += 1;
  if (r.evento === 'page_view') total.paginas += 1;
  if (r.evento === 'open_virtual_tour') {
    total.aberturas += 1;
    total.passeios.add(r.visitante);
  }
  if (r.evento === 'click_whatsapp') {
    total.whatsapp += 1;
    total.contatos.add(r.visitante);
  }
  if (r.evento === 'lead_submit') {
    total.formularios += 1;
    total.contatos.add(r.visitante);
  }
}

function valores(total: Acumulador, metricas: MetricaBi[]): Valores {
  const leads = [...(total.leads?.values() ?? [])];
  return metricas.map((m) => {
    switch (m) {
      case 'leads': return leads.length;
      case 'qualificados': return leads.filter((l) => l.qualificado).length;
      case 'reunioes': return leads.filter((l) => l.reuniao).length;
      case 'propostas': return leads.filter((l) => l.proposta).length;
      case 'vendas': return leads.filter((l) => l.venda).length;
      case 'conversao': return total.visitantes.size ? total.contatos.size / total.visitantes.size * 100 : null;
      default: return typeof total[m] === 'number' ? total[m] : total[m].size;
    }
  });
}

const texto = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 300) : '';

function pagina(value: string | null): string {
  const path = texto(value).split(/[?#]/, 1)[0];
  return path.startsWith('/') ? path : NAO_IDENTIFICADO;
}

function projeto(props: EventoBi['props'], path: string): string {
  const slug = texto(props?.empreendimento) || path.match(/^\/empreendimentos\/([^/]+)/)?.[1] || '';
  return Object.hasOwn(empreendimentos, slug.toLowerCase()) ? empreendimentos[slug.toLowerCase()] : 'Sem empreendimento';
}

function dadosSessao(s: SessaoBi | null) {
  const origem = s ? origemDaSessao(s) : { nome: NAO_IDENTIFICADO, canal: NAO_IDENTIFICADO };
  const local = s ? localizacaoDaSessao(s) : { cidade: null, estado: null, pais: null };
  // O dispositivo está registrado no código do visitante (e não na sessão).
  const dispositivo = s?.visitante?.device;
  return {
    origem: origem.nome, canal: origem.canal,
    cidade: local.cidade ? [local.cidade, local.estado].filter(Boolean).join(' · ') : NAO_IDENTIFICADO,
    estado: local.estado || NAO_IDENTIFICADO, pais: local.pais || NAO_IDENTIFICADO,
    campanha: texto(s?.utm?.utm_campaign) || 'Sem campanha identificada', entrada: pagina(s?.entry_page ?? null),
    dispositivo: dispositivo === 'celular' ? 'Celular' : dispositivo === 'computador' ? 'Computador' : texto(dispositivo) || NAO_IDENTIFICADO,
    visita: s ? s.visit_number > 1 ? 'Retorno' : 'Primeira visita' : NAO_IDENTIFICADO,
  };
}

export function formatarDimensao(dimensao: DimensaoBi, valor: string) {
  if (dimensao === 'dia' && dataValida(valor)) return valor.split('-').reverse().join('/');
  if (dimensao === 'mes' && /^\d{4}-\d{2}$/.test(valor)) return valor.slice(5) + '/' + valor.slice(0, 4);
  return valor;
}

const comparador = new Intl.Collator('pt-BR', { numeric: true });
export function compararDimensao(d: DimensaoBi, a: string, b: string) {
  return d === 'dia' || d === 'mes' || d === 'hora' ? a.localeCompare(b) : comparador.compare(a, b);
}

export function calcularBi(config: ConfigBi, sessoes: SessaoBi[], eventos: EventoBi[], leadsPorVisitante: ReadonlyMap<string, readonly LeadBi[]>): ResultadoBi {
  const { inicio, fim } = limitesBi(config);
  const inicioMs = Date.parse(inicio), fimMs = Date.parse(fim);
  const dentro = (data: string) => { const ms = Date.parse(data); return ms >= inicioMs && ms < fimMs; };
  const porSessao = new Map(sessoes.filter((s) => noAmbiente(s.hostname, config.ambiente)).map((s) => [s.id, { s, dados: dadosSessao(s) }]));
  const grupos = new Map<string, Grupo>();
  const colunas = new Map<string, Acumulador>();
  const total = novoTotal();
  const opcoes = Object.fromEntries(DIMENSOES_BI.map(([d]) => [d, new Set<string>()])) as Record<DimensaoBi, Set<string>>;
  const filtros = Object.entries(config.filtros).map(([dimensao, lista]) => ({ dimensao: dimensao as DimensaoBi, conjunto: new Set(lista) }));
  const cobertura: ResultadoBi['cobertura'] = { registros: 0, selecionados: 0, eventosSemSessao: 0, dataInicial: null };

  function registrar(r: Registro) {
    cobertura.registros += 1;
    if (!cobertura.dataInicial || r.campos.dia < cobertura.dataInicial) cobertura.dataInicial = r.campos.dia;
    for (const [d] of DIMENSOES_BI) opcoes[d].add(r.campos[d]);
    if (filtros.some(({ dimensao, conjunto }) => conjunto.size && !conjunto.has(r.campos[dimensao]))) return;
    cobertura.selecionados += 1;
    if (!r.sessao && r.evento) cobertura.eventosSemSessao += 1;
    const rotulos = config.linhas.map((d) => r.campos[d]);
    const id = JSON.stringify(rotulos);
    let grupo = grupos.get(id);
    if (!grupo) {
      grupo = { rotulos, total: novoTotal(), celulas: new Map() };
      grupos.set(id, grupo);
    }
    somar(total, r);
    somar(grupo.total, r);
    if (config.coluna) {
      const c = r.campos[config.coluna];
      let coluna = colunas.get(c);
      if (!coluna) { coluna = novoTotal(); colunas.set(c, coluna); }
      let celula = grupo.celulas.get(c);
      if (!celula) { celula = novoTotal(); grupo.celulas.set(c, celula); }
      somar(coluna, r);
      somar(celula, r);
    }
  }

  for (const { s, dados } of porSessao.values()) {
    if (!dentro(s.started_at)) continue;
    const entrada = pagina(s.entry_page);
    registrar({ visitante: s.visitor_code, sessao: s.id, evento: null, leads: leadsPorVisitante.get(s.visitor_code) ?? [],
      campos: { ...dados, ...dataHora(s.started_at), pagina: entrada, empreendimento: projeto(null, entrada),
        acao: 'Início da visita', ambiente: rotuloAmbiente[ambienteDoSite(s.hostname)] } });
  }
  const desconhecida = dadosSessao(null);
  for (const e of eventos) {
    if (!dentro(e.created_at) || !noAmbiente(e.hostname, config.ambiente)) continue;
    const info = e.session_id ? porSessao.get(e.session_id) : undefined;
    const sessao = info && info.s.visitor_code === e.visitor_code &&
      ambienteDoSite(info.s.hostname) === ambienteDoSite(e.hostname) ? info : null;
    const nome = empreendimentoDoPasseio(e) ? 'open_virtual_tour' : e.name;
    const path = pagina(e.page);
    registrar({ visitante: e.visitor_code, sessao: sessao?.s.id ?? null, evento: nome, leads: leadsPorVisitante.get(e.visitor_code) ?? [],
      campos: { ...(sessao?.dados ?? desconhecida), ...dataHora(e.created_at), pagina: path,
        empreendimento: projeto(e.props, path),
        acao: Object.hasOwn(NOMES_EVENTOS_SITE, nome) ? NOMES_EVENTOS_SITE[nome] : texto(nome).replaceAll('_', ' '),
        ambiente: rotuloAmbiente[ambienteDoSite(e.hostname)] } });
  }

  const metricas = config.metricas;
  const compararColunas = (a: string, b: string) => config.coluna ? compararDimensao(config.coluna, a, b) : 0;
  return {
    config,
    opcoes: Object.fromEntries(DIMENSOES_BI.map(([d]) => [d, [...opcoes[d]].sort((a, b) => compararDimensao(d, a, b))])) as ResultadoBi['opcoes'],
    linhas: [...grupos.entries()].map(([id, g]) => ({
      id, rotulos: g.rotulos, total: valores(g.total, metricas),
      celulas: Object.fromEntries([...g.celulas].map(([c, acc]) => [c, valores(acc, metricas)])),
    })),
    colunas: [...colunas.entries()].sort(([a], [b]) => compararColunas(a, b)).map(([id, acc]) => ({ id, total: valores(acc, metricas) })),
    total: valores(total, metricas), cobertura,
  };
}

export function valorBi(valor: number | null | undefined, metrica: MetricaBi) {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + (metrica === 'conversao' ? '%' : '');
}

export function linhaCsvBi(valores: string[]) {
  return valores.map((v) => {
    // Valores de campanha, origem e localização podem conter texto externo.
    // Ao abrir no Excel, devem continuar sendo tratados como texto.
    const seguro = /^\s*[=+\-@\t\r\n]/.test(v) ? `'${v}` : v;
    return `"${seguro.replaceAll('"', '""')}"`;
  }).join(';');
}
