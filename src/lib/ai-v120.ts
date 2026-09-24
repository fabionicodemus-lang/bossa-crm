import { enforceNaraReplyGuardrails, generateAiTurn as generateCoreAiTurn } from './ai';
import type { AiTrainingContext, AiTurn } from './ai';
import type { Lead } from './types';

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
  const value = normalizeText(userText(history));
  const matches = value.match(/\b(hola|soy|me llamo|mi nombre|vivo en|resido en|quiero|quisiera|precio|cuanto cuesta|departamento|ustedes|puedo|chile|santiago)\b/g) ?? [];
  return matches.length >= 2 || /\b(hola|soy|me llamo|mi nombre)\b/.test(value);
}

function declaredFirstName(text: string): string {
  const match = text.match(/\b(?:sou|me chamo|meu nome (?:é|e)|aqui é|aqui e|soy|me llamo|mi nombre (?:es|e))\s+(?:a\s+|o\s+)?([\p{L}'’-]{2,})(?:\s+[\p{L}'’-]+){0,2}/iu);
  return match?.[1]?.trim() ?? '';
}

function buyerContextIsClear(history: ChatMessage[]): boolean {
  const value = normalizeText(userText(history));
  return /\b(vi (?:um |o |a )?anuncio|me interessei|tenho interesse|flow|alma|soul|apartamento|imovel|comprar|compra|morar|veranear|investir|investimento|preco|valor|quanto custa|pagamento|parcela|entrada|planta|obra|entrega|aluguel)\b/.test(value);
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
  const value = normalizeText(text);
  return asksHuman(text)
    || /\b(visita|visitar|agendar visita|marcar visita|conhecer pessoalmente|ir ai|proposta|reservar|reserva|negociar|negociacao|reclamacao|visita|visitar|agendar una visita|quiero visitar|conocer en persona|propuesta|reservar|reserva|negociar|negociacion|reclamo)\b/.test(value);
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

function foreignCurrencyReply(context: AiTrainingContext, spanish: boolean): string {
  const foreign = context.foreign;
  if (!foreign?.requested_currency || !foreign.fx || !foreign.conversions.length) return '';
  const first = foreign.conversions[0];
  if (spanish) {
    return `Hoy parte de ${formatBrl(first.brl)}, aproximadamente ${formatForeign(first.foreign, foreign.requested_currency)} según la PTAX del día. El pago puede hacerse en reales, dólares o moneda local; la conversión es solo una referencia cambiaria.`;
  }
  return `Hoje parte de ${formatBrl(first.brl)}, cerca de ${formatForeign(first.foreign, foreign.requested_currency)} pela PTAX do dia. O pagamento pode ser feito em reais, dólar ou moeda local; a conversão é apenas uma referência cambial.`;
}

function foreignPurchaseReply(name: string, spanish: boolean): string {
  const prefix = name ? `${name}, ` : '';
  if (spanish) {
    return `${prefix}sí, puedes comprar viviendo fuera de Brasil. El contrato se firma electrónicamente con la misma validez jurídica de una firma física, y el pago puede hacerse en reales, dólares o moneda local. Bossa ya tiene clientes que compraron a distancia desde Estados Unidos, Dinamarca, Portugal y Chile. ¿Lo buscas para vivir, vacacionar o invertir?`;
  }
  return `${prefix}dá sim. Você pode comprar morando fora do Brasil: o contrato é assinado eletronicamente com a mesma validade jurídica de uma assinatura física, e o pagamento pode ser feito em reais, dólar ou moeda local. A Bossa já tem clientes nos EUA, Dinamarca, Portugal e Chile que compraram à distância. É para morar, veranear ou investir?`;
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
  return null;
}

function choosePromisedFile(history: ChatMessage[], context: AiTrainingContext): string[] {
  const latest = normalizeText(lastUserText(history));
  if (!/^(sim|s|pode|pode mandar|manda|me manda|quero|legal|ok|ta|beleza|si|sí|puede|puedes|manda|enviame|envíame|quiero|dale)\b/.test(latest)) return [];
  const previousAssistant = [...history].reverse().find((item) => item.role === 'assistant')?.content ?? '';
  const offered = normalizeText(previousAssistant);
  const isPlant = offered.includes('planta') || offered.includes('plano');
  const terms = isPlant ? ['planta','plano']
    : offered.includes('folder') || offered.includes('book') || offered.includes('folleto') ? ['folder','book','folleto']
      : offered.includes('foto') || offered.includes('imagem') || offered.includes('imagen') ? ['foto','imagem','imagen','render']
        : offered.includes('video') ? ['video','obra']
          : [];
  if (!terms.length) return [];

  const qualifier = isPlant ? plantQualifier(userText(history)) : null;
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

function isPlantFile(file: AiFileOption): boolean {
  const haystack = normalizeText([file.category, file.title, file.description ?? '', ...(file.trigger_keywords ?? [])].join(' '));
  return /\b(planta|plantas|plano|planos)\b/.test(haystack)
    && !/\b(lazer|rooftop|roof|move)\b/.test(haystack);
}

function developmentFromHistory(history: ChatMessage[]): 'alma' | 'flow' | null {
  const value = normalizeText(userText(history));
  if (/\balma\b/.test(value)) return 'alma';
  if (/\bflow\b/.test(value)) return 'flow';
  return null;
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
  if (assistantMessages(history).length > 0) return reply;
  const spanish = isSpanishLead(history);
  const name = declaredFirstName(lastUserText(history));
  const normalized = normalizeText(reply);
  const alreadyIdentified = normalized.includes('nara') && normalized.includes('bossa');
  if (alreadyIdentified) return reply;
  const intro = spanish
    ? `¡Hola${name ? `, ${name}` : ''}! Soy Nara, de Bossa.`
    : `Oi${name ? `, ${name}` : ''}! Aqui é a Nara, da Bossa.`;
  return `${intro} ${reply.trim()}`.trim();
}

function finishTurn(turn: AiTurn, history: ChatMessage[]): AiTurn {
  turn.reply = ensureFirstReplyIdentity(turn.reply, history);
  const latest = lastUserText(history);
  if (isPureInformationRequest(latest) && !requiresHumanHandoff(latest)) {
    turn.handoff = false;
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
    turn.handoff = false;
    turn.summary = `Dúvida fora da base: ${latestRaw.slice(0, 300)}`;
    turn.next_action = 'Responder com o que estiver confirmado e só escalar se houver pedido explícito de atendimento humano.';
  }

  const promisedFiles = choosePromisedFile(history, context);
  if (promisedFiles.length && !turn.attachment_ids.length) {
    turn.attachment_ids = promisedFiles;
  }

  const asksPlantNow = /\b(planta|plantas|plano|planos)\b/.test(latestNormalized);
  const qualifier = plantQualifier(userText(history));
  if (asksPlantNow && !qualifier) {
    const plantIds = new Set((context.files ?? []).filter(isPlantFile).map((file) => file.id));
    turn.attachment_ids = turn.attachment_ids.filter((id) => !plantIds.has(id));
    turn.reply = spanish
      ? 'Tengo las plantas. Para enviarte la correcta, ¿cuántas suites buscas?'
      : 'Tenho as plantas. Para te enviar a correta, quantas suítes você procura?';
    turn.handoff = false;
    turn.summary = 'Lead pediu planta sem informar tipologia/suítes.';
    turn.next_action = 'Aguardar quantidade de suítes/tipologia antes de enviar planta; não escolher arquivo arbitrariamente.';
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

  const asksIfRobot = /\b(voce e|vc e|e uma|eh uma)\s*(?:um |uma )?(?:robo|robot|ia|inteligencia artificial)|\bassistente digital\b/.test(latest);
  if (asksIfRobot) {
    return applyConversationDecision(turn, {
      reply: 'Sou a assistente digital da Bossa, sim 🙂 Se preferir falar com uma pessoa, chamo alguém do time agora. Quer que eu faça isso?',
      handoff: true,
      summary: 'Contato perguntou se a Nara é uma inteligência artificial.',
      nextAction: 'Oferecer passagem imediata para atendimento humano.',
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

  const isUndecided = /\b(ainda nao sei|nao sei ainda|estou pensando|ainda estou pensando|nao decidi|so estou olhando|so quero entender|estou avaliando|tenho duvida)\b/.test(latest);
  if (isUndecided) {
    return applyConversationDecision(turn, {
      reply: 'Sem problema — você pode conhecer primeiro, sem decidir agora. Posso te explicar rapidamente os empreendimentos, a localização ou como funcionam os valores; por onde prefere começar?',
      summary: 'Contato ainda está avaliando e quer entender melhor antes de decidir.',
      nextAction: 'Apresentar informações introdutórias sem pressionar e descobrir o tema de maior interesse.',
    });
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
    turn.reply = clearBuyerContext
      ? `Essa dúvida sobre ${topic} já ficou registrada para a Taís; você não precisa repetir. Ela continua daqui.`
      : `Vou focar em ${topic} agora, sem repetir a mensagem anterior.`;
    if (clearBuyerContext) turn.handoff = true;
    turn.summary = `Resposta anterior seria repetida. Dúvida atual: ${latestRaw.slice(0, 280)}`;
    turn.next_action = clearBuyerContext
      ? 'Taís deve continuar a partir da dúvida registrada, sem pedir o assunto novamente.'
      : 'Responder especificamente à última mensagem e avançar.';
    return finishTurn(turn, history);
  }

  return finishTurn(turn, history);
}

export async function generateAiTurn(
  lead: Lead,
  history: ChatMessage[],
  context: AiTrainingContext = {},
): Promise<AiTurn | null> {
  const priorTriageAsked = lead.kind === 'cliente' && hasPriorTriage(history);
  const effectiveLead: Lead = priorTriageAsked
    ? {
        ...lead,
        metadata: {
          ...(lead.metadata ?? {}),
          triage_confirmed: true,
          triage_source: 'resposta_apos_pergunta_inicial',
        },
      }
    : lead;

  const turn = await generateCoreAiTurn(effectiveLead, history, context);
  if (!turn || lead.kind !== 'cliente') return turn;
  const processed = finishTurn(postProcessNaraTurn(turn, history, context), history);
  return enforceNaraReplyGuardrails(processed, effectiveLead, history, context);
}
