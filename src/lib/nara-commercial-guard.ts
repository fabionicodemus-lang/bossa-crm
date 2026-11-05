import type { NaraCommercialTurnContext, NaraDevelopmentRange, NaraUnitOffer } from './nara-unit-queries';
import { enterpriseInFocus } from './nara-conversation-signals';
import { naraConversationLanguage, type NaraLanguage } from './nara-language';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** The lookup belongs to this turn. An old conversation is never a price source. */
export const NARA_COMMERCIAL_CONTEXT_MAX_AGE_MS = 5 * 60_000;
const CLOCK_SKEW_MS = 60_000;

export type NaraCommercialGuardOptions = {
  now?: Date | number | string;
  maxAgeMs?: number;
  language?: NaraLanguage;
  /** Trusted lead context, used only when the conversation has no project in focus. */
  enterprise?: string | null;
};

export type NaraCommercialValidation = {
  valid: boolean;
  reasons: string[];
  offers: NaraUnitOffer[];
  ranges: NaraDevelopmentRange[];
  requestedEnterprise: string | null;
  requestedUnit: string | null;
  requestedUnits: string[];
  consultedAt: string | null;
};

export type NaraCommercialGuardResult = {
  reply: string;
  changed: boolean;
  commercial: boolean;
  reasons: string[];
  source: 'model' | 'crm' | 'unconfirmed';
};

function norm(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function projectKey(value: unknown): string {
  const text = norm(value);
  const matches = ['flow', 'alma', 'soul'].filter((name) => new RegExp(`\\b${name}\\b`).test(text));
  return matches.length === 1 ? matches[0] : matches.length ? '' : text;
}

function projectNames(value: string): string[] {
  return [...norm(value).matchAll(/\b(flow|alma|soul)\b/g)].map((item) => item[1]).filter((item, index, all) => all.indexOf(item) === index);
}

function lastUserText(history: ChatMessage[]): string {
  return [...history].reverse().find((message) => message.role === 'user')?.content ?? '';
}

function moneyMatches(value: string): RegExpMatchArray[] {
  return [...norm(value).matchAll(/(?:r\$|brl|us\$|usd|eur|€|\$)\s*\d(?:[\d.,]*\d)?(?:\s*(?:milhoes?|milhao|mil|million|thousand|k))?|\b\d(?:[\d.,]*\d)?\s*(?:milhoes?|milhao|mil|million|thousand|reais|dolares|dollars|euros|k)\b/g)];
}

/** Strict, locale-aware parsing used only for attribution of a customer's own budget. */
export function parseNaraMoneyToCents(value: string): number | null {
  const text = norm(value).replace(/^(?:r\$|brl)\s*/, '').replace(/\s*reais$/, '').trim();
  const match = text.match(/^(\d[\d.,]*)(?:\s*(milhoes?|milhao|mil|million|thousand|k))?$/);
  if (!match) return null;
  const multiplier = /milhao|milhoes|million/.test(match[2] ?? '') ? 1_000_000 : match[2] ? 1_000 : 1;
  const raw = match[1];
  let numeric: string;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw)) numeric = raw.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(raw)) numeric = raw.replace(/,/g, '');
  else if (/^\d+(?:[.,]\d{1,2})?$/.test(raw)) numeric = raw.replace(',', '.');
  else return null;
  const cents = Math.round(Number(numeric) * multiplier * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function unitInText(text: string): string | null {
  const value = norm(text);
  const explicit = value.match(/\b(?:unidade|apto|apartamento|unit|apartment|departamento)\s*(?:n(?:umero)?\s*)?(\d{2,4}[a-z]?)\b/);
  if (explicit) return explicit[1];
  // A payment, year, area or floor must not be interpreted as a unit number.
  const stripped = value.replace(/(?:r\$|brl|us\$|usd|eur|€|\$)\s*\d[\d.,]*(?:\s*(?:milhoes?|milhao|mil|million|thousand|k))?|\b\d[\d.,]*\s*(?:milhoes?|milhao|mil|million|thousand|reais|dolares|dollars|euros|k|m2|m²|metros|meses|months|anos|years|parcelas|vezes|%|x)\b/g, ' ');
  const candidate = stripped.match(/(?:^|\b(?:o|a|do|da|the|el|del))\s*(\d{3,4}[a-z]?)\b/)?.[1];
  return candidate && !/^20(?:2\d|3\d)$/.test(candidate) ? candidate : null;
}

function multipleUnitCodes(text: string): string[] {
  const value = norm(text).replace(/(?:r\$|brl|us\$|usd|eur|€|\$)\s*\d(?:[\d.,]*\d)?(?:\s*(?:milhoes?|milhao|mil|million|thousand|k))?|\b\d(?:[\d.,]*\d)?\s*(?:milhoes?|milhao|mil|million|thousand|reais|dolares|dollars|euros|k|m2|m²|metros|meses|months|anos|years|parcelas|vezes|%|x)\b/g, ' ');
  const explicit = [...value.matchAll(/\b(?:unidades?|aptos?|apartamentos?|units?|apartments?|departamentos?)\s*(?:n(?:umero)?\s*)?(\d{2,4}[a-z]?)\b/g)].map((item) => item[1]);
  const lists = [...value.matchAll(/\b\d{3,4}[a-z]?(?:\s*(?:,|e|ou|and|or|y|o|versus|vs)\s*\d{3,4}[a-z]?)+\b/g)];
  const codes = [...explicit, ...lists.flatMap((list) => list[0].match(/\b\d{3,4}[a-z]?\b/g) ?? [])].filter((item) => !/^20(?:2\d|3\d)$/.test(item));
  return [...new Set(codes)];
}

function requestIdentity(history: ChatMessage[], fallback?: string | null) {
  const latest = lastUserText(history);
  const projects = projectNames(latest);
  const focus = projects.length === 1 ? projects[0] : enterpriseInFocus(history) || projectKey(fallback) || null;
  let unit = unitInText(latest);
  const units = multipleUnitCodes(latest);
  const asksRange = /\b(faixa|a partir de|mais barat[oa]|menor preco|mais car[oa]|maior (?:preco|valor)|maximo|outras opcoes|starting price|price range|cheapest|highest|maximum|desde|rango de precios|mas car[oa]|mayor (?:precio|valor))\b/.test(norm(latest));
  // An explicit new project resets the old unit; otherwise retain an unambiguous unit reference.
  if (!unit && !projects.length && !asksRange) {
    for (const message of [...history].reverse().filter((item) => item.role === 'user')) {
      const olderProjects = projectNames(message.content);
      if (olderProjects.length && (olderProjects.length !== 1 || olderProjects[0] !== focus)) break;
      unit = unitInText(message.content);
      if (unit || olderProjects.length) break;
    }
  }
  if (units.length > 1) unit = null;
  else if (unit && !units.length) units.push(unit);
  return { focus, projects: projects.length > 1 ? projects : focus ? [focus] : [], unit, units, ambiguous: Boolean(units.length && (!focus || projects.length > 1)) };
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
    || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6] ?? 0) > 59) return Number.NaN;
  return Date.parse(value);
}

/** End of the stated calendar day in São Paulo; date-only validity remains valid that whole day. */
function validUntil(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return Number.NaN;
  const text = value.trim();
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const brazilian = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dateOnly || brazilian) {
    const year = Number(dateOnly?.[1] ?? brazilian?.[3]);
    const month = Number(dateOnly?.[2] ?? brazilian?.[2]);
    const day = Number(dateOnly?.[3] ?? brazilian?.[1]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return Number.NaN;
    return Date.UTC(year, month - 1, day + 1, 3) - 1;
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) ? timestamp(text) : Number.NaN;
}

function cleanLabel(value: unknown, max = 120): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\r\n<>$€]/.test(value);
}

function positiveMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && Number.isSafeInteger(Math.round(value * 100))
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.0001;
}

function validOffer(value: NaraUnitOffer, now: number, consulted: number): boolean {
  if (!value || typeof value !== 'object' || !cleanLabel(value.empreendimento) || !projectKey(value.empreendimento)) return false;
  if (!cleanLabel(value.unidade, 20) || !/^[\p{L}\p{N}][\p{L}\p{N}./-]*$/u.test(value.unidade)) return false;
  if (!positiveMoney(value.valor)) return false;
  const expiry = validUntil(value.validade_tabela);
  if (expiry !== null && (!Number.isFinite(expiry) || expiry < now)) return false;
  if (value.preco_atualizado_em) {
    const updated = timestamp(value.preco_atualizado_em);
    if (!Number.isFinite(updated) || updated > consulted + CLOCK_SKEW_MS) return false;
  }
  return true;
}

function validRange(value: NaraDevelopmentRange, now: number): boolean {
  if (!value || typeof value !== 'object' || !cleanLabel(value.empreendimento) || !projectKey(value.empreendimento)) return false;
  if (!positiveMoney(value.valor_minimo) || !positiveMoney(value.valor_maximo) || value.valor_maximo < value.valor_minimo) return false;
  if (!Number.isSafeInteger(value.qtd_disponiveis) || value.qtd_disponiveis < 1) return false;
  const expiry = validUntil(value.validade_tabela);
  return expiry === null || (Number.isFinite(expiry) && expiry >= now);
}

/** Validate fields and identity, not whether a number happened to occur in a text corpus. */
export function validateNaraCommercialContext(
  commercial: NaraCommercialTurnContext | null | undefined,
  history: ChatMessage[] = [],
  options: NaraCommercialGuardOptions = {},
): NaraCommercialValidation {
  const identity = requestIdentity(history, options.enterprise);
  const result: NaraCommercialValidation = {
    valid: false, reasons: [], offers: [], ranges: [], requestedEnterprise: identity.focus,
    requestedUnit: identity.unit, requestedUnits: identity.units, consultedAt: commercial?.consulted_at ?? null,
  };
  if (identity.ambiguous) result.reasons.push('ambiguous_unit');
  if (!commercial) result.reasons.push('missing_commercial_context');
  if (result.reasons.length) return result;
  const context = commercial!;
  const now = options.now instanceof Date ? options.now.getTime() : typeof options.now === 'string' ? timestamp(options.now) : options.now ?? Date.now();
  const consulted = typeof context.consulted_at === 'string' ? timestamp(context.consulted_at) : Number.NaN;
  const maxAge = options.maxAgeMs ?? NARA_COMMERCIAL_CONTEXT_MAX_AGE_MS;
  if (!Number.isFinite(now) || !Number.isFinite(consulted) || !Number.isFinite(maxAge) || maxAge < 0) result.reasons.push('invalid_consultation_time');
  else if (consulted > now + CLOCK_SKEW_MS || now - consulted > maxAge) result.reasons.push('stale_commercial_context');
  if (context.source_table !== 'development_units') result.reasons.push('invalid_commercial_source');
  if (context.blocked_reason || context.status === 'blocked') result.reasons.push('blocked_commercial_context');
  else if (context.status === 'ambiguous') result.reasons.push('ambiguous_unit');
  else if (context.error || context.status === 'error') result.reasons.push('commercial_query_failed');
  else if (context.status === 'empty') result.reasons.push(identity.unit ? 'unit_not_confirmed' : 'no_verified_offer');
  if (!Array.isArray(context.calls)) result.reasons.push('invalid_commercial_calls');
  if (result.reasons.length) return result;

  let inconsistent = false;
  const offers = new Map<string, NaraUnitOffer>();
  const ranges = new Map<string, NaraDevelopmentRange>();
  for (const call of context.calls) {
    if (!call || !call.result) continue;
    const requestedProject = projectKey(call.arguments?.empreendimento);
    if (!requestedProject || (identity.projects.length && !identity.projects.includes(requestedProject))) continue;
    if (call.name === 'faixa_empreendimento' && !Array.isArray(call.result) && 'valor_minimo' in call.result && !identity.units.length) {
      const range = call.result as NaraDevelopmentRange;
      if (projectKey(range.empreendimento) !== requestedProject || !validRange(range, now)) { inconsistent = true; continue; }
      const previous = ranges.get(requestedProject);
      if (previous && (previous.valor_minimo !== range.valor_minimo || previous.valor_maximo !== range.valor_maximo)) inconsistent = true;
      ranges.set(requestedProject, range);
    } else if (call.name === 'buscar_apartamentos' || call.name === 'consultar_apartamento') {
      if ((call.name === 'buscar_apartamentos') !== Array.isArray(call.result)) { inconsistent = true; continue; }
      const rows = Array.isArray(call.result) ? call.result : [call.result];
      for (const row of rows) {
        if (!row || typeof row !== 'object' || !('unidade' in row)) { inconsistent = true; continue; }
        const offer = row as NaraUnitOffer;
        const unit = norm(offer.unidade);
        if (projectKey(offer.empreendimento) !== requestedProject || !validOffer(offer, now, consulted)) { inconsistent = true; continue; }
        if (call.name === 'consultar_apartamento' && unit !== norm(call.arguments?.unidade)) { inconsistent = true; continue; }
        if (identity.units.length && !identity.units.includes(unit)) continue;
        const key = `${requestedProject}:${unit}`;
        const previous = offers.get(key);
        if (previous && JSON.stringify(previous) !== JSON.stringify(offer)) inconsistent = true;
        offers.set(key, offer);
      }
    }
  }
  if (inconsistent) result.reasons.push('inconsistent_or_expired_commercial_data');
  if (identity.units.length > 1 && identity.units.some((unit) => ![...offers.values()].some((offer) => norm(offer.unidade) === unit))) result.reasons.push('multiple_units_not_confirmed');
  if (result.reasons.length) return result;
  result.offers = identity.units.length ? [...offers.values()] : [...offers.values()].slice(0, 3);
  result.ranges = [...ranges.values()].slice(0, 3);
  result.valid = result.offers.length > 0 || result.ranges.length > 0;
  if (!result.valid) result.reasons.push(identity.unit ? 'unit_not_confirmed' : 'no_verified_offer');
  return result;
}

const FINANCIAL_TERMS = /\b(precos?|precios?|prices?|valores?|custa|custos?|costs?|pagamentos?|payments?|pagos?|entradas?|down payments?|parcel(?:as?|amento|ar|ado)|presta(?:cao|coes)|cuotas?|installments?|mensais|mensal|reforcos?|balao|baloes|juros|interest|intereses?|correcao|reajuste|cub|ipca|descontos?|discounts?|descuentos?|comissao|commission|a vista|al contado)\b/;
const SAFE_FINANCIAL_REFUSAL = /\b(nao (?:posso|consigo|podemos|conseguimos|vou|tenho como) (?:\w+\s+){0,3}(?:aprovar|garantir|confirmar|prometer|oferecer)|(?:precisa|depende|necessita) (?:de |da |ser )?(?:aprovacao|confirmacao|validacao|confirmad|aprovad)|(?:comercial|equipe|time) (?:pode |vai |precisa )?(?:avaliar|confirmar|analisar)|no puedo (?:aprobar|confirmar|garantizar)|(?:necesita|requiere) (?:aprobacion|confirmacion)|(?:cannot|can't|can not) (?:approve|confirm|guarantee)|(?:requires?|needs?) (?:approval|confirmation))\b/;

function financialSignalText(value: string): string {
  let text = norm(value);
  // An apartment entrance is architectural when describing its access/layout. Do not
  // exempt the same words in payment questions such as "qual a entrada do apartamento?".
  if (/\b(porta|acesso|sala|corredor|hall|portaria|fachada|porta[oã]|largura)\b/.test(text)
    || /\bcomo (?:e|sera) (?:a )?entrada (?:do apartamento|do apto|da unidade|da casa|do imovel)\b/.test(text)) {
    text = text.replace(/\b(?:porta de entrada|entrada (?:do apartamento|do apto|da unidade|da casa|do imovel|da sala|do quarto))\b/g, ' ');
  }
  return text.replace(/\b(?:hall de entrada|entrada (?:principal|do predio|do edificio|da garagem|de pedestres|do empreendimento|da torre)|entrance hall|main entrance)\b/g, ' ');
}

/** A conservative trigger, not a claim that regex can prove all natural-language semantics. */
export function naraReplyNeedsCommercialProtection(reply: string, history: ChatMessage[] = []): boolean {
  if (asksForQuote(lastUserText(history))) return true;
  const value = financialSignalText(reply);
  if (moneyMatches(value).length) return true;
  if (/\b(?:fecho|fechamos|faco|pode levar|consigo(?: fazer)?|sai|fica|aceito|aceitamos|deixo|deixamos)\s+(?:por|em)\s+(?:\d|um\b|uma\b|dois\b|duas\b|tres\b|quatro\b|cinco\b|seis\b|sete\b|oito\b|nove\b|dez\b|vinte\b|trinta\b|quarenta\b|cinquenta\b|sessenta\b|setenta\b|oitenta\b|noventa\b|cem\b|cento\b|duzentos\b|trezentos\b|quatrocentos\b|quinhentos\b|seiscentos\b|setecentos\b|oitocentos\b|novecentos\b|mil\b)/.test(value)) return true;
  if (/\d+(?:[.,]\d+)?\s*%/.test(value)
    && (FINANCIAL_TERMS.test(value) || /\b(consigo|conseguimos|ofereco|oferecemos|garanto|garantimos|faco|fecho|fechamos|pode levar|can offer|can do|ofrezco|ofrecemos)\b/.test(value))) return true;
  if (/\b(?:milhao|milhoes|million|mil|reais|dolares|dollars|euros)\b/.test(value) && FINANCIAL_TERMS.test(value)) return true;
  const clauses = value.split(/(?<=[.!?;])\s+|;\s*|,(?!\d)\s*|\b(?:mas|porem|but|pero)\b|\b(?:e|and|y)\s+(?=(?:(?:o|a|os|as|the|el|la|los|las)\s+)?(?:precos?|valores?|pagamento|saldo|entradas?|parcelas?|juros|comercial|equipe|time|eu|nos|voce|consigo|conseguimos|ofereco|podemos|i|we|you)\b)/);
  return clauses.some((clause) => {
    if (!FINANCIAL_TERMS.test(clause)) return false;
    // A proposal phrased as a question still quotes a commercial condition.
    if (/\d/.test(clause)) return true;
    // Only a genuine, scoped refusal may contain an unconfirmed condition as its
    // object. A later positive clause is checked independently, never whitelisted.
    if (/^\s*(?:(?:eu|nos|i|we)\s+)?(?:ainda\s+)?(?:nao (?:posso|consigo|podemos|conseguimos|vou|tenho como) (?:\w+\s+){0,3}(?:aprovar|garantir|confirmar|prometer|oferecer)|no puedo (?:aprobar|confirmar|garantizar)|(?:cannot|can't|can not) (?:approve|confirm|guarantee))\b/.test(clause)) return false;
    // Absence of charges is itself a commercial promise, even though it contains a negation.
    if (/\b(sem (?:juros|correcao|reajuste|reforcos?|balao|entrada)|nao (?:tem|ha|existe|cobramos) (?:juros|correcao|reforcos?|balao)|juros zero|zero interest|interest.free|no interest|sin (?:intereses|ajuste)|preco (?:fixo|garantido)|price (?:fixed|guaranteed)|entrada (?:facilitada|reduzida)|cabe no seu orcamento)\b/.test(clause)) return true;
    if (/\b(?:precos?|valores?|parcelas?|entradas?|saldo|pagamento|prices?|installments?|precios?|cuotas?)\b.{0,45}\b(?:fix[oa]s?|garantid[oa]s?|aprovad[oa]s?|fixed|guaranteed|approved|fij[oa]s?|garantizad[oa]s?)\b/.test(clause)) return true;
    const safe = SAFE_FINANCIAL_REFUSAL.exec(clause);
    if (safe && !FINANCIAL_TERMS.test(clause.slice(0, safe.index))) return false;
    if (/\?\s*$/.test(clause)) return false;
    return /\b(?:e|sao|esta|estao|sera|serao|fica|ficam|tem|teria|pode|podemos|consegue|conseguimos|garanto|garantimos|ofereco|oferecemos|aceitamos|aprovad[oa]|is|are|will|can|offer|approved|es|son|sera|puedes?|ofrecemos)\b/.test(clause)
      || /\b(?:entrada|parcelas?|pagamento|juros|correcao|desconto|price|payment|interest|precio|cuotas?)\s*[:=]/.test(clause);
  });
}

function hasOnlyAttributedBudget(reply: string, history: ChatMessage[]): boolean {
  const user = norm(lastUserText(history));
  const value = norm(reply);
  if (!/\b(meu orcamento|meu limite|tenho|posso investir|ate|maximo|my budget|budget is|presupuesto)\b/.test(user)) return false;
  if (!/\b(seu orcamento|seu limite|voce informou|voce mencionou|your budget|you mentioned|tu presupuesto|su presupuesto)\b/.test(value)) return false;
  if (/\b(custa|preco|valor da|unidade|apartamento|flow|alma|soul|desconto|aprovad\w*|garant\w*|fech\w*|suficiente|cabe|aceit\w*|parcela|entrada|juros|sem correcao|price|unit|discount|approved|cuesta|departamento|cuota)\b/.test(value)) return false;
  const allowed = new Set(moneyMatches(user).map((item) => parseNaraMoneyToCents(item[0])).filter((item) => item !== null));
  const amounts = moneyMatches(value);
  return amounts.length > 0 && amounts.every((item) => {
    const cents = parseNaraMoneyToCents(item[0]);
    return cents !== null && allowed.has(cents);
  });
}

function asksForQuote(text: string): boolean {
  const value = financialSignalText(text);
  if (/\b(?:nao (?:quero|preciso)|sem falar de|no quiero|do not want|don't want)\b.{0,35}\b(?:preco|valor|tabela|pagamento|price|payment|precio)\b/.test(value)) return false;
  if (/\b(quanto custa|quanto fica|quanto sai|how much|cuanto cuesta|me (?:passa|passe|manda|mande|informe|envia|envie).{0,20}(?:preco|valor|tabela)|quero saber.{0,20}(?:preco|valor)|sem preco nao adianta)\b/.test(value)) return true;
  if (/^(?:(?:e|qual|o|a|os|as|the|el|la)\s+){0,3}(?:precos?|valores?|tabela|prices?|precio)\b/.test(value)) return true;
  return /\?/.test(value) && FINANCIAL_TERMS.test(value) && !/\b(meu orcamento|my budget|presupuesto)\b/.test(value);
}

function asksPayment(text: string): boolean {
  return /\b(pagamento|condic(?:ao|oes) de pagamento|plano de pagamento|entradas?|parcelas?|parcelamento|presta(?:cao|coes)|mensal|mensais|reforcos?|balao|juros|correcao|reajuste|cub|ipca|a vista|al contado|cuotas?|interes|payment|payment terms|installments?|down payment|interest)\b/.test(norm(text));
}

function customCondition(text: string): boolean {
  const value = norm(text);
  return /\b(desconto|discount|descuento|negociar|negociacao|proposta|proposal|offer|oferta|diretor|autorizou|aprovou)\b/.test(value)
    || (/\b(entrada|parcela|vezes|meses|months|installments|down payment|cuotas)\b/.test(value) && moneyMatches(value).length > 0)
    || /\b(?:em|in|en)\s*\d+\s*(?:x|vezes|meses|months|installments|cuotas)\b/.test(value);
}

/**
 * A customer asking whether an alternative installment plan would be accepted
 * is proposing terms, not asking for the list prices of arbitrary apartments.
 * A separate explicit price question in the same turn still requires a live quote.
 */
export function isNaraAlternativePaymentProposal(text: string): boolean {
  const value = norm(text);
  const asksActualPrice = /\b(?:quanto custa|quanto fica|quanto sai|qual (?:e |o )?(?:preco|valor)|(?:preco|valor) (?:da|do|de) (?:unidade|apto|apartamento)|how much|cuanto cuesta|cuanto sale)\b/.test(value);
  if (asksActualPrice) return false;
  const suggestedTerms = /\b\d{1,3}(?:[.,]\d+)?\s*%\s*(?:de\s+)?entrada\b|\b\d{2,3}\s*(?:x|vezes|parcelas|meses)\b|\b(?:sem|zero)\s+(?:juros|correcao|reajuste)\b/.test(value);
  const asksApproval = /\b(?:podem|pode|conseguem|consegue)\s+(?:aceitar|aprovar|fazer|garantir|fechar)|\b(?:aceitam|aceita|garantem|garante|aprovam|aprova|seria possivel|se eu der|posso dar)\b/.test(value);
  return suggestedTerms && asksApproval;
}

function brl(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function paymentLines(offer: NaraUnitOffer, language: NaraLanguage): string[] {
  const plan = offer.plano_pagamento;
  const partial = language === 'en' ? 'The full payment schedule, adjustments and interest need confirmation before presenting an installment offer.'
    : language === 'es' ? 'El plan completo, los ajustes y los intereses necesitan confirmación antes de presentar una oferta en cuotas.'
      : 'O plano completo, a correção e os juros precisam de confirmação antes de apresentar uma condição parcelada.';
  if (!plan || plan.status !== 'complete' || !Array.isArray(plan.componentes) || !plan.componentes.length) return [partial];
  let sum = 0;
  const labels = language === 'en'
    ? { entrada: 'Down payment', mensal: 'Monthly installments', reforco: 'Additional installments', chaves: 'At handover' }
    : language === 'es'
      ? { entrada: 'Entrada', mensal: 'Cuotas mensuales', reforco: 'Cuotas adicionales', chaves: 'A la entrega' }
      : { entrada: 'Entrada', mensal: 'Parcelas mensais', reforco: 'Reforços', chaves: 'Nas chaves' };
  for (const component of plan.componentes) {
    if (!component || !Object.hasOwn(labels, component.tipo)
      || !Number.isSafeInteger(component.quantidade) || component.quantidade <= 0
      || !Number.isSafeInteger(component.valor_unitario_centavos) || component.valor_unitario_centavos < 0
      || !Number.isSafeInteger(component.total_centavos) || component.total_centavos < 0
      || component.total_centavos !== component.quantidade * component.valor_unitario_centavos) return [partial];
    sum += component.total_centavos;
  }
  if (!Number.isSafeInteger(sum) || sum !== Math.round(offer.valor * 100)
    || plan.total_composto_centavos !== sum || plan.diferenca_centavos !== 0) return [partial];
  const lines = plan.componentes.filter((component) => component.total_centavos > 0).map((component) => {
    const amount = brl(component.valor_unitario_centavos / 100);
    return `${labels[component.tipo]}: ${component.quantidade === 1 ? amount : `${component.quantidade} × ${amount}`}.`;
  });
  const correction = cleanLabel(plan.indice_correcao, 200) ? plan.indice_correcao.trim() : null;
  const interest = cleanLabel(plan.juros, 200) ? plan.juros.trim() : null;
  if (correction) lines.push(`${language === 'en' ? 'Registered adjustment' : language === 'es' ? 'Ajuste registrado' : 'Correção cadastrada'}: ${correction}.`);
  if (interest) lines.push(`${language === 'en' ? 'Registered interest' : language === 'es' ? 'Intereses registrados' : 'Juros cadastrados'}: ${interest}.`);
  if (!correction || !interest) lines.push(language === 'en'
    ? 'These are list amounts; the missing adjustment or interest terms still need confirmation.'
    : language === 'es' ? 'Estos son importes de tabla; los ajustes o intereses no registrados aún necesitan confirmación.'
      : 'Esses são os valores de tabela; a correção ou os juros não informados ainda precisam de confirmação.');
  return lines;
}

function unconfirmedReply(validation: NaraCommercialValidation, language: NaraLanguage): string {
  if (validation.reasons.includes('multiple_units_not_confirmed') || (validation.requestedUnits.length > 1 && validation.requestedEnterprise)) return language === 'en' ? 'I need current quotes for all the units you mentioned before comparing their prices.'
    : language === 'es' ? 'Necesito valores vigentes de todas las unidades que mencionaste para comparar sus precios.'
      : 'Preciso confirmar os valores de todas as unidades citadas para fazer essa comparação.';
  if (validation.reasons.includes('ambiguous_unit')) return language === 'en' ? 'Which development is that unit in? I need that detail to confirm its current price.'
    : language === 'es' ? '¿De qué proyecto es esa unidad? Necesito ese dato para confirmar el precio vigente.'
      : 'Essa unidade é de qual empreendimento? Preciso desse dado para confirmar o preço vigente.';
  if (validation.reasons.includes('blocked_commercial_context')) return language === 'en' ? 'The team responsible for your enquiry needs to confirm the applicable commercial terms.'
    : language === 'es' ? 'El equipo responsable de tu atención necesita confirmar las condiciones comerciales aplicables.'
      : 'A equipe responsável pelo seu atendimento precisa confirmar as condições comerciais aplicáveis.';
  return language === 'en' ? 'I could not confirm a current price for this request. The commercial team can confirm the applicable price and payment terms.'
    : language === 'es' ? 'No pude confirmar un precio vigente para esta consulta. El equipo comercial puede confirmar el valor y las condiciones aplicables.'
      : 'Não consegui confirmar um preço vigente para esse pedido. O comercial pode confirmar o valor e as condições aplicáveis.';
}

function correctionIntroduction(validation: NaraCommercialValidation, history: ChatMessage[], original: string, language: NaraLanguage): string {
  const recognizesCorrection = /\b(?:corrigindo (?:a |o |uma )?(?:informacao|preco|valor)|(?:valor|preco|informacao) (?:anterior|que (?:eu )?(?:informei|passei|mencionei|citei)).{0,70}(?:incorret|imprecis|errad|nao (?:estava |esta )?(?:confirmad|validad))|me enganei|i (?:was wrong|made a mistake)|correcting (?:the |my )?(?:previous|earlier)|corrigiendo (?:la )?(?:informacion|precio|valor)|(?:precio|valor|informacion) anterior.{0,60}(?:incorrect|no (?:estaba )?confirmad))/.test(norm(original));
  if (!recognizesCorrection) return '';
  let previousIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.role === 'assistant' && moneyMatches(message.content).length > 0) {
      previousIndex = index;
      break;
    }
  }
  if (previousIndex < 0) return '';
  const old = history[previousIndex].content;
  const oldIdentity = requestIdentity(history.slice(0, previousIndex), null);
  const explicitProjects = projectNames(old);
  const oldProject = explicitProjects.length === 1 ? explicitProjects[0] : oldIdentity.focus;
  const oldUnit = unitInText(old) ?? oldIdentity.unit;
  const linked = oldProject && (oldUnit
    ? validation.offers.some((offer) => projectKey(offer.empreendimento) === oldProject && norm(offer.unidade) === norm(oldUnit))
    : validation.ranges.some((range) => projectKey(range.empreendimento) === oldProject));
  return language === 'en'
    ? linked ? 'Correcting the earlier information, these are the values confirmed by the current lookup:' : 'These are the values confirmed by the current lookup:'
    : language === 'es'
      ? linked ? 'Corrigiendo la información anterior, estos son los valores confirmados en la consulta actual:' : 'Estos son los valores confirmados en la consulta actual:'
      : linked ? 'Corrigindo a informação anterior, estes são os valores confirmados na consulta atual:' : 'Estes são os valores confirmados na consulta atual:';
}

function renderValidatedReply(validation: NaraCommercialValidation, history: ChatMessage[], original: string, language: NaraLanguage): string {
  const latest = lastUserText(history);
  // Quando o cliente pediu preço + localização, não deixe o modelo acrescentar
  // espontaneamente um plano de pagamento que ele não solicitou. Em diálogos
  // só financeiros, preserva-se a auditoria do plano estruturado já existente.
  const priceAndLocation = /\b(?:onde fica|localizacao|endereco|no mapa|donde queda|ubicacion|direccion|where is|location)\b/.test(norm(latest));
  const payment = asksPayment(latest) || (asksPayment(original) && !priceAndLocation);
  const sections: string[] = [];
  const correction = correctionIntroduction(validation, history, original, language);
  if (correction) sections.push(correction);
  if (validation.offers.length) {
    const cheapestOnly = /\b(?:mais barat[oa]|menor (?:preco|valor|apartamento|unidade)|cheapest|lowest price|mas barat[oa])\b/.test(norm(latest))
      && !/\b(?:3|tres|three|top|opcoes|alternativas|comparar)\b/.test(norm(latest));
    const offers = cheapestOnly
      ? [validation.offers.reduce((a, b) => a.valor <= b.valor ? a : b)]
      : validation.offers;
    for (const offer of offers) {
      const price = language === 'en' ? `At ${offer.empreendimento}, the current list price of unit ${offer.unidade} is ${brl(offer.valor)}.`
        : language === 'es' ? `En ${offer.empreendimento}, el precio de tabla vigente de la unidad ${offer.unidade} es ${brl(offer.valor)}.`
          : `No ${offer.empreendimento}, o valor de tabela vigente da unidade ${offer.unidade} é ${brl(offer.valor)}.`;
      sections.push([price, ...(payment ? paymentLines(offer, language) : [])].join('\n'));
    }
  } else {
    const showRange = /\b(faixa|variacao|variam|compar|compare|comparison|range|rango|diferenca|difference)\w*/.test(norm(latest));
    const showMaximum = !showRange && /\b(maximo|mais car[oa]|maior (?:preco|valor)|maximum|highest|mas car[oa]|mayor (?:precio|valor))\b/.test(norm(latest));
    for (const range of validation.ranges) {
      const prices = showRange ? `${brl(range.valor_minimo)} ${language === 'en' ? 'to' : 'a'} ${brl(range.valor_maximo)}` : brl(showMaximum ? range.valor_maximo : range.valor_minimo);
      sections.push(language === 'en' ? `${range.empreendimento}: ${showRange ? 'current list price range' : showMaximum ? 'highest current list price' : 'current list prices from'} ${prices}.`
        : language === 'es' ? `${range.empreendimento}: ${showRange ? 'rango de precios vigente' : showMaximum ? 'mayor precio de tabla vigente' : 'precios de tabla desde'} ${prices}.`
          : `${range.empreendimento}: ${showRange ? 'faixa de valores na tabela atual' : showMaximum ? 'maior valor na tabela atual' : 'valores de tabela a partir de'} ${prices}.`);
    }
    if (payment) sections.push(language === 'en' ? 'The payment terms depend on the selected unit and need a specific quote.'
      : language === 'es' ? 'Las condiciones de pago dependen de la unidad elegida y necesitan una consulta específica.'
        : 'As condições de pagamento dependem da unidade escolhida e precisam de uma consulta específica.');
  }
  if (customCondition(latest)) sections.push(language === 'en'
    ? 'That condition needs assessment by the commercial team; the values above are from the current price list.'
    : language === 'es' ? 'Esa condición necesita evaluación del equipo comercial; los valores de arriba corresponden a la tabla actual.'
      : 'Essa condição precisa da análise do comercial; os valores acima são os da tabela atual.');
  if (/\b(dolar|dolares|usd|euro|euros|eur|dollars?)\b|us\$|€/.test(norm(latest))) sections.push(language === 'en'
    ? 'These prices are in Brazilian reais. A foreign-currency reference needs a current exchange-rate quote.'
    : language === 'es' ? 'Estos valores están en reales brasileños. La referencia en otra moneda necesita una cotización cambiaria vigente.'
      : 'Esses valores estão em reais. Uma referência em outra moeda precisa de uma cotação cambial vigente.');
  return sections.join('\n\n');
}

/**
 * Run after all other reply transformations, before any send/audit. For a financial
 * response, replace the whole message, so free prose cannot add another price or promise.
 * This layer never treats source_text, customer statements or an old assistant reply as
 * authority. Natural-language detection is defense in depth, not a semantic guarantee.
 */
export function protectNaraCommercialReply(
  reply: string,
  history: ChatMessage[],
  commercial: NaraCommercialTurnContext | null | undefined,
  options: NaraCommercialGuardOptions = {},
): NaraCommercialGuardResult {
  const latest = lastUserText(history);
  const quoteRequested = asksForQuote(latest);
  if (isNaraAlternativePaymentProposal(latest)) {
    const language = options.language ?? naraConversationLanguage(history);
    const safeReply = language === 'en'
      ? 'I cannot guarantee or approve the alternative payment terms you suggested. The Bossa commercial team needs to assess that proposal before confirming any down payment, installments, interest or adjustments.'
      : language === 'es'
        ? 'No puedo garantizar ni aprobar las condiciones de pago alternativas que propones. El equipo comercial de Bossa debe analizarlas antes de confirmar entrada, cuotas, intereses o ajustes.'
        : 'Não posso garantir nem aprovar a condição alternativa que você sugeriu. O comercial da Bossa precisa analisar essa proposta antes de confirmar entrada, parcelas, juros ou correção.';
    return { reply: safeReply, changed: reply !== safeReply, commercial: true, reasons: ['unapproved_customer_proposal'], source: 'unconfirmed' };
  }
  if ((!naraReplyNeedsCommercialProtection(reply) || hasOnlyAttributedBudget(reply, history)) && !quoteRequested) {
    return { reply, changed: false, commercial: false, reasons: [], source: 'model' };
  }
  const validation = validateNaraCommercialContext(commercial, history, options);
  const language = options.language ?? naraConversationLanguage(history);
  const safeReply = validation.valid ? renderValidatedReply(validation, history, reply, language) : unconfirmedReply(validation, language);
  return {
    reply: safeReply, changed: safeReply !== reply, commercial: true,
    reasons: validation.valid ? ['commercial_reply_rendered_from_crm'] : validation.reasons,
    source: validation.valid ? 'crm' : 'unconfirmed',
  };
}
