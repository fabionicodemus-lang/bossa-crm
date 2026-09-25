import { naraReplyWordCount, truncateNaraReplyToWordLimit } from './ai';

export type AgendaAction = 'schedule' | 'reschedule' | 'cancel' | 'none';
export type AgendaConversationMessage = { role: 'user' | 'assistant'; content: string };

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function agendaActionFromText(text: string): AgendaAction {
  const value = normalize(text);
  if (/\b(?:quero|preciso|pode)\s+(?:cancelar|desmarcar)\b/.test(value)
    || /\b(?:cancelar|desmarcar)\b.{0,28}\b(?:visita|agendamento|horario|reuniao)\b/.test(value)) return 'cancel';
  if (/\b(?:remarcar|reagendar)\b/.test(value)
    || /\b(?:mudar|trocar|alterar)\b.{0,28}\b(?:visita|data|dia|horario|agendamento)\b/.test(value)) return 'reschedule';
  if (/\b(?:agendar|marcar)\b.{0,30}\b(?:visita|decorado|horario|reuniao)\b/.test(value)
    || /\b(?:quero|gostaria|pretendo|posso)\b.{0,28}\b(?:visitar|conhecer)\b/.test(value)
    || /\b(?:quero visitar|visitar o decorado|visita ao decorado)\b/.test(value)) return 'schedule';
  return 'none';
}

function isAgendaFollowupQuestion(text: string): boolean {
  const value = normalize(text);
  if (!/\b(?:visita|agenda|agendamento|horario|dia|data)\b/.test(value)) return false;
  return /\b(?:qual dia|qual data|qual horario|qual voce prefere|horarios livres|outro dia|outro horario|dia e horario|que horario)\b/.test(value);
}

function isAgendaDetailReply(text: string): boolean {
  const value = normalize(text);
  return /\b(?:hoje|amanha|domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|manha|tarde|noite)\b/.test(value)
    || /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(value)
    || /\b(?:[01]?\d|2[0-3])[:h](?:[0-5]\d)?\b/.test(value)
    || /\b(?:as|por volta das|perto das)\s+(?:[01]?\d|2[0-3])\b/.test(value);
}

export function shouldHandleAgendaTurn(
  history: AgendaConversationMessage[],
  lastUserMessage: string,
): boolean {
  if (agendaActionFromText(lastUserMessage) !== 'none') return true;
  const lastAssistant = [...history].reverse().find((item) => item.role === 'assistant')?.content ?? '';
  return isAgendaFollowupQuestion(lastAssistant) && isAgendaDetailReply(lastUserMessage);
}

export function hasNonAgendaQuestion(text: string): boolean {
  if (!text.includes('?')) return false;
  const value = normalize(text);
  return /\b(?:valor|preco|condominio|iptu|tamanho|metragem|area|suites?|quartos?|entrega|obra|pagamento|parcelas?|entrada|localizacao|onde fica|quanto custa)\b/.test(value);
}

export function appendAgendaMessageToReply(reply: string, agendaMessage: string, limit = 45): string {
  const trimmedReply = reply.trim();
  const withoutTrailingQuestion = trimmedReply.replace(/\s*[^.!?]*\?\s*$/s, '').trim();
  const base = withoutTrailingQuestion || trimmedReply.replace(/\?/g, '.');
  const combined = `${base} ${agendaMessage.trim()}`.replace(/\s+/g, ' ').trim();
  if (naraReplyWordCount(combined) <= limit) return combined;

  const agendaWords = naraReplyWordCount(agendaMessage);
  const replyBudget = Math.max(1, limit - agendaWords);
  const shortened = truncateNaraReplyToWordLimit(base, replyBudget);
  return `${shortened} ${agendaMessage.trim()}`.replace(/\s+/g, ' ').trim();
}
