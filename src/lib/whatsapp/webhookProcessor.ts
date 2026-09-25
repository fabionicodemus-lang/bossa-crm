import { generateAiTurn, type AiFileOption } from '@/lib/ai-v120';
import { loadAiContext } from '@/lib/ai-context';
import { recordAiUsage } from '@/lib/ai-usage';
import { loadNaraDynamicTurnContext } from '@/lib/nara-dynamic-context';
import { loadNaraForeignContext } from '@/lib/nara-exterior';
import { loadNaraOperationalContext } from '@/lib/nara-operations';
import { extractContactTimePreference, naraContactZone, naraSendHours } from '@/lib/nara-timezone';
import { loadNaraCommercialTurnContext } from '@/lib/nara-unit-queries';
import { markNaraOfferAuditFailed, markNaraOfferAuditSent, prepareNaraOfferAudit } from '@/lib/nara-offer-log';
import { aiCanReply } from '@/lib/hybrid';
import { optOutSignal } from '@/lib/hybrid';
import { whatsappCanStillReply, whatsappClaimAiTurn, whatsappMarkAiTurnSent } from '@/lib/whatsapp/aiTurnSafety';
import { maybeScheduleAgendaFromAi } from '@/lib/agenda-ai-core';
import { appendAgendaMessageToReply, hasNonAgendaQuestion, shouldHandleAgendaTurn } from '@/lib/nara-agenda-intent';
import { mergeMetaAdAttribution } from '@/lib/meta-ad-attribution';
import { applyHybridDecision } from '@/lib/hybrid-server';
import {
  broadcastResponseAction,
  clientNoReplyReason,
  findRecentBroadcastForLead,
  queueBroadcastAttention,
  reactivateLeadFromBroadcast,
  recordClientNoReplySafetyNet,
  shouldForceBroadcastReply,
} from '@/lib/nara-broadcast-response';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Lead, LeadKind } from '@/lib/types';
import { handleAiFailure as recordAiFailure, resolveAiChannelFailure } from '@/lib/whatsapp/aiFailure';
import type { WhatsAppMediaType, WhatsAppMessageCategory } from '@/lib/whatsapp/channelProvider';
import {
  channelAccess,
  findChannelByPhoneNumberId,
  findConversation,
  openConversationWindow,
  type WhatsAppChannelRecord,
  type WhatsAppConversationRecord,
} from '@/lib/whatsapp/channelService';
import { handleMixedPlantaoConversation } from '@/lib/whatsapp/plantaoMixedRouting';
import {
  clientBroadcastBrokerSignal,
  completePendingBrokerPortfolio,
  routeClientBrokerFromBroadcast,
} from '@/lib/whatsapp/clientBrokerTransfer';
import { sendNaraResetConfirmation } from '@/lib/whatsapp/naraReset';
import { isCustomerServiceWindowOpen, OUTSIDE_WINDOW_MESSAGE } from '@/lib/whatsapp/window';
import type {
  MetaWebhookMessage,
  MetaWebhookStatus,
  StoredMetaWebhookEvent,
} from '@/lib/whatsapp/webhookTypes';
import { metaTimestamp, metaWaId, normalizeWaId, phoneMatchVariants } from '@/lib/whatsapp/utils';

type AdminClient = ReturnType<typeof createAdminClient>;

function declaredName(text: string): string {
  const match = text.match(/\b(?:sou|me chamo|meu nome (?:é|e)|aqui é|aqui e|soy|me llamo|mi nombre (?:es|e)|i'm|i am|my name is)\s+(?:a\s+|o\s+)?([\p{L}'’-]{2,})(?:\s+[\p{L}'’-]+){0,2}/iu);
  return match?.[1]?.trim() ?? '';
}

function paymentMethodFromText(text: string): string {
  const value = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
  if (/\ba vista\b|\bavista\b|\bal contado\b/.test(value)) return 'à vista';
  if (/\bfinanciamento\b|\bfinanciar\b|\bcaixa\b|\bfinanciamiento\b/.test(value)) return 'financiamento bancário';
  if (/\bparcelad|\bparcela|\bentrada\b|\bbalao|\breforco\b|\bcuotas?\b|\bmensualidades?\b/.test(value)) return 'parcelado';
  if (/\bdolar|\busd\b|\beuro|\beur\b|\bmoeda local\b/.test(value)) return 'pagamento do exterior / moeda estrangeira';
  return '';
}

async function isAuthorizedNaraReset(
  admin: AdminClient,
  organizationId: string,
  waId: string,
) {
  const { data, error } = await admin.from('nara_internal_numbers')
    .select('phone,can_reset')
    .eq('organization_id', organizationId)
    .in('phone', phoneMatchVariants(waId))
    .eq('can_reset', true)
    .limit(1)
    .maybeSingle();
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw error;
  return Boolean(data);
}

async function handleNaraReset(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  waId: string;
  inboundWamid: string;
}) {
  const authorized = await isAuthorizedNaraReset(
    args.admin,
    args.channel.organization_id,
    args.waId,
  );
  if (!authorized) return false;

  const { data: leads, error: leadsError } = await args.admin.from('leads')
    .select('*')
    .eq('organization_id', args.channel.organization_id)
    .in('phone', phoneMatchVariants(args.waId))
    .eq('kind', 'cliente')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(5);
  if (leadsError) throw leadsError;
  const lead = leads?.[0] as Lead | undefined;
  const now = new Date().toISOString();

  if (lead) {
    const resetResults = await Promise.all([
      args.admin.from('whatsapp_ai_conversation_memory').delete().eq('lead_id', lead.id),
      args.admin.from('nara_offer_logs').delete().eq('lead_id', lead.id),
      args.admin.from('nara_followup_sequences').update({ status: 'cancelled', updated_at: now }).eq('lead_id', lead.id).eq('status', 'active'),
      args.admin.from('nara_deferred_replies').update({ status: 'cancelled', updated_at: now }).eq('lead_id', lead.id).in('status', ['pending', 'processing']),
      args.admin.from('client_handoff_alert_jobs').update({ owner_status: 'cancelled', manager_status: 'cancelled' }).eq('lead_id', lead.id).or('owner_status.eq.queued,manager_status.eq.queued'),
      args.admin.from('lead_handoffs').update({
        status: 'cancelled',
        updated_at: now,
      }).eq('lead_id', lead.id).eq('status', 'pending'),
      args.admin.from('lead_tasks').update({
        status: 'cancelled',
        completed_at: now,
      }).eq('lead_id', lead.id).eq('status', 'pending'),
      args.admin.from('leads').update({
        name: args.waId,
        email: null,
        enterprise: null,
        company: null,
        group_name: null,
        creci: null,
        source: 'WhatsApp',
        stage: 'novo_triagem',
        owner_mode: 'ai',
        owner_id: null,
        backup_owner_id: null,
        ai_enabled: true,
        automation_paused: false,
        priority_class: null,
        temperature: 0,
        ai_classification: null,
        ai_summary: null,
        ai_next_action: null,
        ai_last_classified_at: null,
        next_action: null,
        next_action_type: null,
        next_action_due_at: null,
        reactivation_at: null,
        handoff_requested_at: null,
        handoff_accepted_at: null,
        loss_reason: null,
        opt_out: false,
        metadata: {
          whatsapp_channel_id: args.channel.id,
          nara_reset_at: now,
          nara_reset_by_phone: args.waId,
        },
        updated_at: now,
      }).eq('id', lead.id),
      args.admin.from('activities').insert({
        organization_id: args.channel.organization_id,
        lead_id: lead.id,
        type: 'nara_reset',
        title: 'Conversa de teste da Nara zerada',
        description: 'O histórico anterior foi preservado apenas para auditoria e deixou de compor o contexto da Nara.',
        metadata: { reset_at: now, reset_by_phone: args.waId },
      }),
    ]);
    const resetError = resetResults.find((result) => result.error)?.error;
    if (resetError) throw resetError;
  }

  await sendNaraResetConfirmation(args.channel, args.waId);

  return true;
}

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
    whatsapp_connection_id: args.channel.legacy_connection_id ?? null,
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
}): Promise<{ sentIds: string[]; failedTitles: string[] }> {
  const selected = args.attachmentIds
    .map((id) => args.files.find((file) => file.id === id))
    .filter((file): file is AiFileOption => Boolean(file))
    .slice(0, 3);
  const { provider, accessToken, phoneNumberId } = channelAccess(args.channel);
  const destination = normalizeWaId(args.lead.phone ?? '');
  const sentIds: string[] = [];
  const failedTitles: string[] = [];
  if (!destination) return { sentIds, failedTitles: selected.map((file) => file.title) };

  for (const file of selected) {
    try {
      const { data: signed, error: signedError } = await args.admin.storage
        .from(file.storage_bucket)
        .createSignedUrl(file.storage_path, 3600);
      if (signedError || !signed?.signedUrl) {
        throw signedError ?? new Error('Não foi possível gerar o link temporário do arquivo.');
      }

      const preferredType = whatsappMediaType(file);
      let sentType: WhatsAppMediaType = preferredType;
      let result: Awaited<ReturnType<typeof provider.sendMedia>>;
      try {
        result = await provider.sendMedia({
          phoneNumberId,
          accessToken,
          to: destination,
          type: preferredType,
          link: signed.signedUrl,
          caption: preferredType === 'audio' ? undefined : file.title,
          filename: preferredType === 'document' ? file.original_name : undefined,
        });
      } catch (preferredError) {
        if (preferredType === 'document') throw preferredError;
        sentType = 'document';
        result = await provider.sendMedia({
          phoneNumberId,
          accessToken,
          to: destination,
          type: 'document',
          link: signed.signedUrl,
          caption: file.title,
          filename: file.original_name,
        });
      }

      sentIds.push(file.id);
      await recordOutbound({
        admin: args.admin,
        channel: args.channel,
        conversation: args.conversation,
        lead: args.lead,
        senderKind: 'ia',
        body: `📎 ${file.title}`,
        type: sentType,
        category: 'service',
        wamid: result.messageId,
        providerPayload: result.raw,
        crmPayload: {
          ai_file_id: file.id,
          category: file.category,
          original_name: file.original_name,
          mime_type: file.mime_type,
          sent_as: sentType,
        },
      });

      await args.admin.from('activities').insert({
        organization_id: args.channel.organization_id,
        lead_id: args.lead.id,
        type: 'arquivo_ia_enviado',
        title: `IA enviou o arquivo “${file.title}”`,
        description: `${file.original_name} enviado automaticamente pelo WhatsApp como ${sentType}.`,
        metadata: { ai_file_id: file.id, category: file.category, mime_type: file.mime_type, sent_as: sentType },
      });
    } catch (error) {
      failedTitles.push(file.title);
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

  return { sentIds, failedTitles };
}

function replyAfterAttachmentDelivery(
  originalReply: string,
  requestedCount: number,
  sentCount: number,
): string {
  if (!requestedCount || sentCount === requestedCount) return originalReply;
  const normalized = originalReply
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
  const spanish = /\b(hola|soy nara|quiero|puedes|precio|te envio|te mando)\b/.test(normalized);
  const identity = originalReply.match(/^.{0,140}\bNara\b.{0,80}\bBossa\b[^.!?]*[.!?]/i)?.[0]?.trim() ?? '';

  if (sentCount === 0) {
    const failure = spanish
      ? 'No pude completar el envío del archivo ahora, así que todavía no lo considero enviado. El equipo comercial puede complementarlo sin que tengas que repetir el pedido.'
      : 'Não consegui concluir o envio do arquivo agora, então ainda não considero esse material enviado. O comercial pode complementar sem você precisar repetir o pedido.';
    return `${identity ? `${identity} ` : ''}${failure}`.trim();
  }

  const partial = spanish
    ? 'Te envié los archivos que sí se completaron; uno de los anexos no terminó de salir y el equipo comercial puede complementarlo.'
    : 'Enviei os arquivos que concluíram normalmente; um dos anexos não terminou de sair e o comercial pode complementar.';
  return `${identity ? `${identity} ` : ''}${partial}`.trim();
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

export async function processConversation(args: {
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
  let lead = leadData as Lead | null;
  if (!lead || lead.opt_out) return;

  const pendingBrokerPortfolio = await completePendingBrokerPortfolio({
    admin: args.admin,
    channel: args.channel,
    conversation: args.conversation,
    lead,
    sourceMessageId: args.sourceMessageId,
  });
  if (pendingBrokerPortfolio.handled) return;

  // O número do Plantão é compartilhado. Antes de qualquer IA comercial,
  // aplicamos a regra de identidade: CLIENTE é protegido; GERAL é triado;
  // somente CORRETOR segue para o Plantão normal.
  const mixedRouting = await handleMixedPlantaoConversation({
    admin: args.admin,
    channel: args.channel,
    conversation: args.conversation,
    lead,
    sourceMessageId: args.sourceMessageId,
  });
  if (mixedRouting.handled) return;
  if (mixedRouting.promotedToBroker) {
    const { data: promoted } = await args.admin.from('leads').select('*').eq('id', lead.id).maybeSingle();
    lead = promoted as Lead | null;
    if (!lead || lead.kind !== 'corretor') return;
  }

  // Fora do fluxo misto, somente cliente (no canal da Nara) e corretor
  // (no Plantão) chegam aqui. Geral nunca recebe a IA comercial completa.
  if (lead.kind === 'geral') return;

  const { data: source, error: sourceError } = await args.admin
    .from('messages')
    .select('id,created_at,body')
    .eq('id', args.sourceMessageId)
    .maybeSingle();
  if (sourceError || !source) {
    if (lead.kind === 'cliente') {
      await recordClientNoReplySafetyNet({
        admin: args.admin,
        organizationId: args.channel.organization_id,
        lead,
        sourceMessageId: args.sourceMessageId,
        inboundText: '',
        reason: 'mensagem de origem não encontrada',
      });
    }
    return;
  }

  const explicitOptOut = lead.kind === 'cliente' && optOutSignal(String(source.body ?? ''));
  const recentBroadcast = lead.kind === 'cliente'
    ? await findRecentBroadcastForLead({
      admin: args.admin,
      organizationId: args.channel.organization_id,
      lead,
      sourceCreatedAt: String(source.created_at),
    })
    : null;
  if (lead.kind === 'cliente'
    && recentBroadcast
    && !explicitOptOut
    && clientBroadcastBrokerSignal(String(source.body ?? ''))) {
    await routeClientBrokerFromBroadcast({
      admin: args.admin,
      lead,
      sourceMessageId: args.sourceMessageId,
      sourceText: String(source.body ?? ''),
      broadcastId: recentBroadcast.broadcastId,
    });
    return;
  }

  const broadcastAction = lead.kind === 'cliente'
    ? broadcastResponseAction(lead, Boolean(recentBroadcast), explicitOptOut)
    : 'none';

  if (recentBroadcast && broadcastAction === 'handoff_closed_won') {
    await queueBroadcastAttention({
      admin: args.admin,
      organizationId: args.channel.organization_id,
      lead,
      broadcast: recentBroadcast,
      sourceMessageId: args.sourceMessageId,
      inboundText: String(source.body ?? ''),
      mode: 'closed_won',
    });
    return;
  }

  if (recentBroadcast && broadcastAction === 'notify_human') {
    await queueBroadcastAttention({
      admin: args.admin,
      organizationId: args.channel.organization_id,
      lead,
      broadcast: recentBroadcast,
      sourceMessageId: args.sourceMessageId,
      inboundText: String(source.body ?? ''),
      mode: 'human',
    });
    return;
  }

  if (recentBroadcast && broadcastAction === 'reactivate_ai') {
    lead = await reactivateLeadFromBroadcast({
      admin: args.admin,
      organizationId: args.channel.organization_id,
      lead,
      broadcast: recentBroadcast,
    });
  }

  const context = await loadAiContext(args.admin, args.channel.organization_id, lead.kind);
  if (context.config?.active === false) {
    if (lead.kind === 'cliente') {
      await recordClientNoReplySafetyNet({
        admin: args.admin,
        organizationId: args.channel.organization_id,
        lead,
        sourceMessageId: args.sourceMessageId,
        inboundText: String(source.body ?? ''),
        reason: 'IA da organização está desativada',
      });
    }
    return;
  }

  let historyQuery = args.admin.from('messages')
    .select('id,direction,sender_kind,body,created_at')
    .eq('lead_id', lead.id)
    .neq('direction', 'system');
  const resetAt = typeof lead.metadata?.nara_reset_at === 'string'
    ? String(lead.metadata.nara_reset_at)
    : '';
  if (resetAt) historyQuery = historyQuery.gte('created_at', resetAt);
  const { data: historyRows } = await historyQuery
    .order('created_at', { ascending: true })
    .limit(100);
  if (resetAt && source.created_at < resetAt) return;

  const mergedHistoryRows = [...(historyRows ?? [])];
  if (recentBroadcast && !mergedHistoryRows.some((row) => String(row.id) === recentBroadcast.id)) {
    mergedHistoryRows.push({
      id: recentBroadcast.id,
      direction: 'out',
      sender_kind: 'humano',
      body: recentBroadcast.body,
      created_at: recentBroadcast.createdAt,
    });
    mergedHistoryRows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  const history = mergedHistoryRows.map((row) => ({
    role: row.direction === 'in' ? 'user' as const : 'assistant' as const,
    content: row.body,
  }));
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

  const lastInbound = [...history].reverse().find((item) => item.role === 'user')?.content ?? '';
  if (lead.kind === 'cliente' && optOutSignal(lastInbound)) {
    const now = new Date().toISOString();
    const { error } = await args.admin.from('leads').update({ opt_out: true, ai_enabled: false,
      automation_paused: true, owner_mode: 'none', stage: 'encerrado', updated_at: now })
      .eq('organization_id', args.channel.organization_id).in('phone', phoneMatchVariants(lead.phone));
    if (error) throw error;
    await Promise.all([
      args.admin.from('nara_followup_sequences').update({ status: 'cancelled', updated_at: now }).eq('lead_id', lead.id).eq('status', 'active'),
      args.admin.from('nara_deferred_replies').update({ status: 'cancelled', updated_at: now }).eq('lead_id', lead.id).eq('status', 'pending'),
      args.admin.from('broadcast_recipients').update({ status: 'skipped' }).eq('organization_id', args.channel.organization_id)
        .in('phone', phoneMatchVariants(lead.phone)).eq('status', 'queued'),
    ]);
    const reply = 'Desculpe o incômodo! Seu número foi removido e você não vai receber mais mensagens da Bossa.';
    const { provider, accessToken, phoneNumberId } = channelAccess(args.channel);
    const sent = await provider.sendText({ phoneNumberId, accessToken, to: normalizeWaId(lead.phone ?? ''), body: reply });
    await recordOutbound({ admin: args.admin, channel: args.channel, conversation: args.conversation,
      lead, senderKind: 'ia', body: reply, type: 'text', category: 'service', wamid: sent.messageId,
      providerPayload: sent.raw });
    return;
  }

  const shouldReply = aiCanReply(lead);
  if (!shouldReply) {
    if (lead.kind === 'cliente') {
      await recordClientNoReplySafetyNet({
        admin: args.admin,
        organizationId: args.channel.organization_id,
        lead,
        sourceMessageId: args.sourceMessageId,
        inboundText: lastInbound,
        reason: clientNoReplyReason(lead),
      });
    }
    return;
  }

  const claimed = await whatsappClaimAiTurn({
    admin: args.admin,
    leadId: lead.id,
    conversationId: args.conversation.id,
    sourceId: args.sourceMessageId,
  });
  if (!claimed) return;

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
    const [operational, foreign] = await Promise.all([
      loadNaraOperationalContext(
        args.admin,
        args.channel.organization_id,
      ),
      loadNaraForeignContext(
        args.admin,
        history,
        commercial,
      ),
    ]);
    context.commercial = commercial;
    context.dynamic = dynamic;
    context.foreign = foreign;
    context.operational = operational;
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
  if (!(await whatsappCanStillReply({ admin: args.admin, leadId: lead.id,
    conversationId: args.conversation.id, sourceId: args.sourceMessageId }))) {
    if (lead.kind === 'cliente') {
      await recordClientNoReplySafetyNet({
        admin: args.admin,
        organizationId: args.channel.organization_id,
        lead,
        sourceMessageId: args.sourceMessageId,
        inboundText: lastUserMessage,
        reason: 'estado da conversa mudou durante o processamento da IA',
      });
    }
    return;
  }
  if (lead.kind === 'cliente' && shouldHandleAgendaTurn(history, lastUserMessage)) {
    const officeAddress = context.dynamic?.values.office_address?.trim();
    const appointment = await maybeScheduleAgendaFromAi({ admin: args.admin,
      organizationId: args.channel.organization_id, lead, turn, lastUserMessage,
      officeAddress,
      weekdayHours: context.dynamic?.values.office_weekday_hours,
      saturdayHours: context.dynamic?.values.office_saturday_hours });
    if (appointment.status === 'created') {
      const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(officeAddress || '')}`;
      turn.reply = `Sua visita ficou marcada para ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(appointment.startsAt))}, no escritório da Bossa, ${officeAddress}. ${maps} Se precisar mudar, avise por aqui.`;
      turn.stage = 'agendado'; turn.classification = 'agendamento'; turn.handoff = false;
    } else if (appointment.status !== 'none') {
      turn.reply = hasNonAgendaQuestion(lastUserMessage)
        ? appendAgendaMessageToReply(turn.reply, appointment.message)
        : appointment.message;
      turn.stage = 'ia'; turn.handoff = false;
    }
  }
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

  const forceBroadcastReply = shouldForceBroadcastReply(broadcastAction, Boolean(recentBroadcast));
  if (!shouldReply || ((decision.ownerMode !== 'ai' || !decision.aiEnabled) && !forceBroadcastReply)) {
    if (lead.kind === 'cliente') {
      await recordClientNoReplySafetyNet({
        admin: args.admin,
        organizationId: args.channel.organization_id,
        lead,
        sourceMessageId: args.sourceMessageId,
        inboundText: lastUserMessage,
        reason: decision.ownerMode !== 'ai'
          ? `decisão da conversa mudou o responsável para ${decision.ownerMode}`
          : 'decisão da conversa desligou a IA',
      });
    }
    return;
  }

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
  let reply = turn.reply.trim();
  if (!destination || !reply) return;
  if (!(await whatsappCanStillReply({
    admin: args.admin,
    leadId: lead.id,
    conversationId: args.conversation.id,
    sourceId: args.sourceMessageId,
    allowDisabledLead: forceBroadcastReply,
  }))) {
    if (lead.kind === 'cliente') {
      await recordClientNoReplySafetyNet({
        admin: args.admin,
        organizationId: args.channel.organization_id,
        lead,
        sourceMessageId: args.sourceMessageId,
        inboundText: lastUserMessage,
        reason: 'resposta bloqueada pela trava final de concorrência',
      });
    }
    return;
  }

  if (turn.attachment_ids.length) {
    const delivery = await sendSelectedFiles({
      admin: args.admin,
      channel: args.channel,
      conversation: args.conversation,
      lead,
      files: context.files ?? [],
      attachmentIds: turn.attachment_ids,
    });
    reply = replyAfterAttachmentDelivery(
      reply,
      turn.attachment_ids.length,
      delivery.sentIds.length,
    );
  }

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
  try {
    await whatsappMarkAiTurnSent({
      admin: args.admin,
      leadId: lead.id,
      conversationId: args.conversation.id,
      sourceId: args.sourceMessageId,
    });
  } catch (error) {
    console.error('[whatsapp ai mark sent]', error);
  }

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
  let leadData: Lead | null = null;
  const directRoleRouting = args.channel.routing_mode === 'direct_role';
  const expectedKind: LeadKind = args.channel.role === 'cliente'
    ? 'cliente'
    : directRoleRouting
      ? 'corretor'
      : 'geral';

  if (args.channel.role === 'cliente' || directRoleRouting) {
    const { data, error } = await args.admin
      .from('leads')
      .select('*')
      .eq('organization_id', args.channel.organization_id)
      .eq('kind', expectedKind)
      .in('phone', phoneMatchVariants(args.waId))
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    leadData = ((data?.[0] ?? null) as Lead | null);
  } else {
    // O número principal do Plantão continua compartilhado. CLIENTE tem
    // prioridade absoluta; contatos novos passam pela triagem geral antes de
    // serem promovidos para o pipeline de corretores.
    const { data, error } = await args.admin
      .from('leads')
      .select('*')
      .eq('organization_id', args.channel.organization_id)
      .in('phone', phoneMatchVariants(args.waId))
      .in('kind', ['cliente', 'corretor', 'geral'])
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    const matches = (data ?? []) as Lead[];
    leadData = matches.find((item) => item.kind === 'cliente')
      ?? matches.find((item) => item.kind === 'corretor')
      ?? matches.find((item) => item.kind === 'geral')
      ?? null;
  }

  if (!leadData) {
    const kind = expectedKind;
    const attribution = mergeMetaAdAttribution({}, args.referral, args.receivedAt);
    const metadata = {
      ...attribution.metadata,
      whatsapp_channel_id: args.channel.id,
      whatsapp_routing_mode: args.channel.routing_mode,
      ...(kind === 'geral' ? {
        general_pipeline_reason: 'Contato novo recebido no número compartilhado do Plantão',
        plantao_triage_status: 'new',
      } : {}),
    };
    const { data, error } = await args.admin.from('leads').insert({
      organization_id: args.channel.organization_id,
      kind,
      name: args.contactName || args.waId,
      phone: args.waId,
      stage: 'novo_triagem',
      source: attribution.sourceLabel || 'WhatsApp',
      company: kind === 'corretor' ? 'Não informada' : null,
      temperature: 0,
      ai_enabled: kind !== 'geral',
      automation_paused: kind === 'geral',
      owner_mode: kind === 'geral' ? 'human' : 'ai',
      priority_class: null,
      last_inbound_at: args.receivedAt,
      metadata,
    }).select('*').single();
    if (error) throw error;
    leadData = data as Lead;
  }

  return leadData;
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

  const waId = metaWaId(args.message.from ?? args.contactWaId);
  if (!waId) return null;

  const createdAt = metaTimestamp(args.message.timestamp);
  const [lead, existingConversation] = await Promise.all([
    findOrCreateLead({
      admin: args.admin,
      channel: args.channel,
      waId,
      contactName: args.contactName,
      receivedAt: createdAt,
      referral: args.message.referral,
    }),
    findConversation(args.admin, args.channel.id, waId),
  ]);
  const conversation = await openConversationWindow({
    admin: args.admin,
    channel: args.channel,
    contactWaId: waId,
    leadId: lead.id,
    receivedAt: createdAt,
    prefetched: existingConversation,
  });
  const body = messageBody(args.message);

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
        whatsapp_connection_id: args.channel.legacy_connection_id ?? null,
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
  if (!storedMessage) return null;

  const attribution = mergeMetaAdAttribution(lead.metadata, args.message.referral, createdAt);
  const selfDeclaredName = declaredName(body);
  const contactTime = extractContactTimePreference(body, new Date(createdAt));
  const paymentMethod = paymentMethodFromText(body);
  const metadata = {
    ...attribution.metadata,
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: conversation.id,
    whatsapp_window_expires_at: conversation.window_expires_at,
    ...(contactTime ? {
      contact_time_preference_original: contactTime.original,
      contact_time_preference_city: contactTime.city,
      contact_time_preference_timezone: contactTime.source_timezone,
      contact_time_preference_brasilia: contactTime.brasilia_time,
    } : {}),
    ...(paymentMethod ? { payment_method: paymentMethod } : {}),
  };
  const currentNameLooksGeneric = !lead.name
    || lead.name === lead.phone
    || /^lead\b/i.test(String(lead.name))
    || /^\d{10,15}$/.test(String(lead.name));
  await args.admin.from('leads').update({
    name: selfDeclaredName
      || (currentNameLooksGeneric && args.contactName ? args.contactName : lead.name),
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

export async function processWebhookEvent(eventId: string, knownPhoneNumberId?: string) {
  const admin = createAdminClient();
  const [event, prefetchedChannel] = await Promise.all([
    claimEvent(admin, eventId),
    knownPhoneNumberId
      ? findChannelByPhoneNumberId(admin, knownPhoneNumberId)
      : Promise.resolve(null),
  ]);
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

    const channel = prefetchedChannel?.phone_number_id === phoneNumberId
      ? prefetchedChannel
      : await findChannelByPhoneNumberId(admin, phoneNumberId);
    if (!channel) {
      await admin.from('whatsapp_webhook_events').update({
        phone_number_id: phoneNumberId,
        processed_at: new Date().toISOString(),
        error: `Phone Number ID não cadastrado: ${phoneNumberId}`,
      }).eq('id', event.id);
      return { processed: true, reason: 'unknown_channel' };
    }

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

    // Alertas internos podem sair de um número da Bossa para outro número da
    // própria Bossa. O WhatsApp entrega isso normalmente ao destinatário, mas
    // o webhook do canal receptor não pode transformar a empresa em lead nem
    // deixar Nara/Plantão responderem um ao outro.
    const { data: siblingChannels } = await admin
      .from('whatsapp_channels')
      .select('id,display_phone_number')
      .eq('organization_id', channel.organization_id)
      .neq('id', channel.id);
    const internalBusinessNumbers = new Set(
      (siblingChannels ?? [])
        .map((item) => normalizeWaId(String(item.display_phone_number ?? '')))
        .filter(Boolean),
    );

    const persisted: PersistedInbound[] = [];
    for (const message of value.messages ?? []) {
      const senderWaId = metaWaId(message.from ?? contactWaId);
      const body = messageBody(message).trim();
      if (body.toLowerCase() === '#reset' && senderWaId) {
        const reset = await handleNaraReset({
          admin,
          channel,
          waId: senderWaId,
          inboundWamid: String(message.id ?? ''),
        });
        if (reset) continue;
      }
      if (senderWaId && internalBusinessNumbers.has(senderWaId)) {
        continue;
      }
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

    const aiErrors: string[] = [];
    for (const inbound of persisted) {
      try {
        if (inbound.channel.role === 'cliente') {
          const { data: quietLead } = await admin.from('leads').select('kind,metadata').eq('id', inbound.leadId).maybeSingle();
          const resetAt = typeof quietLead?.metadata?.nara_reset_at === 'string' ? quietLead.metadata.nara_reset_at : null;
          let priorQuery = admin.from('messages').select('id', { count: 'exact', head: true })
            .eq('lead_id', inbound.leadId).eq('direction', 'out').eq('sender_kind', 'ia');
          if (resetAt) priorQuery = priorQuery.gte('created_at', resetAt);
          const { count: priorReplies } = await priorQuery;
          if (quietLead?.kind === 'cliente' && !priorReplies) {
            const { data: inboundBody } = await admin.from('messages').select('body').eq('id', inbound.storedMessageId).single();
            const { data: earlierDeferred } = await admin.from('nara_deferred_replies').select('timezone')
              .eq('lead_id', inbound.leadId).eq('status', 'pending')
              .order('created_at', { ascending: true }).limit(1).maybeSingle();
            const zone = naraContactZone(`${inboundBody?.body || ''} ${quietLead.metadata?.city || ''}`);
            const effectiveZone = zone === 'America/Sao_Paulo' ? earlierDeferred?.timezone || zone : zone;
            if (!optOutSignal(inboundBody?.body || '') && !naraSendHours(new Date(), effectiveZone)) {
              await admin.from('nara_deferred_replies').upsert({
                organization_id: inbound.channel.organization_id, lead_id: inbound.leadId,
                channel_id: inbound.channel.id, conversation_id: inbound.conversation.id,
                source_message_id: inbound.storedMessageId, timezone: effectiveZone,
              }, { onConflict: 'source_message_id', ignoreDuplicates: true });
              continue;
            }
          }
        }
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
