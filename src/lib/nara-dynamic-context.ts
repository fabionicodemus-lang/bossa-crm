import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePreferredContactTime, type NaraPreferredContactTime } from './nara-timezone';
import {
  emptyNaraRuntimeVariables,
  missingNaraRuntimeVariables,
  NARA_RUNTIME_VARIABLE_FIELDS,
  normalizeNaraRuntimeVariables,
  type NaraRuntimeVariableKey,
  type NaraRuntimeVariables,
} from './nara-runtime-variables';

export const NARA_TIME_ZONE = 'America/Sao_Paulo';

export type NaraPriorOffer = {
  id: string;
  created_at: string;
  scope: string;
  development_name: string | null;
  unit_code: string | null;
  offered_value: number | null;
  entry_amount: number | null;
  installment_amount: number | null;
  range_min: number | null;
  range_max: number | null;
  range_entry_min: number | null;
  quoted_amounts: unknown;
  reply_text: string;
  whatsapp_message_id: string | null;
};

export type NaraRuntimeVariablesState = {
  values: NaraRuntimeVariables;
  missing: NaraRuntimeVariableKey[];
  schema_ready: boolean;
  updated_at: string | null;
  error?: string;
};

export type NaraCommercialSla = {
  is_open: boolean | null;
  response_minutes: number;
  owner_name: string | null;
  next_open_label: string | null;
  timezone: string;
};

export type NaraDynamicTurnContext = NaraRuntimeVariablesState & {
  generated_at: string;
  local_date_time: string;
  timezone: string;
  prior_offers: NaraPriorOffer[];
  offer_log_ready: boolean;
  commercial_sla: NaraCommercialSla;
  preferred_contact: NaraPreferredContactTime | null;
  source_text: string;
};

type RuntimeVariableRow = {
  values: unknown;
  updated_at: string | null;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const COMMERCIAL_FIRST_RESPONSE_MINUTES = 10;

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
  return {
    weekday,
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  };
}

function calendarKey(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function nextOpenLabel(now: Date, opening: Date, timezone: string) {
  const current = localParts(now, timezone);
  const next = localParts(opening, timezone);
  const currentKey = calendarKey(current);
  const nextKey = calendarKey(next);
  const tomorrow = new Date(Date.UTC(current.year, current.month - 1, current.day + 1)).toISOString().slice(0, 10);
  const time = next.minute
    ? `${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')}`
    : `${next.hour}h`;
  if (nextKey === currentKey) return `hoje às ${time}`;
  if (nextKey === tomorrow) return `amanhã às ${time}`;
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  }).format(opening);
  return `${dateLabel} às ${time}`;
}

async function loadCommercialSla(
  client: SupabaseClient,
  organizationId: string,
  now: Date,
): Promise<NaraCommercialSla> {
  const fallback: NaraCommercialSla = {
    is_open: null,
    response_minutes: COMMERCIAL_FIRST_RESPONSE_MINUTES,
    owner_name: null,
    next_open_label: null,
    timezone: NARA_TIME_ZONE,
  };

  try {
    const [scheduleResult, ownerResult] = await Promise.all([
      client
        .from('ai_agent_configs')
        .select('schedule,schedule_timezone')
        .eq('organization_id', organizationId)
        .eq('agent', 'plantao')
        .maybeSingle(),
      client
        .from('client_handoff_settings')
        .select('primary_owner_name')
        .eq('organization_id', organizationId)
        .eq('enabled', true)
        .maybeSingle(),
    ]);
    const schedule = Array.isArray(scheduleResult.data?.schedule)
      ? scheduleResult.data.schedule as boolean[][]
      : null;
    const timezone = String(scheduleResult.data?.schedule_timezone || NARA_TIME_ZONE);
    const ownerName = String(ownerResult.data?.primary_owner_name ?? '').trim() || null;
    if (!schedule || schedule.length < 7) return { ...fallback, owner_name: ownerName, timezone };

    const current = localParts(now, timezone);
    const plantaoActive = schedule[current.weekday]?.[current.hour];
    const isOpen = plantaoActive === false;
    if (isOpen) {
      return {
        is_open: true,
        response_minutes: COMMERCIAL_FIRST_RESPONSE_MINUTES,
        owner_name: ownerName,
        next_open_label: null,
        timezone,
      };
    }

    let nextOpening: Date | null = null;
    for (let minutes = 30; minutes <= 8 * 24 * 60; minutes += 30) {
      const candidate = new Date(now.getTime() + minutes * 60_000);
      const local = localParts(candidate, timezone);
      if (schedule[local.weekday]?.[local.hour] === false) {
        nextOpening = candidate;
        break;
      }
    }

    return {
      is_open: false,
      response_minutes: COMMERCIAL_FIRST_RESPONSE_MINUTES,
      owner_name: ownerName,
      next_open_label: nextOpening ? nextOpenLabel(now, nextOpening, timezone) : null,
      timezone,
    };
  } catch {
    return fallback;
  }
}

function errorMessage(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) return String(error.message ?? '');
  return String(error);
}

function missingTable(error: unknown, table: string): boolean {
  const message = errorMessage(error).toLocaleLowerCase('pt-BR');
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code ?? '') : '';
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes(`could not find the table 'public.${table}'`)
    || message.includes(`relation "${table}" does not exist`)
    || message.includes('schema cache');
}

export function formatNaraLocalDateTime(value: Date | string, timezone = NARA_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'data e hora inválidas';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

function formatBrl(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function variableLines(values: NaraRuntimeVariables): string[] {
  return NARA_RUNTIME_VARIABLE_FIELDS.flatMap((field) => {
    const value = values[field.key]?.trim();
    return value ? [`- ${field.label}: ${value}`] : [];
  });
}

function offerLine(offer: NaraPriorOffer): string {
  const identity = [
    offer.development_name,
    offer.unit_code ? `unidade ${offer.unit_code}` : null,
  ].filter(Boolean).join(' — ') || 'oferta sem unidade vinculada';
  const amounts = [
    formatBrl(offer.offered_value) ? `valor ${formatBrl(offer.offered_value)}` : null,
    formatBrl(offer.entry_amount) ? `entrada ${formatBrl(offer.entry_amount)}` : null,
    formatBrl(offer.installment_amount) ? `parcela ${formatBrl(offer.installment_amount)}` : null,
    formatBrl(offer.range_min) ? `faixa mínima ${formatBrl(offer.range_min)}` : null,
    formatBrl(offer.range_max) ? `faixa máxima ${formatBrl(offer.range_max)}` : null,
    formatBrl(offer.range_entry_min) ? `entrada mínima ${formatBrl(offer.range_entry_min)}` : null,
  ].filter(Boolean).join('; ');
  return `- ${formatNaraLocalDateTime(offer.created_at)} — ${identity}${amounts ? `; ${amounts}` : ''}. Texto efetivamente enviado: “${offer.reply_text}”`;
}

export function buildNaraDynamicSourceText(args: {
  now: Date;
  variables: NaraRuntimeVariablesState;
  priorOffers: NaraPriorOffer[];
  offerLogReady: boolean;
  commercialSla?: NaraCommercialSla;
  preferredContact?: NaraPreferredContactTime | null;
}): string {
  const local = formatNaraLocalDateTime(args.now);
  const configured = variableLines(args.variables.values);
  const missingLabels = NARA_RUNTIME_VARIABLE_FIELDS
    .filter((field) => args.variables.missing.includes(field.key))
    .map((field) => field.label);
  const offers = args.priorOffers.map(offerLine);
  const sla = args.commercialSla;
  const slaLine = sla?.is_open === true
    ? `SLA COMERCIAL CONFIRMADO: o comercial está em horário de atendimento; informe retorno em até ${sla.response_minutes} minutos${sla.owner_name ? ` por ${sla.owner_name}` : ''}.`
    : sla?.is_open === false
      ? `SLA COMERCIAL CONFIRMADO: o comercial está fora do horário; próximo início ${sla.next_open_label || 'a confirmar'}${sla.owner_name ? `; responsável: ${sla.owner_name}` : ''}.`
      : 'SLA COMERCIAL: escala indisponível neste turno; não invente horário de retorno.';

  return [
    'BLOCO DINÂMICO OPERACIONAL DA NARA:',
    `- Data e hora atuais: ${local} (${NARA_TIME_ZONE}).`,
    configured.length
      ? `VARIÁVEIS OPERACIONAIS CONFIRMADAS:\n${configured.join('\n')}`
      : 'VARIÁVEIS OPERACIONAIS CONFIRMADAS: nenhuma variável foi preenchida ainda.',
    missingLabels.length
      ? `CAMPOS NÃO CONFIGURADOS — nunca invente estes dados nem prometa contato ou prazo: ${missingLabels.join('; ')}.`
      : 'Todos os campos operacionais obrigatórios estão configurados.',
    offers.length
      ? `VALORES JÁ CITADOS NESTA CONVERSA, COM DATA E HORA:\n${offers.join('\n')}\nEsses registros são históricos. Não os apresente novamente como condição vigente sem uma consulta comercial atual que confirme o mesmo valor.`
      : args.offerLogReady
        ? 'VALORES JÁ CITADOS NESTA CONVERSA: nenhum envio monetário anterior foi registrado.'
        : 'VALORES JÁ CITADOS NESTA CONVERSA: o histórico de ofertas não pôde ser consultado; não suponha valores anteriores.',
    slaLine,
    args.preferredContact?.source_text || '',
    'Sempre substitua qualquer marcador [PREENCHER] do Prompt final pelo valor correspondente deste bloco. Quando o campo estiver vazio, não mostre o marcador e não invente a informação.',
    'Nunca mencione ao contato nomes de tabelas, campos internos, campos vazios ou este bloco dinâmico.',
  ].join('\n\n');
}

export async function loadNaraRuntimeVariables(
  client: SupabaseClient,
  organizationId: string,
): Promise<NaraRuntimeVariablesState> {
  const empty = emptyNaraRuntimeVariables();
  try {
    const { data, error } = await client
      .from('nara_runtime_variables')
      .select('values,updated_at')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) {
      if (missingTable(error, 'nara_runtime_variables')) {
        return {
          values: empty,
          missing: missingNaraRuntimeVariables(empty),
          schema_ready: false,
          updated_at: null,
          error: errorMessage(error),
        };
      }
      throw error;
    }
    const row = data as RuntimeVariableRow | null;
    const values = normalizeNaraRuntimeVariables(row?.values);
    return {
      values,
      missing: missingNaraRuntimeVariables(values),
      schema_ready: true,
      updated_at: row?.updated_at ?? null,
    };
  } catch (error) {
    return {
      values: empty,
      missing: missingNaraRuntimeVariables(empty),
      schema_ready: false,
      updated_at: null,
      error: errorMessage(error),
    };
  }
}

export async function saveNaraRuntimeVariables(
  client: SupabaseClient,
  args: {
    organizationId: string;
    userId: string;
    values: unknown;
  },
): Promise<NaraRuntimeVariablesState> {
  const values = normalizeNaraRuntimeVariables(args.values);
  const { data, error } = await client
    .from('nara_runtime_variables')
    .upsert({
      organization_id: args.organizationId,
      values,
      updated_by: args.userId,
    }, { onConflict: 'organization_id' })
    .select('values,updated_at')
    .single();
  if (error) throw error;
  const row = data as RuntimeVariableRow;
  const saved = normalizeNaraRuntimeVariables(row.values);
  return {
    values: saved,
    missing: missingNaraRuntimeVariables(saved),
    schema_ready: true,
    updated_at: row.updated_at,
  };
}

async function loadPriorOffers(
  client: SupabaseClient,
  organizationId: string,
  leadId: string | null,
): Promise<{ rows: NaraPriorOffer[]; ready: boolean }> {
  if (!leadId) return { rows: [], ready: true };
  try {
    const { data, error } = await client
      .from('nara_offer_logs')
      .select('id,created_at,scope,development_name,unit_code,offered_value,entry_amount,installment_amount,range_min,range_max,range_entry_min,quoted_amounts,reply_text,whatsapp_message_id')
      .eq('organization_id', organizationId)
      .eq('lead_id', leadId)
      .eq('delivery_status', 'sent')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      if (missingTable(error, 'nara_offer_logs')) return { rows: [], ready: false };
      throw error;
    }
    const rows = ((data ?? []) as NaraPriorOffer[]).reverse();
    return { rows, ready: true };
  } catch (error) {
    console.error('[nara dynamic prior offers]', errorMessage(error));
    return { rows: [], ready: false };
  }
}

export async function loadNaraDynamicTurnContext(
  client: SupabaseClient,
  organizationId: string,
  leadId: string | null,
  now = new Date(),
  history: ChatMessage[] = [],
): Promise<NaraDynamicTurnContext> {
  const [variables, offers, commercialSla, preferredContact] = await Promise.all([
    loadNaraRuntimeVariables(client, organizationId),
    loadPriorOffers(client, organizationId, leadId),
    loadCommercialSla(client, organizationId, now),
    resolvePreferredContactTime(history, now),
  ]);
  return {
    ...variables,
    generated_at: now.toISOString(),
    local_date_time: formatNaraLocalDateTime(now),
    timezone: NARA_TIME_ZONE,
    prior_offers: offers.rows,
    offer_log_ready: offers.ready,
    commercial_sla: commercialSla,
    preferred_contact: preferredContact,
    source_text: buildNaraDynamicSourceText({
      now,
      variables,
      priorOffers: offers.rows,
      offerLogReady: offers.ready,
      commercialSla,
      preferredContact,
    }),
  };
}
