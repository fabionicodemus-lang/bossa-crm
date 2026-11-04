import { enforceNaraReplyGuardrails, ensureFirstTurnIntroduction, generateAiTurn as generateCoreAiTurn } from './ai';
import { naraConversationLanguage, requestedNaraLanguage } from './nara-language';
import type { AiTrainingContext, AiTurn } from './ai';
import type { Lead } from './types';
import type { NaraUnitOffer } from './nara-unit-queries';
import { adDevelopment, declaredPlace, facadeFor, firstMessageBody } from './nara-first-message';
import { isGenericPortfolioInterest, portfolioFacadesForFirstPresentation, presentsWholePortfolio, selectPortfolioFacadeIds } from './nara-generic-interest';
import {
  asksPermissionToAnswer,
  declaredFirstName,
  declinedTopics,
  enterpriseInFocus,
  explicitHumanRequest,
  purchaseIntent,
  qualificationPaused,
  questionTopic,
  refusesHandoff,
  withoutNegatedRequests,
  withoutUnwantedQualification,
  type Enterprise,
} from './nara-conversation-signals';
import { filesForPlant, isPlantFile, mentionsPlant, plantReply, resolvePlantRequest, type PlantEntry } from './nara-plant-catalog';

export * from './ai';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function assistantMessages(history: ChatMessage[]): string[] {
  return history.filter((item) => item.role === 'assistant').map((item) => item.content);
}

function lastUserText(history: ChatMessage[]): string {
  return [...history].reverse().find((item) => item.role === 'user')?.content ?? '';
}

function userText(history: ChatMessage[]): string {
  return history.filter((item) => item.role === 'user').map((item) => item.content).join(' ');
}

function isSpanishLead(history: ChatMessage[]): boolean {
  return naraConversationLanguage(history) === 'es';
}

function isEnglishLead(history: ChatMessage[]): boolean {
  return naraConversationLanguage(history) === 'en';
}


function buyerContextIsClear(history: ChatMessage[]): boolean {
  const value = normalizeText(userText(history));
  return /\b(vi (?:um |o |a )?anuncio|me interessei|tenho interesse|flow|alma|soul|apartamento|imovel|comprar|compra|morar|veranear|investir|investimento|preco|valor|quanto custa|pagamento|parcela|entrada|planta|obra|entrega|aluguel|prices?|buy|usd|dollars?|decorado|desconto|troca|financiamento)\b/.test(value);
}

function asksHuman(text: string): boolean {
  const value = normalizeText(text);
  return /\b(falar com (?:uma pessoa|alguem|um corretor|corretor|atendente)|quero um corretor|quero falar com gente|atendimento humano|me liga|pode me ligar|hablar con (?:una persona|alguien|un corredor|un asesor|un vendedor)|quiero (?:hablar con|un) (?:asesor|corredor|vendedor|persona)|atencion humana|pueden llamarme|me pueden llamar)\b/.test(value);
}

function isPureInformationRequest(text: string): boolean {
  const value = normalizeText(text);
  return /\b(preco|valor|quanto custa|tabela|foto|fotos|imagem|imagens|video|folder|book|planta|plantas|fachada|localizacao|mapa|endereco|precio|cuanto cuesta|tabla|foto|fotos|imagen|imagenes|video|folleto|plano|planos|ubicacion|direccion)\b/.test(value);
}

function requiresHumanHandoff(text: string): boolean {
  // "Não pedi reserva" ou "sem proposta" não são pedidos de encaminhamento.
  const value = withoutNegatedRequests(normalizeText(text));
  return asksHuman(text)
    || explicitHumanRequest(text)
    || purchaseIntent(text)
    || /\b(proposta|reservar|reserva|negociar|negociacao|desconto|reclamacao|propuesta|negociacion|reclamo)\b/.test(value);
}

function handoffQuestion(history: ChatMessage[]): string {
  const value = normalizeText(userText(history));
  const spanish = isSpanishLead(history);
  if (!/\b(a vista|avista|parcelad|financi|entrada|sinal|mensal|contado|cuotas|financi|entrada|mensual)\b/.test(value)) {
    return spanish ? 'Mientras tanto, ¿piensas pagar al contado o en cuotas?' : 'Enquanto isso: você pensa em pagar à vista ou parcelado?';
  }
  if (!/\b(agora|este mes|esse mes|\d+ meses|ano que vem|202\d|sem pressa|prazo|ahora|este mes|proximo mes|sin apuro|plazo)\b/.test(value)) {
    return spanish ? 'Mientras tanto, ¿en qué plazo piensas comprar?' : 'Enquanto isso: você pensa em comprar em qual prazo?';
  }
  if (!/\b(melhor horario|depois das|apos as|a partir das|manha|tarde|noite|mejor horario|despues de|a partir de|manana|tarde|noche)\b/.test(value)) {
    return spanish ? 'Mientras tanto, ¿cuál es el mejor horario para que Taís te contacte?' : 'Enquanto isso: qual é o melhor horário para a Taís te chamar?';
  }
  return '';
}

function topicFromQuestion(text: string): string {
  const value = normalizeText(text);
  if (/\baluguel|locacao|administracao\b/.test(value)) return 'a administração do aluguel';
  if (/\bdolar|euro|moeda|cambio\b/.test(value)) return 'o pagamento e a conversão de moeda';
  if (/\bassinar|assinatura|contrato\b/.test(value)) return 'a assinatura do contrato';
  if (/\bfinanciamento|caixa\b/.test(value)) return 'o financiamento';
  if (/\bpagamento|parcela|entrada\b/.test(value)) return 'a forma de pagamento';
  const compact = text.replace(/\s+/g, ' ').trim().replace(/[?!.]+$/g, '');
  return compact ? `a sua dúvida sobre “${compact.slice(0, 90)}”` : 'essa dúvida';
}

function looksLikeBadMaterialFallback(text: string): boolean {
  const value = normalizeText(text);
  return /nao tenho confirmacao do envio desse material|comercial podera verificar o pedido|confirmacao do envio|pedido de material/.test(value);
}

function formatBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

function formatForeign(value: number, currency: 'USD' | 'EUR'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function verifiedStartingPrices(context: AiTrainingContext, history: ChatMessage[]): string {
  const ranges = (context.commercial?.calls ?? []).filter((call) => call.name === 'faixa_empreendimento'
    && call.result && !Array.isArray(call.result))
    .map((call) => call.result as { empreendimento: string; valor_minimo: number })
    .filter((item) => item.valor_minimo > 0);
  if (!ranges.length) return '';
  const english = isEnglishLead(history);
  const spanish = isSpanishLead(history);
  const conversion = context.foreign?.fx && context.foreign.conversions;
  const prices = ranges.map((range) => {
    const foreign = conversion && context.foreign?.conversions.find((item) => item.development === range.empreendimento && item.brl === range.valor_minimo);
    const converted = foreign ? ` (≈ ${formatForeign(foreign.foreign, foreign.currency)})` : '';
    return `${range.empreendimento}: ${english ? 'from' : spanish ? 'desde' : 'a partir de'} ${formatBrl(range.valor_minimo)}${converted}`;
  }).join('; ') + (conversion ? english ? '. Approximate PTAX conversion.' : spanish ? '. Conversión PTAX aproximada.' : '. Conversão PTAX aproximada.' : '.');
  const question = english ? 'Which one interests you most?' : spanish ? '¿Cuál te interesa más?' : 'Qual deles te interessa mais?';
  return `${prices} ${question}`;
}

function foreignCurrencyReply(context: AiTrainingContext, spanish: boolean): string {
  const foreign = context.foreign;
  if (!foreign?.requested_currency || !foreign.fx || !foreign.conversions.length) return '';
  const first = foreign.conversions[0];
  if (spanish) {
    return `Hoy parte de ${formatBrl(first.brl)}, aproximadamente ${formatForeign(first.foreign, foreign.requested_currency)} según la PTAX del día. El contrato se trabaja en reales y la conversión es solo una referencia cambiaria.`;
  }
  return `Hoje parte de ${formatBrl(first.brl)}, cerca de ${formatForeign(first.foreign, foreign.requested_currency)} pela PTAX do dia. O contrato é trabalhado em reais e a conversão é apenas uma referência cambial.`;
}

function foreignPurchaseReply(name: string, spanish: boolean): string {
  void name;
  if (spanish) {
    return 'Sí, gran parte de la negociación puede hacerse a distancia. El contrato y los valores se trabajan en reales; al elegir una unidad, el equipo confirma la documentación y firma aplicables. ¿Buscas invertir o usar el inmueble con tu familia?';
  }
  return 'Dá sim. Grande parte da negociação pode ser feita à distância. O contrato e os valores são trabalhados em reais; ao escolher uma unidade, o comercial confirma documentação e assinatura. Você busca investir ou usar o imóvel com a família?';
}

function slaReply(context: AiTrainingContext, spanish: boolean): string {
  const op = context.operational;
  if (!op) return spanish ? 'Ya pasé tu atención a Taís, del equipo comercial.' : 'Já passei para a Taís do comercial. Ela assume seu atendimento agora.';
  return op.business_open_now
    ? (spanish ? `Taís, del equipo comercial, te contacta en hasta ${op.hot_lead_sla_minutes} minutos.` : `A Taís do comercial te chama em até ${op.hot_lead_sla_minutes} minutos.`)
    : (spanish ? `Nuestro equipo vuelve ${op.next_business_label} y tu atención queda como prioridad.` : `Nosso time volta ${op.next_business_label} e você será o primeiro a ser atendido.`);
}

function plantQualifier(text: string): string | null {
  const value = normalizeText(text);
  const type = value.match(/\btipo\s*0?(\d+)\b/);
  if (type?.[1]) return `tipo ${type[1]}`;
  const duplex = value.match(/\bduplex\s*0?(\d+)\b/);
  if (duplex?.[1]) return `duplex ${duplex[1]}`;
  const suites = value.match(/\b(\d+)\s*suites?\b/);
  if (suites?.[1]) return `${suites[1]} suite`;
  const numberedPlant = value.match(/\bplanta\s*0?(\d+)\b/);
  if (numberedPlant?.[1]) return `planta ${numberedPlant[1]}`;
  return null;
}

function choosePromisedFile(history: ChatMessage[], context: AiTrainingContext): string[] {
  const latest = normalizeText(lastUserText(history));
  if (!/^(sim|s|pode|pode mandar|manda|me manda|quero|legal|ok|ta|beleza|si|sí|puede|puedes|manda|enviame|envíame|quiero|dale)\b/.test(latest)) return [];
  const previousAssistant = [...history].reverse().find((item) => item.role === 'assistant')?.content ?? '';
  const offered = normalizeText(previousAssistant);
  const isPlant = offered.includes('planta') || offered.includes('plano');
  // Planta prometida é tratada pela seleção determinística do catálogo de plantas.
  if (isPlant) return [];
  const terms = isPlant ? ['planta','plano']
    : offered.includes('folder') || offered.includes('book') || offered.includes('folleto') ? ['folder','book','folleto']
      : offered.includes('foto') || offered.includes('imagem') || offered.includes('imagen') ? ['foto','imagem','imagen','render']
        : offered.includes('video') ? ['video','obra']
          : [];
  if (!terms.length) return [];

  const qualifier = isPlant ? plantQualifier(history.map((item) => item.content).join(' ')) : null;
  if (isPlant && !qualifier) return [];

  return (context.files ?? [])
    .filter((file) => {
      const haystack = normalizeText([file.category,file.title,file.description ?? '',...(file.trigger_keywords ?? [])].join(' '));
      const categoryMatch = terms.some((term) => haystack.includes(term));
      if (!categoryMatch) return false;
      return !qualifier || haystack.includes(qualifier) || haystack.includes(qualifier.replace(' ', ' 0'));
    })
    .slice(0, 1)
    .map((file) => file.id);
}

function developmentFromHistory(history: ChatMessage[]): 'alma' | 'flow' | null {
  // Empreendimento em discussão agora (o último citado), não o primeiro da conversa.
  const focus = enterpriseInFocus(history);
  return focus === 'alma' || focus === 'flow' ? focus : null;
}

function locationFileId(history: ChatMessage[], context: AiTrainingContext): string | null {
  const development = developmentFromHistory(history);
  if (!development) return null;
  const candidate = (context.files ?? []).find((file) => {
    const haystack = normalizeText([file.category, file.title, file.description ?? '', ...(file.trigger_keywords ?? [])].join(' '));
    return haystack.includes(development)
      && /\b(localizacao|ubicacion|mapa)\b/.test(haystack);
  });
  return candidate?.id ?? null;
}

function mapsSearchUrl(development: 'alma' | 'flow'): string {
  return development === 'alma'
    ? 'https://www.google.com/maps/search/?api=1&query=Alma%20Seahouses%20Porto%20Belo%20SC'
    : 'https://www.google.com/maps/search/?api=1&query=Flow%20Aptos%20Porto%20Belo%20SC';
}


function ensureFirstReplyIdentity(reply: string, history: ChatMessage[]): string {
  // Reaproveita a mesma validação idempotente do motor central.
  return ensureFirstTurnIntroduction(reply, history, {});
}

function materialQualificationQuestion(history: ChatMessage[]): string {
  // Cliente só pesquisando ou que recusou a pergunta não recebe outra pergunta de qualificação.
  if (qualificationPaused(history)) return '';
  const declined = declinedTopics(history);
  const asked = new Set(assistantMessages(history).map((message) => questionTopic(message.split(/[.!]/).at(-1) ?? '')).filter(Boolean));
  const value = normalizeText(userText(history));
  const spanish = isSpanishLead(history);
  if (!declined.has('suites') && !asked.has('suites') && !/\b\d+\s*(?:suites?|quartos?|habitaciones?)\b|\b(?:dois|tres|quatro|dos|tres|cuatro)\s*(?:suites?|quartos?|habitaciones?)\b|\b\d{2,3}\s*(?:m2|m²|metros)\b/.test(value)) {
    return spanish ? '¿Cuántas suites buscas?' : 'Quantas suítes você procura?';
  }
  if (!declined.has('finalidade') && !asked.has('finalidade') && !/\b(morar|moradia|investir|investimento|viver|vivir|invertir|inversion|ferias|veranear|temporada)\b/.test(value)) {
    return spanish ? '¿Lo buscas para vivir o para invertir?' : 'Você procura para morar ou investir?';
  }
  return '';
}

/** Remove frases em que a Nara desmente um valor que ela mesma já informou nesta conversa. */
function withoutPriceRetraction(reply: string, history: ChatMessage[]): string {
  const informedBefore = assistantMessages(history).some((message) => /R\$\s*\d/.test(message));
  if (!informedBefore) return reply;
  const sentences = reply.trim().match(/[^.!?]+[.!?]*\s*/g) ?? [];
  const kept = sentences.filter((sentence) => !/\b(?:nao (?:estava|estavam) (?:validad|confirmad)\w*|informacao (?:imprecisa|incorreta)|(?:valor|preco|faixa) que (?:eu )?(?:mencionei|informei|passei|citei)(?: antes)?\b.{0,40}\b(?:nao|sem)\b)/.test(normalizeText(sentence)));
  const result = kept.join('').trim();
  return result || reply;
}

function finishTurn(turn: AiTurn, history: ChatMessage[]): AiTurn {
  turn.reply = ensureFirstReplyIdentity(turn.reply, history);
  const latest = lastUserText(history);
  if (isPureInformationRequest(latest) && !requiresHumanHandoff(latest)) {
    turn.handoff = false;
  }
  // Recusa atual vale mais que qualquer leitura anterior: "não encaminha", "sem corretor", "volto depois".
  if (turn.handoff && refusesHandoff(latest) && !explicitHumanRequest(latest) && !purchaseIntent(latest)) {
    turn.handoff = false;
    if (turn.classification === 'quente') turn.classification = 'morno';
    turn.score = Math.min(turn.score, 40);
    turn.next_action = 'Contato pediu para não ser encaminhado agora; respeitar e seguir só por mensagem quando ele voltar.';
  }
  // Pedido de alguém para confirmar uma informação não é intenção de compra.
  if (turn.handoff && !history.some((item) => item.role === 'user' && purchaseIntent(item.content)) && turn.classification === 'quente') {
    turn.classification = 'morno';
    turn.score = Math.min(turn.score, 50);
  }
  turn.reply = withoutPriceRetraction(turn.reply, history);
  turn.reply = withoutUnwantedQualification(turn.reply, history);
  if (turn.attachment_ids.length > 0 && !turn.handoff && !turn.reply.includes('?')) {
    const question = materialQualificationQuestion(history);
    if (question) turn.reply = `${turn.reply.trim()} ${question}`;
  }
  return turn;
}

function looksLikeTriageQuestion(text: string): boolean {
  const value = normalizeText(text);
  return (/buscando.*imovel.*comprar/.test(value) && /outro assunto|outro atendimento/.test(value))
    || (/interesse.*comprar/.test(value) && /outro assunto|outro atendimento|assunto/.test(value))
    || (/conhecer.*imovel.*comprar/.test(value) && /outro atendimento/.test(value));
}

function hasPriorTriage(history: ChatMessage[]): boolean {
  return assistantMessages(history).some(looksLikeTriageQuestion);
}

export function naraReplyOpeningKey(value: string): string {
  const firstClause = normalizeText(value.split(/[.!?]/, 1)[0] ?? '');
  if (!firstClause) return '';
  return firstClause.split(' ').slice(0, 4).join(' ');
}

function withoutRepeatedOpening(value: string): string {
  const match = value.trim().match(/^[^.!?]+[.!?]\s*(.+)$/s);
  if (!match?.[1]?.trim()) return '';
  const remainder = match[1].trim();
  return remainder.charAt(0).toLocaleUpperCase('pt-BR') + remainder.slice(1);
}

function applyConversationDecision(
  turn: AiTurn,
  values: {
    reply: string;
    handoff?: boolean;
    summary: string;
    nextAction: string;
    score?: number;
  },
): AiTurn {
  turn.reply = values.reply;
  turn.classification = 'frio';
  turn.score = values.score ?? Math.min(turn.score, 20);
  turn.stage = 'ia';
  turn.summary = values.summary;
  turn.next_action = values.nextAction;
  turn.handoff = values.handoff ?? false;
  turn.attachment_ids = [];
  turn.extracted.budget = '';
  turn.extracted.typology = '';
  turn.extracted.deadline = '';
  turn.extracted.decision_maker = '';
  return turn;
}

const ENTERPRISE_NAME: Record<Enterprise, string> = { soul: 'Soul', flow: 'Flow', alma: 'Alma' };

function conversationLanguage(history: ChatMessage[]): 'pt' | 'es' | 'en' {
  return isSpanishLead(history) ? 'es' : isEnglishLead(history) ? 'en' : 'pt';
}

function asksApartmentPrice(latestNormalized: string): boolean {
  return /\b(precos?|precio|prices?|valor(?:es)?|quanto (?:custa|ta|tá|esta|fica|sai|e|da)|(?:fica|sai|custa|ta|esta|comeca|da) (?:em |por )?quanto|cuanto (?:cuesta|sale)|how much|dolar|usd|cabe no bolso|o total|valor total|total do menor)\b/.test(latestNormalized)
    || /\b(?:ate|hasta|up to)\s+(?:r\$\s*)?\d/.test(latestNormalized);
}

function formatBrlExact(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

type PriceRange = { empreendimento: string; valor_minimo: number; valor_maximo: number };

/** Faixa de preço do empreendimento em discussão, a partir das consultas comerciais deste turno. */
function rangeForEnterprise(context: AiTrainingContext, focus: Enterprise | null): PriceRange | null {
  const calls = context.commercial?.calls ?? [];
  const matches = (name: string) => !focus || normalizeText(name).includes(focus);
  const ranges = calls
    .filter((call) => call.name === 'faixa_empreendimento' && call.result && !Array.isArray(call.result))
    .map((call) => call.result as PriceRange)
    .filter((item) => item.valor_minimo > 0 && matches(item.empreendimento));
  if (ranges.length === 1) return ranges[0];
  if (ranges.length > 1 && focus) return ranges[0];
  const offers = calls.flatMap((call) => call.name === 'consultar_apartamento'
    ? call.result && !Array.isArray(call.result) ? [call.result as NaraUnitOffer] : []
    : call.name === 'buscar_apartamentos' && Array.isArray(call.result) ? call.result as NaraUnitOffer[] : [])
    .filter((offer) => offer.valor > 0 && matches(offer.empreendimento));
  if (!offers.length) return null;
  const values = offers.map((offer) => offer.valor);
  return { empreendimento: offers[0].empreendimento, valor_minimo: Math.min(...values), valor_maximo: Math.max(...values) };
}

function moneyValues(text: string): number[] {
  return [...text.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(milh(?:ao|ão|oes|ões)|mil)?/giu)].map((match) => {
    const base = Number(`${match[1].replace(/\./g, '')}.${match[2] ?? '0'}`);
    const unit = normalizeText(match[3] ?? '');
    return unit.startsWith('milh') ? base * 1_000_000 : unit === 'mil' ? base * 1_000 : base;
  });
}

function replyHasRangeValue(reply: string, range: PriceRange): boolean {
  const targets = [range.valor_minimo, range.valor_maximo].map(Math.round);
  return moneyValues(reply).some((value) => targets.includes(Math.round(value)));
}

function retractsPrice(reply: string): boolean {
  const value = normalizeText(reply);
  return /\bnao (?:estava|esta|estavam|estao) (?:validad|confirmad)|\bnao tenho\b.{0,25}\b(?:valor|valores|preco|precos)\b|precisa(?:m)? ser confirmad|nao consigo (?:informar|confirmar|garantir|afirmar)|no tengo\b.{0,20}\b(?:precio|valor)|i do not have\b.{0,20}\bprice/.test(value);
}

function userBudget(history: ChatMessage[]): number | null {
  const value = normalizeText(userText(history));
  const match = value.match(/\b(?:ate|hasta|teto de|orcamento de|tenho)\s+(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(milhao|milhoes|mi|mil)?\b/);
  if (!match) return null;
  const base = Number(match[1].replace(/\.(?=\d{3})/g, '').replace(',', '.'));
  const unit = match[2] ?? '';
  const amount = unit.startsWith('mi') ? base * 1_000_000 : unit === 'mil' ? base * 1_000 : base;
  return amount >= 50_000 ? amount : null;
}

function naturalPriceReply(range: PriceRange, history: ChatMessage[], context: AiTrainingContext = {}): string {
  const language = conversationLanguage(history);
  const conversion = context.foreign?.fx
    ? context.foreign.conversions.find((item) => item.development === range.empreendimento && Math.round(item.brl) === Math.round(range.valor_minimo))
    : undefined;
  const min = `${formatBrlExact(range.valor_minimo)}${conversion ? ` (≈ ${formatForeign(conversion.foreign, conversion.currency)}${language === 'en' ? ', approximate PTAX' : language === 'es' ? ', PTAX aproximada' : ' pela PTAX do dia'})` : ''}`;
  const max = range.valor_maximo > range.valor_minimo ? formatBrlExact(range.valor_maximo) : '';
  const name = range.empreendimento;
  const asked = normalizeText(userText(history));
  const mentionsTotal = /\b(total|balao|baloes|por fora|entrada|cabe no bolso)\b/.test(asked);
  const budget = userBudget(history);
  const belowBudget = budget !== null && budget < range.valor_minimo;
  const paused = qualificationPaused(history);
  const focus = enterpriseInFocus(history);
  const offerPlant = !paused && !belowBudget && (focus === 'alma' || focus === 'flow');
  if (language === 'es') {
    return [
      `${name} empieza en ${min}${max ? ` y llega a ${max}` : ''}.`,
      mentionsTotal ? 'Es el precio total: entrada, cuotas, anuales y llaves ya están dentro de ese valor.' : '',
      belowBudget ? 'Así que, hasta tu presupuesto, no tiene opción en este proyecto.' : '',
      offerPlant ? '¿Te envío la planta de la opción de menor valor?' : '',
    ].filter(Boolean).join(' ');
  }
  if (language === 'en') {
    return [
      `${name} starts at ${min}${max ? ` and goes up to ${max}` : ''}.`,
      mentionsTotal ? 'That is the total price: down payment, installments, annual payments and keys are all inside it.' : '',
      belowBudget ? 'So, within your budget, there is no option in this project.' : '',
      offerPlant ? 'Want me to send the floor plan of the lowest-priced option?' : '',
    ].filter(Boolean).join(' ');
  }
  return [
    `O ${name} começa em ${min}${max ? ` e vai até ${max}` : ''}.`,
    mentionsTotal ? 'Esse é o preço total: entrada, parcelas, anuais e chaves já estão dentro dele.' : '',
    belowBudget ? 'Então, dentro do seu teto, ele não tem opção.' : '',
    offerPlant ? 'Quer que eu te mande a planta da opção de menor valor?' : '',
  ].filter(Boolean).join(' ');
}

function mentionsOtherEnterprisePrice(reply: string, focus: Enterprise): boolean {
  if (!moneyValues(reply).length) return false;
  const value = normalizeText(reply);
  const others = (['soul', 'flow', 'alma'] as const).filter((name) => name !== focus);
  return !new RegExp(`\\b${focus}\\b`).test(value) && others.some((name) => new RegExp(`\\b${name}\\b`).test(value));
}

function missingPriceReply(focus: Enterprise, history: ChatMessage[]): string {
  const language = conversationLanguage(history);
  const name = ENTERPRISE_NAME[focus];
  if (qualificationPaused(history) || refusesHandoff(lastUserText(history))) {
    if (language === 'es') return `El valor actualizado de ${name} no está conmigo ahora. Cuando quieras retomar, escríbeme por aquí.`;
    if (language === 'en') return `I do not have the updated price for ${name} with me right now. Whenever you want to pick this up again, just message me here.`;
    return `O valor atualizado do ${name} não está aqui comigo agora. Quando quiser retomar, é só me chamar por aqui.`;
  }
  if (language === 'es') return `El valor actualizado de ${name} no está conmigo ahora. ¿Quieres que le pida al equipo que te lo envíe por mensaje?`;
  if (language === 'en') return `I do not have the updated price for ${name} with me right now. Want me to ask the team to send it to you by message?`;
  return `O valor atualizado do ${name} não está aqui comigo agora. Quer que eu peça para o time te mandar por mensagem?`;
}

/** Pedido de planta: escolhe pelo catálogo oficial, anexa e explica. */
function plantRequestTurn(turn: AiTurn, history: ChatMessage[], context: AiTrainingContext): AiTurn | null {
  const latest = lastUserText(history);
  const latestNormalized = normalizeText(latest);
  const previousAssistant = [...history].reverse().find((item) => item.role === 'assistant')?.content ?? '';
  const acceptsOffer = !mentionsPlant(latest)
    && /^(sim|s|pode|pode mandar|pode sim|manda|me manda|quero|quero ver|claro|ok|beleza|bora|si|sí|dale|yes|sure)\b/.test(latestNormalized)
    && mentionsPlant(previousAssistant) && previousAssistant.includes('?');
  // "3 suítes", "a de 103 m²", "Tipo 01" respondendo a uma pergunta da Nara sobre planta.
  const answersPlantQuestion = !mentionsPlant(latest) && !acceptsOffer
    && mentionsPlant(previousAssistant) && previousAssistant.includes('?')
    && /\b(\d|dois|duas|tres|quatro)\s*(?:suites?|quartos?)\b|\b\d{2,3}(?:[.,]\d)?\s*(?:m2|m²|m\b|metros)|\btipo\s*0?\d\b|\bduplex\b|\b(?:menor|maior)\b/.test(latestNormalized);
  if (!mentionsPlant(latest) && !acceptsOffer && !answersPlantQuestion) return null;
  const development = developmentFromHistory(history);
  if (!development) return null;

  const request = acceptsOffer
    ? /\bduplex\b/.test(normalizeText(previousAssistant))
      ? resolvePlantRequest(development, 'duplex')
      : resolvePlantRequest(development, previousAssistant)
    : resolvePlantRequest(development, latest, previousAssistant);
  const sent: PlantEntry[] = [];
  const ids: string[] = [];
  for (const entry of request.entries) {
    const files = filesForPlant(entry, context.files ?? []);
    if (!files.length) continue;
    sent.push(entry);
    ids.push(...files.slice(0, 2).map((file) => file.id));
  }
  turn.attachment_ids = [...new Set(ids)].slice(0, 3);
  if (!sent.length) {
    // Biblioteca com nomes genéricos ("Planta Flow 2 suítes"): usa o arquivo do empreendimento que
    // bate com as suítes pedidas, em vez de deixar o cliente sem planta.
    const suites = [...new Set(request.entries.map((entry) => entry.suites))];
    const projectFiles = (context.files ?? []).filter((file) => isPlantFile(file)
      && new RegExp(`\\b${development}\\b`).test(normalizeText([file.category, file.title, file.description ?? '', file.original_name ?? '', ...(file.trigger_keywords ?? [])].join(' '))));
    const bySuites = suites.length === 1
      ? projectFiles.filter((file) => new RegExp(`\\b${suites[0]}\\s*suites?\\b`).test(normalizeText([file.title, file.description ?? '', ...(file.trigger_keywords ?? [])].join(' '))))
      : [];
    const fallback = bySuites.length ? bySuites : projectFiles.length === 1 ? projectFiles : [];
    if (fallback.length) {
      turn.attachment_ids = fallback.slice(0, 2).map((file) => file.id);
      const language = conversationLanguage(history);
      const areas = [...new Set(request.entries.map((entry) => entry.areaLabel))].join(language === 'en' ? ' or ' : language === 'es' ? ' o ' : ' ou ');
      const name = ENTERPRISE_NAME[development];
      const suiteText = suites.length === 1 ? `${suites[0]} ${language === 'pt' ? 'suítes' : 'suites'}` : '';
      turn.reply = language === 'es'
        ? `Aquí está la planta de ${name}${suiteText ? ` de ${suiteText}` : ''}, con ${areas}.`
        : language === 'en'
          ? `Here is the ${name} floor plan${suiteText ? ` with ${suiteText}` : ''}, ${areas}.`
          : `Aqui está a planta do ${name}${suiteText ? ` de ${suiteText}` : ''}, com ${areas}.`;
      if (!explicitHumanRequest(latest) && !purchaseIntent(latest)) turn.handoff = false;
      turn.summary = 'Planta enviada pelo arquivo genérico do empreendimento.';
      turn.next_action = 'Continuar a conversa a partir da planta enviada, sem interrogar.';
      return turn;
    }
  }
  turn.reply = plantReply({
    development,
    request,
    sentEntries: sent,
    language: conversationLanguage(history),
    allowQuestion: !qualificationPaused(history),
  });
  if (!explicitHumanRequest(latest) && !purchaseIntent(latest)) turn.handoff = false;
  turn.summary = sent.length
    ? `Planta enviada pelo catálogo oficial: ${sent.map((entry) => `${entry.label} (${entry.areaLabel})`).join(', ')}.`
    : 'Cliente pediu planta, mas o arquivo correspondente não está na biblioteca; Nara explicou a planta em texto.';
  turn.next_action = sent.length
    ? 'Continuar a conversa a partir da planta enviada, sem interrogar.'
    : 'Cadastrar o arquivo dessa planta na biblioteca da Nara.';
  return turn;
}

/** Pedido de foto da fachada: anexa a fachada do empreendimento em discussão. */
function facadeRequestFile(history: ChatMessage[], context: AiTrainingContext): { id: string; reply: string } | null {
  const latest = normalizeText(lastUserText(history));
  if (!/\b(fachada|foto do predio|foto do prédio|foto (?:dele|do alma|do flow|do soul|do empreendimento)|como (?:ele )?e por fora|fachada|frente del edificio)\b/.test(latest)) return null;
  const focus = enterpriseInFocus(history);
  if (!focus) return null;
  const id = facadeFor(context.files ?? [], focus);
  if (!id) return null;
  const language = conversationLanguage(history);
  const detail: Record<Enterprise, Record<'pt' | 'es' | 'en', string>> = {
    alma: { pt: 'Aqui está a fachada do Alma: são 30 andares, com só dois apartamentos por andar.', es: 'Aquí está la fachada de Alma: son 30 pisos, con solo dos departamentos por piso.', en: 'Here is the Alma facade: 30 floors, with only two apartments per floor.' },
    flow: { pt: 'Aqui está a fachada do Flow, a 800 m do mar.', es: 'Aquí está la fachada de Flow, a 800 m del mar.', en: 'Here is the Flow facade, 800 m from the beach.' },
    soul: { pt: 'Aqui está a fachada do Soul, já pronto em Itapema.', es: 'Aquí está la fachada de Soul, ya terminado en Itapema.', en: 'Here is the Soul facade, already finished in Itapema.' },
  };
  return { id, reply: detail[focus][language] };
}

export function postProcessNaraTurn(
  turn: AiTurn,
  history: ChatMessage[],
  context: AiTrainingContext = {},
): AiTurn {
  const latest = normalizeText(lastUserText(history));
  const priorMessages = assistantMessages(history);
  const priorReplies = priorMessages.map(normalizeText);
  const name = declaredFirstName(lastUserText(history));
  const clearBuyerContext = buyerContextIsClear(history);
  const latestRaw = lastUserText(history);
  const latestNormalized = normalizeText(latestRaw);
  const spanish = isSpanishLead(history);
  const isLanguageRequest = Boolean(requestedNaraLanguage(latestRaw));
  if (isLanguageRequest) return finishTurn(turn, history);
  const nonApartmentValue = /\b(?:valor|preco|precio|quanto custa|cuanto cuesta|how much)\b.{0,28}\b(?:condominio|iptu|aluguel|taxa|laudemio|itbi|escritura|entrada|parcelas?|reforcos?|chaves)\b/.test(latestNormalized);
  const asksPriceNow = !nonApartmentValue && asksApartmentPrice(latestNormalized);
  const exactUsCampaignSeed = /^ola[!.]?\s+moro nos (?:eua|estados unidos|usa) e quero conhecer os imoveis da bossa em sc\.?$/.test(latestNormalized);

  if (context.foreign?.us_campaign_lead && exactUsCampaignSeed && history.filter((item) => item.role === 'user').length === 1) {
    turn.reply = 'Oi! 😊 Que bom falar com você. Temos imóveis em Porto Belo, no litoral de Santa Catarina, em diferentes fases de obra. Pra eu te mostrar primeiro o que combina com você: busca mais investimento ou um imóvel no Brasil para usar com a família?';
    turn.classification = 'morno';
    turn.score = Math.max(30, Math.min(turn.score, 59));
    turn.stage = 'ia';
    turn.summary = 'Lead da campanha para brasileiros nos EUA iniciou pela mensagem padrão do anúncio.';
    turn.next_action = 'Aguardar investimento ou uso próprio; não enviar material no primeiro contato.';
    turn.handoff = false;
    turn.attachment_ids = [];
    return finishTurn(turn, history);
  }

  if (isGenericPortfolioInterest(history)) {
    const facadeIds = selectPortfolioFacadeIds(context.files ?? []);
    turn.reply = facadeIds.length
      ? 'Hoje temos o Soul pronto em Itapema, o Flow com 2 suítes e duplex para 2027, e o Alma com 3 e 4 suítes para 2030. Te mando as fachadas. Quer mais fotos, plantas ou folder de algum deles?'
      : 'Hoje temos o Soul pronto em Itapema, o Flow com 2 suítes e duplex para 2027, e o Alma com 3 e 4 suítes para 2030. Quer mais fotos, plantas ou folder de algum deles?';
    turn.classification = 'morno';
    turn.score = Math.max(30, Math.min(turn.score, 59));
    turn.stage = 'ia';
    turn.summary = 'Contato respondeu a uma apresentação geral e quer conhecer melhor os empreendimentos.';
    turn.next_action = 'Apresentar os produtos e oferecer material do empreendimento que gerar mais interesse.';
    turn.handoff = false;
    turn.attachment_ids = facadeIds;
    return finishTurn(turn, history);
  }

  if (asksPriceNow) {
    const focus = enterpriseInFocus(history);
    const range = rangeForEnterprise(context, focus);
    const portfolio = !focus ? verifiedStartingPrices(context, history) : '';
    if (!range && portfolio) {
      // Pergunta de preço sem empreendimento definido: mostra a carteira inteira.
      const foreignPurchase = /\b(puedo comprar|buy from|buy remotely|comprar desde|comprar morando)\b/.test(latestNormalized);
      turn.reply = foreignPurchase
        ? `${spanish ? 'Sí, puedes comprar desde el exterior con firma electrónica.' : 'Yes, you can buy remotely with an electronic signature.'} ${portfolio}`
        : portfolio;
      turn.handoff = false;
      turn.summary = 'Valores iniciais informados a partir da tabela vigente consultada neste turno.';
      turn.next_action = 'Continuar o atendimento e confirmar empreendimento de interesse.';
      return finishTurn(turn, history);
    }
    if (range) {
      const alreadyHasPrice = replyHasRangeValue(turn.reply, range);
      const asksWhichWithOneProject = Boolean(focus) && /qual deles te interessa|cual te interesa mas|which one interests you/.test(normalizeText(turn.reply));
      if (!alreadyHasPrice || retractsPrice(turn.reply) || asksPermissionToAnswer(turn.reply) || asksWhichWithOneProject) {
        turn.reply = naturalPriceReply(range, history, context);
        turn.attachment_ids = [];
      }
      if (!explicitHumanRequest(latestRaw) && !purchaseIntent(latestRaw)) turn.handoff = false;
      turn.summary = `Valor de ${range.empreendimento} informado a partir da tabela vigente consultada neste turno.`;
      turn.next_action = 'Continuar a conversa sobre o empreendimento em discussão, sem pressionar.';
      return finishTurn(turn, history);
    }
    if (focus && mentionsOtherEnterprisePrice(turn.reply, focus)) {
      // Cliente perguntou de um empreendimento e a resposta trouxe o preço de outro (ex.: Soul → Alma).
      turn.reply = missingPriceReply(focus, history);
      turn.attachment_ids = [];
      if (!explicitHumanRequest(latestRaw)) turn.handoff = false;
      return finishTurn(turn, history);
    }
  }

  const asksForeignPurchase = /\b(moro|morando|resido|vivo|soy|vivo en|resido en)\b.{0,45}\b(orlando|miami|estados unidos|eua|usa|fora do brasil|exterior|portugal|dinamarca|chile|santiago|fuera de brasil)\b/.test(latestNormalized)
    && /\b(compr\w*|assin\w*|contrato|pag\w*|comprar|firmar|pagar)\b/.test(latestNormalized);
  if (asksForeignPurchase) {
    turn.reply = foreignPurchaseReply(name, spanish);
    turn.classification = turn.classification === 'frio' ? 'morno' : turn.classification;
    turn.score = Math.max(turn.score, 35);
    turn.summary = `Lead mora no exterior${context.foreign?.location ? ` (${context.foreign.location})` : ''} e confirmou interesse em compra à distância.`;
    turn.next_action = 'Continuar qualificação de uso, prazo e forma de pagamento; não exigir presença física para assinatura.';
    return finishTurn(turn, history);
  }

  const asksPrice = /\b(quanto|valor|fica|cust|preco|precio|cuanto|cuesta|valor)\b/.test(latestNormalized);
  if (context.foreign && (asksPrice || /\b(dolar|usd|euro|eur)\b/.test(latestNormalized))) {
    const converted = foreignCurrencyReply(context, spanish);
    if (converted) {
      turn.reply = converted;
      turn.summary = 'Lead no exterior pediu conversão de preço; valor calculado com cotação PTAX do dia e tabela viva em reais.';
      turn.next_action = 'Seguir qualificação sem substituir a tabela oficial em reais pela referência cambial.';
      return finishTurn(turn, history);
    }
  }

  if (/\b(demora muito|quanto tempo|em quanto tempo|quando (?:ele|ela|o corretor|a corretora|o comercial) (?:me )?(?:chama|responde|liga))\b/.test(latestNormalized)) {
    turn.reply = slaReply(context, spanish);
    turn.handoff = true;
    turn.classification = 'quente';
    turn.score = Math.max(turn.score, 80);
    turn.summary = turn.summary || 'Lead perguntou o prazo para retorno do comercial.';
    turn.next_action = 'Taís deve assumir o atendimento dentro do SLA informado.';
    return finishTurn(turn, history);
  }

  if (asksHuman(latestRaw) && clearBuyerContext) {
    const extra = handoffQuestion(history);
    turn.reply = spanish ? `Ya estoy llamando a Taís, del equipo comercial.${extra ? ` ${extra}` : ''}` : `Já estou chamando a Taís do comercial.${extra ? ` ${extra}` : ''}`;
    turn.handoff = true;
    turn.classification = 'quente';
    turn.score = Math.max(turn.score, 80);
    turn.summary = turn.summary || 'Lead de compra pediu atendimento humano.';
    turn.next_action = 'Taís deve assumir imediatamente usando o histórico e os dados já coletados.';
    return finishTurn(turn, history);
  }

  if (looksLikeBadMaterialFallback(turn.reply)) {
    const topic = topicFromQuestion(latestRaw);
    turn.reply = spanish
      ? `Sobre ${topic}, no tengo esa información confirmada en mi base. Te digo lo que sí está disponible y, si hace falta, el equipo comercial complementa sin que tengas que repetir.`
      : `Sobre ${topic}, isso não está confirmado na minha base. Posso te passar o que está disponível e, se precisar, o comercial complementa sem você repetir.`;
    const alreadyInHandoff = priorMessages.some((message) => /ta[ií]s.*comercial|chamando a ta[ií]s|llamando a ta[ií]s|equipo comercial/.test(normalizeText(message)));
    turn.handoff = alreadyInHandoff;
    turn.summary = `Dúvida fora da base: ${latestRaw.slice(0, 300)}`;
    turn.next_action = alreadyInHandoff
      ? 'Taís deve continuar a partir do histórico sem pedir o assunto novamente.'
      : 'Responder com o que estiver confirmado e só escalar se houver pedido explícito de atendimento humano.';
  }

  const promisedFiles = choosePromisedFile(history, context);
  if (promisedFiles.length && !turn.attachment_ids.length) {
    turn.attachment_ids = promisedFiles;
  }

  const plantTurn = plantRequestTurn(turn, history, context);
  if (plantTurn) return finishTurn(plantTurn, history);

  const facade = facadeRequestFile(history, context);
  if (facade && !turn.attachment_ids.includes(facade.id)) {
    turn.attachment_ids = [facade.id, ...turn.attachment_ids.filter((id) => id !== facade.id)].slice(0, 3);
    turn.reply = facade.reply;
    if (!explicitHumanRequest(latestRaw)) turn.handoff = false;
    return finishTurn(turn, history);
  }

  const asksLocationNow = /\b(localizacao|endereco|mapa|onde fica|ubicacion|direccion|donde queda)\b/.test(latestNormalized);
  const development = developmentFromHistory(history);
  if (asksLocationNow && development) {
    const mapFile = locationFileId(history, context);
    if (mapFile && !turn.attachment_ids.includes(mapFile)) {
      turn.attachment_ids = [mapFile, ...turn.attachment_ids].slice(0, 3);
    }
    const url = mapsSearchUrl(development);
    const projectName = development === 'alma' ? 'Alma Seahouses' : 'Flow Aptos';
    turn.reply = spanish
      ? `Aquí tienes la ubicación de ${projectName} en Google Maps: ${url}`
      : `Aqui está a localização do ${projectName} no Google Maps: ${url}`;
    turn.handoff = false;
    turn.summary = `Lead pediu localização do ${projectName}; link do Google Maps fornecido.`;
    turn.next_action = 'Continuar atendimento pela Nara e fazer uma pergunta de qualificação na próxima interação se necessário.';
  }

  const asksIfRobot = /\b(voce e|vc e|e uma|eh uma|e um|eh um|isso e|aqui e|falando com)\s*(?:um |uma )?(?:robo|robot|bot|ia|inteligencia artificial|maquina|pessoa de verdade|humano|humana|gente de verdade)\b|\b(?:robo|bot|ia) ou (?:pessoa|humano|gente)\b|\b(?:pessoa|humano|gente) ou (?:robo|bot|ia)\b|\bassistente digital\b|\b(?:eres|es) (?:un )?(?:robot|bot|ia|humano)\b|\bare you (?:a )?(?:bot|robot|human|ai)\b/.test(latest);
  if (asksIfRobot) {
    const firstTurn = priorMessages.length === 0;
    const hasOwnQuestion = /\?|\b(duvida|pergunta|queria saber|quero saber)\b/.test(latest.replace(/\b(?:robo|bot|ia|pessoa|humano)\b[^?]*\?/, ''));
    const answer = spanish
      ? `${firstTurn ? '¡Hola! ' : ''}Soy Nara, la asistente digital de Bossa 🙂 Respondo por aquí mismo y, si prefieres, llamo a alguien del equipo.${hasOwnQuestion ? ' ¿Cuál es tu duda?' : ''}`
      : `${firstTurn ? 'Oi! ' : ''}Sou a Nara, assistente digital da Bossa 🙂 Respondo tudo por aqui mesmo, só por mensagem, e se preferir chamo alguém do time.${hasOwnQuestion ? ' Qual é a sua dúvida?' : ''}`;
    return applyConversationDecision(turn, {
      reply: answer,
      handoff: false,
      summary: 'Contato perguntou se a Nara é uma inteligência artificial.',
      nextAction: 'Responder a dúvida do contato por mensagem; oferecer pessoa só se ele pedir.',
    });
  }

  const asksAboutBossa = /\b(o que|oq|quem e|quem eh|como funciona|me fale sobre).*\bbossa\b/.test(latest)
    || /\bsobre a bossa\b/.test(latest);
  if (asksAboutBossa) {
    return applyConversationDecision(turn, {
      reply: 'A Bossa atua com empreendimentos imobiliários e hoje apresenta o Flow Aptos e o Alma Seahouses. Posso te explicar os projetos, os valores ou direcionar para outro setor — o que você quer entender primeiro?',
      summary: 'Contato pediu uma explicação geral sobre a Bossa.',
      nextAction: 'Responder à dúvida institucional e identificar qual assunto deseja conhecer.',
    });
  }

  const asksOtherService = /\b(atendimento bossa|outro atendimento|outro assunto|preciso de atendimento|preciso falar com a bossa|quero falar com a bossa|falar com atendente|falar com uma pessoa|atendimento humano)\b/.test(latest);
  if (asksOtherService && !clearBuyerContext) {
    return applyConversationDecision(turn, {
      reply: 'Claro. Qual assunto você precisa tratar com a Bossa: compra de imóvel, cliente atual, financeiro, obra ou outro?',
      handoff: true,
      summary: 'Contato solicitou outro tipo de atendimento da Bossa.',
      nextAction: 'Identificar o assunto e encaminhar para a equipe humana responsável.',
    });
  }

  const doesNotWantToBuy = /\b(nao quero comprar|nao estou procurando|nao tenho interesse em comprar|so preciso de atendimento)\b/.test(latest);
  if (doesNotWantToBuy) {
    return applyConversationDecision(turn, {
      reply: 'Entendi. Vou te direcionar para o atendimento correto da Bossa. Pode me dizer em uma frase qual assunto você precisa resolver?',
      handoff: true,
      summary: 'Contato informou que não está buscando comprar um imóvel.',
      nextAction: 'Direcionar para a equipe humana e identificar o assunto.',
    });
  }

  // "Ainda não sei"/"não decidi" não troca mais a resposta por uma frase genérica: a pergunta concreta
  // da mesma mensagem (ladeira, fotos, fachada) precisa ser respondida. A qualificação é pausada em finishTurn.
  if (qualificationPaused(history) && !explicitHumanRequest(latestRaw) && !purchaseIntent(latestRaw)) {
    turn.handoff = false;
    if (turn.classification === 'quente') turn.classification = 'morno';
  }

  const currentOpening = naraReplyOpeningKey(turn.reply);
  const priorOpenings = priorMessages.map(naraReplyOpeningKey).filter(Boolean);
  if (currentOpening && priorOpenings.includes(currentOpening)) {
    const rewritten = withoutRepeatedOpening(turn.reply);
    if (rewritten) turn.reply = rewritten;
  }

  const normalizedReply = normalizeText(turn.reply);
  const repeated = Boolean(normalizedReply) && priorReplies.slice(-8).includes(normalizedReply);
  const repeatedTriage = hasPriorTriage(history) && looksLikeTriageQuestion(turn.reply);
  if (repeated || repeatedTriage) {
    const topic = topicFromQuestion(latestRaw);
    const alreadyInHandoff = priorMessages.some((message) => /ta[ií]s.*comercial|chamando a ta[ií]s|llamando a ta[ií]s/.test(normalizeText(message)));
    turn.reply = alreadyInHandoff
      ? `Essa dúvida sobre ${topic} já ficou registrada para a Taís; você não precisa repetir. Ela continua daqui.`
      : `Sobre ${topic}: me conta o que ficou faltando que eu respondo direto.`;
    turn.handoff = alreadyInHandoff;
    turn.summary = `Resposta anterior seria repetida. Dúvida atual: ${latestRaw.slice(0, 280)}`;
    turn.next_action = alreadyInHandoff
      ? 'Taís deve continuar a partir da dúvida registrada, sem pedir o assunto novamente.'
      : 'Responder especificamente à última mensagem e avançar.';
    return finishTurn(turn, history);
  }

  return finishTurn(turn, history);
}

/** "Em que posso ajudar?" e variações: pergunta genérica que pouca gente responde. */
export function isGenericHelpQuestion(text: string): boolean {
  const value = normalizeText(text);
  return /\b(em que|como|no que) (?:eu )?posso (?:te |lhe )?ajudar|posso (?:te )?ajudar (?:em )?(?:algo|alguma coisa)|(?:en que|como|en qué|cómo) (?:te |le )?puedo ayudar|how (?:can|may) i help/.test(value);
}

/**
 * Em vez de "em que posso ajudar?", a Nara abre com algo concreto (Fábio, 20/10/2026):
 * - lead de anúncio de um empreendimento → fala só dele, com a fachada;
 * - sem origem conhecida → apresenta Soul, Flow e Alma por benefícios, com as fachadas;
 * - se o contato disse de onde é, comenta isso antes.
 */
export function replaceGenericHelpWithPortfolio(
  turn: AiTurn,
  history: ChatMessage[],
  context: AiTrainingContext,
  lead?: Pick<Lead, 'metadata' | 'source'>,
): void {
  if (turn.handoff || !isGenericHelpQuestion(turn.reply)) return;
  if (/\b(soul|flow|alma)\b/.test(normalizeText(userText(history)))) return;
  if (assistantMessages(history).some(presentsWholePortfolio)) return;
  const firstTurn = assistantMessages(history).length === 0;
  const development = adDevelopment(lead?.metadata, lead?.source);
  const intro = firstTurn
    ? turn.reply
      .split(/(?<=[.!?;]|😊)\s+/u)
      .filter((part) => !isGenericHelpQuestion(part))
      .join(' ')
      .replace(/;\s*$/, '.')
      .trim()
    : '';
  const language = isSpanishLead(history) ? 'es' : isEnglishLead(history) ? 'en' : 'pt';
  turn.reply = firstMessageBody({
    intro,
    language,
    development,
    place: firstTurn ? declaredPlace(userText(history)) : '',
  });
  if (development) {
    const facade = facadeFor(context.files ?? [], development);
    turn.attachment_ids = facade ? [facade] : [];
  }
}

/**
 * Regra da primeira apresentação: se a Nara apresentou Soul, Flow e Alma juntos
 * pela primeira vez e não anexou as fachadas, anexa as que existirem na
 * biblioteca, na ordem Soul, Flow, Alma, em vez de outros arquivos.
 */
function attachFirstPortfolioFacades(turn: AiTurn, history: ChatMessage[], context: AiTrainingContext): void {
  if (turn.handoff) return;
  const facades = portfolioFacadesForFirstPresentation(turn.reply, history, context.files ?? []);
  if (!facades.length) return;
  turn.attachment_ids = facades.slice(0, 3);
}

export async function generateAiTurn(
  lead: Lead,
  history: ChatMessage[],
  context: AiTrainingContext = {},
): Promise<AiTurn | null> {
  const turn = await generateCoreAiTurn(lead, history, context);
  if (!turn || lead.kind !== 'cliente') return turn;
  const processed = finishTurn(postProcessNaraTurn(turn, history, context), history);
  replaceGenericHelpWithPortfolio(processed, history, context, lead);
  attachFirstPortfolioFacades(processed, history, context);
  return enforceNaraReplyGuardrails(processed, lead, history, context);
}

/**
 * Turno supervisionado pelo gestor: mantém o histórico e todos os guardrails,
 * mas não aplica os pós-processadores determinísticos que reinterpretam a
 * última fala do cliente. A orientação interna decide a iniciativa deste turno.
 */
export async function generateSupervisedAiTurn(
  lead: Lead,
  history: ChatMessage[],
  context: AiTrainingContext = {},
): Promise<AiTurn | null> {
  const turn = await generateCoreAiTurn(lead, history, context);
  if (!turn || lead.kind !== 'cliente') return turn;
  const processed = finishTurn(turn, history);
  return enforceNaraReplyGuardrails(processed, lead, history, context);
}
