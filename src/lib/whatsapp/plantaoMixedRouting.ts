import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from '@/lib/types';
import { isBrokerRoutingSignal, normalizeNaraRoutingText } from '@/lib/nara-contact-routing';
import { channelAccess, type WhatsAppChannelRecord, type WhatsAppConversationRecord } from '@/lib/whatsapp/channelService';
import { plantaoCanReplyNow } from '@/lib/whatsapp/plantaoSchedule';
import { normalizeWaId } from '@/lib/whatsapp/utils';

type AdminClient = SupabaseClient;

type RoutingResult = {
  handled: boolean;
  promotedToBroker?: boolean;
};

const BROKER_QUESTION = 'Olá! Para eu direcionar seu atendimento corretamente: você é corretor(a) de imóveis? Pode me responder sim ou não.';
const NON_BROKER_REPLY = 'Certo, obrigado! Vou encaminhar sua mensagem para o responsável da Bossa, que entrará em contato com você em breve.';
const CUSTOMER_REPLY = 'Olá! Recebemos sua mensagem. Como você já está cadastrado como cliente da Bossa, vou encaminhar para o responsável, que entrará em contato com você em breve.';

function metadataOf(lead: Lead) {
  return (lead.metadata && typeof lead.metadata === 'object' ? lead.metadata : {}) as Record<string, unknown>;
}

function isRecent(value: unknown, hours: number) {
  const timestamp = new Date(String(value || '')).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < hours * 60 * 60 * 1000;
}

function isBrokerYes(value: string, awaitingAnswer: boolean) {
  if (isBrokerRoutingSignal(value)) return true;
  if (!awaitingAnswer) return false;
  const text = normalizeNaraRoutingText(value);
  return /^(?:sim|s|sou|corretor|corretora|sim sou|sou sim|sou corretor|sou corretora|isso|isso mesmo|positivo|yes)\b/.test(text);
}

function isBrokerNo(value: string, awaitingAnswer: boolean) {
  const text = normalizeNaraRoutingText(value);
  if (/\bnao sou (?:um |uma )?corretor(?:a)?\b/.test(text)) return true;
  if (/\b(?:sou cliente|ja sou cliente|sou fornecedor|sou fornecedora|fornecedor|fornecedora|prestador|prestadora|proprietario|proprietaria|morador|moradora|sindico|sindica|funcionario|funcionaria)\b/.test(text)) return true;
  if (!awaitingAnswer) return false;
  return /^(?:nao|n|negativo|no|nao sou|não|não sou)\b/.test(text);
}

async function sendRoutingText(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  text: string;
  reason: string;
}) {
  const destination = normalizeWaId(args.conversation.contact_wa_id || args.lead.phone || '');
  if (!destination) return;
  const { provider, accessToken, phoneNumberId } = channelAccess(args.channel);
  const result = await provider.sendText({
    phoneNumberId,
    accessToken,
    to: destination,
    body: args.text,
  });
  const now = new Date().toISOString();
  const transport = {
    organization_id: args.channel.organization_id,
    channel_id: args.channel.id,
    conversation_id: args.conversation.id,
    lead_id: args.lead.id,
    wamid: result.messageId,
    direction: 'out',
    sender_kind: 'ia',
    type: 'text',
    body: args.text,
    payload: { provider: result.raw, routing_reason: args.reason },
    status: 'sent',
    category: 'service',
    sent_at: now,
  };
  if (result.messageId) {
    const { error } = await args.admin.from('whatsapp_messages')
      .upsert(transport, { onConflict: 'wamid', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await args.admin.from('whatsapp_messages').insert(transport);
    if (error) throw error;
  }

  const { error: messageError } = await args.admin.from('messages').insert({
    organization_id: args.channel.organization_id,
    lead_id: args.lead.id,
    whatsapp_connection_id: args.channel.legacy_connection_id ?? args.channel.id,
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: args.conversation.id,
    direction: 'out',
    sender_kind: 'ia',
    body: args.text,
    status: 'sent',
    whatsapp_message_id: result.messageId,
    raw_payload: { routing_reason: args.reason },
    created_at: now,
  });
  if (messageError) throw messageError;

  await args.admin.from('leads').update({
    last_outbound_at: now,
    last_ai_activity_at: now,
    updated_at: now,
  }).eq('id', args.lead.id);
}

async function ensureHumanTask(args: {
  admin: AdminClient;
  lead: Lead;
  title: string;
  description: string;
  dedupeKey: string;
}) {
  const { data: existing } = await args.admin.from('lead_tasks')
    .select('id')
    .eq('lead_id', args.lead.id)
    .eq('status', 'pending')
    .eq('dedupe_key', args.dedupeKey)
    .maybeSingle();
  if (existing?.id) return;
  await args.admin.from('lead_tasks').insert({
    organization_id: args.lead.organization_id,
    lead_id: args.lead.id,
    assigned_to: args.lead.owner_id,
    assigned_mode: 'human',
    type: 'retorno_whatsapp',
    title: args.title,
    description: args.description,
    priority: 'high',
    status: 'pending',
    due_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    created_by_kind: 'system',
    dedupe_key: args.dedupeKey,
    metadata: { source: 'plantao_mixed_routing' },
  });
}

async function handleKnownCustomer(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
}): Promise<RoutingResult> {
  const metadata = metadataOf(args.lead);
  const now = new Date().toISOString();

  await args.admin.from('leads').update({
    ai_enabled: false,
    automation_paused: true,
    owner_mode: 'human',
    metadata: {
      ...metadata,
      plantao_recognized_existing_customer: true,
      plantao_customer_last_inbound_at: now,
    },
    updated_at: now,
  }).eq('id', args.lead.id);

  await ensureHumanTask({
    admin: args.admin,
    lead: args.lead,
    title: 'Cliente escreveu no número do Plantão',
    description: 'Cliente já cadastrado entrou em contato pelo número compartilhado do Plantão. Retornar sem alterar sua classificação de cliente.',
    dedupeKey: 'plantao:cliente:retorno',
  });

  if (!isRecent(metadata.plantao_customer_ack_at, 8)) {
    await sendRoutingText({
      admin: args.admin,
      channel: args.channel,
      conversation: args.conversation,
      lead: args.lead,
      text: CUSTOMER_REPLY,
      reason: 'existing_customer_on_plantao',
    });
    await args.admin.from('leads').update({
      metadata: {
        ...metadata,
        plantao_recognized_existing_customer: true,
        plantao_customer_last_inbound_at: now,
        plantao_customer_ack_at: now,
      },
    }).eq('id', args.lead.id);
  }

  return { handled: true };
}

async function handleGeneral(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  sourceMessageId: string;
}): Promise<RoutingResult> {
  const { data: sourceMessage } = await args.admin.from('messages')
    .select('body')
    .eq('id', args.sourceMessageId)
    .maybeSingle();
  const text = String(sourceMessage?.body || '').trim();
  const metadata = metadataOf(args.lead);
  const awaiting = metadata.plantao_triage_status === 'awaiting_broker_answer';
  const now = new Date().toISOString();

  if (isBrokerYes(text, awaiting)) {
    const { error } = await args.admin.from('leads').update({
      kind: 'corretor',
      stage: 'qualificacao_ia',
      company: args.lead.company || 'Não informada',
      ai_enabled: true,
      automation_paused: false,
      owner_mode: 'ai',
      owner_id: null,
      metadata: {
        ...metadata,
        plantao_triage_status: 'classified_broker',
        plantao_triage_answer: text,
        plantao_triage_classified_at: now,
        contact_kind_routed_from: 'geral',
        contact_kind_routed_to: 'corretor',
        contact_kind_routed_at: now,
      },
      updated_at: now,
    }).eq('id', args.lead.id);
    if (error) throw error;
    await args.admin.from('activities').insert({
      organization_id: args.lead.organization_id,
      lead_id: args.lead.id,
      type: 'lead_direcionado_corretor',
      title: 'Contato geral identificado como corretor',
      description: 'O próprio contato confirmou que é corretor. O Plantão continuará o atendimento no pipeline de corretores.',
      metadata: { source_message_id: args.sourceMessageId, answer: text },
    });
    return { handled: false, promotedToBroker: true };
  }

  if (isBrokerNo(text, awaiting)) {
    const { error } = await args.admin.from('leads').update({
      stage: 'humano_ativo',
      ai_enabled: false,
      automation_paused: true,
      owner_mode: 'human',
      metadata: {
        ...metadata,
        plantao_triage_status: 'not_broker',
        plantao_triage_answer: text,
        plantao_triage_classified_at: now,
      },
      updated_at: now,
    }).eq('id', args.lead.id);
    if (error) throw error;
    await sendRoutingText({
      admin: args.admin,
      channel: args.channel,
      conversation: args.conversation,
      lead: args.lead,
      text: NON_BROKER_REPLY,
      reason: 'general_not_broker',
    });
    await ensureHumanTask({
      admin: args.admin,
      lead: args.lead,
      title: 'Novo contato não corretor aguardando retorno',
      description: 'O contato informou que não é corretor. Verificar se é cliente, fornecedor, prestador ou outro contato e classificar manualmente se necessário.',
      dedupeKey: 'plantao:geral:retorno',
    });
    return { handled: true };
  }

  await args.admin.from('leads').update({
    ai_enabled: false,
    automation_paused: true,
    owner_mode: 'human',
    metadata: {
      ...metadata,
      plantao_triage_status: 'awaiting_broker_answer',
      plantao_broker_question_sent_at: now,
    },
    updated_at: now,
  }).eq('id', args.lead.id);
  await sendRoutingText({
    admin: args.admin,
    channel: args.channel,
    conversation: args.conversation,
    lead: args.lead,
    text: BROKER_QUESTION,
    reason: awaiting ? 'broker_question_repeat' : 'broker_question_first',
  });
  return { handled: true };
}

/**
 * Trata exclusivamente o número compartilhado do Plantão (role=corretor):
 * - CLIENTE sempre tem prioridade e jamais é reclassificado automaticamente;
 * - CORRETOR segue para o atendimento normal do Plantão;
 * - GERAL recebe a pergunta de identificação; somente GERAL pode virar CORRETOR;
 * - fora dos horários configurados, nenhuma resposta automática do Plantão sai.
 */
export async function handleMixedPlantaoConversation(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  sourceMessageId: string;
}): Promise<RoutingResult> {
  if (args.channel.role !== 'corretor' || args.channel.routing_mode === 'direct_role') {
    return { handled: false };
  }
  const activeNow = await plantaoCanReplyNow(args.admin, args.channel.organization_id);
  if (!activeNow) return { handled: true };
  if (args.lead.kind === 'cliente') return handleKnownCustomer(args);
  if (args.lead.kind === 'geral') return handleGeneral(args);
  return { handled: false };
}
