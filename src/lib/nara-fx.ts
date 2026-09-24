import type { SupabaseClient } from '@supabase/supabase-js';

export type NaraFxCurrency = 'USD' | 'EUR' | 'DKK' | 'CLP';

export type NaraFxQuote = {
  currency: NaraFxCurrency;
  rate_brl_per_unit: number;
  quote_at: string;
  quote_date: string;
  requested_date: string;
  source: 'BCB PTAX';
};

const CURRENCY_LABELS: Record<NaraFxCurrency, { symbol: string; label: string }> = {
  USD: { symbol: 'US$', label: 'dólar' },
  EUR: { symbol: '€', label: 'euro' },
  DKK: { symbol: 'DKK', label: 'coroa dinamarquesa' },
  CLP: { symbol: 'CLP', label: 'peso chileno' },
};

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectRequestedCurrency(text: string): NaraFxCurrency | null {
  const value = normalize(text);
  if (/\b(dolar|dolares|usd|us\$|orlando|estados unidos|eua|usa)\b/.test(value)) return 'USD';
  if (/\b(euro|euros|eur|€|portugal)\b/.test(value)) return 'EUR';
  if (/\b(dinamarca|coroa dinamarquesa|dkk)\b/.test(value)) return 'DKK';
  if (/\b(chile|peso chileno|clp)\b/.test(value)) return 'CLP';
  return null;
}

function saoPauloDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function mmddyyyy(isoDate: string) {
  const [year, month, day] = isoDate.split('-');
  return `${month}-${day}-${year}`;
}

function isoDaysBefore(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function quoteDate(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const br = value.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return value.slice(0, 10);
}

async function fetchBcbQuote(currency: NaraFxCurrency, requestedDate: string): Promise<NaraFxQuote | null> {
  const initial = isoDaysBefore(requestedDate, 10);
  const endpoint = new URL(
    'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)',
  );
  endpoint.searchParams.set('@moeda', `'${currency}'`);
  endpoint.searchParams.set('@dataInicial', `'${mmddyyyy(initial)}'`);
  endpoint.searchParams.set('@dataFinalCotacao', `'${mmddyyyy(requestedDate)}'`);
  endpoint.searchParams.set('$format', 'json');

  const response = await fetch(endpoint, {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`BCB PTAX HTTP ${response.status}`);

  const payload = await response.json() as {
    value?: Array<{
      cotacaoVenda?: number;
      dataHoraCotacao?: string;
      tipoBoletim?: string;
    }>;
  };
  const rows = (payload.value ?? [])
    .filter((row) => Number(row.cotacaoVenda) > 0 && row.dataHoraCotacao)
    .sort((a, b) => new Date(String(b.dataHoraCotacao)).getTime() - new Date(String(a.dataHoraCotacao)).getTime());

  const latest = rows[0];
  if (!latest) return null;
  return {
    currency,
    rate_brl_per_unit: Number(latest.cotacaoVenda),
    quote_at: String(latest.dataHoraCotacao),
    quote_date: quoteDate(String(latest.dataHoraCotacao)),
    requested_date: requestedDate,
    source: 'BCB PTAX',
  };
}

export async function loadDailyFxQuote(
  client: SupabaseClient,
  organizationId: string,
  currency: NaraFxCurrency,
  now = new Date(),
): Promise<NaraFxQuote | null> {
  const requestedDate = saoPauloDate(now);

  try {
    const { data } = await client
      .from('nara_fx_rates')
      .select('currency,rate_brl_per_unit,quote_at,quote_date,requested_date,source')
      .eq('organization_id', organizationId)
      .eq('currency', currency)
      .eq('requested_date', requestedDate)
      .maybeSingle();
    if (data && Number(data.rate_brl_per_unit) > 0) {
      return {
        currency: data.currency as NaraFxCurrency,
        rate_brl_per_unit: Number(data.rate_brl_per_unit),
        quote_at: String(data.quote_at),
        quote_date: String(data.quote_date),
        requested_date: String(data.requested_date),
        source: 'BCB PTAX',
      };
    }
  } catch {
    // O cache é uma otimização; a consulta oficial continua funcionando sem ele.
  }

  const quote = await fetchBcbQuote(currency, requestedDate);
  if (!quote) return null;

  try {
    await client.from('nara_fx_rates').upsert({
      organization_id: organizationId,
      currency: quote.currency,
      rate_brl_per_unit: quote.rate_brl_per_unit,
      quote_at: quote.quote_at,
      quote_date: quote.quote_date,
      requested_date: quote.requested_date,
      source: quote.source,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,currency,requested_date' });
  } catch {
    // O cliente autenticado do simulador pode ter somente leitura.
  }

  return quote;
}

export function convertBrl(brl: number, quote: NaraFxQuote) {
  if (!Number.isFinite(brl) || brl <= 0 || quote.rate_brl_per_unit <= 0) return null;
  return brl / quote.rate_brl_per_unit;
}

export function formatForeignApprox(amount: number, currency: NaraFxCurrency) {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const { symbol } = CURRENCY_LABELS[currency];
  const rounded = amount >= 1_000_000
    ? Math.round(amount / 10_000) * 10_000
    : amount >= 100_000
      ? Math.round(amount / 1_000) * 1_000
      : amount >= 10_000
        ? Math.round(amount / 100) * 100
        : Math.round(amount);
  return `${symbol} ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(rounded)}`;
}

export function fxSourceLine(quote: NaraFxQuote, brlValue: number) {
  const foreign = convertBrl(brlValue, quote);
  if (!foreign) return '';
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .format(new Date(`${quote.quote_date}T12:00:00-03:00`));
  return [
    '[cambio_ptax]',
    `moeda=${quote.currency}`,
    `cotacao_venda_brl_por_moeda=${quote.rate_brl_per_unit}`,
    `data_cotacao=${quote.quote_date}`,
    `valor_brl=${brlValue.toFixed(2)}`,
    `valor_aproximado=${formatForeignApprox(foreign, quote.currency)}`,
    `fonte=Banco Central do Brasil PTAX (${dateLabel})`,
    'observacao=conversão aproximada para referência; a tabela oficial do imóvel é em reais',
  ].join('; ');
}
