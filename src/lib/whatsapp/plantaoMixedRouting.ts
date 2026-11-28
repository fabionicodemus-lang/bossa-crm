import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from '@/lib/types';
import { isBrokerRoutingSignal, normalizeNaraRoutingText } from '@/lib/nara-contact-routing';
import { channelAccess, type WhatsAppChannelRecord, type WhatsAppConversationRecord } from '@/lib/whatsapp/channelService';
import { clearlyOperationalNonBrokerReason } from '@/lib/whatsapp/contactKindAutoRouting';
import { plantaoCanReplyNow } from '@/lib/whatsapp/plantaoSchedule';
import { whatsappClaimAiTurn, whatsappMarkAiTurnSent } from '@/lib/whatsapp/aiTurnSafety';
import { understandInboundMedia } from '@/lib/whatsapp/aiMediaUnderstanding';
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
  const text = normalizeNaraRoutingText(value);
  if (isBrokerNo(text, awaitingAnswer)) return false;
  if (isBrokerRoutingSignal(value)) return true;
  if (/\b(?:apresentando|mostrando|oferecendo)\s+(?:(?:o|a|esse|essa|este|esta|um|uma)\s+(?:imovel|apartamento|duplex|empreendimento|unidade)\s+)?(?:pra|para|a)\s+(?:(?:um|uma|meu|minha)\s+)?cliente\b/.test(text)) return true;
  if (!awaitingAnswer) return false;
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
    whatsapp_connection_id: args.channel.legacy_connection_id,
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

async function recentRoutingReply(admin: AdminClient, conversationId: string, reasons: string[]) {
  const { data, error } = await admin.from('whatsapp_messages').select('id')
    .eq('conversation_id', conversationId).eq('direction', 'out').eq('sender_kind', 'ia')
    .in('payload->>routing_reason', reasons).in('status', ['sent', 'delivered', 'read'])
    .gte('sent_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString()).limit(1).maybeSingle();
  if (error) throw error;
  return Boolean(data);
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
  const { data: sourceMessage, error: sourceError } = await args.admin.from('messages')
    .select('id,body,whatsapp_channel_id,raw_payload')
    .eq('id', args.sourceMessageId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  let text = String(sourceMessage?.body || '').trim();
  const metadata = metadataOf(args.lead);
  const awaiting = metadata.plantao_triage_status === 'awaiting_broker_answer';
  const now = new Date().toISOString();

  // Uma decisão manual de que o contato não é corretor é soberana. O número
  // compartilhado do Plantão não pode perguntar de novo nem promovê-lo sozinho.
  if (metadata.contact_kind_manually_confirmed === 'geral' || metadata.contact_kind_manually_confirmed === 'cliente') {
    await args.admin.from('leads').update({
      ai_enabled: false,
      automation_paused: true,
      owner_mode: 'human',
      updated_at: now,
    }).eq('id', args.lead.id);
    return { handled: true };
  }
  const autoOperationalReason = metadata.auto_kind_triage_status === 'operational_non_broker'
    ? String(metadata.auto_kind_triage_reason || 'Fornecedor/prestador identificado automaticamente')
    : '';
  const cleanup = metadata.pipeline_kind_cleanup_2026_09_30 && typeof metadata.pipeline_kind_cleanup_2026_09_30 === 'object'
    ? metadata.pipeline_kind_cleanup_2026_09_30 as Record<string, unknown>
    : null;
  const cleanupReason = cleanup?.new_kind === 'geral'
    ? String(cleanup.reason || 'Contato já classificado como Geral')
    : '';
  const operationalReason = autoOperationalReason || cleanupReason || clearlyOperationalNonBrokerReason(text) || '';

  if (sourceMessage?.raw_payload?.type === 'audio' && !operationalReason) {
    const transcript = await understandInboundMedia({ admin: args.admin, organizationId: args.channel.organization_id, row: sourceMessage });
    if (transcript) text = transcript.replace(/^Áudio transcrito:\s*/, '');
  }

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

  const previousNonBroker = metadata.plantao_triage_status === 'not_broker'
    || metadata.plantao_triage_status === 'operational_non_broker';
  if (previousNonBroker || operationalReason || isBrokerNo(text, awaiting)) {
    if (!previousNonBroker) {
      const { error } = await args.admin.from('leads').update({
        stage: 'humano_ativo',
        ai_enabled: false,
        automation_paused: true,
        owner_mode: 'human',
        priority_class: null,
        metadata: {
          ...metadata,
          plantao_triage_status: operationalReason ? 'operational_non_broker' : 'not_broker',
          plantao_triage_answer: text,
          plantao_triage_reason: operationalReason || null,
          plantao_triage_classified_at: now,
        },
        updated_at: now,
      }).eq('id', args.lead.id).eq('kind', 'geral');
      if (error) throw error;
    }
    await ensureHumanTask({
      admin: args.admin,
      lead: args.lead,
      title: 'Novo contato não corretor aguardando retorno',
      description: operationalReason
        ? `Contato identificado automaticamente como não corretor: ${operationalReason}. Verificar o retorno quando necessário.`
        : 'O contato informou que não é corretor. Verificar se é cliente, fornecedor, prestador ou outro contato e classificar manualmente se necessário.',
      dedupeKey: 'plantao:geral:retorno',
    });
    if (!await recentRoutingReply(args.admin, args.conversation.id, ['general_not_broker'])) {
      const turn = { admin: args.admin, leadId: args.lead.id, conversationId: args.conversation.id, sourceId: args.sourceMessageId };
      if (!await whatsappClaimAiTurn(turn)) return { handled: true };
      await sendRoutingText({
        admin: args.admin,
        channel: args.channel,
        conversation: args.conversation,
        lead: args.lead,
        text: NON_BROKER_REPLY,
        reason: 'general_not_broker',
      });
      await whatsappMarkAiTurnSent(turn);
    }
    return { handled: true };
  }

  if (awaiting && isRecent(metadata.plantao_broker_question_sent_at, 24)) {
    // Versões anteriores marcavam a pergunta antes do envio, inclusive quando a Meta o recusava.
    if (await recentRoutingReply(args.admin, args.conversation.id, ['broker_question_first', 'broker_question_repeat'])) {
      await ensureHumanTask({
        admin: args.admin, lead: args.lead,
        title: 'Conferir pedido recebido no Plantão',
        description: 'O contato escreveu de novo sem confirmar o perfil. Consulte a conversa para responder ao pedido.',
        dedupeKey: 'plantao:geral:triagem',
      });
      return { handled: true };
    }
  }
  const turn = { admin: args.admin, leadId: args.lead.id, conversationId: args.conversation.id, sourceId: args.sourceMessageId };
  if (!await whatsappClaimAiTurn(turn)) return { handled: true };
  await sendRoutingText({
    admin: args.admin,
    channel: args.channel,
    conversation: args.conversation,
    lead: args.lead,
    text: BROKER_QUESTION,
    reason: awaiting ? 'broker_question_repeat' : 'broker_question_first',
  });
  await whatsappMarkAiTurnSent(turn);
  const { error: triageError } = await args.admin.from('leads').update({
    ai_enabled: false,
    automation_paused: true,
    owner_mode: 'human',
    metadata: {
      ...metadata,
      plantao_triage_status: 'awaiting_broker_answer',
      plantao_broker_question_sent_at: now,
    },
    updated_at: now,
  }).eq('id', args.lead.id).eq('kind', 'geral');
  if (triageError) throw triageError;
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
  if (args.channel.role !== 'corretor') {
    return { handled: false };
  }
  if (args.lead.automation_paused && args.lead.metadata?.whatsapp_manual_takeover === true) {
    return { handled: true };
  }
  const activeNow = await plantaoCanReplyNow(args.admin, args.channel.organization_id);
  if (!activeNow) return { handled: true };
  if (args.channel.routing_mode === 'direct_role' && args.lead.kind !== 'geral') return { handled: false };
  if (args.lead.kind === 'cliente') return handleKnownCustomer(args);
  if (args.lead.kind === 'geral') return handleGeneral(args);
  return { handled: false };
}
