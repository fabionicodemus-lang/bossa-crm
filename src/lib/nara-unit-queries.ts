import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from './types';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type JsonRecord = Record<string, unknown>;

type DevelopmentRow = {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  delivery_date: string | null;
};

type TypologyRow = {
  id: string;
  code: string;
  name: string;
  bedrooms: number | null;
  suites: number | null;
  private_area_m2: number | string | null;
};

type UnitRow = {
  id: string;
  development_id: string;
  typology_id: string | null;
  unit_code: string;
  floor: number | null;
  list_price: number | string;
  entry_amount: number | string;
  installment_count: number;
  installment_amount: number | string;
  payment_plan: JsonRecord | null;
  price_updated_at: string | null;
};

export type NaraUnitOffer = {
  empreendimento: string;
  unidade: string;
  andar: number | null;
  tipologia: string;
  valor: number;
  entrada: number;
  parcela_media: number | null;
  quantidade_parcelas: number;
  indice_correcao: string | null;
  validade_tabela: string | null;
  referencia_tabela: string | null;
  preco_atualizado_em: string | null;
};

export type NaraDevelopmentRange = {
  empreendimento: string;
  valor_minimo: number;
  valor_maximo: number;
  entrada_minima: number;
  qtd_disponiveis: number;
};

export type NaraApartmentFilters = {
  empreendimento: string;
  tipologia?: string | null;
  andar_min?: number | null;
  andar_max?: number | null;
  valor_max?: number | null;
  entrada_max?: number | null;
};

export type NaraCommercialCall = {
  name: 'faixa_empreendimento' | 'buscar_apartamentos' | 'consultar_apartamento';
  arguments: Record<string, unknown>;
  result: NaraDevelopmentRange | NaraUnitOffer[] | NaraUnitOffer | null;
};

export type NaraCommercialTurnContext = {
  consulted_at: string;
  source_table: 'development_units';
  calls: NaraCommercialCall[];
  source_text: string;
  error?: string;
  blocked_reason?: 'corretor' | 'cliente_atual';
};

const UNIT_SELECT = 'id,development_id,typology_id,unit_code,floor,list_price,entry_amount,installment_count,installment_amount,payment_plan,price_updated_at';
const MONEY_IN_TEXT = /r\$\s*\d[\d.\s]*(?:,\d{1,2})?\s*(?:milhao|milhoes|mil)?|\b\d+(?:[.,]\d+)?\s*(?:milhao|milhoes|mil)\b/giu;

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalText(record: JsonRecord | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function formatBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

async function activeDevelopments(
  client: SupabaseClient,
  organizationId: string,
): Promise<DevelopmentRow[]> {
  const { data, error } = await client
    .from('developments')
    .select('id,name,slug,code,delivery_date')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as DevelopmentRow[];
}

async function resolveDevelopment(
  client: SupabaseClient,
  organizationId: string,
  requested: string,
): Promise<DevelopmentRow | null> {
  const rows = await activeDevelopments(client, organizationId);
  const target = normalizeText(requested);
  if (!target) return rows.length === 1 ? rows[0] : null;

  const exact = rows.find((row) => [row.name, row.slug, row.code]
    .some((value) => normalizeText(value) === target));
  if (exact) return exact;

  const alias = target.includes('flow') ? 'flow' : target.includes('alma') ? 'alma' : target;
  return rows.find((row) => {
    const candidates = [row.name, row.slug, row.code]
      .map(normalizeText)
      .filter(Boolean);
    return candidates.some((value) => value.includes(alias) || alias.includes(value));
  }) ?? null;
}

async function developmentTypologies(
  client: SupabaseClient,
  organizationId: string,
  developmentId: string,
): Promise<TypologyRow[]> {
  const { data, error } = await client
    .from('development_typologies')
    .select('id,code,name,bedrooms,suites,private_area_m2')
    .eq('organization_id', organizationId)
    .eq('development_id', developmentId)
    .eq('active', true);
  if (error) throw error;
  return (data ?? []) as TypologyRow[];
}

function typologyMatches(row: TypologyRow, requested: string): boolean {
  const target = normalizeText(requested);
  if (!target) return true;
  const text = normalizeText(`${row.code} ${row.name}`);
  if (text.includes(target) || target.includes(text)) return true;
  const suites = target.match(/\b(\d+)\s*suite/)?.[1];
  const bedrooms = target.match(/\b(\d+)\s*quarto/)?.[1];
  if (suites && row.suites === Number(suites)) return true;
  if (bedrooms && row.bedrooms === Number(bedrooms)) return true;
  return false;
}

function toOffer(
  development: DevelopmentRow,
  unit: UnitRow,
  typology: TypologyRow | undefined,
): NaraUnitOffer {
  const plan = unit.payment_plan && typeof unit.payment_plan === 'object'
    ? unit.payment_plan
    : null;
  return {
    empreendimento: development.name,
    unidade: unit.unit_code,
    andar: unit.floor,
    tipologia: typology?.name || typology?.code || 'Não informada',
    valor: numberValue(unit.list_price),
    entrada: numberValue(unit.entry_amount),
    parcela_media: unit.installment_count > 0 ? numberValue(unit.installment_amount) : null,
    quantidade_parcelas: Math.max(0, Number(unit.installment_count || 0)),
    indice_correcao: optionalText(plan, [
      'indice_correcao',
      'correction_index',
      'correction_label',
      'index_name',
    ]),
    validade_tabela: optionalText(plan, [
      'validade_tabela',
      'table_valid_until',
      'valid_until',
    ]),
    referencia_tabela: optionalText(plan, ['table_reference', 'referencia_tabela']),
    preco_atualizado_em: unit.price_updated_at,
  };
}

async function offersFromRows(
  client: SupabaseClient,
  organizationId: string,
  development: DevelopmentRow,
  rows: UnitRow[],
): Promise<NaraUnitOffer[]> {
  const typologies = await developmentTypologies(client, organizationId, development.id);
  const byId = new Map(typologies.map((row) => [row.id, row]));
  return rows.map((row) => toOffer(
    development,
    row,
    row.typology_id ? byId.get(row.typology_id) : undefined,
  ));
}

export async function faixaEmpreendimento(
  client: SupabaseClient,
  organizationId: string,
  empreendimento: string,
): Promise<NaraDevelopmentRange | null> {
  const development = await resolveDevelopment(client, organizationId, empreendimento);
  if (!development) return null;
  const { data, error } = await client
    .from('development_units')
    .select('list_price,entry_amount')
    .eq('organization_id', organizationId)
    .eq('development_id', development.id)
    .eq('status', 'disponivel')
    .gt('list_price', 0)
    .order('list_price', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ list_price: number | string; entry_amount: number | string }>;
  if (!rows.length) return null;
  const prices = rows.map((row) => numberValue(row.list_price)).filter((value) => value > 0);
  const entries = rows.map((row) => numberValue(row.entry_amount)).filter((value) => value > 0);
  if (!prices.length) return null;
  return {
    empreendimento: development.name,
    valor_minimo: Math.min(...prices),
    valor_maximo: Math.max(...prices),
    entrada_minima: entries.length ? Math.min(...entries) : 0,
    qtd_disponiveis: rows.length,
  };
}

export async function buscarApartamentos(
  client: SupabaseClient,
  organizationId: string,
  filters: NaraApartmentFilters,
): Promise<NaraUnitOffer[]> {
  const development = await resolveDevelopment(client, organizationId, filters.empreendimento);
  if (!development) return [];

  const typologies = await developmentTypologies(client, organizationId, development.id);
  const matchingTypologyIds = filters.tipologia
    ? typologies.filter((row) => typologyMatches(row, filters.tipologia || '')).map((row) => row.id)
    : [];
  if (filters.tipologia && matchingTypologyIds.length === 0) return [];

  let query = client
    .from('development_units')
    .select(UNIT_SELECT)
    .eq('organization_id', organizationId)
    .eq('development_id', development.id)
    .eq('status', 'disponivel')
    .gt('list_price', 0);
  if (matchingTypologyIds.length) query = query.in('typology_id', matchingTypologyIds);
  if (Number.isFinite(filters.andar_min)) query = query.gte('floor', Number(filters.andar_min));
  if (Number.isFinite(filters.andar_max)) query = query.lte('floor', Number(filters.andar_max));
  if (Number.isFinite(filters.valor_max)) query = query.lte('list_price', Number(filters.valor_max));
  if (Number.isFinite(filters.entrada_max)) query = query.lte('entry_amount', Number(filters.entrada_max));

  const { data, error } = await query
    .order('list_price', { ascending: true })
    .order('floor', { ascending: true, nullsFirst: false })
    .limit(3);
  if (error) throw error;
  return offersFromRows(client, organizationId, development, (data ?? []) as UnitRow[]);
}

export async function consultarApartamento(
  client: SupabaseClient,
  organizationId: string,
  empreendimento: string,
  unidade: string,
): Promise<NaraUnitOffer | null> {
  const development = await resolveDevelopment(client, organizationId, empreendimento);
  if (!development) return null;
  const { data, error } = await client
    .from('development_units')
    .select(UNIT_SELECT)
    .eq('organization_id', organizationId)
    .eq('development_id', development.id)
    .eq('unit_code', unidade.trim())
    .eq('status', 'disponivel')
    .gt('list_price', 0)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const offers = await offersFromRows(client, organizationId, development, [data as UnitRow]);
  return offers[0] ?? null;
}

function formatRange(result: NaraDevelopmentRange | null): string {
  if (!result) return 'resultado vazio';
  return [
    `empreendimento=${result.empreendimento}`,
    `valor_minimo=${formatBrl(result.valor_minimo)}`,
    `valor_maximo=${formatBrl(result.valor_maximo)}`,
    `entrada_minima=${formatBrl(result.entrada_minima)}`,
    `qtd_disponiveis=${result.qtd_disponiveis}`,
  ].join('; ');
}

function formatOffer(result: NaraUnitOffer): string {
  return [
    `empreendimento=${result.empreendimento}`,
    `unidade=${result.unidade}`,
    `andar=${result.andar ?? 'não informado'}`,
    `tipologia=${result.tipologia}`,
    `valor=${formatBrl(result.valor)}`,
    `entrada=${formatBrl(result.entrada)}`,
    result.parcela_media === null ? 'parcela_media=não informada' : `parcela_media=${formatBrl(result.parcela_media)}`,
    `quantidade_parcelas=${result.quantidade_parcelas}`,
    `indice_correcao=${result.indice_correcao ?? 'não informado'}`,
    `validade_tabela=${result.validade_tabela ?? 'não informada'}`,
    `referencia_tabela=${result.referencia_tabela ?? 'não informada'}`,
    `preco_atualizado_em=${result.preco_atualizado_em ?? 'não informado'}`,
  ].join('; ');
}

function sourceText(calls: NaraCommercialCall[]): string {
  const lines = calls.flatMap((call) => {
    if (call.name === 'faixa_empreendimento') {
      return [`[faixa_empreendimento] ${formatRange(call.result as NaraDevelopmentRange | null)}`];
    }
    if (Array.isArray(call.result)) {
      const rows = call.result as NaraUnitOffer[];
      return rows.length
        ? rows.map((row, index) => `[buscar_apartamentos ${index + 1}/${rows.length}] ${formatOffer(row)}`)
        : ['[buscar_apartamentos] resultado vazio'];
    }
    return call.result
      ? [`[consultar_apartamento] ${formatOffer(call.result as NaraUnitOffer)}`]
      : ['[consultar_apartamento] resultado vazio'];
  });
  return lines.join('\n');
}

function lastUserMessage(history: ChatMessage[]): string {
  return [...history].reverse().find((item) => item.role === 'user')?.content ?? '';
}

function allUserText(history: ChatMessage[]): string {
  return history.filter((item) => item.role === 'user').map((item) => item.content).join(' ');
}

function inferredEnterprise(lead: Lead, history: ChatMessage[]): string {
  const latest = normalizeText(lastUserMessage(history));
  if (latest.includes('flow')) return 'flow';
  if (latest.includes('alma')) return 'alma';
  const leadEnterprise = normalizeText(lead.enterprise);
  if (leadEnterprise.includes('flow')) return 'flow';
  if (leadEnterprise.includes('alma')) return 'alma';
  const historyText = normalizeText(allUserText(history));
  if (historyText.includes('flow')) return 'flow';
  if (historyText.includes('alma')) return 'alma';
  const metadataText = normalizeText(JSON.stringify(lead.metadata ?? {}));
  if (metadataText.includes('flow')) return 'flow';
  if (metadataText.includes('alma')) return 'alma';
  return '';
}

function unitCodeFromMessage(message: string): string {
  const value = normalizeText(message);
  const explicit = value.match(/\b(?:unidade|apto|apartamento)\s*(?:n(?:umero)?\s*)?(\d{2,4})\b/)?.[1];
  if (explicit) return explicit;
  const withoutMoney = value.replace(MONEY_IN_TEXT, ' ');
  const candidates = withoutMoney.match(/\b\d{3,4}\b/g) ?? [];
  return candidates.find((item) => !/^20(?:2\d|3\d)$/.test(item)) ?? '';
}

function numberAfter(message: string, expression: RegExp): number | null {
  const match = normalizeText(message).match(expression)?.[1]?.trim();
  if (!match) return null;
  const amount = match.match(/(\d[\d.,]*)\s*(milhao|milhoes|mil)?/) ?? [];
  const raw = String(amount[1] ?? '').replace(/\./g, '').replace(',', '.');
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const unit = amount[2] ?? '';
  if (unit === 'milhao' || unit === 'milhoes') return value * 1_000_000;
  if (unit === 'mil') return value * 1_000;
  return value;
}

function filtersFromMessage(enterprise: string, message: string): NaraApartmentFilters {
  const normalized = normalizeText(message);
  const suites = normalized.match(/\b(\d+)\s*suites?\b/)?.[1];
  const bedrooms = normalized.match(/\b(\d+)\s*quartos?\b/)?.[1];
  const exactFloor = normalized.match(/\b(?:andar|no)\s*(\d{1,2})\b/)?.[1];
  const aboveFloor = normalized.match(/\b(?:acima|a partir)\s+(?:do |de )?(\d{1,2})(?:o|º)?\s*andar\b/)?.[1];
  const belowFloor = normalized.match(/\b(?:ate|abaixo)\s+(?:o |do )?(\d{1,2})(?:o|º)?\s*andar\b/)?.[1];
  const amountPattern = '(\\d[\\d.,]*\\s*(?:milhao|milhoes|mil)?)';
  const valueByLabel = numberAfter(
    message,
    new RegExp(`\\b(?:valor|preco|orcamento|investimento)(?:\\s+maximo)?\\D{0,16}${amountPattern}`),
  );
  const genericValue = valueByLabel === null && !/\bentrada\b/.test(normalized)
    ? numberAfter(message, new RegExp(`\\bate\\D{0,12}${amountPattern}`))
    : null;
  return {
    empreendimento: enterprise,
    tipologia: suites ? `${suites} suítes` : bedrooms ? `${bedrooms} quartos` : normalized.includes('duplex') ? 'duplex' : null,
    andar_min: aboveFloor ? Number(aboveFloor) : exactFloor ? Number(exactFloor) : null,
    andar_max: belowFloor ? Number(belowFloor) : exactFloor ? Number(exactFloor) : null,
    valor_max: valueByLabel ?? genericValue,
    entrada_max: numberAfter(message, new RegExp(`\\bentrada\\D{0,16}${amountPattern}`)),
  };
}

function hasCommercialSignal(message: string): boolean {
  return /\b(precos?|valor(?:es)?|quanto custa|faixa|a partir de|tabela|disponibilidade|disponive(?:l|is)|unidade|apto|apartamento|entrada|parcela|andar|suites?|quartos?|duplex)\b/.test(normalizeText(message));
}

function asksForSpecificOptions(message: string): boolean {
  return /\b(disponibilidade|disponive(?:l|is)|unidade|apto|apartamento|entrada|parcela|andar|suites?|quartos?|duplex|opcoes?)\b/.test(normalizeText(message));
}


function routingProfileText(value: string): string {
  let normalized = normalizeText(value);
  if (/\bnao sou (?:um |uma )?corretor(?:a)?\b/.test(normalized)) {
    normalized = normalized.replace(/\b(corretor|corretora|imobiliaria|creci)\b/g, ' ');
  }
  if (/\bnao sou (?:um |uma )?cliente\b/.test(normalized)) {
    normalized = normalized.replace(/\b(ja comprei|sou cliente|segunda via|boleto)\b/g, ' ');
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

function blockedCommercialProfile(
  lead: Lead,
  history: ChatMessage[],
): 'corretor' | 'cliente_atual' | null {
  if (lead.kind === 'corretor') return 'corretor';
  const userMessages = history
    .filter((item) => item.role === 'user')
    .map((item) => routingProfileText(item.content));
  const full = userMessages.join('\n');
  const metadata = routingProfileText(JSON.stringify(lead.metadata ?? {}));
  const brokerSelfIdentification = /\b(?:sou|trabalho como|atuo como|falo como)\s+(?:um |uma )?(?:corretor|corretora)\b/.test(full)
    || /\b(?:minha|da nossa) imobiliaria\b/.test(full)
    || /\b(?:meu )?creci\s*[-:]?\s*\d+/i.test(full)
    || /\bperfil[_ ]?(?:de[_ ])?corretor\b/.test(metadata);
  if (brokerSelfIdentification) return 'corretor';

  const currentCustomerSignal = /\b(ja comprei|sou cliente|comprei com voces|segunda via|boleto|meu contrato|minha unidade|assistencia tecnica|pos-venda)\b/.test(full)
    || /\b(?:cliente_atual|current_customer|pos_venda)\b/.test(metadata);
  return currentCustomerSignal ? 'cliente_atual' : null;
}

function blockedCommercialContext(
  reason: 'corretor' | 'cliente_atual',
  consultedAt: string,
): NaraCommercialTurnContext {
  if (reason === 'corretor') {
    return {
      consulted_at: consultedAt,
      source_table: 'development_units',
      calls: [],
      blocked_reason: reason,
      error: 'nara_price_disabled_for_broker',
      source_text: 'CONSULTA COMERCIAL BLOQUEADA: o contato se identificou como corretor. Não consulte nem informe preço, tabela, unidade ou disponibilidade. Transfira para o Plantão da Bossa.',
    };
  }
  return {
    consulted_at: consultedAt,
    source_table: 'development_units',
    calls: [],
    blocked_reason: reason,
    error: 'nara_price_disabled_for_current_customer',
    source_text: 'CONSULTA COMERCIAL BLOQUEADA: o contato é cliente atual. Não consulte nem informe preço, tabela, unidade ou disponibilidade. Encaminhe para o pós-venda ou setor responsável.',
  };
}

export async function loadNaraCommercialTurnContext(
  client: SupabaseClient,
  organizationId: string,
  lead: Lead,
  history: ChatMessage[],
): Promise<NaraCommercialTurnContext | null> {
  const latest = lastUserMessage(history);
  if (!latest || !hasCommercialSignal(latest)) return null;
  const consultedAt = new Date().toISOString();
  const blockedReason = blockedCommercialProfile(lead, history);
  if (blockedReason) return blockedCommercialContext(blockedReason, consultedAt);
  const calls: NaraCommercialCall[] = [];

  try {
    const enterprise = inferredEnterprise(lead, history);
    const unitCode = unitCodeFromMessage(latest);

    if (unitCode) {
      if (!enterprise) {
        return {
          consulted_at: consultedAt,
          source_table: 'development_units',
          calls: [],
          source_text: 'A mensagem menciona uma unidade, mas não identifica o empreendimento. Não informe preço ou disponibilidade dessa unidade; pergunte se é Flow ou Alma.',
        };
      }
      const result = await consultarApartamento(client, organizationId, enterprise, unitCode);
      calls.push({
        name: 'consultar_apartamento',
        arguments: { empreendimento: enterprise, unidade: unitCode },
        result,
      });
    } else if (enterprise && asksForSpecificOptions(latest)) {
      const filters = filtersFromMessage(enterprise, latest);
      const result = await buscarApartamentos(client, organizationId, filters);
      calls.push({ name: 'buscar_apartamentos', arguments: filters, result });
    } else if (enterprise) {
      const result = await faixaEmpreendimento(client, organizationId, enterprise);
      calls.push({
        name: 'faixa_empreendimento',
        arguments: { empreendimento: enterprise },
        result,
      });
    } else {
      const developments = await activeDevelopments(client, organizationId);
      for (const development of developments) {
        const result = await faixaEmpreendimento(client, organizationId, development.name);
        calls.push({
          name: 'faixa_empreendimento',
          arguments: { empreendimento: development.name },
          result,
        });
      }
    }

    return {
      consulted_at: consultedAt,
      source_table: 'development_units',
      calls,
      source_text: sourceText(calls),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[nara commercial query]', message);
    return {
      consulted_at: consultedAt,
      source_table: 'development_units',
      calls: [],
      source_text: 'A consulta comercial do sistema não respondeu neste turno. Não informe números lembrados ou estimados; diga que o comercial confirmará a condição vigente.',
      error: message,
    };
  }
}
