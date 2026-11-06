import { agendaActionFromText, shouldHandleAgendaTurn, type AgendaConversationMessage } from './nara-agenda-intent';
import { explicitHumanRequest, refusesHandoff } from './nara-conversation-signals';
import { naraConversationLanguage } from './nara-language';

const APPOINTMENT = '(?:visitas?|videochamada|chamada(?: de video)?|ligacao|reuniao|horarios?|agendamento|appointments?|meetings?|video call|phone call|call|videollamada|citas?|reunion|llamada)';
const CONFIRMED = '(?:agendad[oa]s?|marcad[oa]s?|confirmad[oa]s?|scheduled|booked|confirmed)';
const COMPLETED = '(?:agendei|agendamos|marquei|marcamos|confirmei|confirmamos|registrei|registramos|reservei|reservamos|scheduled|booked|confirmed|agende|program[eé]|reserve|confirm[eé])';
const ASSERTION = new RegExp(`\\b${APPOINTMENT}\\b.{0,45}?\\b(?:esta|estao|ficou|ficaram|foi|foram|e|is|are|was|were|has been|have been|queda|quedo|estan|ha sido)\\s+(?:(?:ja|ainda|already|now|ya)\\s+){0,2}${CONFIRMED}\\b`, 'g');
const REVERSE_ASSERTION = new RegExp(`\\b(?:esta|ficou|foi|is|was|queda|quedo)\\s+(?:(?:ja|already|ya)\\s+)?${CONFIRMED}\\b.{0,25}?\\b${APPOINTMENT}\\b`, 'g');
const COMPLETED_ACTION = new RegExp(`\\b${COMPLETED}\\b.{0,45}?\\b${APPOINTMENT}\\b`, 'g');
const NOMINAL_ASSERTION = new RegExp(`^(?:(?:a|o|sua|seu|your|tu|su|la|el)\\s+){0,2}${APPOINTMENT}\\s+${CONFIRMED}\\b(?=\\s*(?:[.!]|$)|\\s+(?:para|for|on|at|as|a las)\\b)`, 'g');
const NEGATED_CONFIRMATION = new RegExp(`\\b(?:nao|not|no|isn't|isn’t|aren't|aren’t|hasn't|hasn’t|haven't|haven’t|wasn't|wasn’t|without|sin)\\s+(?:(?:ainda|yet|esta|estao|foi|foram|ha|houve|uma|um|a|o|nenhuma|nenhum|sido|se|ha|han|estan|been|has|have|is|are|was|were|any|a|the|ninguna|el|la|${APPOINTMENT})\\s+){0,8}(?:${CONFIRMED}|${COMPLETED})\\b|\\b(?:nenhuma?|ninguna?|no)\\s+${APPOINTMENT}\\b.{0,24}?${CONFIRMED}\\b`);
const DELIVERY_CLAIM = /\b(?:convite (?:foi )?enviado|enviei (?:o )?convite|link (?:foi )?enviado|acion(?:ei|amos) (?:o )?time)\b/g;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A consent signal is not a reservation, and a refusal/cancellation is not consent. */
export function hasNaraAgendaConsent(history: AgendaConversationMessage[]): boolean {
  const latest = [...history].reverse().find((message) => message.role === 'user')?.content ?? '';
  if (agendaActionFromText(latest) === 'cancel') return false;
  if (refusesHandoff(latest) && !explicitHumanRequest(latest)) return false;
  return shouldHandleAgendaTurn(history, latest);
}

function isUnsupportedClause(clause: string, includeDeliveryClaims: boolean): boolean {
  const value = normalize(clause).replace(/^[¿¡"“‘]+/, '').trim();
  if (!value) return false;
  const candidates = [ASSERTION, REVERSE_ASSERTION, COMPLETED_ACTION, NOMINAL_ASSERTION,
    ...(includeDeliveryClaims ? [DELIVERY_CLAIM] : [])];
  return candidates.some((pattern) => {
    pattern.lastIndex = 0;
    const matches = [...value.matchAll(pattern)];
    return matches.some((match) => {
      const before = value.slice(0, match.index);
      const throughClaim = value.slice(0, match.index! + match[0].length);
      // A question, conditional or description of the booking process is not
      // evidence of a completed action. Do not exempt a later separate clause.
      if (value.endsWith('?') && pattern !== COMPLETED_ACTION && pattern !== DELIVERY_CLAIM) return false;
      if (/\b(?:se|quando|caso|if|when|once|si|cuando|assim que|whether)\b/.test(before)) return false;
      if (/\b(?:como|how)\s*$/.test(before)) return false;
      if (/\b(?:so|somente|apenas|only|solo)\b/.test(throughClaim)
        && /\b(?:depois|apos|after|quando|when|se|si)\b/.test(value.slice(match.index))) return false;
      if (NEGATED_CONFIRMATION.test(throughClaim)) return false;
      if (/\b(?:nao|no|not)\s+(?:ja\s+)?(?:enviei|acionamos|acionei)|\b(?:nao|no|not)\s+(?:foi\s+)?enviado\b/.test(throughClaim)) return false;
      if (/\b(?:nao (?:posso|vou|consigo|devo)|no puedo|cannot|can't)\s+(?:dizer|afirmar|informar|considerar|decir|say|confirm)\b/.test(throughClaim)) return false;
      // Registering a request is not the same as confirming the appointment.
      if (pattern === COMPLETED_ACTION && /\b(?:solicitacao|pedido|request|solicitud)\b/.test(match[0])) return false;
      return true;
    });
  });
}

function isUnsupportedSentence(sentence: string, includeDeliveryClaims: boolean): boolean {
  // Keep sentence-level output so a safe explanation in another sentence is
  // preserved. Clause boundaries prevent a negation masking a later assertion.
  return sentence.split(/\s*[;,]\s*|\s+(?:mas|porem|but|pero)\s+/iu)
    .some((clause) => isUnsupportedClause(clause, includeDeliveryClaims));
}

/** Pure text guard: no database, model, calendar, transport or side effects. */
export function guardNaraAgendaContext(
  reply: string,
  history: AgendaConversationMessage[],
  options: { confirmed?: boolean; includeDeliveryClaims?: boolean } = {},
): { reply: string; changed: boolean; consented: boolean; nextAction: string } {
  const consented = hasNaraAgendaConsent(history);
  const nextAction = consented
    ? 'Verificar a agenda para o formato, dia e horário pedidos; perguntar apenas o detalhe que faltar e confirmar somente após gravação bem-sucedida.'
    : 'Responder à dúvida atual e preservar o contexto; não iniciar nem confirmar agendamento sem pedido ou aceite do contato.';
  if (options.confirmed === true || !reply.trim()) return { reply, changed: false, consented, nextAction };
  const sentences = reply.split(/(?<=[.!?])\s+|\n+/u);
  const kept = sentences.filter((sentence) => !isUnsupportedSentence(sentence, options.includeDeliveryClaims === true));
  if (kept.length === sentences.length) return { reply, changed: false, consented, nextAction };
  let protectedReply = kept.join(' ').trim();
  const language = naraConversationLanguage(history);
  if (consented) {
    const pending = language === 'es'
      ? 'La cita todavía no está confirmada. La disponibilidad debe verificarse en la agenda.'
      : language === 'en'
        ? 'The appointment is not confirmed yet. Availability still needs to be checked in the calendar.'
        : 'O agendamento ainda não está confirmado. A disponibilidade precisa ser verificada na agenda.';
    // Collapse short status-only notices when removing a contradictory claim
    // ("não há visita confirmada. Sua videochamada está confirmada"). Keep
    // explanations intact and state the pending status once, consistently.
    const explanations = kept.filter((sentence) => !(NEGATED_CONFIRMATION.test(normalize(sentence))
      && normalize(sentence).split(' ').length <= 10));
    protectedReply = [...explanations, pending].filter(Boolean).join(' ').trim();
  } else if (!protectedReply) {
    protectedReply = language === 'es'
      ? 'Puedo seguir ayudándote por aquí con la información de Bossa y sus proyectos.'
      : language === 'en'
        ? 'I can keep helping you here with information about Bossa and its developments.'
        : 'Posso continuar te ajudando por aqui com as informações da Bossa e dos empreendimentos.';
  }
  return { reply: protectedReply, changed: true, consented, nextAction };
}
