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
  us_campaign_lead: boolean;
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

const US_CAMPAIGN_SEED = 'ola moro nos eua e quero conhecer os imoveis da bossa em sc';

function isUsCampaignLead(history: ChatMessage[]) {
  const firstUser = history.find((item) => item.role === 'user')?.content ?? '';
  const value = normalize(firstUser).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return value.includes(US_CAMPAIGN_SEED)
    || (/\bmoro nos (?:eua|estados unidos|usa)\b/.test(value)
      && /\bquero conhecer\b/.test(value)
      && /\bimoveis da bossa\b/.test(value));
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
  const usCampaignLead = isUsCampaignLead(history);
  if (!detected.livesAbroad && !detected.requestedCurrency && !usCampaignLead) return null;
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

  const campaignRules = usCampaignLead ? [
    'CAMPANHA EUA — CONDUÇÃO OBRIGATÓRIA:',
    '- A frase “Olá! Moro nos EUA e quero conhecer os imóveis da Bossa em SC.” é texto pré-preenchido do anúncio. Não trate essa frase como uma confidência espontânea e não responda “que legal que você mora nos EUA”.',
    '- PRIMEIRA RESPOSTA: não envie imagem, vídeo, folder, planta, tabela, localização nem condição de pagamento. Apresente-se brevemente e faça UMA pergunta: se busca investimento ou imóvel para usar com a família.',
    '- Abertura de referência: “Oi! 😊 Que bom falar com você. Temos imóveis em Porto Belo, no litoral de Santa Catarina, com opções em diferentes fases de obra e perfis. Pra eu te mostrar primeiro o que mais combina com você: está buscando mais como investimento ou para ter um imóvel aqui no Brasil para usar com a família?”',
    '- Se o lead já acrescentou pergunta objetiva (preço, pagamento, empreendimento, faixa etc.), responda primeiro o que ele perguntou e só depois faça a próxima pergunta útil. Nunca ignore informação já fornecida.',
    '- Se responder investimento: pergunte se prefere entrega mais próxima ou pode esperar alguns anos pensando em valorização. Entrega mais próxima direciona primeiro ao Flow; prazo maior direciona primeiro ao Alma.',
    '- Se responder uso próprio/família: pergunte se imagina férias/temporadas ou possibilidade de voltar a morar no Brasil. Depois refine compacto/praticidade versus 3 suítes/mais espaço.',
    '- Depois que houver interesse definido, envie no máximo UMA imagem principal do empreendimento indicado e faça UMA pergunta curta. Mais materiais entram progressivamente conforme a conversa.',
    '- Sequência de materiais: interesse → 1 imagem → conversa → planta quando fizer sentido → conversa → vídeo → conversa → proposta/tabela. Nunca despeje catálogo no primeiro contato.',
    '- Pergunte faixa de investimento somente se ela ainda não foi informada. Se o lead já der valor em USD ou BRL, use esse dado e avance.',
    '- Pergunte cidade/região nos EUA apenas depois que a conversa estiver fluindo; não use isso na primeira resposta.',
    '- Nunca faça interrogatório. Uma pergunta por mensagem. Prioridade de descoberta: objetivo, prazo, empreendimento, faixa, forma de pagamento, cidade, uso, objeção e timing.',
    '- Nunca repita pergunta já respondida no histórico.',
    '- Para Flow: entrega prevista para novembro de 2027, aproximadamente 800 m do mar, apartamentos aproximadamente 62–80 m²; parcelamento pode chegar a 60x conforme condição aplicável.',
    '- Para Alma Sea Houses: entrega prevista para julho de 2030, aproximadamente 350 m do mar, 2 apartamentos por andar, 3 suítes + lavabo e 2 vagas; parcelamento pode chegar a 100x conforme composição.',
    '- Se perguntarem “qual é o melhor?”, compare conforme prazo, tamanho e perfil, sem declarar um vencedor absoluto.',
    '- Se disser que está só pesquisando, não pressione; ofereça uma comparação curta entre Flow e Alma.',
    '- Handoff para Taís somente quando houver intenção real (proposta, unidade, simulação, reserva, desconto, contrato, escolha de planta ou pedido de corretor). Preserve e repasse o contexto para o lead não precisar repetir.',
    '- Tom: humano, simples, consultivo, seguro e sem pressão; mensagens curtas, poucos emojis e sem promessas de valorização/rentabilidade.',
  ] : [];

  const lines = [
    'CLIENTE NO EXTERIOR — DADOS OPERACIONAIS:',
    `- Mora fora do Brasil: ${detected.livesAbroad ? 'sim' : 'não confirmado'}.`,
    detected.location ? `- Local informado: ${detected.location}.` : '',
    '- É possível conduzir grande parte da negociação à distância. Quando houver unidade específica, o comercial confirma a documentação e a assinatura aplicáveis.',
    '- O contrato e os valores dos imóveis são trabalhados em reais. Não afirme espontaneamente que o contrato é em dólar.',
    '- Se o cliente pedir referência em moeda estrangeira, apresente-a apenas como conversão aproximada do dia e mantenha também o valor em reais.',
    ...campaignRules,
    fx
      ? `- Cotação de referência do dia: 1 ${currency} = R$ ${fx.brl_per_currency.toFixed(4).replace('.', ',')} (BCB PTAX, referência aproximada).`
      : `- A cotação ${currency} não pôde ser obtida agora. Não calcule nem estime conversão por conta própria.`,
    ...conversions.map((item) => `- ${item.development}: a partir de R$ ${Math.round(item.brl).toLocaleString('pt-BR')} ≈ ${currency} ${Math.round(item.foreign).toLocaleString('pt-BR')} pela PTAX de hoje.`),
    '- Nunca calcule câmbio mentalmente. Use somente as conversões prontas deste bloco.',
  ].filter(Boolean);

  return {
    requested_currency: currency,
    lives_abroad: detected.livesAbroad,
    location: detected.location,
    us_campaign_lead: usCampaignLead,
    fx,
    conversions,
    source_text: lines.join('\n'),
  };
}
