import type { Lead } from './types';
import { isAssistedSaleSignal, isBrokerRoutingSignal, normalizeNaraRoutingText as norm } from './nara-contact-routing';
import { isCompletePaymentQuote, paymentQuoteSum, type PaymentTableQuote } from './unit-payment-tables';

export type PurchaseRelationship = 'direct_confirmed' | 'intermediated' | 'unknown';
export type DirectPurchaseCondition = {
  relationship: PurchaseRelationship;
  discount_bps: 400;
  original_value: number;
};
type Message = { role: 'user' | 'assistant'; content: string };

export function isPurchaseRelationshipAnswer(history: Message[]): boolean {
  const latest = [...history].reverse().find((m) => m.role === 'user');
  if (!latest) return false;
  const text = norm(latest.content);
  if (/\b(?:nao tenho (?:um |uma |nenhum |nenhuma )?corretor[a]?|sem corretor[a]?|cliente diret[oa])\b/.test(text)) return true;
  const previous = history[history.lastIndexOf(latest) - 1];
  return previous?.role === 'assistant' && /\bvoce (?:ja )?(?:esta sendo atendid[oa] por|tem|esta com)\b.{0,30}\bcorretor[a]?\b/.test(norm(previous.content))
    && /^(?:nao|nenhum|nenhuma|sim|tenho|estou)[.! ,]*$/.test(text);
}

/** Absence of a broker field, an ad click or a wish to buy directly is not confirmation. */
export function purchaseRelationship(lead: Pick<Lead, 'kind' | 'source' | 'creci' | 'metadata'>, history: Message[]): PurchaseRelationship {
  const metadata = lead.metadata ?? {};
  if (lead.kind === 'corretor' || lead.creci || metadata.contact_kind_manually_confirmed === 'corretor'
    || metadata.client_broker_transfer_verified === true || metadata.client_broker_transfer_status
    || metadata.broker_id || metadata.referred_by_broker_id || metadata.commission_required === true
    || /\b(corretor|corretora|imobiliaria)\b/.test(norm(lead.source))) return 'intermediated';
  let direct = false;
  for (let index = 0; index < history.length; index += 1) {
    const message = history[index];
    if (message.role !== 'user') continue;
    const text = norm(message.content);
    const withoutDenial = text.replace(/\bnao (?:tenho|estou com|sou atendid[oa] por|fui indicad[oa] por)\s+(?:(?:um|uma|nenhum|nenhuma)\s+)?(?:corretor[a]?|imobiliaria)\b/g, ' ')
      .replace(/\bsem (?:corretor[a]?|imobiliaria|intermediacao|comissao)\b/g, ' ');
    if (isAssistedSaleSignal(withoutDenial) || isBrokerRoutingSignal(withoutDenial)
      || /\b(?:meu corretor|minha corretora|minha imobiliaria|tenho (?:um |uma )?corretor[a]?|estou com (?:um |uma )?corretor[a]?|(?:atendid[oa]|acompanhad[oa]) (?:por|pela?|com) (?:um |uma )?(?:corretor[a]?|imobiliaria))\b/.test(withoutDenial)) return 'intermediated';
    const question = index > 0 && history[index - 1].role === 'assistant' ? norm(history[index - 1].content) : '';
    const askedBroker = /\bvoce (?:ja )?(?:esta sendo atendid[oa] por|tem|esta com)\b.{0,30}\bcorretor[a]?\b/.test(question);
    if (askedBroker && /^(?:sim|tenho|estou)(?:[.! ,]|$)/.test(text)) return 'intermediated';
    if (/\bnao (?:tenho|estou com|sou atendid[oa] por|fui indicad[oa] por)\s+(?:(?:um|uma|nenhum|nenhuma)\s+)?(?:corretor[a]?|imobiliaria)\b/.test(text)
      || /\b(?:estou|compro|comprando|compra|negocio|negociacao)\b.{0,45}\bsem (?:corretor[a]?|intermediacao)\b/.test(text)
      || /\bsou (?:um |uma )?cliente diret[oa]\b/.test(text)
      || (askedBroker && /^(?:nao|nenhum|nenhuma)(?:[.! ,]|$)/.test(text))) direct = true;
  }
  return direct ? 'direct_confirmed' : 'unknown';
}

export function hasDirectPurchasePolicy(plan: unknown): boolean {
  if (!plan || typeof plan !== 'object') return false;
  const policy = (plan as Record<string, unknown>).direct_purchase as Record<string, unknown> | undefined;
  return policy?.version === 1 && policy.approved === true && policy.discount_bps === 400 && policy.table_commission_bps === 500;
}

/** The manager approved 4% of each plan, not the full 5% commission. Apply once. */
export function directPurchaseCents(cents: number): number {
  return Number((BigInt(cents) * 96n + 50n) / 100n);
}

export function directPurchaseQuote(quote: PaymentTableQuote): PaymentTableQuote {
  if (!isCompletePaymentQuote(quote)) return { ...quote, totalCents: directPurchaseCents(quote.totalCents) };
  const result = { ...quote, totalCents: directPurchaseCents(quote.totalCents),
    entryCents: directPurchaseCents(quote.entryCents), installmentCents: directPurchaseCents(quote.installmentCents),
    lastInstallmentCents: directPurchaseCents(quote.lastInstallmentCents),
    reinforcementCents: directPurchaseCents(quote.reinforcementCents), keysCents: directPurchaseCents(quote.keysCents) };
  if (result.installmentCount) result.lastInstallmentCents += result.totalCents - paymentQuoteSum(result);
  result.complete = isCompletePaymentQuote(result);
  return result;
}
