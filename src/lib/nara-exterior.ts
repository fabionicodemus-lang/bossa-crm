import type { SupabaseClient } from '@supabase/supabase-js';
import type { NaraCommercialTurnContext, NaraDevelopmentRange, NaraUnitOffer } from './nara-unit-queries';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type NaraFxQuote = {
  currency: 'USD' | 'EUR';
  rate_date: string;
  brl_per_currency: number;
  source: 'BCB PTAX';
  source_timestamp: string | null;
};

export type NaraForeignContext = {
  requested_currency: 'USD' | 'EUR' | null;
  lives_abroad: boolean;
  location: string | null;
  fx: NaraFxQuote | null;
  conversions: Array<{
    development: string;
    brl: number;
    currency: 'USD' | 'EUR';
    foreign: number;
  }>;
  source_text: string;
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

function userText(history: ChatMessage[]): string {
  return history.filter((item) => item.role === 'user').map((item) => item.content).join(' ');
}

export function detectForeignLead(history: ChatMessage[]) {
  const raw = userText(history);
  const value = normalize(raw);
  const usd = /\b(dolar|dolares|usd|orlando|miami|florida|estados unidos|eua|usa|chile|santiago)\b/.test(value);
  const eur = /\b(euro|euros|eur|portugal|lisboa|dinamarca|copenhague|espanha|espana|franca|alemanha|italia)\b/.test(value);
  const foreignPlace = /\b(fora do brasil|fuera de brasil|exterior|orlando|miami|florida|estados unidos|eua|usa|portugal|dinamarca|europa|chile|santiago)\b/;
  const livesAbroad = /\b(moro|morando|resido|vivendo|vivo|vivo en|resido en|estoy viviendo)\b.{0,45}/.test(value) && foreignPlace.test(value)
    || /\b(comprar|compra|comprando)\b.{0,40}\b(morando fora|fora do brasil|do exterior|viviendo fuera|fuera de brasil|desde el exterior)\b/.test(value)
    || /\bsoy (?:chileno|chilena)|vivo en santiago|resido en santiago\b/.test(value);
  const location = /\borlando\b/.test(value) ? 'Orlando'
    : /\bmiami\b/.test(value) ? 'Miami'
      : /\bportugal|lisboa\b/.test(value) ? 'Portugal'
        : /\bdinamarca|copenhague\b/.test(value) ? 'Dinamarca'
          : /\bchile|santiago\b/.test(value) ? 'Chile'
            : /\bestados unidos|eua|usa\b/.test(value) ? 'Estados Unidos'
              : null;
  return {
    livesAbroad,
    requestedCurrency: usd ? 'USD' as const : eur ? 'EUR' as const : null,
    location,
  };
}

function formatBcbDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function localDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function loadCachedFx(client: SupabaseClient, currency: 'USD' | 'EUR', dateKey: string) {
  const { data, error } = await client
    .from('nara_fx_daily')
    .select('rate_date,currency,brl_per_currency,source,source_timestamp')
    .eq('rate_date', dateKey)
    .eq('currency', currency)
    .maybeSingle();
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw error;
  if (!data) return null;
  return {
    currency,
    rate_date: String(data.rate_date),
    brl_per_currency: Number(data.brl_per_currency),
    source: 'BCB PTAX' as const,
    source_timestamp: data.source_timestamp ? String(data.source_timestamp) : null,
  } satisfies NaraFxQuote;
}

async function fetchBcbFx(currency: 'USD' | 'EUR', now = new Date()): Promise<NaraFxQuote | null> {
  const end = new Date(now);
  const start = new Date(now.getTime() - 8 * 86_400_000);
  const params = new URLSearchParams({
    '@moeda': `'${currency}'`,
    '@dataInicial': `'${formatBcbDate(start)}'`,
    '@dataFinalCotacao': `'${formatBcbDate(end)}'`,
    '$top': '100',
    '$orderby': 'dataHoraCotacao desc',
    '$format': 'json',
  });
  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?${params.toString()}`;
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({})) as {
    value?: Array<{ cotacaoVenda?: number; dataHoraCotacao?: string }>;
  };
  const row = payload.value?.find((item) => Number(item.cotacaoVenda) > 0);
  if (!row?.cotacaoVenda) return null;
  const timestamp = row.dataHoraCotacao ? new Date(row.dataHoraCotacao) : now;
  return {
    currency,
    rate_date: localDateKey(timestamp),
    brl_per_currency: Number(row.cotacaoVenda),
    source: 'BCB PTAX',
    source_timestamp: row.dataHoraCotacao ?? null,
  };
}

async function getDailyFx(
  client: SupabaseClient,
  currency: 'USD' | 'EUR',
  now = new Date(),
): Promise<NaraFxQuote | null> {
  const today = localDateKey(now);
  const cached = await loadCachedFx(client, currency, today);
  if (cached) return cached;
  const fresh = await fetchBcbFx(currency, now);
  if (!fresh) return null;

  const { error } = await client.from('nara_fx_daily').upsert({
    rate_date: today,
    currency,
    brl_per_currency: fresh.brl_per_currency,
    source: fresh.source,
    source_timestamp: fresh.source_timestamp,
  }, { onConflict: 'rate_date,currency' });
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    console.error('[nara fx cache]', error.message);
  }
  return { ...fresh, rate_date: today };
}

function rangeValues(commercial: NaraCommercialTurnContext | null | undefined) {
  if (!commercial) return [] as Array<{ development: string; brl: number }>;
  const values: Array<{ development: string; brl: number }> = [];
  for (const call of commercial.calls) {
    if (call.name === 'faixa_empreendimento' && call.result && !Array.isArray(call.result)) {
      const range = call.result as NaraDevelopmentRange;
      if (range.valor_minimo > 0) values.push({ development: range.empreendimento, brl: range.valor_minimo });
    } else if (call.name === 'consultar_apartamento' && call.result && !Array.isArray(call.result)) {
      const unit = call.result as NaraUnitOffer;
      if (unit.valor > 0) values.push({ development: `${unit.empreendimento} ${unit.unidade}`, brl: unit.valor });
    } else if (call.name === 'buscar_apartamentos' && Array.isArray(call.result)) {
      for (const unit of (call.result as NaraUnitOffer[]).slice(0, 3)) {
        if (unit.valor > 0) values.push({ development: `${unit.empreendimento} ${unit.unidade}`, brl: unit.valor });
      }
    }
  }
  return values;
}

export async function loadNaraForeignContext(
  client: SupabaseClient,
  history: ChatMessage[],
  commercial: NaraCommercialTurnContext | null | undefined,
  now = new Date(),
): Promise<NaraForeignContext | null> {
  const detected = detectForeignLead(history);
  if (!detected.livesAbroad && !detected.requestedCurrency) return null;
  const currency = detected.requestedCurrency
    ?? (detected.location === 'Portugal' || detected.location === 'Dinamarca' ? 'EUR' : 'USD');
  const fx = await getDailyFx(client, currency, now);
  const conversions = fx
    ? rangeValues(commercial).map((item) => ({
        ...item,
        currency,
        foreign: item.brl / fx.brl_per_currency,
      }))
    : [];

  const lines = [
    'CLIENTE NO EXTERIOR — DADOS OPERACIONAIS:',
    `- Mora fora do Brasil: ${detected.livesAbroad ? 'sim' : 'não confirmado'}.`,
    detected.location ? `- Local informado: ${detected.location}.` : '',
    '- É possível comprar morando fora; o contrato pode ser assinado eletronicamente e não exige presença física no Brasil para assinatura.',
    '- O pagamento pode ser feito do exterior em reais, dólar ou moeda local, conforme o fluxo comercial aplicável.',
    '- A Bossa já tem clientes residentes nos Estados Unidos, Dinamarca, Portugal e Chile que compraram à distância.',
    fx
      ? `- Cotação de referência do dia: 1 ${currency} = R$ ${fx.brl_per_currency.toFixed(4).replace('.', ',')} (BCB PTAX, referência aproximada).`
      : `- A cotação ${currency} não pôde ser obtida agora. Não calcule nem estime conversão por conta própria.`,
    ...conversions.map((item) => `- ${item.development}: a partir de R$ ${Math.round(item.brl).toLocaleString('pt-BR')} ≈ ${currency} ${Math.round(item.foreign).toLocaleString('pt-BR')} pela PTAX de hoje.`),
    '- Sempre informe também o valor em reais quando houver preço confirmado. Qualquer valor em moeda estrangeira é uma referência cambial aproximada do dia.',
    '- Nunca calcule câmbio mentalmente. Use somente as conversões prontas deste bloco.',
  ].filter(Boolean);

  return {
    requested_currency: currency,
    lives_abroad: detected.livesAbroad,
    location: detected.location,
    fx,
    conversions,
    source_text: lines.join('\n'),
  };
}
