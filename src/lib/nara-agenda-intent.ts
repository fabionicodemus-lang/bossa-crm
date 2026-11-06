export type AgendaAction = 'schedule' | 'reschedule' | 'cancel' | 'none';
export type AgendaConversationMessage = { role: 'user' | 'assistant'; content: string };
export type AgendaRequestedMode = 'presencial' | 'video' | 'telefone';

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function affirmativeAgendaText(text: string): string {
  return normalize(text)
    // Refusing a visit/video call must not book it. Preserve a later affirmative
    // clause, e.g. "não quero visita, prefiro uma videochamada".
    .replace(/\b(?:nao|nem|sem|no|not|do not|don't)\s+(?:(?!(?:mas|porem)\b)\w+\s+){0,4}?(?:agendar|marcar|visitar|cancelar|desmarcar|remarcar|reagendar|videochamada|videollamada|video call|visita|reuniao|ligacao|presencial)\b(?:(?!\b(?:mas|porem|prefiro)\b)[^,;.!?])*/g, ' ')
    .replace(/\b(?:videochamada|videollamada|video call|visita|presencial|ligacao)\s+nao\b/g, ' ');
}

function directNominalAgendaRequest(text: string): boolean {
  const raw = normalize(text);
  // These added forms must be actual requests, not an example, a conditional
  // question or a request immediately withdrawn in the same message.
  if (/\b(?:nao quero|nao gostaria|agora nao|nao agora|por enquanto nao|not now|not yet|do not (?:schedule|book)|don['’]t (?:schedule|book))\b/.test(raw)) return false;
  return affirmativeAgendaText(text).split(/[.!?;]+/).some((part) => {
    const value = part.trim().replace(/^(?:por favor|please)[,\s]+/, '');
    if (/^(?:se|caso|talvez|if|perhaps|maybe|si)\b/.test(value)) return false;
    return /^(?:eu\s+)?(?:quero|gostaria de|prefiro|pode ser)\s+(?:um[a]?\s+)?(?:visita|videochamada|reuniao|ligacao)\b/.test(value)
      || /^(?:i would like|i['’]d like|i want|can i have|could i have)\s+(?:a[n]?\s+)?(?:visit|video call|meeting)\b/.test(value)
      || /^(?:quiero|quisiera|prefiero)\s+(?:una?\s+)?(?:visita|videollamada|reunion)\b/.test(value);
  });
}

export function agendaActionFromText(text: string): AgendaAction {
  const value = affirmativeAgendaText(text);
  if (/\b(?:quero|preciso|pode)\s+(?:cancelar|desmarcar)\b/.test(value)
    || /\b(?:cancelar|desmarcar)\b.{0,28}\b(?:visita|agendamento|horario|reuniao|videochamada|ligacao)\b/.test(value)) return 'cancel';
  if (/\b(?:remarcar|reagendar)\b/.test(value)
    || /\b(?:mudar|trocar|alterar)\b.{0,28}\b(?:visita|data|dia|horario|agendamento|videochamada|ligacao)\b/.test(value)) return 'reschedule';
  if (/\b(?:agendar|marcar)\b.{0,45}\b(?:visita|decorado|horario|reuniao|apresentacao|videochamada|videoconferencia|chamada de video|ligacao)\b/.test(value)
    || /\b(?:quero|gostaria|pretendo|posso)\b.{0,28}\bvisitar\b/.test(value)
    || /\b(?:quero|gostaria|pretendo|posso)\b.{0,40}\bconhecer\b.{0,30}\b(?:pessoalmente|decorado|estande|obra)\b/.test(value)
    || /\b(?:quero|gostaria|podemos|vamos|prefiro|pode ser)\b.{0,35}\b(?:videochamada|videoconferencia|chamada de video|reuniao online|apresentacao online|por video|presencialmente|visita presencial)\b/.test(value)
    || /\b(?:quiero|quisiera|podemos|prefiero)\b.{0,35}\b(?:videollamada|visita presencial)\b/.test(value)
    || /\b(?:schedule|book)\b.{0,35}\b(?:video call|visit|meeting)\b/.test(value)
    || /\b(?:quero visitar|visitar o decorado|visita ao decorado)\b/.test(value)
    || directNominalAgendaRequest(text)) return 'schedule';
  return 'none';
}

function isAgendaFollowupQuestion(text: string): boolean {
  const value = normalize(text);
  if (!/\b(?:visita|agenda|agendamento|horarios?|dia|data|videochamada|apresentacao|presencial)\b/.test(value)) return false;
  return /\b(?:qual dia|qual data|qual horario|qual voce prefere|horarios livres|outro dia|outro horario|dia e horario|que horario)\b/.test(value);
}

function isAgendaOffer(text: string): boolean {
  const value = normalize(text);
  return text.includes('?')
    && /\b(?:quer|prefere|vamos|podemos|posso|gostaria|que tal|would you|quieres|prefieres)\b/.test(value)
    && /\b(?:agendar|marcar|videochamada|chamada de video|por video|visita|conhecer pessoalmente|apresentacao online|videollamada|video call)\b/.test(value);
}

function affirmativeAgendaReply(text: string): boolean {
  const value = normalize(text);
  if (/\b(?:nao|depois eu|te chamo|vou pensar|por enquanto|not now|ahora no)\b/.test(value)) return false;
  return /^(?:sim|pode ser|pode marcar|quero|vamos|bora|claro|ok|combinado|aceito|gostei da ideia|yes|sure|si|dale)\b/.test(value);
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
  if (/\b(?:nao quero|nao posso|agora nao|por enquanto nao|vou pensar|te chamo depois|depois eu|sem visita|sem videochamada)\b/.test(normalize(lastUserMessage))) return false;
  const offered = isAgendaOffer(lastAssistant);
  const explicitAgendaContext = /\b(?:visita|agenda|agendamento|horarios livres|videochamada|ligacao|reuniao|presencial)\b/.test(normalize(lastAssistant))
    || history.filter((item) => item.role === 'user').slice(-3)
      .some((item) => ['schedule', 'reschedule'].includes(agendaActionFromText(item.content)));
  // A date answer after "qual dia pretende se mudar?" is qualification, not consent.
  return ((isAgendaFollowupQuestion(lastAssistant) && explicitAgendaContext) || offered)
    && (isAgendaDetailReply(lastUserMessage)
      || (offered && affirmativeAgendaReply(lastUserMessage))
      || /^(?:por )?(?:videochamada|video|presencial|pessoalmente|telefone|videollamada|video call)[.!]?$/i.test(normalize(lastUserMessage)));
}

function agendaModes(text: string): AgendaRequestedMode[] {
  const value = affirmativeAgendaText(text);
  const modes: AgendaRequestedMode[] = [];
  const video = /\b(?:videochamada|videoconferencia|chamada de video|por video|video call|videollamada|online|virtual|meet|teams|zoom)\b/.test(value)
    || /^video[.!]?$/.test(value);
  if (video) modes.push('video');
  if (/\b(?:presencial|presencialmente|pessoalmente|decorado|estande)\b/.test(value)
    || (!video && /\b(?:visitar|visita)\b/.test(value))
    || /\b(?:visita\s+ou|ou\s+(?:uma\s+)?visita)\b/.test(value)) modes.push('presencial');
  if (/\b(?:ligacao|telefone|ligar|phone call)\b/.test(value)) modes.push('telefone');
  return modes;
}

/** The buyer's most recent preference wins; an assistant offer is not consent. */
export function agendaModeFromConversation(history: AgendaConversationMessage[], lastUserMessage: string): AgendaRequestedMode | null {
  const latest = agendaModes(lastUserMessage);
  if (latest.length === 1) return latest[0];
  if (latest.length > 1) return null;
  const lastAssistant = [...history].reverse().find((item) => item.role === 'assistant')?.content ?? '';
  if (isAgendaOffer(lastAssistant) && (affirmativeAgendaReply(lastUserMessage) || isAgendaDetailReply(lastUserMessage))) {
    const offered = agendaModes(lastAssistant);
    // "Sim" to "vídeo ou presencial?" still requires choosing the format.
    return offered.length === 1 ? offered[0] : null;
  }
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role !== 'user') continue;
    const modes = agendaModes(history[i].content);
    if (modes.length === 1) return modes[0];
    if (modes.length > 1) return null;
  }
  return null;
}

/** Use only after the calendar operation returns a persisted event. Never invent a join URL. */
export function confirmedAgendaReply(appointment: {
  startsAt: string;
  meetingMode: AgendaRequestedMode;
  location?: string | null;
}): string {
  const when = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(appointment.startsAt));
  if (appointment.meetingMode === 'video') {
    return `Registrei sua videochamada para ${when} (horário de Brasília), para apresentar o empreendimento e a Bossa. O link de acesso ainda precisa ser confirmado pela equipe; não há deslocamento ao escritório. Se precisar mudar o horário, avise por aqui.`;
  }
  if (appointment.meetingMode === 'telefone') {
    return `Registrei sua ligação para ${when} (horário de Brasília). Se precisar mudar o horário, avise por aqui.`;
  }
  const address = appointment.location?.trim();
  if (!address) return `Registrei sua solicitação para ${when} (horário de Brasília), mas o local ainda precisa ser confirmado pela equipe antes da visita.`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return `Sua visita ficou marcada para ${when} (horário de Brasília), no escritório da Bossa, ${address}. ${maps} Se precisar mudar, avise por aqui.`;
}

export function hasNonAgendaQuestion(text: string): boolean {
  if (!text.includes('?')) return false;
  const value = normalize(text);
  return /\b(?:valor|preco|condominio|iptu|tamanho|metragem|area|suites?|quartos?|entrega|obra|pagamento|parcelas?|entrada|localizacao|onde fica|quanto custa)\b/.test(value);
}

/** Preserve the answer and the confirmed scheduling step; do not truncate either. */
export function appendAgendaMessageToReply(reply: string, agendaMessage: string): string {
  const trimmedReply = reply.trim();
  const withoutTrailingQuestion = trimmedReply.replace(/\s*[^.!?]*\?\s*$/s, '').trim();
  const base = withoutTrailingQuestion || trimmedReply;
  const agenda = agendaMessage.trim();
  if (!agenda || base.includes(agenda)) return base;
  return [base, agenda].filter(Boolean).join('\n\n');
}
