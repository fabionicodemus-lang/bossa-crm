/** Prices are base-date amounts. Future CUB/IPCA and post-handover interest are not forecasts. */
export const PAYMENT_TABLE_LABELS = {
  cash: 'À vista',
  months36: '30% + 36x + 3 reforços',
  months48: '30% + 48x + 4 reforços + 10% nas chaves',
  months40: '25% + 40x + 3 reforços',
  months60: '20% + 60x + 4 reforços + 10% nas chaves',
  current: 'Tabela atual do CRM',
} as const;
export type PaymentTableId = keyof typeof PAYMENT_TABLE_LABELS;
export type PaymentTablePlan = {
  id: Exclude<PaymentTableId, 'cash' | 'current'>;
  months: number;
  entry_bps: number;
  reinforcement_count: number;
  keys_bps: number;
};
export type PaymentTableOption = {
  id: PaymentTableId;
  label: string;
  installmentCount: number;
  reinforcementCount: number;
  entryPercent: number;
  keysPercent: number;
};
export type PaymentTableQuote = {
  id: PaymentTableId;
  totalCents: number;
  entryCents: number;
  installmentCount: number;
  installmentCents: number;
  lastInstallmentCents: number;
  reinforcementCount: number;
  reinforcementCents: number;
  keysCents: number;
  complete: boolean;
  issue?: string;
};
export type PaymentTableUnit = {
  unit_code: string;
  list_price: number | string;
  entry_amount: number | string;
  installment_count: number;
  installment_amount: number | string;
  reinforcement_count?: number | null;
  reinforcement_amount?: number | string | null;
  keys_amount?: number | string | null;
};
export type PaymentTablePolicy = {
  version: 1;
  approved: true;
  valuation_date: string;
  handover_month: string;
  cash_basis_cents: number;
  list_basis_cents: number;
  reference_entry_cents: number;
  reference_installment_cents: number;
  reference_installment_count: number;
  reference_reinforcement_cents: number;
  reference_reinforcement_count: number;
  reference_keys_cents: number;
  /** Only explicit unit exceptions approved by the manager; never infer missing reinforcements. */
  reinforcement_overrides_cents?: Record<string, number>;
  /** Omitted on the original Flow rule; explicit variants belong only to this development. */
  installment_plans?: PaymentTablePlan[];
};
export const PAYMENT_TABLE_TERMS = 'Valores-base: CUB durante as obras; após as chaves, IPCA + 0,59% ao mês. Entrada no ato, primeira mensal em 30 dias e reforços a cada 12 meses.';

export function moneyToCents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const number = Number(value);
  const cents = Math.round(number * 100);
  return Number.isFinite(number) && number >= 0 && Number.isSafeInteger(cents)
    && Math.abs(number * 100 - cents) < 0.0001 ? cents : null;
}
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function readPaymentTablePolicy(plan: unknown): PaymentTablePolicy | null {
  if (!plan || typeof plan !== 'object') return null;
  const p = (plan as Record<string, unknown>).payment_tables as PaymentTablePolicy | undefined;
  if (!p || p.version !== 1 || p.approved !== true) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.valuation_date) || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(p.handover_month)) return null;
  const date = new Date(`${p.valuation_date}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== p.valuation_date) return null;
  const amounts = [p.cash_basis_cents, p.list_basis_cents, p.reference_entry_cents, p.reference_installment_cents,
    p.reference_reinforcement_cents, p.reference_keys_cents];
  if (!amounts.every(integer) || p.cash_basis_cents <= 0 || p.list_basis_cents <= p.cash_basis_cents
    || p.reference_entry_cents >= p.cash_basis_cents) return null;
  if (!integer(p.reference_installment_count) || p.reference_installment_count < 1 || p.reference_installment_count > 120
    || !integer(p.reference_reinforcement_count) || p.reference_reinforcement_count > 10) return null;
  const sum = p.reference_entry_cents + p.reference_installment_count * p.reference_installment_cents
    + p.reference_reinforcement_count * p.reference_reinforcement_cents + p.reference_keys_cents;
  // A reference may have a cent-rounding residue, not an incomplete commercial schedule.
  if (!Number.isSafeInteger(sum) || Math.abs(sum - p.list_basis_cents) > 100 || monthsUntilHandover(p) < 1) return null;
  if (p.reinforcement_overrides_cents && (typeof p.reinforcement_overrides_cents !== 'object'
    || !Object.values(p.reinforcement_overrides_cents).every((n) => integer(n) && n > 0))) return null;
  if (p.installment_plans !== undefined && (!Array.isArray(p.installment_plans) || p.installment_plans.length !== 2
    || new Set(p.installment_plans.map((plan) => plan?.id)).size !== 2
    || p.installment_plans.some((plan) => !plan || !['months36', 'months40', 'months48', 'months60'].includes(plan.id)
      || !integer(plan.months) || plan.id !== `months${plan.months}`
      || !integer(plan.entry_bps) || plan.entry_bps <= 0 || !integer(plan.keys_bps) || plan.entry_bps + plan.keys_bps >= 10000
      || !integer(plan.reinforcement_count) || plan.reinforcement_count < 1 || plan.reinforcement_count > Math.floor(plan.months / 12)))) return null;
  return p;
}

function installmentPlans(policy: PaymentTablePolicy): PaymentTablePlan[] {
  return policy.installment_plans ?? [
    { id: 'months36', months: 36, entry_bps: 3000, reinforcement_count: 3, keys_bps: 0 },
    { id: 'months48', months: 48, entry_bps: 3000, reinforcement_count: 4, keys_bps: 1000 },
  ];
}

export function paymentTableOptions(policy: PaymentTablePolicy): PaymentTableOption[] {
  return [
    { id: 'cash', label: 'À vista', installmentCount: 0, reinforcementCount: 0, entryPercent: 100, keysPercent: 0 },
    ...installmentPlans(policy).map((p) => ({ id: p.id,
      label: `${p.entry_bps / 100}% + ${p.months}x + ${p.reinforcement_count} reforços${p.keys_bps ? ` + ${p.keys_bps / 100}% nas chaves` : ''}`,
      installmentCount: p.months, reinforcementCount: p.reinforcement_count, entryPercent: p.entry_bps / 100, keysPercent: p.keys_bps / 100 })),
    { id: 'current', label: `Tabela atual do CRM · ${policy.reference_installment_count}x`, installmentCount: policy.reference_installment_count,
      reinforcementCount: policy.reference_reinforcement_count, entryPercent: Math.round(policy.reference_entry_cents / policy.list_basis_cents * 100),
      keysPercent: Math.round(policy.reference_keys_cents / policy.list_basis_cents * 100) },
  ];
}

export function paymentQuoteLabel(quote: PaymentTableQuote): string {
  if (quote.id === 'current') return `Plano em ${quote.installmentCount} meses`;
  if (quote.id === 'cash') return 'À vista';
  if (!quote.complete) return PAYMENT_TABLE_LABELS[quote.id];
  return `${Math.round(quote.entryCents / quote.totalCents * 100)}% + ${quote.installmentCount}x + ${quote.reinforcementCount} reforços${quote.keysCents ? ` + ${Math.round(quote.keysCents / quote.totalCents * 100)}% nas chaves` : ''}`;
}

export function monthsUntilHandover(policy: PaymentTablePolicy): number {
  const [year, month] = policy.valuation_date.split('-').map(Number);
  const [keysYear, keysMonth] = policy.handover_month.split('-').map(Number);
  return (keysYear - year) * 12 + keysMonth - month;
}
function discountedMonths(rate: number, count: number): number {
  return rate === 0 ? count : -Math.expm1(-count * Math.log1p(rate)) / rate;
}
function discountedAnnual(rate: number, count: number): number {
  let sum = 0;
  for (let i = 1; i <= count; i += 1) sum += (1 + rate) ** (-12 * i);
  return sum;
}

/** Internal equivalence rate, calibrated to the original CRM cash flow. Not a customer charge. */
export function paymentTableDiscountRate(policy: PaymentTablePolicy): number {
  const value = (rate: number) => policy.reference_entry_cents
    + policy.reference_installment_cents * discountedMonths(rate, policy.reference_installment_count)
    + policy.reference_reinforcement_cents * discountedAnnual(rate, policy.reference_reinforcement_count)
    + policy.reference_keys_cents * (1 + rate) ** -monthsUntilHandover(policy);
  let lower = 0;
  let upper = 1;
  for (let i = 0; i < 100; i += 1) {
    const middle = (lower + upper) / 2;
    if (value(middle) > policy.cash_basis_cents) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

export function cashPriceCents(unit: Pick<PaymentTableUnit, 'list_price'>, policy: PaymentTablePolicy): number | null {
  const price = moneyToCents(unit.list_price);
  if (price === null || price <= 0) return null;
  // BigInt keeps the approved ratio exact before rounding to cents.
  const numerator = BigInt(price) * BigInt(policy.cash_basis_cents);
  const denominator = BigInt(policy.list_basis_cents);
  const rounded = Number((numerator * 2n + denominator) / (denominator * 2n));
  return Number.isSafeInteger(rounded) && rounded > 0 ? rounded : null;
}

export function paymentQuoteSum(quote: PaymentTableQuote): number {
  return quote.entryCents + Math.max(0, quote.installmentCount - 1) * quote.installmentCents
    + (quote.installmentCount ? quote.lastInstallmentCents : 0)
    + quote.reinforcementCount * quote.reinforcementCents + quote.keysCents;
}
export function isCompletePaymentQuote(q: PaymentTableQuote): boolean {
  if (!q || !Object.hasOwn(PAYMENT_TABLE_LABELS, q.id) || !q.complete) return false;
  if (![q.totalCents, q.entryCents, q.installmentCount, q.installmentCents, q.lastInstallmentCents,
    q.reinforcementCount, q.reinforcementCents, q.keysCents].every(integer) || q.totalCents <= 0) return false;
  if (q.installmentCount > 120 || q.reinforcementCount > 10 || paymentQuoteSum(q) !== q.totalCents) return false;
  if (q.id === 'cash') return q.entryCents === q.totalCents && q.installmentCount === 0
    && q.reinforcementCount === 0 && q.keysCents === 0 && q.installmentCents === 0 && q.lastInstallmentCents === 0;
  return q.installmentCount > 0 && q.installmentCents > 0 && q.lastInstallmentCents > 0;
}

export function unitPaymentTables(unit: PaymentTableUnit, policy: PaymentTablePolicy): PaymentTableQuote[] {
  const cash = cashPriceCents(unit, policy);
  const price = moneyToCents(unit.list_price);
  if (cash === null || price === null) return [];
  const base: PaymentTableQuote = { id: 'cash', totalCents: cash, entryCents: cash,
    installmentCount: 0, installmentCents: 0, lastInstallmentCents: 0,
    reinforcementCount: 0, reinforcementCents: 0, keysCents: 0, complete: true };
  const rate = paymentTableDiscountRate(policy);
  const recordedReinforcement = moneyToCents(unit.reinforcement_amount);
  const reinforcement = recordedReinforcement && recordedReinforcement > 0 ? recordedReinforcement
    : policy.reinforcement_overrides_cents?.[unit.unit_code] ?? null;
  const quotes: PaymentTableQuote[] = [base];
  for (const p of installmentPlans(policy)) {
    const { id, months, reinforcement_count: count } = p;
    const entryPercent = p.entry_bps / 10000;
    const keysPercent = p.keys_bps / 10000;
    if (reinforcement === null) {
      quotes.push({ ...base, id, totalCents: 0, entryCents: 0, installmentCount: months,
        reinforcementCount: count, complete: false, issue: 'Valor do reforço não cadastrado. Confirmar com o gestor.' });
      continue;
    }
    const averageDiscount = discountedMonths(rate, months) / months;
    const reinforcementDiscount = discountedAnnual(rate, count);
    const keysDiscount = (1 + rate) ** -monthsUntilHandover(policy);
    const total = Math.round((cash - reinforcement * (reinforcementDiscount - count * averageDiscount))
      / (entryPercent + (1 - entryPercent - keysPercent) * averageDiscount + keysPercent * keysDiscount));
    const entry = Math.round(total * entryPercent);
    const keys = Math.round(total * keysPercent);
    const balance = total - entry - keys - count * reinforcement;
    const monthly = Math.round(balance / months);
    const last = balance - monthly * (months - 1);
    const quote: PaymentTableQuote = { id, totalCents: total, entryCents: entry, installmentCount: months,
      installmentCents: monthly, lastInstallmentCents: last, reinforcementCount: count,
      reinforcementCents: reinforcement, keysCents: keys, complete: monthly > 0 && last > 0 };
    if (!isCompletePaymentQuote(quote)) {
      quote.complete = false;
      quote.issue = 'Composição inválida: confirmar o valor dos reforços antes de oferecer esta modalidade.';
    }
    quotes.push(quote);
  }
  const current: PaymentTableQuote = { ...base, id: 'current', totalCents: price,
    entryCents: moneyToCents(unit.entry_amount) ?? 0,
    installmentCount: unit.installment_count,
    installmentCents: moneyToCents(unit.installment_amount) ?? 0,
    lastInstallmentCents: moneyToCents(unit.installment_amount) ?? 0,
    reinforcementCount: unit.reinforcement_count ?? 0,
    reinforcementCents: moneyToCents(unit.reinforcement_amount) ?? 0,
    keysCents: moneyToCents(unit.keys_amount) ?? 0, complete: true };
  const roundingRemainder = price - paymentQuoteSum(current);
  if (current.installmentCount > 0 && Math.abs(roundingRemainder) <= 100) {
    // Preserve the recorded regular payments; reconcile only the final cent rounding.
    current.lastInstallmentCents += roundingRemainder;
  }
  current.complete = isCompletePaymentQuote(current);
  if (!current.complete) current.issue = 'Valores preservados do CRM. A composição precisa de conferência antes de uma proposta.';
  quotes.push(current);
  return quotes;
}
