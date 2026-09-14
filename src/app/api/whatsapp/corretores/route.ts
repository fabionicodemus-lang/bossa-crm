import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requestSmbAppDataSync } from '@/lib/whatsapp/coexistenceSync';
import { ensureCoexistenceWebhookFields } from '@/lib/whatsapp/metaAppWebhook';
import type { WhatsAppChannelRecord } from '@/lib/whatsapp/channelService';

export const runtime = 'nodejs';

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

async function ensureCoexistenceWebhooks(admin: ReturnType<typeof createAdminClient>, channel: SyncChannel) {
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

async function requestInitialSync(admin: ReturnType<typeof createAdminClient>, channel: SyncChannel) {
  if (channel.connection_mode !== 'coexistence') return;

  // Os callbacks de history/contacts/echoes precisam estar habilitados no app
  // Meta antes de solicitar o backfill. Esse passo também corrige conexões já
  // feitas com uma configuração antiga do webhook.
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
    const { data: internalChannel, error: channelError } = await admin
      .from('whatsapp_channels')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .eq('role', 'corretor')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (channelError) throw channelError;
    if (!internalChannel) {
      return NextResponse.json({ channel: null, conversations: [], selectedConversationId: null, messages: [] });
    }

    await requestInitialSync(admin, internalChannel as SyncChannel);

    const { data: channel, error: refreshedChannelError } = await admin
      .from('whatsapp_channels')
      .select('id,label,display_phone_number,verified_name,status,connection_mode,history_sync_requested_at,history_sync_request_id,history_sync_completed_at,history_sync_progress,history_sync_phase,history_sync_error,contacts_sync_requested_at,contacts_sync_completed_at,contacts_sync_error,coexistence_webhooks_ensured_at,coexistence_webhooks_error')
      .eq('id', internalChannel.id)
      .single();
    if (refreshedChannelError) throw refreshedChannelError;

    const { data: conversationRows, error: conversationsError } = await admin
      .from('whatsapp_conversations')
      .select('id,contact_wa_id,lead_id,last_inbound_at,window_expires_at,created_at,updated_at')
      .eq('organization_id', membership.organization_id)
      .eq('channel_id', channel.id)
      .order('updated_at', { ascending: false })
      .limit(5000);

    if (conversationsError) throw conversationsError;
    const rawConversations = conversationRows ?? [];
    if (!rawConversations.length) {
      return NextResponse.json({ channel, conversations: [], selectedConversationId: null, messages: [] });
    }

    const leadIds = [...new Set(rawConversations.map((row) => row.lead_id).filter(Boolean))] as string[];
    const { data: leadRows, error: leadsError } = leadIds.length
      ? await admin.from('leads')
        .select('id,name,phone,company,creci,stage,metadata,updated_at')
        .in('id', leadIds)
      : { data: [], error: null };
    if (leadsError) throw leadsError;
    const leads = new Map((leadRows ?? []).map((lead) => [lead.id, lead]));

    const conversationIds = rawConversations.map((row) => row.id);
    const latestByConversation = new Map<string, Record<string, unknown>>();
    for (let start = 0; start < conversationIds.length; start += 400) {
      const ids = conversationIds.slice(start, start + 400);
      const { data: latestMessageRows, error: latestMessagesError } = await admin
        .from('whatsapp_messages')
        .select('id,conversation_id,direction,sender_kind,type,body,status,sent_at,created_at')
        .eq('organization_id', membership.organization_id)
        .eq('channel_id', channel.id)
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(Math.max(600, ids.length * 3));
      if (latestMessagesError) throw latestMessagesError;
      for (const message of latestMessageRows ?? []) {
        if (!latestByConversation.has(message.conversation_id)) {
          latestByConversation.set(message.conversation_id, message);
        }
      }
    }

    const conversations = rawConversations.map((conversation) => {
      const lead = conversation.lead_id ? leads.get(conversation.lead_id) : null;
      const lastMessage = latestByConversation.get(conversation.id) as {
        id: string;
        direction: string;
        sender_kind: string;
        type: string;
        body: string | null;
        status: string | null;
        sent_at: string | null;
        created_at: string;
      } | undefined;
      return {
        id: conversation.id,
        contactWaId: conversation.contact_wa_id,
        leadId: conversation.lead_id,
        name: lead?.name || conversation.contact_wa_id,
        phone: lead?.phone || conversation.contact_wa_id,
        company: lead?.company || null,
        creci: lead?.creci || null,
        stage: lead?.stage || null,
        lastInboundAt: conversation.last_inbound_at,
        windowExpiresAt: conversation.window_expires_at,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        lastMessage: lastMessage ? {
          id: lastMessage.id,
          direction: lastMessage.direction,
          senderKind: lastMessage.sender_kind,
          type: lastMessage.type,
          body: lastMessage.body,
          status: lastMessage.status,
          sentAt: lastMessage.sent_at,
          createdAt: lastMessage.created_at,
        } : null,
      };
    }).sort((a, b) => {
      const aTime = new Date(a.lastMessage?.createdAt || a.updatedAt).getTime();
      const bTime = new Date(b.lastMessage?.createdAt || b.updatedAt).getTime();
      return bTime - aTime;
    });

    const requested = new URL(request.url).searchParams.get('conversationId');
    const selectedConversationId = requested && conversations.some((item) => item.id === requested)
      ? requested
      : conversations[0]?.id ?? null;

    let messages: Array<Record<string, unknown>> = [];
    if (selectedConversationId) {
      const { data: selectedMessages, error: selectedMessagesError } = await admin
        .from('whatsapp_messages')
        .select('id,conversation_id,direction,sender_kind,type,body,status,sent_at,created_at')
        .eq('organization_id', membership.organization_id)
        .eq('channel_id', channel.id)
        .eq('conversation_id', selectedConversationId)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (selectedMessagesError) throw selectedMessagesError;
      messages = (selectedMessages ?? []).reverse().map((message) => ({
        id: message.id,
        conversationId: message.conversation_id,
        direction: message.direction,
        senderKind: message.sender_kind,
        type: message.type,
        body: message.body,
        status: message.status,
        sentAt: message.sent_at,
        createdAt: message.created_at,
      }));
    }

    return NextResponse.json({ channel, conversations, selectedConversationId, messages });
  } catch (error) {
    console.error('[whatsapp corretores inbox]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Não foi possível carregar as conversas.',
    }, { status: 500 });
  }
}
