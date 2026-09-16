import { generateAiTurn as generatePreviousTurn } from './ai-v120';
import type { AiTrainingContext, AiTurn } from './ai';
import { aiCanReply } from './hybrid';
import { createAdminClient } from './supabase/admin';
import type { Lead } from './types';

export * from './ai-v120';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type MessageRow = { id: string; direction: string; sender_kind: string; body: string; created_at: string; whatsapp_conversation_id: string | null };
type GuardedTurn = AiTurn & { __bossaAiClaim?: { conversationId: string; sourceId: string }; __bossaAiSkipped?: boolean };
export const SKIP_REASON = '__bossa_ai_turn_skipped__';
const DEBOUNCE_MS = 6500;

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

  // Uma confirmação curta sem novo pedido não precisa de mais uma pergunta.
  if (/^(?:obrigad[oa]|obg|valeu|ok|okay|blz|beleza|👍|🙏)[.!\s]*$/iu.test(lastUser)) {
    turn.reply = '';
    if (!turn.handoff && !turn.attachment_ids.length) {
      turn.summary = SKIP_REASON;
      turn.__bossaAiSkipped = true;
    }
    return turn;
  }

  // A API não disponibiliza neste fluxo ação confirmada de agenda/convite/e-mail.
  // Uma instrução ao modelo nunca conta como evidência de execução.
  const appointmentClaim = /\b(?:agendei|agendamos|marquei|marcamos|convite (?:foi )?enviado|enviei (?:o )?convite|link (?:foi )?enviado|reuni[aã]o (?:est[aá] )?confirmada|chamada (?:est[aá] )?confirmada|confirmei (?:a )?(?:reuni[aã]o|videochamada)|acion(?:ei|amos) (?:o )?time)\b/iu.test(reply);
  const materialClaim = /\b(?:enviei|enviamos|encaminhei|encaminhamos|arquivo enviado|material enviado|pdf enviado|documento enviado)\b/iu.test(reply);
  if (appointmentClaim) {
    turn.reply = 'Recebi os dados. O responsável precisa confirmar a disponibilidade e enviar o convite.';
    turn.handoff = true;
    turn.next_action = 'Equipe humana: confirmar disponibilidade, criar a reunião e enviar o convite antes de informar que foi agendada.';
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

  // Bloqueio determinístico de mensagens repetidas, inclusive com outras palavras.
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

/** O webhook pode chamar esta função uma vez por mensagem; somente a última
 * mensagem da conversa, depois de 6,5 s de silêncio, consegue o claim atômico.
 * Testes e chamadas fora de um webhook não dependem de Supabase nem da espera. */
export async function generateAiTurn(lead: Lead, history: ChatMessage[], context: AiTrainingContext = {}): Promise<AiTurn | null> {
  const conversationId = typeof lead.metadata?.whatsapp_conversation_id === 'string'
    ? lead.metadata.whatsapp_conversation_id : '';
  const lastInboundTime = new Date(lead.last_inbound_at || '').getTime();
  const live = Boolean(conversationId && Number.isFinite(lastInboundTime)
    && Date.now() - lastInboundTime >= 0 && Date.now() - lastInboundTime < 3 * 60_000
    && history.at(-1)?.role === 'user' && aiCanReply(lead));

  if (!live) {
    const turn = await generatePreviousTurn(lead, history, context);
    return turn ? guardedReply(turn as GuardedTurn, history) : null;
  }

  await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
  const admin = createAdminClient();
  const [{ data: freshData, error: leadError }, { data: recentRows, error: historyError }, { data: memory, error: memoryError }] = await Promise.all([
    admin.from('leads').select('*').eq('id', lead.id).maybeSingle(),
    admin.from('messages').select('id,direction,sender_kind,body,created_at,whatsapp_conversation_id')
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
  const recentHistory: ChatMessage[] = rows.map((row) => ({
    role: row.direction === 'in' ? 'user' : 'assistant', content: row.body,
  }));
  const { data: latest, error: latestError } = await admin.from('messages')
    .select('id,created_at').eq('whatsapp_conversation_id', conversationId).eq('direction', 'in')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (latestError || !latest) return skip(freshLead);

  // Nunca retomar a IA se um humano respondeu depois do contato.
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

  const existingFacts = memory?.facts && typeof memory.facts === 'object' && !Array.isArray(memory.facts)
    ? memory.facts as Record<string, unknown> : {};
  const facts = memoryFacts(rows, existingFacts);
  const memoryLead = { ...freshLead, metadata: {
    ...(freshLead.metadata || {}),
    memoria_da_conversa: { ...facts, resumo_anterior: memory?.last_summary || '' },
  } } as Lead;
  const turn = await generatePreviousTurn(memoryLead, recentHistory, context);
  if (!turn) return skip(freshLead);
  const guarded = guardedReply(turn as GuardedTurn, recentHistory);
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
