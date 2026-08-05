import type { SupabaseClient } from '@supabase/supabase-js';
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

export type NaraDynamicTurnContext = NaraRuntimeVariablesState & {
  generated_at: string;
  local_date_time: string;
  timezone: string;
  prior_offers: NaraPriorOffer[];
  offer_log_ready: boolean;
  source_text: string;
};

type RuntimeVariableRow = {
  values: unknown;
  updated_at: string | null;
};

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
}): string {
  const local = formatNaraLocalDateTime(args.now);
  const configured = variableLines(args.variables.values);
  const missingLabels = NARA_RUNTIME_VARIABLE_FIELDS
    .filter((field) => args.variables.missing.includes(field.key))
    .map((field) => field.label);
  const offers = args.priorOffers.map(offerLine);

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
      .order('created_at', { ascending: true })
      .limit(20);
    if (error) {
      if (missingTable(error, 'nara_offer_logs')) return { rows: [], ready: false };
      throw error;
    }
    return { rows: (data ?? []) as NaraPriorOffer[], ready: true };
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
): Promise<NaraDynamicTurnContext> {
  const [variables, offers] = await Promise.all([
    loadNaraRuntimeVariables(client, organizationId),
    loadPriorOffers(client, organizationId, leadId),
  ]);
  return {
    ...variables,
    generated_at: now.toISOString(),
    local_date_time: formatNaraLocalDateTime(now),
    timezone: NARA_TIME_ZONE,
    prior_offers: offers.rows,
    offer_log_ready: offers.ready,
    source_text: buildNaraDynamicSourceText({
      now,
      variables,
      priorOffers: offers.rows,
      offerLogReady: offers.ready,
    }),
  };
}
