import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from './types';
import { isAssistedSaleSignal, isBrokerRoutingSignal, isCurrentCustomerSignal } from './nara-contact-routing';
import { adDevelopment } from './nara-first-message';
import { isNaraAlternativePaymentProposal, isNaraArchitecturalEntranceQuestion } from './nara-commercial-guard';

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
  reinforcement_count?: number | null;
  reinforcement_amount?: number | string | null;
  keys_amount?: number | string | null;
  payment_plan: JsonRecord | null;
  price_updated_at: string | null;
};

export type NaraPaymentComponent = {
  tipo: 'entrada' | 'mensal' | 'reforco' | 'chaves';
  quantidade: number;
  valor_unitario_centavos: number;
  total_centavos: number;
};

export type NaraPaymentPlan = {
  status: 'complete' | 'incomplete' | 'inconsistent';
  componentes: NaraPaymentComponent[];
  total_composto_centavos: number;
  diferenca_centavos: number;
  indice_correcao: string | null;
  juros: string | null;
  motivo?: string;
};

export type NaraUnitOffer = {
  empreendimento_id?: string;
  unidade_id?: string;
  moeda?: 'BRL';
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
  plano_pagamento?: NaraPaymentPlan;
};

export type NaraDevelopmentRange = {
  empreendimento_id?: string;
  empreendimento: string;
  valor_minimo: number;
  valor_maximo: number;
  entrada_minima: number;
  qtd_disponiveis: number;
  validade_tabela?: string | null;
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
  status?: 'ok' | 'empty' | 'ambiguous' | 'error' | 'blocked';
  motivo?: string;
  consulted_at: string;
  source_table: 'development_units';
  calls: NaraCommercialCall[];
  source_text: string;
  error?: string;
  blocked_reason?: 'corretor' | 'cliente_atual' | 'venda_assistida';
};

const UNIT_SELECT = 'id,development_id,typology_id,unit_code,floor,list_price,entry_amount,installment_count,installment_amount,reinforcement_count,reinforcement_amount,keys_amount,payment_plan,price_updated_at';
const MONEY_IN_TEXT = /r\$\s*\d[\d.\s]*(?:,\d{1,2})?\s*(?:milhao|milhoes|mil)?|\b\d+(?:[.,]\d+)?\s*(?:milhao|milhoes|mil)\b/giu;

class NaraCommercialQueryIssue extends Error {
  readonly status: 'ambiguous' | 'error';
  readonly reason: string;
  readonly sourceText: string;

  constructor(
    status: 'ambiguous' | 'error',
    reason: string,
    sourceText: string,
  ) {
    super(reason);
    this.status = status;
    this.reason = reason;
    this.sourceText = sourceText;
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Database monetary columns are decimal values, not locale-formatted prose. */
function moneyCents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) return null;
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  // Reject an extra decimal rather than silently modifying a commercial value.
  if (typeof value === 'number' && Math.abs(value - cents / 100) > 0.000001) return null;
  return cents;
}

function validCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function planForUnit(unit: Pick<UnitRow, 'payment_plan'>): JsonRecord | null {
  return unit.payment_plan && typeof unit.payment_plan === 'object' && !Array.isArray(unit.payment_plan)
    ? unit.payment_plan : null;
}

function tableValidUntil(plan: JsonRecord | null): string | null {
  return optionalText(plan, ['validade_tabela', 'table_valid_until', 'valid_until']);
}

/** Date-only validity includes the whole business day in São Paulo. */
function validityTimestamp(value: string): number | null {
  const text = value.trim();
  const brazilian = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = brazilian ? `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}` : text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const parsed = new Date(`${iso}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null;
    // The business timezone is explicit, independent of the server timezone.
    return Date.parse(`${iso}T23:59:59.999-03:00`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function priceRowIsCurrent(unit: UnitRow, now = Date.now()): boolean {
  const price = moneyCents(unit.list_price);
  if (price === null || price <= 0) return false;
  const validity = tableValidUntil(planForUnit(unit));
  if (validity) {
    const until = validityTimestamp(validity);
    if (until === null || until < now) return false;
  }
  if (unit.price_updated_at) {
    const updated = Date.parse(unit.price_updated_at);
    if (!Number.isFinite(updated) || updated > now + 5 * 60_000) return false;
  }
  return true;
}

function paymentPlan(unit: UnitRow, plan: JsonRecord | null): NaraPaymentPlan {
  const components: NaraPaymentComponent[] = [];
  let invalid = false;
  let missing = false;
  const add = (tipo: NaraPaymentComponent['tipo'], rawCount: unknown, rawAmount: unknown) => {
    const quantity = validCount(rawCount);
    const amount = moneyCents(rawAmount);
    if (quantity === null || amount === null) {
      const absent = rawCount === undefined || rawCount === null || rawAmount === undefined || rawAmount === null;
      if (absent) missing = true;
      else invalid = true;
      return;
    }
    const total = quantity * amount;
    if (!Number.isSafeInteger(total) || (quantity === 0 && amount > 0) || (quantity > 0 && amount === 0 && tipo !== 'entrada' && tipo !== 'chaves')) {
      invalid = true;
      return;
    }
    if (quantity > 0 && amount > 0) components.push({ tipo, quantidade: quantity, valor_unitario_centavos: amount, total_centavos: total });
  };
  add('entrada', 1, unit.entry_amount);
  add('mensal', unit.installment_count, unit.installment_amount);
  add('reforco', unit.reinforcement_count, unit.reinforcement_amount);
  add('chaves', 1, unit.keys_amount);
  const price = moneyCents(unit.list_price);
  if (price === null || price <= 0) invalid = true;
  const total = components.reduce((sum, component) => sum + component.total_centavos, 0);
  if (!Number.isSafeInteger(total)) invalid = true;
  const difference = (price ?? 0) - total;
  const status = invalid || (!missing && difference !== 0) || difference < 0
    ? 'inconsistent' : missing || difference !== 0 ? 'incomplete' : 'complete';
  return {
    status,
    componentes: components,
    total_composto_centavos: total,
    diferenca_centavos: difference,
    indice_correcao: optionalText(plan, ['indice_correcao', 'correction_index', 'correction_label', 'index_name']),
    juros: optionalText(plan, ['juros', 'interest_label', 'interest_terms', 'juros_descricao']),
    ...(status !== 'complete' ? { motivo: invalid ? 'invalid_payment_components' : missing ? 'missing_payment_components' : 'payment_total_mismatch' } : {}),
  };
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

  const exact = rows.filter((row) => [row.id, row.name, row.slug, row.code]
    .some((value) => normalizeText(value) === target));
  if (exact.length === 1) return exact[0];

  const named = mentionedEnterprises(target);
  const alias = named.length === 1 ? named[0] : target;
  const matches = exact.length ? exact : rows.filter((row) => {
    const candidates = [row.name, row.slug, row.code]
      .map(normalizeText)
      .filter(Boolean);
    return candidates.some((value) => value.includes(alias) || alias.includes(value));
  });
  if (matches.length > 1 || named.length > 1) {
    throw new NaraCommercialQueryIssue('ambiguous', 'ambiguous_development',
      'O empreendimento não está identificado de forma única. Confirme qual empreendimento o contato deseja antes de informar preço ou condição.');
  }
  return matches[0] ?? null;
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
  const plan = planForUnit(unit);
  const terms = paymentPlan(unit, plan);
  return {
    empreendimento_id: development.id,
    unidade_id: unit.id,
    moeda: 'BRL',
    empreendimento: development.name,
    unidade: unit.unit_code,
    andar: unit.floor,
    tipologia: typology?.name || typology?.code || 'Não informada',
    valor: (moneyCents(unit.list_price) ?? 0) / 100,
    entrada: (moneyCents(unit.entry_amount) ?? 0) / 100,
    parcela_media: (validCount(unit.installment_count) ?? 0) > 0 && moneyCents(unit.installment_amount) !== null
      ? moneyCents(unit.installment_amount)! / 100 : null,
    quantidade_parcelas: validCount(unit.installment_count) ?? 0,
    indice_correcao: terms.indice_correcao,
    validade_tabela: tableValidUntil(plan),
    referencia_tabela: optionalText(plan, ['table_reference', 'referencia_tabela']),
    preco_atualizado_em: unit.price_updated_at,
    plano_pagamento: terms,
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
    .select(UNIT_SELECT)
    .eq('organization_id', organizationId)
    .eq('development_id', development.id)
    .eq('status', 'disponivel')
    .gt('list_price', 0)
    .order('list_price', { ascending: true });
  if (error) throw error;
  const allRows = (data ?? []) as UnitRow[];
  const now = Date.now();
  const rows = allRows.filter((row) => priceRowIsCurrent(row, now));
  if (!rows.length) {
    if (allRows.length) throw new NaraCommercialQueryIssue('error', 'invalid_or_expired_price_table',
      'As unidades consultadas não têm preço válido e vigente comprovado. Não reutilize valores anteriores; a tabela precisa ser confirmada.');
    return null;
  }
  const prices = rows.map((row) => moneyCents(row.list_price)! / 100);
  const entries = rows.map((row) => (moneyCents(row.entry_amount) ?? 0) / 100).filter((value) => value > 0);
  const validity = rows.map((row) => tableValidUntil(planForUnit(row)))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => validityTimestamp(a)! - validityTimestamp(b)!)[0] ?? null;
  if (!prices.length) return null;
  return {
    empreendimento_id: development.id,
    empreendimento: development.name,
    valor_minimo: Math.min(...prices),
    valor_maximo: Math.max(...prices),
    entrada_minima: entries.length ? Math.min(...entries) : 0,
    qtd_disponiveis: rows.length,
    validade_tabela: validity,
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
    // Filter table validity before capping, so an expired cheap unit does not hide a valid option.
    .limit(100);
  if (error) throw error;
  const allRows = (data ?? []) as UnitRow[];
  const now = Date.now();
  const rows = allRows.filter((row) => priceRowIsCurrent(row, now)).slice(0, 3);
  if (allRows.length && !rows.length) throw new NaraCommercialQueryIssue('error', 'invalid_or_expired_price_table',
    'As opções encontradas precisam de confirmação da tabela vigente. Não informe esses valores nem use ofertas antigas.');
  return offersFromRows(client, organizationId, development, rows);
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
  if (!priceRowIsCurrent(data as UnitRow)) throw new NaraCommercialQueryIssue('error', 'invalid_or_expired_price_table',
    'A tabela desta unidade está vencida ou inconsistente. Não apresente um valor anterior como atual; confirme a condição vigente.');
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
    `validade_tabela=${result.validade_tabela ?? 'não informada'}`,
  ].join('; ');
}

function formatOffer(result: NaraUnitOffer): string {
  const plan = result.plano_pagamento;
  const complete = plan?.status === 'complete';
  const installments = complete ? plan.componentes.find((item) => item.tipo === 'mensal') : null;
  const reinforcements = complete ? plan.componentes.find((item) => item.tipo === 'reforco') : null;
  const keys = complete ? plan.componentes.find((item) => item.tipo === 'chaves') : null;
  return [
    `empreendimento=${result.empreendimento}`,
    `unidade=${result.unidade}`,
    `andar=${result.andar ?? 'não informado'}`,
    `tipologia=${result.tipologia}`,
    `valor=${formatBrl(result.valor)}`,
    'natureza_valor=preço de tabela; não autoriza preço à vista, desconto ou proposta negociada',
    complete ? `plano_de_pagamento=completo; entrada=${formatBrl(result.entrada)}` : 'plano_de_pagamento=parcial ou inconsistente; confirmar composição completa antes de apresentar entrada, parcelas, reforços e chaves',
    ...(installments ? [`parcela_media=${formatBrl(installments.valor_unitario_centavos / 100)}`, `quantidade_parcelas=${installments.quantidade}`] : []),
    ...(reinforcements ? [`reforcos=${reinforcements.quantidade} x ${formatBrl(reinforcements.valor_unitario_centavos / 100)}`] : []),
    ...(keys ? [`chaves=${formatBrl(keys.valor_unitario_centavos / 100)}`] : []),
    `indice_correcao=${result.indice_correcao ?? 'não informado'}`,
    `juros=${plan?.juros ?? 'não informados; não significa ausência de juros'}`,
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

function mentionedEnterprises(message: string): string[] {
  const text = normalizeText(message);
  return ['flow', 'alma', 'soul'].filter((name) => new RegExp(`\\b${name}\\b`).test(text));
}

function inferredEnterprise(lead: Lead, history: ChatMessage[]): string {
  // A comparison is not a selection. Never attach an ambiguous unit to the last name in a list.
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const mentioned = mentionedEnterprises(history[index].content);
    if (mentioned.length === 1) return mentioned[0];
    if (mentioned.length > 1) throw new NaraCommercialQueryIssue('ambiguous', 'ambiguous_development',
      'Há mais de um empreendimento em discussão. Confirme de qual deles é a unidade ou condição solicitada antes de informar valores.');
  }
  const leadEnterprise = mentionedEnterprises(String(lead.enterprise ?? ''));
  if (leadEnterprise.length === 1) return leadEnterprise[0];
  if (leadEnterprise.length > 1) throw new NaraCommercialQueryIssue('ambiguous', 'ambiguous_development',
    'O cadastro do contato cita mais de um empreendimento. Pergunte qual deles deseja consultar.');
  // Only the dedicated attribution fields can supply an ad's project, not arbitrary metadata.
  return adDevelopment(lead.metadata, lead.source) ?? '';
}

function unitCodesFromMessage(message: string): string[] {
  const value = normalizeText(message);
  const withoutMoney = value.replace(MONEY_IN_TEXT, ' ');
  const codes: string[] = [];
  const labeledUnits = /\b(?:unidades?|aptos?|apartamentos?|units?|apartments?|departamentos?)\s*(?:n(?:umeros?)?[.°º]?\s*)?(\d{2,4}(?:(?:\s*[,;/]\s*|\s+(?:e|ou|and|or|y|versus|vs)\s+)\d{2,4})*)(?!\d|[.,]\d)\b/g;
  for (const match of withoutMoney.matchAll(labeledUnits)) codes.push(...(match[1].match(/\d{2,4}/g) ?? []));
  // Read the whole list. A plural label or separator must never silently select
  // only the final unit before the project name ("901, 1001 e 1101 do Flow").
  const lists = /(?<![\d.,])\b\d{3,4}(?:(?:\s*[,;/]\s*|\s+(?:e|ou|and|or|y|versus|vs)\s+)\d{3,4})+(?!\d|[.,]\d)\b/g;
  for (const match of withoutMoney.matchAll(lists)) {
    const after = withoutMoney.slice((match.index ?? 0) + match[0].length);
    if (/^\s*(?:de\s+)?(?:entrada|parcelas?|mensais|meses?|anos?|reais|dolares|euros|por mes|m2|m²|metros)\b/.test(after)) continue;
    codes.push(...(match[0].match(/\d{3,4}/g) ?? []));
  }
  const references = /(?:^|\b(?:a|o|da|do|na|no|custa|precio|preco|valor|e|ou)\s+)(\d{3,4})(?!\d|[.,]\d)\b/g;
  for (const match of withoutMoney.matchAll(references)) {
    const after = withoutMoney.slice((match.index ?? 0) + match[0].length);
    if (/^\s*(?:de\s+)?(?:entrada|parcelas?|mensais|meses?|anos?|reais|dolares|euros|por mes)\b/.test(after)) continue;
    if (!/^20(?:2\d|3\d)$/.test(match[1])) codes.push(match[1]);
  }
  for (const match of withoutMoney.matchAll(/\b(\d{3,4})\s+(?:do|da|no|na)\s+(?:flow|alma|soul)\b/g)) codes.push(match[1]);
  return [...new Set(codes)];
}

function unitInCurrentConversation(lead: Lead, history: ChatMessage[], enterprise: string): string {
  // A previous unit is only a reference to query again; its old price is never reused.
  const clarification = /^(?:(?:e |eh |seria )?(?:o |a |do |da )?)?(?:flow(?: aptos)?|alma(?: seahouses)?|soul(?: residence)?)[.!?]*$/.test(normalizeText(lastUserMessage(history)));
  for (let index = history.length - 2; index >= 0; index -= 1) {
    const message = history[index];
    const mentioned = mentionedEnterprises(message.content);
    if (mentioned.length > 1 || (mentioned.length === 1 && mentioned[0] !== enterprise)) return '';
    if (message.role !== 'user') continue;
    const codes = unitCodesFromMessage(message.content);
    if (codes.length > 1) return '';
    if (codes.length === 1) {
      try {
        const priorEnterprise = inferredEnterprise(lead, history.slice(0, index + 1));
        return priorEnterprise === enterprise || (!priorEnterprise && clarification) ? codes[0] : '';
      } catch {
        return '';
      }
    }
  }
  return '';
}

function numberAfter(message: string, expression: RegExp): number | null {
  const match = normalizeText(message).match(expression)?.[1]?.trim();
  if (!match) return null;
  const amount = match.match(/(\d[\d.,]*)\s*(milhao|milhoes|mil)?/) ?? [];
  const numericText = String(amount[1] ?? '');
  const raw = numericText.includes(',') || /^\d{1,3}(?:\.\d{3})+$/.test(numericText)
    ? numericText.replace(/\./g, '').replace(',', '.') : numericText;
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
    new RegExp(`\\b(?:orcamento|investimento)(?:\\s+maximo)?\\D{0,16}${amountPattern}`),
  ) ?? numberAfter(
    message,
    new RegExp(`\\b(?:valor|preco)\\s+(?:maximo|ate|limite)(?:\\s+de)?\\D{0,12}${amountPattern}`),
  );
  const genericValue = valueByLabel === null && !/\bentrada\b/.test(normalized)
    ? numberAfter(message, new RegExp(`\\b(?:ate|tenho|posso investir|meu limite e)\\D{0,12}${amountPattern}`))
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

function filtersFromConversation(enterprise: string, history: ChatMessage[]): NaraApartmentFilters {
  const result: NaraApartmentFilters = { empreendimento: enterprise };
  for (const message of history) {
    if (message.role !== 'user') continue;
    const projects = mentionedEnterprises(message.content);
    if (projects.length > 1 || (projects.length === 1 && projects[0] !== enterprise)) continue;
    const current = filtersFromMessage(enterprise, message.content);
    for (const key of ['tipologia', 'andar_min', 'andar_max', 'valor_max', 'entrada_max'] as const) {
      const value = current[key];
      if (value !== null && value !== undefined) Object.assign(result, { [key]: value });
    }
  }
  return result;
}

function hasCommercialSignal(message: string): boolean {
  return /\b(precos?|prices?|precio|cuanto cuesta|how much|valor(?:es)?|quanto custa|quanto fica|quanto (?:ta|sai|e|esta|da)|(?:comeca|fica|sai|custa) (?:em |por )?quanto|cabe no bolso|valor total|o total|mais barat[oa]|orcamento|ate (?:r\$\s*)?\d|tenho (?:r\$\s*)?\d|faixa|a partir de|tabela|disponibilidade|disponive(?:l|is)|unidade|apto|apartamento|entrada|parcelas?|reforcos?|chaves|juros|correcao|desconto|pagamento|andar|suites?|quartos?|duplex|dolar|usd|euro|eur|moeda)\b/.test(normalizeText(message));
}

function asksForSpecificOptions(message: string): boolean {
  return /\b(disponibilidade|disponive(?:l|is)|unidade|apto|apartamento|entrada|parcela|andar|suites?|quartos?|duplex|opcoes?)\b/.test(normalizeText(message));
}


function blockedCommercialProfile(
  lead: Lead,
  history: ChatMessage[],
): 'corretor' | 'cliente_atual' | 'venda_assistida' | null {
  // Conversa do Plantão (contato já tratado como corretor): o Plantão pode consultar e informar
  // unidades, valores e condições. A trava abaixo vale só para a Nara quando um contato dela se
  // revela corretor.
  if (lead.kind === 'corretor') return null;
  const userMessages = history
    .filter((item) => item.role === 'user')
    .map((item) => item.content);
  const latest = normalizeText(userMessages.at(-1));
  const correctedCustomer = /\b(nao sou (?:um |uma )?cliente|nao comprei|quero comprar)\b/.test(latest);
  if (userMessages.some(isAssistedSaleSignal)) return 'venda_assistida';
  if (userMessages.some(isBrokerRoutingSignal)) return 'corretor';
  const metadata = JSON.stringify(lead.metadata ?? {});
  if (isBrokerRoutingSignal(metadata)) return 'corretor';
  if (!correctedCustomer && (userMessages.some(isCurrentCustomerSignal) || isCurrentCustomerSignal(metadata))) return 'cliente_atual';
  return null;
}

function blockedCommercialContext(
  reason: 'corretor' | 'cliente_atual' | 'venda_assistida',
  consultedAt: string,
): NaraCommercialTurnContext {
  if (reason === 'venda_assistida') {
    return {
      status: 'blocked',
      motivo: reason,
      consulted_at: consultedAt,
      source_table: 'development_units',
      calls: [],
      blocked_reason: reason,
      error: 'nara_price_disabled_for_assisted_sale',
      source_text: 'CONSULTA COMERCIAL BLOQUEADA: o contato informou que veio indicado por corretor ou imobiliária. Não conduza venda direta nem informe preço, tabela, unidade ou disponibilidade. Registre a origem e encaminhe ao comercial.',
    };
  }
  if (reason === 'corretor') {
    return {
      status: 'blocked',
      motivo: reason,
      consulted_at: consultedAt,
      source_table: 'development_units',
      calls: [],
      blocked_reason: reason,
      error: 'nara_price_disabled_for_broker',
      source_text: 'CONSULTA COMERCIAL BLOQUEADA: o contato se identificou como corretor. Não consulte nem informe preço, tabela, unidade ou disponibilidade. Transfira para o Plantão da Bossa.',
    };
  }
  return {
    status: 'blocked',
    motivo: reason,
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
  if (!latest) return null;
  const consultedAt = new Date().toISOString();
  const blockedReason = blockedCommercialProfile(lead, history);
  if (blockedReason) return blockedCommercialContext(blockedReason, consultedAt);
  if (isNaraArchitecturalEntranceQuestion(latest) || isNaraAlternativePaymentProposal(latest)) return null;
  const latestUnits = unitCodesFromMessage(latest);
  const hasCurrentRequest = hasCommercialSignal(latest) || latestUnits.length > 0;
  // O histórico indica o assunto a consultar novamente, nunca os valores autorizados.
  const continuesPriceConversation = !hasCurrentRequest && (
    history.some((item) => item.role === 'user' && (hasCommercialSignal(item.content) || unitCodesFromMessage(item.content).length > 0))
    || history.some((item) => item.role === 'assistant' && /R\$\s*\d/.test(item.content))
  );
  if (!hasCurrentRequest && !continuesPriceConversation) return null;
  const calls: NaraCommercialCall[] = [];

  try {
    const named = mentionedEnterprises(latest);
    if (latestUnits.length > 1 || (latestUnits.length > 0 && named.length > 1)) {
      throw new NaraCommercialQueryIssue('ambiguous', 'ambiguous_unit',
        'Há mais de uma unidade ou empreendimento na pergunta. Confirme a combinação de empreendimento e unidade antes de apresentar uma oferta específica.');
    }
    // Uma comparação explícita recebe faixas distintas, sem escolher um empreendimento silenciosamente.
    if (named.length > 1) {
      for (const name of named) {
        const result = await faixaEmpreendimento(client, organizationId, name);
        calls.push({ name: 'faixa_empreendimento', arguments: { empreendimento: name }, result });
      }
    }
    const enterprise = named.length > 1 ? '' : inferredEnterprise(lead, history);
    const referencesUnit = (/\b(essa|esse|dessa|desse|dela|dele|entrada|parcelas?|reforcos?|chaves|juros|correcao|pagamento|total|desconto|condicao|preco|valor|quanto|custa|cuesta|price|how much)\b/.test(normalizeText(latest)) || (continuesPriceConversation && named.length === 1))
      && !/\b(outr[oa]s?|opcoes|alternativas|mais barat[oa]|mais car[oa])\b/.test(normalizeText(latest));
    const unitCode = latestUnits[0] || (enterprise && referencesUnit ? unitInCurrentConversation(lead, history, enterprise) : '');

    if (calls.length) {
      // Explicit comparisons were resolved above, each against its own current table.
    } else if (unitCode) {
      if (!enterprise) {
        return {
          status: 'ambiguous',
          motivo: 'missing_development',
          consulted_at: consultedAt,
          source_table: 'development_units',
          calls: [],
          source_text: 'A mensagem menciona uma unidade, mas não identifica o empreendimento. Não informe preço ou disponibilidade dessa unidade; pergunte de qual empreendimento é.',
        };
      }
      const result = await consultarApartamento(client, organizationId, enterprise, unitCode);
      calls.push({
        name: 'consultar_apartamento',
        arguments: { empreendimento: enterprise, unidade: unitCode },
        result,
      });
    } else if (enterprise && !continuesPriceConversation && (asksForSpecificOptions(latest)
      || filtersFromMessage(enterprise, latest).valor_max !== null)) {
      const filters = filtersFromConversation(enterprise, history);
      const result = await buscarApartamentos(client, organizationId, filters);
      calls.push({ name: 'buscar_apartamentos', arguments: filters, result });
    } else if (enterprise) {
      const result = await faixaEmpreendimento(client, organizationId, enterprise);
      calls.push({
        name: 'faixa_empreendimento',
        arguments: { empreendimento: enterprise },
        result,
      });
    } else if (continuesPriceConversation) {
      return null;
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
      status: calls.some((call) => Array.isArray(call.result) ? call.result.length > 0 : Boolean(call.result)) ? 'ok' : 'empty',
      consulted_at: consultedAt,
      source_table: 'development_units',
      calls,
      source_text: sourceText(calls),
    };
  } catch (error) {
    if (error instanceof NaraCommercialQueryIssue) {
      return {
        status: error.status,
        motivo: error.reason,
        consulted_at: consultedAt,
        source_table: 'development_units',
        calls: [],
        source_text: error.sourceText,
        ...(error.status === 'error' ? { error: error.reason } : {}),
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('[nara commercial query]', message);
    return {
      status: 'error',
      motivo: 'commercial_query_failed',
      consulted_at: consultedAt,
      source_table: 'development_units',
      calls: [],
      source_text: 'A consulta comercial do sistema não respondeu neste turno. Não informe números lembrados ou estimados; diga que o comercial confirmará a condição vigente.',
      error: message,
    };
  }
}
