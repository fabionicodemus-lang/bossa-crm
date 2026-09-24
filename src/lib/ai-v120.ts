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

function declaredFirstName(text: string): string {
  const match = text.match(/\b(?:sou|me chamo|meu nome (?:é|e)|aqui é|aqui e)\s+(?:a\s+|o\s+)?([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'’-]+)(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'’-]+){0,2}/u);
  return match?.[1]?.trim() ?? '';
}

function buyerContextIsClear(history: ChatMessage[]): boolean {
  const value = normalizeText(userText(history));
  return /\b(vi (?:um |o |a )?anuncio|me interessei|tenho interesse|flow|alma|soul|apartamento|imovel|comprar|compra|morar|veranear|investir|investimento|preco|valor|quanto custa|pagamento|parcela|entrada|planta|obra|entrega|aluguel)\b/.test(value);
}

function asksHuman(text: string): boolean {
  const value = normalizeText(text);
  return /\b(falar com (?:uma pessoa|alguem|um corretor|corretor|atendente)|quero um corretor|quero falar com gente|atendimento humano|me liga|pode me ligar)\b/.test(value);
}

function handoffQuestion(history: ChatMessage[]): string {
  const value = normalizeText(userText(history));
  if (!/\b(a vista|avista|parcelad|financi|entrada|sinal|mensal)\b/.test(value)) {
    return 'Enquanto isso: você pensa em pagar à vista ou parcelado?';
  }
  if (!/\b(agora|este mes|esse mes|\d+ meses|ano que vem|202\d|sem pressa|prazo)\b/.test(value)) {
    return 'Enquanto isso: você pensa em comprar em qual prazo?';
  }
  if (!/\b(melhor horario|depois das|apos as|a partir das|manha|tarde|noite)\b/.test(value)) {
    return 'Enquanto isso: qual é o melhor horário para a Taís te chamar?';
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

function foreignCurrencyReply(context: AiTrainingContext): string {
  const foreign = context.foreign;
  if (!foreign?.requested_currency || !foreign.fx || !foreign.conversions.length) return '';
  const first = foreign.conversions[0];
  return `Hoje parte de ${formatBrl(first.brl)}, cerca de ${formatForeign(first.foreign, foreign.requested_currency)} pela PTAX. É uma referência cambial; a tabela oficial e o contrato ficam em reais.`;
}

function foreignPurchaseReply(name: string): string {
  const prefix = name ? `${name}, ` : '';
  return `${prefix}dá sim. Você compra morando fora, assina eletronicamente com validade jurídica e paga do exterior em reais, dólar ou moeda local. Já temos clientes nos EUA, Dinamarca, Portugal e Chile que compraram assim. É para morar, veranear ou investir?`;
}

function slaReply(context: AiTrainingContext): string {
  const op = context.operational;
  if (!op) return 'Já passei para a Taís do comercial. Ela assume seu atendimento agora.';
  return op.business_open_now
    ? `A Taís do comercial te chama em até ${op.hot_lead_sla_minutes} minutos.`
    : `Nosso time volta ${op.next_business_label} e você será o primeiro a ser atendido.`;
}

function choosePromisedFile(history: ChatMessage[], context: AiTrainingContext): string[] {
  const latest = normalizeText(lastUserText(history));
  if (!/^(sim|s|pode|pode mandar|manda|me manda|quero|legal|ok|ta|tá|beleza)\b/.test(latest)) return [];
  const previousAssistant = [...history].reverse().find((item) => item.role === 'assistant')?.content ?? '';
  const offered = normalizeText(previousAssistant);
  const terms = offered.includes('planta') ? ['planta']
    : offered.includes('folder') || offered.includes('book') ? ['folder','book']
      : offered.includes('foto') || offered.includes('imagem') ? ['foto','imagem','render']
        : offered.includes('video') ? ['video','obra']
          : [];
  if (!terms.length) return [];
  return (context.files ?? [])
    .filter((file) => {
      const haystack = normalizeText([file.category,file.title,file.description ?? '',...(file.trigger_keywords ?? [])].join(' '));
      return terms.some((term) => haystack.includes(term));
    })
    .slice(0, 1)
    .map((file) => file.id);
}

function ensureDeclaredNameInFirstReply(reply: string, history: ChatMessage[]): string {
  if (assistantMessages(history).length > 0) return reply;
  const name = declaredFirstName(lastUserText(history));
  if (!name || normalizeText(reply).includes(normalizeText(name))) return reply;
  if (/^oi\b/i.test(reply.trim())) return reply.trim().replace(/^oi[!,.]?\s*/i, `Oi, ${name}! `);
  return `Oi, ${name}! ${reply.trim()}`;
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

  const asksForeignPurchase = /\b(moro|morando|resido|vivo)\b.{0,35}\b(orlando|miami|estados unidos|eua|usa|fora do brasil|exterior|portugal|dinamarca)\b/.test(latestNormalized)
    && /\b(compr|assin|contrato|pag)\b/.test(latestNormalized);
  if (asksForeignPurchase) {
    turn.reply = foreignPurchaseReply(name);
    turn.classification = turn.classification === 'frio' ? 'morno' : turn.classification;
    turn.score = Math.max(turn.score, 35);
    turn.summary = `Lead mora no exterior${context.foreign?.location ? ` (${context.foreign.location})` : ''} e confirmou interesse em compra à distância.`;
    turn.next_action = 'Continuar qualificação de uso, prazo e forma de pagamento; não exigir presença física para assinatura.';
    return turn;
  }

  if (/\b(quanto|valor|fica|cust).{0,25}\b(dolar|usd|euro|eur)\b|\b(dolar|usd|euro|eur).{0,25}\b(quanto|valor|fica|cust)\b/.test(latestNormalized)) {
    const converted = foreignCurrencyReply(context);
    if (converted) {
      turn.reply = converted;
      turn.summary = 'Lead no exterior pediu conversão de preço; valor calculado com cotação PTAX do dia e tabela viva em reais.';
      turn.next_action = 'Seguir qualificação sem substituir a tabela oficial em reais pela referência cambial.';
      return turn;
    }
  }

  if (/\b(demora muito|quanto tempo|em quanto tempo|quando (?:ele|ela|o corretor|a corretora|o comercial) (?:me )?(?:chama|responde|liga))\b/.test(latestNormalized)) {
    turn.reply = slaReply(context);
    turn.handoff = true;
    turn.classification = 'quente';
    turn.score = Math.max(turn.score, 80);
    turn.summary = turn.summary || 'Lead perguntou o prazo para retorno do comercial.';
    turn.next_action = 'Taís deve assumir o atendimento dentro do SLA informado.';
    return turn;
  }

  if (asksHuman(latestRaw) && clearBuyerContext) {
    const extra = handoffQuestion(history);
    turn.reply = `Já estou chamando a Taís do comercial.${extra ? ` ${extra}` : ''}`;
    turn.handoff = true;
    turn.classification = 'quente';
    turn.score = Math.max(turn.score, 80);
    turn.summary = turn.summary || 'Lead de compra pediu atendimento humano.';
    turn.next_action = 'Taís deve assumir imediatamente usando o histórico e os dados já coletados.';
    return turn;
  }

  if (looksLikeBadMaterialFallback(turn.reply)) {
    const topic = topicFromQuestion(latestRaw);
    turn.reply = `Sobre ${topic}, isso não está confirmado na minha base. Vou deixar essa dúvida no resumo para a Taís te responder sem você repetir.`;
    turn.handoff = true;
    turn.summary = `Dúvida fora da base: ${latestRaw.slice(0, 300)}`;
    turn.next_action = 'Taís deve responder exatamente à dúvida registrada no resumo.';
  }

  const promisedFiles = choosePromisedFile(history, context);
  if (promisedFiles.length && !turn.attachment_ids.length) {
    turn.attachment_ids = promisedFiles;
  }

  turn.reply = ensureDeclaredNameInFirstReply(turn.reply, history);

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
    return turn;
  }

  return turn;
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
  const processed = postProcessNaraTurn(turn, history, context);
  return enforceNaraReplyGuardrails(processed, effectiveLead, history, context);
}
