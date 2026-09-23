import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requestSmbAppDataSync } from '@/lib/whatsapp/coexistenceSync';
import { ensureCoexistenceWebhookFields } from '@/lib/whatsapp/metaAppWebhook';
import type { WhatsAppChannelRecord } from '@/lib/whatsapp/channelService';

export const runtime = 'nodejs';

const MESSAGE_PAGE_SIZE = 180;

type SyncChannel = WhatsAppChannelRecord & {
  connection_mode?: string | null;
  history_sync_requested_at?: string | null;
  history_sync_request_id?: string | null;
  history_sync_completed_at?: string | null;
  history_sync_progress?: number | null;
  history_sync_phase?: number | null;
  history_sync_error?: string | null;
  contacts_sync_requested_at?: string | null;
  contacts_sync_request_id?: string | null;
  contacts_sync_completed_at?: string | null;
  contacts_sync_error?: string | null;
  coexistence_webhooks_ensured_at?: string | null;
  coexistence_webhooks_error?: string | null;
};

type MediaSummary = {
  available: boolean;
  mimeType: string | null;
  filename: string | null;
  historicalPlaceholder: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function mediaSummary(typeValue: unknown, payloadValue: unknown): MediaSummary | null {
  const payload = asRecord(payloadValue);
  if (!payload) return null;

  const crm = asRecord(payload.crm);
  if (crm && String(crm.ai_file_id ?? '').trim()) {
    return {
      available: true,
      mimeType: typeof crm.mime_type === 'string' ? crm.mime_type : null,
      filename: typeof crm.original_name === 'string' ? crm.original_name : null,
      historicalPlaceholder: false,
    };
  }

  const envelope = asRecord(payload.message_echo) ?? asRecord(payload.history_message) ?? payload;
  const type = String(envelope.type ?? typeValue ?? '').toLowerCase();
  if (type === 'media_placeholder') {
    return { available: false, mimeType: null, filename: null, historicalPlaceholder: true };
  }
  if (!['image', 'audio', 'video', 'document', 'sticker'].includes(type)) return null;
  const media = asRecord(envelope[type]);
  if (!media) {
    return { available: false, mimeType: null, filename: null, historicalPlaceholder: false };
  }
  return {
    available: Boolean(String(media.id ?? '').trim()),
    mimeType: typeof media.mime_type === 'string' ? media.mime_type : null,
    filename: typeof media.filename === 'string' ? media.filename : null,
    historicalPlaceholder: false,
  };
}

function publicChannel(channel: SyncChannel, slotLabel?: string) {
  return {
    id: channel.id,
    label: channel.label,
    slotLabel: slotLabel ?? null,
    display_phone_number: channel.display_phone_number,
    verified_name: channel.verified_name,
    status: channel.status,
    connection_mode: channel.connection_mode ?? null,
  };
}

async function ensureCoexistenceWebhooks(admin: AdminClient, channel: SyncChannel) {
  if (channel.connection_mode !== 'coexistence') return;
  if (channel.coexistence_webhooks_ensured_at || channel.coexistence_webhooks_error) return;

  try {
    await ensureCoexistenceWebhookFields();
    await admin.from('whatsapp_channels').update({
      coexistence_webhooks_ensured_at: new Date().toISOString(),
      coexistence_webhooks_error: null,
    }).eq('id', channel.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao configurar os webhooks da Coexistência.';
    await admin.from('whatsapp_channels').update({
      coexistence_webhooks_error: message.slice(0, 2000),
    }).eq('id', channel.id);
  }
}

async function requestInitialSync(admin: AdminClient, channel: SyncChannel) {
  if (channel.connection_mode !== 'coexistence') return;

  await ensureCoexistenceWebhooks(admin, channel);

  const connectedAt = channel.registered_at ? new Date(channel.registered_at).getTime() : Date.now();
  const onboardingAgeHours = (Date.now() - connectedAt) / 3_600_000;
  if (onboardingAgeHours > 24 && !channel.history_sync_requested_at) {
    await admin.from('whatsapp_channels').update({
      history_sync_error: 'A janela de 24h para solicitar o histórico da Coexistência expirou. Reconecte o número para abrir uma nova janela de sincronização.',
    }).eq('id', channel.id);
    return;
  }

  const jobs: Array<Promise<void>> = [];

  if (!channel.contacts_sync_requested_at) {
    jobs.push((async () => {
      const now = new Date().toISOString();
      const { data: claimed, error: claimError } = await admin.from('whatsapp_channels')
        .update({ contacts_sync_requested_at: now, contacts_sync_error: null })
        .eq('id', channel.id)
        .is('contacts_sync_requested_at', null)
        .select('id')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return;
      try {
        const result = await requestSmbAppDataSync(channel, 'smb_app_state_sync');
        await admin.from('whatsapp_channels').update({
          contacts_sync_request_id: result.requestId,
          contacts_sync_error: null,
        }).eq('id', channel.id);
      } catch (error) {
        await admin.from('whatsapp_channels').update({
          contacts_sync_error: (error instanceof Error ? error.message : 'Falha ao solicitar contatos.').slice(0, 2000),
        }).eq('id', channel.id);
      }
    })());
  }

  if (!channel.history_sync_requested_at) {
    jobs.push((async () => {
      const now = new Date().toISOString();
      const { data: claimed, error: claimError } = await admin.from('whatsapp_channels')
        .update({ history_sync_requested_at: now, history_sync_error: null, history_sync_progress: 0 })
        .eq('id', channel.id)
        .is('history_sync_requested_at', null)
        .select('id')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return;
      try {
        const result = await requestSmbAppDataSync(channel, 'history');
        await admin.from('whatsapp_channels').update({
          history_sync_request_id: result.requestId,
          history_sync_error: null,
        }).eq('id', channel.id);
      } catch (error) {
        await admin.from('whatsapp_channels').update({
          history_sync_error: (error instanceof Error ? error.message : 'Falha ao solicitar histórico.').slice(0, 2000),
        }).eq('id', channel.id);
      }
    })());
  }

  if (jobs.length) await Promise.allSettled(jobs);
}

async function loadMessages(args: {
  admin: AdminClient;
  organizationId: string;
  channelId: string;
  conversationId: string;
  before?: string | null;
}) {
  const { data: conversation, error: conversationError } = await args.admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', args.conversationId)
    .eq('organization_id', args.organizationId)
    .eq('channel_id', args.channelId)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) throw new Error('Conversa não encontrada.');

  let query = args.admin
    .from('whatsapp_messages')
    .select('id,conversation_id,direction,sender_kind,type,body,status,sent_at,created_at,payload')
    .eq('organization_id', args.organizationId)
    .eq('channel_id', args.channelId)
    .eq('conversation_id', args.conversationId);

  if (args.before) query = query.lt('created_at', args.before);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE + 1);
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > MESSAGE_PAGE_SIZE;
  const page = rows.slice(0, MESSAGE_PAGE_SIZE).reverse();
  const messages = page.map((message) => ({
    id: message.id,
    conversationId: message.conversation_id,
    direction: message.direction,
    senderKind: message.sender_kind,
    type: message.type,
    body: message.body,
    status: message.status,
    sentAt: message.sent_at,
    createdAt: message.created_at,
    media: mediaSummary(message.type, message.payload),
  }));

  return {
    messages,
    hasMore,
    oldestAt: messages[0]?.createdAt ?? null,
  };
}

async function loadLeads(admin: AdminClient, leadIds: string[]) {
  const rows: Array<Record<string, unknown>> = [];
  for (let start = 0; start < leadIds.length; start += 100) {
    const ids = leadIds.slice(start, start + 100);
    const { data, error } = await admin.from('leads')
      .select('id,name,phone,company,creci,stage,metadata,updated_at')
      .in('id', ids);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return new Map(rows.map((lead) => [String(lead.id), lead]));
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id,role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores podem acessar as conversas dos corretores.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const url = new URL(request.url);
    const view = url.searchParams.get('view') ?? 'conversations';
    const channelFilter = url.searchParams.get('channel')?.trim() || 'all';

    const { data: internalChannels, error: channelError } = await admin
      .from('whatsapp_channels')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .eq('role', 'corretor')
      .eq('status', 'connected')
      .order('created_at', { ascending: true });

    if (channelError) throw channelError;
    const channels = (internalChannels ?? []) as SyncChannel[];
    if (!channels.length) {
      return NextResponse.json({ channels: [], channel: null, conversations: [], selectedConversationId: null, messages: [] });
    }

    const publicChannels = channels.map((item, index) => publicChannel(item, `Canal ${index + 2}`));
    const channelById = new Map(channels.map((item) => [item.id, item]));
    const publicChannelById = new Map(publicChannels.map((item) => [item.id, item]));
    const selectedChannels = channelFilter === 'all'
      ? channels
      : channels.filter((item) => item.id === channelFilter);

    if (!selectedChannels.length) {
      return NextResponse.json({ error: 'Canal de corretores inválido.' }, { status: 400 });
    }

    // Trocar de conversa é o caminho crítico. Ele não deve reconsultar contatos,
    // histórico ou a lista de 800+ conversas: busca somente as últimas mensagens
    // daquela conversa por um índice dedicado.
    if (view === 'messages') {
      const conversationId = url.searchParams.get('conversationId')?.trim();
      if (!conversationId) {
        return NextResponse.json({ error: 'conversationId é obrigatório.' }, { status: 400 });
      }
      const { data: targetConversation, error: targetConversationError } = await admin
        .from('whatsapp_conversations')
        .select('id,channel_id')
        .eq('id', conversationId)
        .eq('organization_id', membership.organization_id)
        .maybeSingle();
      if (targetConversationError) throw targetConversationError;
      if (!targetConversation) {
        return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
      }
      const messageChannel = channelById.get(String(targetConversation.channel_id));
      if (!messageChannel) {
        return NextResponse.json({ error: 'O canal desta conversa não está conectado.' }, { status: 409 });
      }
      const result = await loadMessages({
        admin,
        organizationId: membership.organization_id,
        channelId: messageChannel.id,
        conversationId,
        before: url.searchParams.get('before'),
      });
      return NextResponse.json({
        channels: publicChannels,
        channel: publicChannelById.get(messageChannel.id) ?? publicChannel(messageChannel),
        selectedConversationId: conversationId,
        conversations: [],
        ...result,
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    // O sync inicial só precisa ser verificado no refresh da lista, nunca em cada
    // clique de conversa. Com múltiplos canais, cada um é verificado de forma independente.
    await Promise.allSettled(selectedChannels.map((item) => requestInitialSync(admin, item)));

    const { data: conversationRows, error: conversationsError } = await admin
      .from('whatsapp_conversations')
      .select('id,channel_id,contact_wa_id,lead_id,last_inbound_at,window_expires_at,created_at,updated_at,last_message_id,last_message_body,last_message_type,last_message_direction,last_message_status,last_message_at')
      .eq('organization_id', membership.organization_id)
      .in('channel_id', selectedChannels.map((item) => item.id))
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(5000);

    if (conversationsError) throw conversationsError;
    const rawConversations = conversationRows ?? [];
    if (!rawConversations.length) {
      return NextResponse.json({
        channels: publicChannels,
        channel: selectedChannels.length === 1 ? publicChannelById.get(selectedChannels[0].id) ?? publicChannel(selectedChannels[0]) : null,
        conversations: [],
        selectedConversationId: null,
        messages: [],
      });
    }

    const leadIds = [...new Set(rawConversations.map((row) => row.lead_id).filter(Boolean))] as string[];
    const leads = await loadLeads(admin, leadIds);

    const conversations = rawConversations.map((conversation) => {
      const lead = conversation.lead_id ? leads.get(String(conversation.lead_id)) : null;
      const leadName = lead && typeof lead.name === 'string' ? lead.name : null;
      const leadPhone = lead && typeof lead.phone === 'string' ? lead.phone : null;
      const leadCompany = lead && typeof lead.company === 'string' ? lead.company : null;
      const leadCreci = lead && typeof lead.creci === 'string' ? lead.creci : null;
      const leadStage = lead && typeof lead.stage === 'string' ? lead.stage : null;
      const lastAt = conversation.last_message_at ?? conversation.updated_at;
      const lastMessage = conversation.last_message_id ? {
        id: conversation.last_message_id,
        direction: conversation.last_message_direction ?? 'in',
        senderKind: '',
        type: conversation.last_message_type ?? 'text',
        body: conversation.last_message_body,
        status: conversation.last_message_status,
        sentAt: conversation.last_message_at,
        createdAt: lastAt,
      } : null;

      const conversationChannel = publicChannelById.get(String(conversation.channel_id));

      return {
        id: conversation.id,
        channelId: conversation.channel_id,
        channelLabel: conversationChannel?.label ?? 'WhatsApp Corretores',
        channelDisplayPhone: conversationChannel?.display_phone_number ?? null,
        channelSlotLabel: conversationChannel?.slotLabel ?? null,
        contactWaId: conversation.contact_wa_id,
        leadId: conversation.lead_id,
        name: leadName || conversation.contact_wa_id,
        phone: leadPhone || conversation.contact_wa_id,
        company: leadCompany,
        creci: leadCreci,
        stage: leadStage,
        lastInboundAt: conversation.last_inbound_at,
        windowExpiresAt: conversation.window_expires_at,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        lastMessage,
      };
    });

    return NextResponse.json({
      channels: publicChannels,
      channel: selectedChannels.length === 1 ? publicChannelById.get(selectedChannels[0].id) ?? publicChannel(selectedChannels[0]) : null,
      conversations,
      selectedConversationId: conversations[0]?.id ?? null,
      messages: [],
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[whatsapp corretores inbox]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Não foi possível carregar as conversas.',
    }, { status: 500 });
  }
}
