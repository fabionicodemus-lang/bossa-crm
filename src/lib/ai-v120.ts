import { generateAiTurn as generateCoreAiTurn } from './ai';
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

function looksLikeTriageQuestion(text: string): boolean {
  const value = normalizeText(text);
  return (/buscando.*imovel.*comprar/.test(value) && /outro assunto|outro atendimento/.test(value))
    || (/interesse.*comprar/.test(value) && /outro assunto|outro atendimento|assunto/.test(value))
    || (/conhecer.*imovel.*comprar/.test(value) && /outro atendimento/.test(value));
}

function hasPriorTriage(history: ChatMessage[]): boolean {
  return assistantMessages(history).some(looksLikeTriageQuestion);
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

function postProcessNaraTurn(turn: AiTurn, history: ChatMessage[]): AiTurn {
  const latest = normalizeText(lastUserText(history));
  const priorReplies = assistantMessages(history).map(normalizeText);

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
  if (asksOtherService) {
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

  const normalizedReply = normalizeText(turn.reply);
  const repeated = Boolean(normalizedReply) && priorReplies.slice(-8).includes(normalizedReply);
  const repeatedTriage = hasPriorTriage(history) && looksLikeTriageQuestion(turn.reply);
  if (repeated || repeatedTriage) {
    return applyConversationDecision(turn, {
      reply: 'Entendi. Para eu responder ao que você precisa agora: você quer informações sobre os empreendimentos, valores, atendimento a clientes, obra ou outro assunto?',
      summary: 'A última resposta seria repetitiva; a Nara mudou a abordagem para entender o assunto atual.',
      nextAction: 'Responder à última mensagem e avançar sem repetir a triagem.',
    });
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
  return postProcessNaraTurn(turn, history);
}
