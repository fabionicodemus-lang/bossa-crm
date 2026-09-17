import { generateAiTurn as generatePreviousTurn } from './ai-v120';
import type { AiTrainingContext, AiTurn } from './ai';
import { rankAiFilesForConversation } from './ai-file-ranking';
import { maybeScheduleAgendaFromAi } from './agenda-ai';
import { aiCanReply } from './hybrid';
import { createAdminClient } from './supabase/admin';
import type { Lead } from './types';
import { understandInboundMedia } from './whatsapp/aiMediaUnderstanding';

export * from './ai-v120';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type MessageRow = {
  id: string;
  direction: string;
  sender_kind: string;
  body: string;
  created_at: string;
  whatsapp_conversation_id: string | null;
  whatsapp_channel_id: string | null;
  whatsapp_message_id: string | null;
  raw_payload: Record<string, unknown> | null;
};
type GuardedTurn = AiTurn & { __bossaAiClaim?: { conversationId: string; sourceId: string }; __bossaAiSkipped?: boolean };
export const SKIP_REASON = '__bossa_ai_turn_skipped__';
const DEBOUNCE_MS = 6500;
const MEDIA_BURST_MS = 45_000;
const MAX_MEDIA_PER_TURN = 4;

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string) {
  const left = new Set(normalize(a).split(' ').filter(Boolean));
  const right = new Set(normalize(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

function skip(lead: Lead): GuardedTurn {
  return {
    reply: '',
    classification: lead.ai_classification || (lead.kind === 'cliente' ? 'frio' : 'cadastrado'),
    score: Number(lead.temperature || 0),
    stage: lead.kind === 'cliente' ? 'ia' : 'n1',
    summary: SKIP_REASON,
    next_action: '',
    handoff: false,
    attachment_ids: [],
    extracted: { enterprise: '', purpose: '', typology: '', budget: '', deadline: '', decision_maker: '', company: '', creci: '', region: '', client_status: '' },
    __bossaAiSkipped: true,
  };
}

function guardedReply(turn: GuardedTurn, history: ChatMessage[]): GuardedTurn {
  const lastUser = [...history].reverse().find((entry) => entry.role === 'user')?.content.trim() || '';
  const previousReplies = history.filter((entry) => entry.role === 'assistant').map((entry) => entry.content).slice(-8);
  const reply = turn.reply.trim();
  if (!reply) return turn;

  if (/^(?:obrigad[oa]|obg|valeu|ok|okay|blz|beleza|👍|🙏)[.!\s]*$/iu.test(lastUser)) {
    turn.reply = '';
    if (!turn.handoff && !turn.attachment_ids.length) {
      turn.summary = SKIP_REASON;
      turn.__bossaAiSkipped = true;
    }
    return turn;
  }

  const appointmentClaim = /\b(?:agendei|agendamos|marquei|marcamos|convite (?:foi )?enviado|enviei (?:o )?convite|link (?:foi )?enviado|reuni[aã]o (?:est[aá] )?confirmada|chamada (?:est[aá] )?confirmada|confirmei (?:a )?(?:reuni[aã]o|videochamada)|acion(?:ei|amos) (?:o )?time)\b/iu.test(reply);
  const materialClaim = /\b(?:enviei|enviamos|encaminhei|encaminhamos|arquivo enviado|material enviado|pdf enviado|documento enviado)\b/iu.test(reply);
  if (appointmentClaim) {
    turn.reply = 'Recebi os dados. Vou conferir a Agenda antes de confirmar esse horário.';
    turn.next_action = 'Consultar a Agenda e somente confirmar o compromisso se o responsável estiver livre.';
    turn.attachment_ids = [];
    return turn;
  }
  if (materialClaim) {
    turn.reply = turn.attachment_ids.length
      ? 'Separei os materiais disponíveis para envio por aqui.'
      : 'Ainda não tenho confirmação do envio desse material. O comercial poderá verificar o pedido.';
    if (!turn.attachment_ids.length) turn.handoff = true;
    return turn;
  }

  if (previousReplies.some((previous) => normalize(previous) === normalize(reply) ||
      (normalize(reply).length > 35 && similarity(previous, reply) >= 0.88))) {
    turn.reply = '';
    if (!turn.handoff && !turn.attachment_ids.length) {
      turn.summary = SKIP_REASON;
      turn.__bossaAiSkipped = true;
    }
    return turn;
  }
  const question = reply.match(/[^.!?]*\?\s*$/u)?.[0]?.trim();
  if (question && previousReplies.some((previous) => {
    const oldQuestion = previous.match(/[^.!?]*\?\s*$/u)?.[0]?.trim();
    return oldQuestion && similarity(oldQuestion, question) > 0.82;
  })) {
    const withoutQuestion = reply.slice(0, reply.length - question.length).trim();
    turn.reply = withoutQuestion.replace(/^(?:perfeito|otimo|claro|entendi)[!.,\s]*/iu, '').trim();
    if (!turn.reply && !turn.handoff && !turn.attachment_ids.length) {
      turn.summary = SKIP_REASON;
      turn.__bossaAiSkipped = true;
    }
  }
  return turn;
}

function memoryFacts(rows: MessageRow[], previous: Record<string, unknown>) {
  const userMessages = rows.filter((row) => row.direction === 'in').map((row) => row.body);
  const raw = userMessages.join('\n');
  const email = [...raw.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu)].at(-1)?.[0];
  const scheduleRequest = [...userMessages].reverse().find((text) =>
    /\b(?:reuniao|videochamada|chamada|visita|agenda|agendar|quarta|quinta|sexta|sabado|domingo|segunda|terca)\b/iu.test(normalize(text))
      && /\b(?:\d{1,2}(?:\/\d{1,2})?|\d{1,2}h(?:\d{2})?)\b/iu.test(text),
  );
  return {
    ...previous,
    ...(email ? { email_informado: email.toLowerCase() } : {}),
    ...(scheduleRequest ? { horario_solicitado_texto_original: scheduleRequest.slice(0, 360) } : {}),
    ultimas_solicitacoes: userMessages.slice(-4).map((text) => text.slice(0, 280)),
  };
}

function rankedContext(context: AiTrainingContext, history: ChatMessage[], lead: Lead): AiTrainingContext {
  return {
    ...context,
    files: rankAiFilesForConversation(context.files ?? [], history, lead, 24),
  };
}

function looksLikeUnderstandableMedia(row: MessageRow) {
  const raw = row.raw_payload;
  if (!raw || row.direction !== 'in') return false;
  const source = (raw.message_echo && typeof raw.message_echo === 'object' ? raw.message_echo : raw.history_message && typeof raw.history_message === 'object' ? raw.history_message : raw) as Record<string, unknown>;
  return source.type === 'audio' || source.type === 'image';
}

async function enrichRecentMedia(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  rows: MessageRow[],
  latestAt: string,
) {
  const latestMs = new Date(latestAt).getTime();
  if (!Number.isFinite(latestMs)) return new Map<string, string>();
  const candidates = rows.filter((row) => {
    const rowMs = new Date(row.created_at).getTime();
    return looksLikeUnderstandableMedia(row)
      && Number.isFinite(rowMs)
      && latestMs - rowMs >= 0
      && latestMs - rowMs <= MEDIA_BURST_MS;
  }).slice(-MAX_MEDIA_PER_TURN);

  const results = await Promise.all(candidates.map(async (row) => {
    const understanding = await understandInboundMedia({ admin, organizationId, row });
    return [row.id, understanding] as const;
  }));
  return new Map(results.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
}

function formatAgendaConfirmation(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit',
  }).format(start);
  const startTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(start);
  const endTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(end);
  return `Perfeito. Conferi a Agenda e ficou marcado para ${date}, das ${startTime} às ${endTime}.`;
}

async function applyAgendaScheduling(
  admin: ReturnType<typeof createAdminClient>,
  freshLead: Lead,
  guarded: GuardedTurn,
  recentHistory: ChatMessage[],
) {
  const lastUserMessage = [...recentHistory].reverse().find((entry) => entry.role === 'user')?.content || '';
  const result = await maybeScheduleAgendaFromAi({
    admin,
    organizationId: freshLead.organization_id,
    lead: freshLead,
    turn: guarded,
    lastUserMessage,
  });

  if (result.status === 'none') return guarded;
  guarded.__bossaAiSkipped = false;
  guarded.attachment_ids = [];

  if (result.status === 'created') {
    guarded.reply = formatAgendaConfirmation(result.startsAt, result.endsAt);
    guarded.summary = `${guarded.summary || 'Compromisso solicitado pelo contato.'} Agenda consultada e compromisso criado sem conflito.`;
    guarded.next_action = 'Responsável deve realizar o compromisso no horário registrado na Agenda.';
    guarded.handoff = true;
    if (freshLead.kind === 'cliente') {
      guarded.classification = 'agendamento';
      guarded.stage = 'agendado';
      guarded.score = Math.max(80, guarded.score);
    } else {
      guarded.classification = 'negociando';
      guarded.stage = 'n4';
      guarded.score = Math.max(80, guarded.score);
    }
    return guarded;
  }

  guarded.reply = result.message;
  guarded.next_action = result.status === 'conflict'
    ? 'Aguardar o contato indicar outro horário; não confirmar o compromisso enquanto houver conflito na Agenda.'
    : 'Aguardar o contato informar data e horário exatos antes de criar o compromisso.';
  guarded.handoff = false;
  if (freshLead.kind === 'cliente') {
    if (guarded.classification === 'agendamento') guarded.classification = 'quente';
    if (guarded.stage === 'agendado') guarded.stage = 'ia';
  } else if (guarded.stage === 'n4' && result.status === 'needs_details') {
    guarded.stage = 'n3';
  }
  return guarded;
}

/** O webhook pode chamar esta função uma vez por mensagem; somente a última
 * mensagem da conversa, depois de 6,5 s de silêncio, consegue o claim atômico. */
export async function generateAiTurn(lead: Lead, history: ChatMessage[], context: AiTrainingContext = {}): Promise<AiTurn | null> {
  const conversationId = typeof lead.metadata?.whatsapp_conversation_id === 'string'
    ? lead.metadata.whatsapp_conversation_id : '';
  const lastInboundTime = new Date(lead.last_inbound_at || '').getTime();
  const live = Boolean(conversationId && Number.isFinite(lastInboundTime)
    && Date.now() - lastInboundTime >= 0 && Date.now() - lastInboundTime < 3 * 60_000
    && history.at(-1)?.role === 'user' && aiCanReply(lead));

  if (!live) {
    const contextual = rankedContext(context, history, lead);
    const turn = await generatePreviousTurn(lead, history, contextual);
    return turn ? guardedReply(turn as GuardedTurn, history) : null;
  }

  await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
  const admin = createAdminClient();
  const [{ data: freshData, error: leadError }, { data: recentRows, error: historyError }, { data: memory, error: memoryError }] = await Promise.all([
    admin.from('leads').select('*').eq('id', lead.id).maybeSingle(),
    admin.from('messages').select('id,direction,sender_kind,body,created_at,whatsapp_conversation_id,whatsapp_channel_id,whatsapp_message_id,raw_payload')
      .eq('lead_id', lead.id).neq('direction', 'system')
      .order('created_at', { ascending: false }).limit(100),
    admin.from('whatsapp_ai_conversation_memory').select('facts,last_summary').eq('lead_id', lead.id).maybeSingle(),
  ]);
  if (leadError || historyError || memoryError || !freshData || !recentRows) {
    console.error('[ai debounce] erro ao reler contexto', leadError, historyError, memoryError);
    return skip(lead);
  }
  const freshLead = freshData as Lead;
  if (!aiCanReply(freshLead)) return skip(freshLead);
  const rows = ([...recentRows].reverse() as MessageRow[]);
  const { data: latest, error: latestError } = await admin.from('messages')
    .select('id,created_at').eq('whatsapp_conversation_id', conversationId).eq('direction', 'in')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (latestError || !latest) return skip(freshLead);

  const { data: humanReply } = await admin.from('messages').select('id').eq('whatsapp_conversation_id', conversationId)
    .eq('direction', 'out').eq('sender_kind', 'humano').gt('created_at', latest.created_at).limit(1).maybeSingle();
  if (humanReply) return skip(freshLead);
  const { data: claimed, error: claimError } = await admin.rpc('claim_whatsapp_ai_turn', {
    p_conversation_id: conversationId, p_source_message_id: latest.id,
  });
  if (claimError || claimed !== true) {
    if (claimError) console.error('[ai debounce] claim', claimError.message);
    return skip(freshLead);
  }

  const mediaUnderstanding = await enrichRecentMedia(admin, freshLead.organization_id, rows, latest.created_at);
  const recentHistory: ChatMessage[] = rows.map((row) => ({
    role: row.direction === 'in' ? 'user' : 'assistant',
    content: mediaUnderstanding.get(row.id) || row.body,
  }));

  const existingFacts = memory?.facts && typeof memory.facts === 'object' && !Array.isArray(memory.facts)
    ? memory.facts as Record<string, unknown> : {};
  const facts = memoryFacts(rows.map((row) => ({
    ...row,
    body: mediaUnderstanding.get(row.id) || row.body,
  })), existingFacts);
  const memoryLead = { ...freshLead, metadata: {
    ...(freshLead.metadata || {}),
    memoria_da_conversa: { ...facts, resumo_anterior: memory?.last_summary || '' },
  } } as Lead;
  const contextual = rankedContext(context, recentHistory, memoryLead);
  const turn = await generatePreviousTurn(memoryLead, recentHistory, contextual);
  if (!turn) return skip(freshLead);
  let guarded = guardedReply(turn as GuardedTurn, recentHistory);
  guarded = await applyAgendaScheduling(admin, freshLead, guarded, recentHistory);
  guarded.__bossaAiClaim = { conversationId, sourceId: latest.id };
  if (!guarded.__bossaAiSkipped) {
    const { error: saveError } = await admin.from('whatsapp_ai_conversation_memory').upsert({
      lead_id: freshLead.id,
      organization_id: freshLead.organization_id,
      facts,
      last_summary: guarded.summary.slice(0, 2500),
      last_source_message_id: latest.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lead_id' });
    if (saveError) console.error('[ai memory]', saveError.message);
  }
  return guarded;
}
