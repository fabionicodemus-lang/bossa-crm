import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NaraCommercialTurnContext,
  NaraDevelopmentRange,
  NaraUnitOffer,
} from './nara-unit-queries';

type MoneyCitation = {
  field: string;
  amount: number;
  token: string;
};

export type NaraOfferAuditRecord = {
  scope: 'range' | 'unit' | 'unstructured';
  source_call: string;
  development_name: string | null;
  unit_code: string | null;
  offered_value: number | null;
  entry_amount: number | null;
  installment_amount: number | null;
  range_min: number | null;
  range_max: number | null;
  range_entry_min: number | null;
  quoted_amounts: MoneyCitation[];
};

type PrepareOfferAuditArgs = {
  organizationId: string;
  leadId: string;
  conversationId: string;
  reply: string;
  commercial?: NaraCommercialTurnContext | null;
};

const MONEY_PATTERN = /R\$\s*\d[\d.\s]*(?:,\d{1,2})?\s*(?:milh(?:ao|ão|oes|ões)|mil)?|\b\d+(?:[.,]\d+)?\s*(?:milh(?:ao|ão|oes|ões)|mil)\b/giu;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function amountFromToken(token: string): number | null {
  const normalized = normalizeText(token).replace(/r\$\s*/, '').trim();
  const multiplier = /milhao|milhoes/.test(normalized) ? 1_000_000 : /\bmil\b/.test(normalized) ? 1_000 : 1;
  const withoutScale = normalized.replace(/\s*(milhao|milhoes|mil)\b/g, '').trim();
  const numeric = withoutScale.match(/\d[\d.]*?(?:,\d{1,2})?(?=\s|$)/)?.[0]
    ?? withoutScale.match(/\d+(?:[.,]\d+)?/)?.[0]
    ?? '';
  if (!numeric) return null;
  const cleanNumeric = numeric.replace(/\.+$/, '');
  const parsed = cleanNumeric.includes(',')
    ? Number(cleanNumeric.replace(/\./g, '').replace(',', '.'))
    : multiplier === 1 && /^\d{1,3}(?:\.\d{3})+$/.test(cleanNumeric)
      ? Number(cleanNumeric.replace(/\./g, ''))
      : Number(cleanNumeric);
  return Number.isFinite(parsed) ? Math.round(parsed * multiplier * 100) / 100 : null;
}

function moneyCitations(reply: string): MoneyCitation[] {
  const tokens = reply.match(MONEY_PATTERN) ?? [];
  const unique = new Map<number, MoneyCitation>();
  for (const token of tokens) {
    const amount = amountFromToken(token);
    if (amount === null || amount <= 0 || unique.has(amount)) continue;
    unique.set(amount, { field: 'unclassified', amount, token: token.trim() });
  }
  return [...unique.values()];
}

function cited(citations: MoneyCitation[], amount: number | null | undefined): MoneyCitation | null {
  if (!amount || !Number.isFinite(amount)) return null;
  const rounded = Math.round(amount * 100) / 100;
  return citations.find((item) => item.amount === rounded) ?? null;
}

function offerList(result: NaraUnitOffer[] | NaraUnitOffer | NaraDevelopmentRange | null): NaraUnitOffer[] {
  if (Array.isArray(result)) return result;
  if (result && 'unidade' in result) return [result as NaraUnitOffer];
  return [];
}

export function buildNaraOfferAuditRecords(
  reply: string,
  commercial?: NaraCommercialTurnContext | null,
): NaraOfferAuditRecord[] {
  const citations = moneyCitations(reply);
  if (!citations.length) return [];
  const matched = new Set<number>();
  const records: NaraOfferAuditRecord[] = [];

  for (const call of commercial?.calls ?? []) {
    if (call.name === 'faixa_empreendimento' && call.result && !Array.isArray(call.result) && 'valor_minimo' in call.result) {
      const range = call.result as NaraDevelopmentRange;
      const min = cited(citations, range.valor_minimo);
      const max = cited(citations, range.valor_maximo);
      const entry = cited(citations, range.entrada_minima);
      const quoted = [
        min && { ...min, field: 'range_min' },
        max && { ...max, field: 'range_max' },
        entry && { ...entry, field: 'range_entry_min' },
      ].filter(Boolean) as MoneyCitation[];
      if (quoted.length) {
        quoted.forEach((item) => matched.add(item.amount));
        records.push({
          scope: 'range',
          source_call: call.name,
          development_name: range.empreendimento,
          unit_code: null,
          offered_value: null,
          entry_amount: null,
          installment_amount: null,
          range_min: min ? range.valor_minimo : null,
          range_max: max ? range.valor_maximo : null,
          range_entry_min: entry ? range.entrada_minima : null,
          quoted_amounts: quoted,
        });
      }
    }

    for (const offer of offerList(call.result)) {
      const value = cited(citations, offer.valor);
      const entry = cited(citations, offer.entrada);
      const installment = cited(citations, offer.parcela_media);
      const quoted = [
        value && { ...value, field: 'offered_value' },
        entry && { ...entry, field: 'entry_amount' },
        installment && { ...installment, field: 'installment_amount' },
      ].filter(Boolean) as MoneyCitation[];
      if (!quoted.length) continue;
      quoted.forEach((item) => matched.add(item.amount));
      records.push({
        scope: 'unit',
        source_call: call.name,
        development_name: offer.empreendimento,
        unit_code: offer.unidade,
        offered_value: value ? offer.valor : null,
        entry_amount: entry ? offer.entrada : null,
        installment_amount: installment ? offer.parcela_media : null,
        range_min: null,
        range_max: null,
        range_entry_min: null,
        quoted_amounts: quoted,
      });
    }
  }

  const unmatched = citations.filter((item) => !matched.has(item.amount));
  if (unmatched.length) {
    records.push({
      scope: 'unstructured',
      source_call: commercial?.calls.length ? 'user_or_knowledge' : 'without_commercial_query',
      development_name: null,
      unit_code: null,
      offered_value: null,
      entry_amount: null,
      installment_amount: null,
      range_min: null,
      range_max: null,
      range_entry_min: null,
      quoted_amounts: unmatched,
    });
  }
  return records;
}

export async function prepareNaraOfferAudit(
  client: SupabaseClient,
  args: PrepareOfferAuditArgs,
): Promise<string[]> {
  const records = buildNaraOfferAuditRecords(args.reply, args.commercial);
  if (!records.length) return [];
  const createdAt = new Date().toISOString();
  const payload = records.map((record) => ({
    organization_id: args.organizationId,
    lead_id: args.leadId,
    conversation_id: args.conversationId,
    scope: record.scope,
    source_call: record.source_call,
    development_name: record.development_name,
    unit_code: record.unit_code,
    offered_value: record.offered_value,
    entry_amount: record.entry_amount,
    installment_amount: record.installment_amount,
    range_min: record.range_min,
    range_max: record.range_max,
    range_entry_min: record.range_entry_min,
    quoted_amounts: record.quoted_amounts,
    reply_text: args.reply,
    source_calls: args.commercial?.calls ?? [],
    delivery_status: 'pending',
    created_at: createdAt,
  }));
  const { data, error } = await client.from('nara_offer_logs').insert(payload).select('id');
  if (error) throw new Error(`Não foi possível registrar a oferta antes do envio: ${error.message}`);
  return (data ?? []).map((row) => String(row.id)).filter(Boolean);
}

export async function markNaraOfferAuditSent(
  client: SupabaseClient,
  ids: string[],
  whatsappMessageId: string | null,
): Promise<void> {
  if (!ids.length) return;
  const { error } = await client.from('nara_offer_logs').update({
    delivery_status: 'sent',
    whatsapp_message_id: whatsappMessageId,
    sent_at: new Date().toISOString(),
    failure_reason: null,
  }).in('id', ids);
  if (error) throw error;
}

export async function markNaraOfferAuditFailed(
  client: SupabaseClient,
  ids: string[],
  error: unknown,
): Promise<void> {
  if (!ids.length) return;
  const reason = error instanceof Error ? error.message : String(error);
  const { error: updateError } = await client.from('nara_offer_logs').update({
    delivery_status: 'failed',
    failure_reason: reason.slice(0, 1000),
  }).in('id', ids);
  if (updateError) throw updateError;
}
