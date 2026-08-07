import { generateAiTurn, type AiFileOption } from '@/lib/ai';
import { loadAiContext } from '@/lib/ai-context';
import { recordAiUsage } from '@/lib/ai-usage';
import { loadNaraDynamicTurnContext } from '@/lib/nara-dynamic-context';
import { loadNaraCommercialTurnContext } from '@/lib/nara-unit-queries';
import { markNaraOfferAuditFailed, markNaraOfferAuditSent, prepareNaraOfferAudit } from '@/lib/nara-offer-log';
import { aiCanReply } from '@/lib/hybrid';
import { mergeMetaAdAttribution } from '@/lib/meta-ad-attribution';
import { applyHybridDecision } from '@/lib/hybrid-server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Lead, LeadKind } from '@/lib/types';
import { handleAiFailure as recordAiFailure, resolveAiChannelFailure } from '@/lib/whatsapp/aiFailure';
import type { WhatsAppMediaType, WhatsAppMessageCategory } from '@/lib/whatsapp/channelProvider';
import {
  channelAccess,
  findChannelByPhoneNumberId,
  openConversationWindow,
  type WhatsAppChannelRecord,
  type WhatsAppConversationRecord,
} from '@/lib/whatsapp/channelService';
import { isCustomerServiceWindowOpen, OUTSIDE_WINDOW_MESSAGE } from '@/lib/whatsapp/window';
import type {
  MetaWebhookMessage,
  MetaWebhookStatus,
  StoredMetaWebhookEvent,
} from '@/lib/whatsapp/webhookTypes';
import { metaTimestamp, normalizeWaId } from '@/lib/whatsapp/utils';

type AdminClient = ReturnType<typeof createAdminClient>;

function messageBody(message: MetaWebhookMessage) {
  if (message.type === 'text') return String(message.text?.body ?? '');
  if (message.type === 'button') return String(message.button?.text ?? '');
  if (message.type === 'interactive') {
    return String(
      message.interactive?.button_reply?.title
      ?? message.interactive?.list_reply?.title
      ?? 'Resposta interativa',
    );
  }
  if (message.type === 'image') return String(message.image?.caption ?? '[Imagem]');
  if (message.type === 'document') {
    return String(message.document?.caption ?? `[Documento${message.document?.filename ? `: ${message.document.filename}` : ''}]`);
  }
  if (message.type === 'audio') return '[Áudio]';
  if (message.type === 'video') return String(message.video?.caption ?? '[Vídeo]');
  if (message.type === 'location') return '[Localização]';
  if (message.type === 'contacts') return '[Contato compartilhado]';
  return `[Mensagem ${message.type || 'desconhecida'}]`;
}

function whatsappMediaType(file: AiFileOption): WhatsAppMediaType {
  const mime = (file.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

function normalizedCategory(value: unknown): WhatsAppMessageCategory | null {
  const category = String(value ?? '').toLowerCase();
  if (category === 'service' || category === 'marketing' || category === 'utility' || category === 'authentication') {
    return category;
  }
  return null;
}

async function recordOutbound(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  senderKind: 'ia' | 'humano';
  senderUserId?: string | null;
  body: string;
  type: string;
  category: WhatsAppMessageCategory;
  wamid: string | null;
  providerPayload: Record<string, unknown>;
  crmPayload?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const crmPayload = args.crmPayload ?? {};

  const transportInsert = {
    organization_id: args.channel.organization_id,
    channel_id: args.channel.id,
    conversation_id: args.conversation.id,
    lead_id: args.lead.id,
    wamid: args.wamid,
    direction: 'out',
    sender_kind: args.senderKind,
    type: args.type,
    body: args.body,
    payload: { provider: args.providerPayload, crm: crmPayload },
    status: 'sent',
    category: args.category,
    sent_at: now,
  };

  if (args.wamid) {
    const { error } = await args.admin
      .from('whatsapp_messages')
      .upsert(transportInsert, { onConflict: 'wamid', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await args.admin.from('whatsapp_messages').insert(transportInsert);
    if (error) throw error;
  }

  const { data: legacyMessage, error: legacyError } = await args.admin.from('messages').insert({
    organization_id: args.channel.organization_id,
    lead_id: args.lead.id,
    whatsapp_connection_id: args.channel.legacy_connection_id ?? args.channel.id,
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: args.conversation.id,
    direction: 'out',
    sender_kind: args.senderKind,
    sender_user_id: args.senderUserId ?? null,
    body: args.body,
    status: 'sent',
    whatsapp_message_id: args.wamid,
    raw_payload: crmPayload,
  }).select('*').single();
  if (legacyError) throw legacyError;

  return legacyMessage;
}

async function sendSelectedFiles(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  files: AiFileOption[];
  attachmentIds: string[];
}) {
  const selected = args.attachmentIds
    .map((id) => args.files.find((file) => file.id === id))
    .filter((file): file is AiFileOption => Boolean(file))
    .slice(0, 3);
  const { provider, accessToken, phoneNumberId } = channelAccess(args.channel);
  const destination = normalizeWaId(args.lead.phone ?? '');
  if (!destination) return;

  for (const file of selected) {
    try {
      const { data: signed, error: signedError } = await args.admin.storage
        .from(file.storage_bucket)
        .createSignedUrl(file.storage_path, 3600);
      if (signedError || !signed?.signedUrl) {
        throw signedError ?? new Error('Não foi possível gerar o link temporário do arquivo.');
      }

      const type = whatsappMediaType(file);
      const result = await provider.sendMedia({
        phoneNumberId,
        accessToken,
        to: destination,
        type,
        link: signed.signedUrl,
        caption: type === 'audio' ? undefined : file.title,
        filename: type === 'document' ? file.original_name : undefined,
      });

      await recordOutbound({
        admin: args.admin,
        channel: args.channel,
        conversation: args.conversation,
        lead: args.lead,
        senderKind: 'ia',
        body: `📎 ${file.title}`,
        type,
        category: 'service',
        wamid: result.messageId,
        providerPayload: result.raw,
        crmPayload: {
          ai_file_id: file.id,
          category: file.category,
          original_name: file.original_name,
          mime_type: file.mime_type,
        },
      });

      await args.admin.from('activities').insert({
        organization_id: args.channel.organization_id,
        lead_id: args.lead.id,
        type: 'arquivo_ia_enviado',
        title: `IA enviou o arquivo “${file.title}”`,
        description: `${file.original_name} enviado automaticamente pelo WhatsApp.`,
        metadata: { ai_file_id: file.id, category: file.category, mime_type: file.mime_type },
      });
    } catch (error) {
      console.error('[whatsapp ai file]', file.id, error);
      await args.admin.from('activities').insert({
        organization_id: args.channel.organization_id,
        lead_id: args.lead.id,
        type: 'falha_arquivo_ia',
        title: `Falha ao enviar o arquivo “${file.title}”`,
        description: error instanceof Error ? error.message : 'Erro desconhecido no envio do arquivo.',
        metadata: { ai_file_id: file.id },
      });
    }
  }
}

async function handleAiFailure(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  error: unknown;
}) {
  await recordAiFailure(args);
}

async function processConversation(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  leadId: string;
  sourceMessageId: string;
}) {
  const { data: leadData } = await args.admin
    .from('leads')
    .select('*')
    .eq('id', args.leadId)
    .maybeSingle();
  const lead = leadData as Lead | null;
  if (!lead || lead.opt_out) return;

  const context = await loadAiContext(args.admin, args.channel.organization_id, lead.kind);
  if (context.config?.active === false) return;

  const { data: historyRows } = await args.admin.from('messages')
    .select('direction,sender_kind,body')
    .eq('lead_id', lead.id)
    .neq('direction', 'system')
    .order('created_at', { ascending: true })
    .limit(100);
  const history = (historyRows ?? []).map((row) => ({
    role: row.direction === 'in' ? 'user' as const : 'assistant' as const,
    content: row.body,
  }));
  const shouldReply = aiCanReply(lead);
  if (!history.length) {
    await handleAiFailure({
      admin: args.admin,
      channel: args.channel,
      conversation: args.conversation,
      lead,
      error: new Error('IA indisponível — chave ausente ou histórico vazio'),
    });
    return;
  }

  if (lead.kind === 'cliente') {
    const [commercial, dynamic] = await Promise.all([
      loadNaraCommercialTurnContext(
        args.admin,
        args.channel.organization_id,
        lead,
        history,
      ),
      loadNaraDynamicTurnContext(
        args.admin,
        args.channel.organization_id,
        lead.id,
      ),
    ]);
    context.commercial = commercial;
    context.dynamic = dynamic;
  }

  let turn;
  try {
    turn = await generateAiTurn(lead, history, context);
  } catch (error) {
    console.error('[whatsapp ai exhausted]', error);
    await handleAiFailure({
      admin: args.admin,
      channel: args.channel,
      conversation: args.conversation,
      lead,
      error,
    });
    return;
  }
  if (!turn) {
    await handleAiFailure({
      admin: args.admin,
      channel: args.channel,
      conversation: args.conversation,
      lead,
      error: new Error('IA indisponível — chave ausente ou histórico vazio'),
    });
    return;
  }

  const lastUserMessage = [...history].reverse().find((item) => item.role === 'user')?.content ?? '';
  const decision = await applyHybridDecision({
    admin: args.admin,
    organizationId: args.channel.organization_id,
    lead,
    turn,
    lastUserMessage,
    sourceMessageId: args.sourceMessageId,
  });
  await recordAiUsage({
    admin: args.admin,
    organizationId: args.channel.organization_id,
    leadId: lead.id,
    records: turn.usage_records ?? [],
  });

  if (!shouldReply || decision.ownerMode !== 'ai' || !decision.aiEnabled) return;

  if (!isCustomerServiceWindowOpen(args.conversation.window_expires_at)) {
    await args.admin.from('activities').insert({
      organization_id: args.channel.organization_id,
      lead_id: lead.id,
      type: 'janela_whatsapp_fechada',
      title: 'IA não enviou texto fora da janela de 24h',
      description: OUTSIDE_WINDOW_MESSAGE,
      metadata: { conversation_id: args.conversation.id },
    });
    return;
  }

  const destination = normalizeWaId(lead.phone ?? '');
  const reply = turn.reply.trim();
  if (!destination || !reply) return;


  let offerAuditIds: string[] = [];
  if (lead.kind === 'cliente') {
    try {
      offerAuditIds = await prepareNaraOfferAudit(args.admin, {
        organizationId: args.channel.organization_id,
        leadId: lead.id,
        conversationId: args.conversation.id,
        reply,
        commercial: context.commercial,
      });
    } catch (error) {
      console.error('[nara offer audit prepare]', error);
      await handleAiFailure({
        admin: args.admin,
        channel: args.channel,
        conversation: args.conversation,
        lead,
        error,
      });
      return;
    }
  }

  const { provider, accessToken, phoneNumberId } = channelAccess(args.channel);
  let result: Awaited<ReturnType<typeof provider.sendText>>;
  try {
    result = await provider.sendText({
      phoneNumberId,
      accessToken,
      to: destination,
      body: reply,
    });
  } catch (error) {
    try {
      await markNaraOfferAuditFailed(args.admin, offerAuditIds, error);
    } catch (auditError) {
      console.error('[nara offer audit failed status]', auditError);
    }
    await handleAiFailure({
      admin: args.admin,
      channel: args.channel,
      conversation: args.conversation,
      lead,
      error,
    });
    return;
  }

  try {
    await markNaraOfferAuditSent(args.admin, offerAuditIds, result.messageId);
  } catch (error) {
    console.error('[nara offer audit sent status]', error);
  }
  await recordOutbound({
    admin: args.admin,
    channel: args.channel,
    conversation: args.conversation,
    lead,
    senderKind: 'ia',
    body: reply,
    type: 'text',
    category: 'service',
    wamid: result.messageId,
    providerPayload: result.raw,
    crmPayload: {
      ai_model: turn.model_used ?? null,
      ai_compacted: turn.compacted ?? false,
      ai_usage: turn.usage_records ?? [],
      nara_offer_audit_ids: offerAuditIds,
    },
  });

  const now = new Date().toISOString();
  await args.admin.from('leads').update({
    last_outbound_at: now,
    last_ai_activity_at: now,
  }).eq('id', lead.id);
  await resolveAiChannelFailure({
    admin: args.admin,
    channel: args.channel,
    lead,
    succeededAt: now,
  });

  if (turn.attachment_ids.length) {
    await sendSelectedFiles({
      admin: args.admin,
      channel: args.channel,
      conversation: args.conversation,
      lead,
      files: context.files ?? [],
      attachmentIds: turn.attachment_ids,
    });
  }
}

async function processStatus(
  admin: AdminClient,
  status: MetaWebhookStatus,
) {
  const wamid = String(status.id ?? '').trim();
  if (!wamid) return;

  const nextStatus = String(status.status ?? 'unknown');
  const category = normalizedCategory(status.pricing?.category);
  const update: Record<string, unknown> = { status: nextStatus };
  if (category) update.category = category;
  if (status.errors?.length) update.error = { errors: status.errors };

  const { error } = await admin
    .from('whatsapp_messages')
    .update(update)
    .eq('wamid', wamid);
  if (error) throw error;

  await admin.from('messages').update({ status: nextStatus }).eq('whatsapp_message_id', wamid);

  const recipientUpdate: Record<string, unknown> = { status: nextStatus };
  const timestamp = metaTimestamp(status.timestamp);
  if (nextStatus === 'sent') recipientUpdate.sent_at = timestamp;
  if (nextStatus === 'delivered') recipientUpdate.delivered_at = timestamp;
  if (nextStatus === 'read') recipientUpdate.read_at = timestamp;
  if (nextStatus === 'failed') {
    recipientUpdate.error_message = status.errors?.length
      ? JSON.stringify(status.errors).slice(0, 1000)
      : 'Falha informada pela Meta.';
  }
  await admin
    .from('broadcast_recipients')
    .update(recipientUpdate)
    .eq('whatsapp_message_id', wamid);
}

async function findOrCreateLead(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  waId: string;
  contactName: string;
  receivedAt: string;
  referral?: MetaWebhookMessage['referral'];
}) {
  const kind: LeadKind = args.channel.role;
  const { data: existingLead, error: readError } = await args.admin
    .from('leads')
    .select('*')
    .eq('organization_id', args.channel.organization_id)
    .eq('kind', kind)
    .eq('phone', args.waId)
    .maybeSingle();
  if (readError) throw readError;
  let leadData = existingLead;

  if (!leadData) {
    const { data: routedLead, error: routedReadError } = await args.admin
      .from('leads')
      .select('*')
      .eq('organization_id', args.channel.organization_id)
      .eq('phone', args.waId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (routedReadError) throw routedReadError;
    leadData = routedLead;
  }

  if (!leadData) {
    const attribution = mergeMetaAdAttribution({}, args.referral, args.receivedAt);
    const { data, error } = await args.admin.from('leads').insert({
      organization_id: args.channel.organization_id,
      kind,
      name: args.contactName || args.waId,
      phone: args.waId,
      stage: 'novo_triagem',
      source: attribution.sourceLabel || 'WhatsApp',
      company: kind === 'corretor' ? 'Não informada' : null,
      temperature: 0,
      ai_enabled: true,
      owner_mode: 'ai',
      priority_class: null,
      last_inbound_at: args.receivedAt,
      metadata: attribution.metadata,
    }).select('*').single();
    if (error) throw error;
    leadData = data;
  }

  return leadData as Lead;
}

type PersistedInbound = {
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  leadId: string;
  storedMessageId: string;
};

// Grava a mensagem recebida e devolve o contexto necessário para a IA responder
// depois. A separação é proposital: a linha em `messages` é o que o Realtime
// entrega para a tela, então nada de lento pode acontecer antes dela.
async function persistInboundMessage(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  message: MetaWebhookMessage;
  contactWaId: string;
  contactName: string;
}): Promise<PersistedInbound | null> {
  const inboundWamid = String(args.message.id ?? '').trim();
  if (!inboundWamid) return null;

  const waId = normalizeWaId(String(args.message.from ?? args.contactWaId));
  if (!waId) return null;

  const createdAt = metaTimestamp(args.message.timestamp);
  const lead = await findOrCreateLead({
    admin: args.admin,
    channel: args.channel,
    waId,
    contactName: args.contactName,
    receivedAt: createdAt,
    referral: args.message.referral,
  });
  const conversation = await openConversationWindow({
    admin: args.admin,
    channel: args.channel,
    contactWaId: waId,
    leadId: lead.id,
    receivedAt: createdAt,
  });
  const body = messageBody(args.message);

  // As duas gravações são independentes e cada uma tem sua própria chave de
  // deduplicação, então vão juntas para tirar uma ida ao banco do caminho.
  const [transportResult, messageResult] = await Promise.all([
    args.admin
      .from('whatsapp_messages')
      .upsert({
        organization_id: args.channel.organization_id,
        channel_id: args.channel.id,
        conversation_id: conversation.id,
        lead_id: lead.id,
        wamid: inboundWamid,
        direction: 'in',
        sender_kind: 'lead',
        type: args.message.type || 'unknown',
        body,
        payload: args.message,
        status: 'received',
        category: null,
        sent_at: createdAt,
        created_at: createdAt,
      }, { onConflict: 'wamid', ignoreDuplicates: true })
      .select('id')
      .maybeSingle(),
    args.admin
      .from('messages')
      .upsert({
        organization_id: args.channel.organization_id,
        lead_id: lead.id,
        whatsapp_connection_id: args.channel.legacy_connection_id ?? args.channel.id,
        whatsapp_channel_id: args.channel.id,
        whatsapp_conversation_id: conversation.id,
        direction: 'in',
        sender_kind: 'lead',
        body,
        status: 'received',
        whatsapp_message_id: inboundWamid,
        raw_payload: args.message,
        created_at: createdAt,
      }, { onConflict: 'whatsapp_message_id', ignoreDuplicates: true })
      .select('id')
      .maybeSingle(),
  ]);
  if (transportResult.error) throw transportResult.error;
  if (messageResult.error) throw messageResult.error;

  const storedMessage = messageResult.data;
  // Reentrega da Meta: a mensagem já está na conversa e a IA já respondeu.
  if (!storedMessage) return null;

  const attribution = mergeMetaAdAttribution(lead.metadata, args.message.referral, createdAt);
  const metadata = {
    ...attribution.metadata,
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: conversation.id,
    whatsapp_window_expires_at: conversation.window_expires_at,
  };
  await args.admin.from('leads').update({
    name: lead.name === lead.phone && args.contactName ? args.contactName : lead.name,
    source: attribution.firstAttribution && attribution.sourceLabel ? attribution.sourceLabel : lead.source,
    last_inbound_at: createdAt,
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', lead.id);

  return {
    channel: args.channel,
    conversation,
    leadId: lead.id,
    storedMessageId: storedMessage.id,
  };
}

async function claimEvent(admin: AdminClient, eventId: string) {
  const { data, error } = await admin.rpc('claim_whatsapp_webhook_event', {
    target_id: eventId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as StoredMetaWebhookEvent | null;
}

export async function processWebhookEvent(eventId: string) {
  const admin = createAdminClient();
  const event = await claimEvent(admin, eventId);
  if (!event) return { processed: false, reason: 'not_claimed' };

  try {
    const change = event.raw.change;
    const value = change?.value ?? {};
    const phoneNumberId = String(
      event.phone_number_id
      ?? value.metadata?.phone_number_id
      ?? '',
    ).trim();

    if (!phoneNumberId) {
      await admin.from('whatsapp_webhook_events').update({
        processed_at: new Date().toISOString(),
        error: 'Evento sem metadata.phone_number_id.',
      }).eq('id', event.id);
      return { processed: true, reason: 'missing_phone_number_id' };
    }

    const channel = await findChannelByPhoneNumberId(admin, phoneNumberId);
    if (!channel) {
      await admin.from('whatsapp_webhook_events').update({
        phone_number_id: phoneNumberId,
        processed_at: new Date().toISOString(),
        error: `Phone Number ID não cadastrado: ${phoneNumberId}`,
      }).eq('id', event.id);
      return { processed: true, reason: 'unknown_channel' };
    }

    // Associação do evento e confirmações de entrega são rastreabilidade: saem
    // do caminho crítico e correm enquanto as mensagens recebidas são gravadas.
    // Os status seguem em série entre si porque um mesmo wamid pode chegar como
    // `sent` e `delivered` no mesmo lote e a ordem da gravação importa.
    let sideEffectError: unknown = null;
    const sideEffects = (async () => {
      const { error: associateError } = await admin.from('whatsapp_webhook_events').update({
        organization_id: channel.organization_id,
        channel_id: channel.id,
        phone_number_id: phoneNumberId,
      }).eq('id', event.id);
      if (associateError) throw associateError;

      for (const status of value.statuses ?? []) {
        await processStatus(admin, status);
      }
    })().catch((error: unknown) => {
      sideEffectError = error;
    });

    const contactName = String(value.contacts?.[0]?.profile?.name ?? '').trim();
    const contactWaId = String(value.contacts?.[0]?.wa_id ?? '').trim();

    // Primeiro todas as mensagens entram na conversa. Antes, a segunda mensagem
    // de um mesmo lote só era gravada depois da IA terminar de responder a
    // primeira — dezenas de segundos de atraso na tela.
    const persisted: PersistedInbound[] = [];
    for (const message of value.messages ?? []) {
      const stored = await persistInboundMessage({
        admin,
        channel,
        message,
        contactWaId,
        contactName,
      });
      if (stored) persisted.push(stored);
    }

    await sideEffects;
    if (sideEffectError) throw sideEffectError;

    await admin.from('whatsapp_webhook_events').update({
      organization_id: channel.organization_id,
      channel_id: channel.id,
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      error: null,
    }).eq('id', event.id);

    // Só agora a IA entra em cena. Uma falha aqui já tem tratamento próprio e
    // não deve reabrir o evento para reprocessamento pelo worker de recuperação,
    // que reenviaria a mesma resposta ao cliente.
    const aiErrors: string[] = [];
    for (const inbound of persisted) {
      try {
        await processConversation({
          admin,
          channel: inbound.channel,
          conversation: inbound.conversation,
          leadId: inbound.leadId,
          sourceMessageId: inbound.storedMessageId,
        });
      } catch (aiError) {
        console.error('[whatsapp ai turn]', event.id, inbound.leadId, aiError);
        aiErrors.push(aiError instanceof Error ? aiError.message : 'Falha desconhecida na resposta da IA.');
      }
    }

    if (aiErrors.length) {
      await admin.from('whatsapp_webhook_events').update({
        error: `Mensagens gravadas; resposta da IA falhou: ${aiErrors.join(' | ')}`.slice(0, 2000),
      }).eq('id', event.id);
    }

    return { processed: true, reason: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida no processamento.';
    await admin.from('whatsapp_webhook_events').update({
      processing_started_at: null,
      error: message.slice(0, 2000),
    }).eq('id', event.id);
    throw error;
  }
}

export async function processPendingWebhookEvents(limit = 25) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('whatsapp_webhook_events')
    .select('id')
    .eq('signature_valid', true)
    .is('processed_at', null)
    .lt('attempts', 10)
    .order('received_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  let processed = 0;
  let failed = 0;
  for (const event of data ?? []) {
    try {
      const result = await processWebhookEvent(event.id);
      if (result.processed) processed++;
    } catch (processError) {
      failed++;
      console.error('[whatsapp event worker]', event.id, processError);
    }
  }
  return { selected: data?.length ?? 0, processed, failed };
}
