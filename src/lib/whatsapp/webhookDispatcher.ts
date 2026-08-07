import { createAdminClient } from '@/lib/supabase/admin';
import type { Lead, LeadKind } from '@/lib/types';
import {
  ensureConversation,
  findChannelByPhoneNumberId,
  type WhatsAppChannelRecord,
} from '@/lib/whatsapp/channelService';
import { processWebhookEvent } from '@/lib/whatsapp/webhookProcessor';
import { metaTimestamp, normalizeWaId } from '@/lib/whatsapp/utils';

type AdminClient = ReturnType<typeof createAdminClient>;

type LooseMessage = {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string | number;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  revoke?: { original_message_id?: string };
  edit?: { original_message_id?: string; message?: LooseMessage };
  [key: string]: unknown;
};

type StoredEvent = {
  id: string;
  phone_number_id: string | null;
  raw: {
    change?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        message_echoes?: LooseMessage[];
        [key: string]: unknown;
      };
    };
    [key: string]: unknown;
  };
};

function messageBody(message: LooseMessage) {
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

async function claimEvent(admin: AdminClient, eventId: string) {
  const { data, error } = await admin.rpc('claim_whatsapp_webhook_event', {
    target_id: eventId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as StoredEvent | null;
}

async function associateEvent(
  admin: AdminClient,
  event: StoredEvent,
  channel: WhatsAppChannelRecord,
  phoneNumberId: string,
) {
  const { error } = await admin.from('whatsapp_webhook_events').update({
    organization_id: channel.organization_id,
    channel_id: channel.id,
    phone_number_id: phoneNumberId,
  }).eq('id', event.id);
  if (error) throw error;
}

async function finishEvent(admin: AdminClient, eventId: string, errorMessage: string | null = null) {
  const { error } = await admin.from('whatsapp_webhook_events').update({
    processed_at: new Date().toISOString(),
    processing_started_at: null,
    error: errorMessage,
  }).eq('id', eventId);
  if (error) throw error;
}

async function findOrCreateLead(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  contactWaId: string;
  contactName: string;
  sentAt: string;
}) {
  const kind: LeadKind = args.channel.role;
  const { data: existing, error: readError } = await args.admin
    .from('leads')
    .select('*')
    .eq('organization_id', args.channel.organization_id)
    .eq('kind', kind)
    .eq('phone', args.contactWaId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing as Lead;

  const { data, error } = await args.admin.from('leads').insert({
    organization_id: args.channel.organization_id,
    kind,
    name: args.contactName || args.contactWaId,
    phone: args.contactWaId,
    stage: 'novo_triagem',
    source: 'WhatsApp Business',
    company: kind === 'corretor' ? 'Não informada' : null,
    temperature: 0,
    ai_enabled: false,
    automation_paused: true,
    owner_mode: 'human',
    priority_class: null,
    last_outbound_at: args.sentAt,
    last_human_activity_at: args.sentAt,
    metadata: {
      whatsapp_last_source: 'whatsapp_business_app',
      whatsapp_last_app_activity_at: args.sentAt,
    },
  }).select('*').single();
  if (error) throw error;
  return data as Lead;
}

async function updateOriginalMessage(args: {
  admin: AdminClient;
  originalWamid: string;
  body: string;
  payload: Record<string, unknown>;
  status?: string;
}) {
  if (!args.originalWamid) return;
  await Promise.all([
    args.admin.from('whatsapp_messages').update({
      body: args.body,
      payload: args.payload,
      ...(args.status ? { status: args.status } : {}),
    }).eq('wamid', args.originalWamid),
    args.admin.from('messages').update({
      body: `📱 WhatsApp Business: ${args.body}`,
      raw_payload: args.payload,
      ...(args.status ? { status: args.status } : {}),
    }).eq('whatsapp_message_id', args.originalWamid),
  ]);
}

async function processEcho(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  echo: LooseMessage;
  fallbackContact: string;
  contactName: string;
}) {
  if (args.echo.type === 'revoke') {
    const originalWamid = String(args.echo.revoke?.original_message_id ?? '').trim();
    await updateOriginalMessage({
      admin: args.admin,
      originalWamid,
      body: '[Mensagem apagada no WhatsApp Business]',
      payload: { source: 'whatsapp_business_app', echo: args.echo },
      status: 'deleted',
    });
    return;
  }

  if (args.echo.type === 'edit') {
    const originalWamid = String(args.echo.edit?.original_message_id ?? '').trim();
    const edited = args.echo.edit?.message ?? args.echo;
    await updateOriginalMessage({
      admin: args.admin,
      originalWamid,
      body: messageBody(edited),
      payload: { source: 'whatsapp_business_app', edited: true, echo: args.echo },
    });
    return;
  }

  const wamid = String(args.echo.id ?? '').trim();
  if (!wamid) return;

  const contactWaId = normalizeWaId(String(args.echo.to ?? args.fallbackContact));
  if (!contactWaId) return;

  const sentAt = metaTimestamp(args.echo.timestamp);
  const lead = await findOrCreateLead({
    admin: args.admin,
    channel: args.channel,
    contactWaId,
    contactName: args.contactName,
    sentAt,
  });
  const conversation = await ensureConversation({
    admin: args.admin,
    channel: args.channel,
    contactWaId,
    leadId: lead.id,
  });
  const body = messageBody(args.echo);
  const payload = {
    source: 'whatsapp_business_app',
    message_echo: args.echo,
  };

  const { data: stored, error: transportError } = await args.admin
    .from('whatsapp_messages')
    .upsert({
      organization_id: args.channel.organization_id,
      channel_id: args.channel.id,
      conversation_id: conversation.id,
      lead_id: lead.id,
      wamid,
      direction: 'out',
      sender_kind: 'humano',
      type: args.echo.type || 'unknown',
      body,
      payload,
      status: 'sent',
      category: null,
      sent_at: sentAt,
      created_at: sentAt,
    }, { onConflict: 'wamid', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();
  if (transportError) throw transportError;
  if (!stored) return;

  const { error: messageError } = await args.admin.from('messages').upsert({
    organization_id: args.channel.organization_id,
    lead_id: lead.id,
    whatsapp_connection_id: args.channel.legacy_connection_id ?? args.channel.id,
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: conversation.id,
    direction: 'out',
    sender_kind: 'humano',
    body: `📱 WhatsApp Business: ${body}`,
    status: 'sent',
    whatsapp_message_id: wamid,
    raw_payload: payload,
    created_at: sentAt,
  }, { onConflict: 'whatsapp_message_id', ignoreDuplicates: true });
  if (messageError) throw messageError;

  const metadata = {
    ...(lead.metadata || {}),
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: conversation.id,
    whatsapp_last_source: 'whatsapp_business_app',
    whatsapp_last_app_activity_at: sentAt,
  };
  await args.admin.from('leads').update({
    ai_enabled: false,
    automation_paused: true,
    owner_mode: 'human',
    last_outbound_at: sentAt,
    last_human_activity_at: sentAt,
    metadata,
  }).eq('id', lead.id);

  await args.admin.from('activities').insert({
    organization_id: args.channel.organization_id,
    lead_id: lead.id,
    type: 'mensagem_whatsapp_business',
    title: 'Equipe respondeu pelo aplicativo WhatsApp Business',
    description: body,
    metadata: {
      whatsapp_message_id: wamid,
      whatsapp_channel_id: args.channel.id,
      source: 'whatsapp_business_app',
      ai_paused: true,
    },
  });
}

async function processCoexistenceEvent(eventId: string) {
  const admin = createAdminClient();
  const event = await claimEvent(admin, eventId);
  if (!event) return { processed: false, reason: 'not_claimed' };

  try {
    const change = event.raw.change;
    const field = String(change?.field ?? '');
    const value = change?.value ?? {};
    const phoneNumberId = String(
      event.phone_number_id
      ?? value.metadata?.phone_number_id
      ?? '',
    ).trim();

    if (!phoneNumberId) {
      await finishEvent(admin, event.id, `Evento ${field || 'desconhecido'} sem metadata.phone_number_id.`);
      return { processed: true, reason: 'missing_phone_number_id' };
    }

    const channel = await findChannelByPhoneNumberId(admin, phoneNumberId);
    if (!channel) {
      await finishEvent(admin, event.id, `Phone Number ID não cadastrado: ${phoneNumberId}`);
      return { processed: true, reason: 'unknown_channel' };
    }
    await associateEvent(admin, event, channel, phoneNumberId);

    if (field === 'smb_message_echoes') {
      const fallbackContact = String(value.contacts?.[0]?.wa_id ?? '');
      const contactName = String(value.contacts?.[0]?.profile?.name ?? '').trim();
      for (const echo of value.message_echoes ?? []) {
        await processEcho({
          admin,
          channel,
          echo,
          fallbackContact,
          contactName,
        });
      }
    }

    // history e smb_app_state_sync permanecem preservados no log bruto.
    // A importação do histórico anterior ao onboarding fica para uma etapa separada,
    // evitando misturar mensagens antigas com o pipeline comercial atual.
    await finishEvent(admin, event.id);
    return { processed: true, reason: field || 'coexistence_event' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no evento de coexistência.';
    await admin.from('whatsapp_webhook_events').update({
      processing_started_at: null,
      error: message.slice(0, 2000),
    }).eq('id', event.id);
    throw error;
  }
}

const COEXISTENCE_FIELDS = ['smb_message_echoes', 'history', 'smb_app_state_sync'];

export async function dispatchWebhookEvent(eventId: string, knownField?: string) {
  let field = knownField ?? '';

  // O recuperador de eventos pendentes não conhece o `field`; nesse caso vale a
  // leitura extra. O webhook ao vivo já informa e pula direto para o processador.
  if (knownField === undefined) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('whatsapp_webhook_events')
      .select('raw')
      .eq('id', eventId)
      .maybeSingle();
    if (error) throw error;
    const raw = data?.raw as StoredEvent['raw'] | undefined;
    field = String(raw?.change?.field ?? '');
  }

  if (COEXISTENCE_FIELDS.includes(field)) {
    return processCoexistenceEvent(eventId);
  }
  return processWebhookEvent(eventId);
}

export async function processPendingWebhookEvents(limit = 5) {
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
      const result = await dispatchWebhookEvent(event.id);
      if (result.processed) processed++;
    } catch (processError) {
      failed++;
      console.error('[whatsapp event dispatcher]', event.id, processError);
    }
  }
  return { selected: data?.length ?? 0, processed, failed };
}