import type { AiTurn } from './ai';
import { enterpriseInFocus, explicitHumanRequest, financialNegotiationIntent, normalizeSignalText, refusesHandoff } from './nara-conversation-signals';
import { naraConversationLanguage } from './nara-language';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Final, deterministic boundary between pre-sales and financial negotiation.
 * No database/network work happens here: the normal hybrid workflow persists
 * the pending handoff after this turn. Never describe that action as completed.
 */
export function applyNaraFinancialHandoff(turn: AiTurn, history: ChatMessage[]): boolean {
  const latest = [...history].reverse().find((item) => item.role === 'user')?.content ?? '';
  if (!financialNegotiationIntent(latest, history)) return false;

  const language = naraConversationLanguage(history);
  const focus = enterpriseInFocus(history);
  const project = focus ? { flow: 'Flow', alma: 'Alma', soul: 'Soul' }[focus] : '';
  const topic = normalizeSignalText(latest);
  const proposal = /\b(?:proposta|propuesta|offer|proposal|contraproposta|negoci\w*|desconto|discount|permuta|troca)\b/.test(topic);
  const subject = proposal ? 'sua proposta' : 'a entrada e as condições de pagamento';
  const refused = refusesHandoff(latest) && !explicitHumanRequest(latest);

  if (refused) {
    turn.handoff = false;
    turn.stage = 'ia';
    if (turn.classification === 'quente' || turn.classification === 'agendamento') turn.classification = 'morno';
    turn.score = Math.min(turn.score, 59);
    turn.reply = language === 'es'
      ? 'Entendido, seguimos por mensaje sin derivarte. La entrada y las condiciones de pago necesitan confirmación del equipo comercial; no puedo aprobarlas por aquí. Podemos seguir con la información del proyecto.'
      : language === 'en'
        ? 'Understood—we can keep chatting without transferring you. The down payment and payment terms need confirmation from our sales team; I cannot approve them here. I can still help with information about the development.'
        : 'Entendido, seguimos por mensagem sem te encaminhar. Entrada e condições de pagamento precisam de confirmação do comercial; não consigo aprová-las por aqui. Posso continuar te ajudando com as informações do empreendimento.';
    turn.next_action = 'Respeitar a recusa de atendimento humano; não negociar nem aprovar condições. Continuar apenas com informações gerais solicitadas.';
    return true;
  }

  turn.handoff = true;
  turn.stage = 'qualificado';
  turn.classification = 'quente';
  turn.score = Math.max(60, Math.min(100, Number.isFinite(turn.score) ? turn.score : 60));
  // The client's numbers stay in the private briefing, never become an offer.
  // Keep this boundary short: no more qualification or simulated instalments.
  turn.reply = language === 'es'
    ? `Voy a llamar a nuestro equipo comercial para ${proposal ? 'evaluar tu propuesta' : 'confirmar la entrada y las condiciones de pago'}${project ? ` de ${project}` : ''}. Continuará por aquí con el contexto de nuestra conversación, sin que tengas que empezar de nuevo.`
    : language === 'en'
      ? `I'll ask our sales team to ${proposal ? 'review your proposal' : 'confirm the down payment and payment terms'}${project ? ` for ${project}` : ''}. The team can continue here with the context of our conversation, so you won't need to start over.`
      : `Vou chamar nossa equipe comercial para ${proposal ? 'avaliar' : 'confirmar'} ${subject}${project ? ` do ${project}` : ''} com você. O atendimento continua por aqui com o contexto da nossa conversa, sem você precisar começar do zero.`;
  turn.summary = `Contato quer tratar de ${subject}${project ? ` do ${project}` : ''}. Pedido declarado, ainda não aprovado: ${latest.slice(0, 700)}`;
  turn.next_action = `Passagem comercial imediata para avaliar ${subject}${project ? ` do ${project}` : ''}. Não condicionar o atendimento a novas perguntas. Preservar preferências, objeções e valores declarados no histórico; nenhuma condição foi aprovada.`;
  return true;
}
