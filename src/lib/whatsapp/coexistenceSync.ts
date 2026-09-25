import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from '@/lib/types';
import { chooseLeadIdentity, leadNameLooksGeneric, normalizeLeadIdentity, splitLeadFullName } from '@/lib/lead-identity';
import type { WhatsAppChannelRecord } from '@/lib/whatsapp/channelService';
import { channelAccess } from '@/lib/whatsapp/channelService';
import { metaTimestamp, normalizeWaId, phoneMatchVariants } from '@/lib/whatsapp/utils';
import { windowExpiresFromInbound } from '@/lib/whatsapp/window';

type AdminClient = SupabaseClient;

type HistoryMessage = {
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
  history_context?: { status?: string };
  [key: string]: unknown;
};

type HistoryThread = {
  id?: string;
  messages?: HistoryMessage[];
};

type HistoryChunk = {
  metadata?: { phase?: number; chunk_order?: number; progress?: number | string };
  threads?: HistoryThread[];
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
};

type StateSyncItem = {
  type?: string;
  contact?: { full_name?: string; first_name?: string; phone_number?: string };
  action?: string;
  metadata?: { timestamp?: string | number };
};

function bodyOf(message: HistoryMessage) {
  if (message.type === 'text') return String(message.text?.body ?? '');
  if (message.type === 'button') return String(message.button?.text ?? '');
  if (message.type === 'interactive') {
    return String(message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? 'Resposta interativa');
  }
  if (message.type === 'image') return String(message.image?.caption ?? '[Imagem]');
  if (message.type === 'video') return String(message.video?.caption ?? '[Vídeo]');
  if (message.type === 'document') return String(message.document?.caption ?? `[Documento${message.document?.filename ? `: ${message.document.filename}` : ''}]`);
  if (message.type === 'audio') return '[Áudio]';
  if (message.type === 'sticker') return '[Figurinha]';
  if (message.type === 'location') return '[Localização]';
  if (message.type === 'contacts') return '[Contato compartilhado]';
  if (message.type === 'media_placeholder') return '[Mídia histórica]';
  if (message.type === 'reaction') return '[Reação]';
  return `[Mensagem ${message.type || 'desconhecida'}]`;
}

function maxIso(...values: Array<string | null | undefined>) {
  let best: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > bestTime) {
      best = new Date(time).toISOString();
      bestTime = time;
    }
  }
  return best;
}

function stageForHistoricalContact(lastActivityAt: string) {
  const ageDays = Math.max(0, (Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000);
  if (ageDays <= 30) return 'humano_ativo';
  if (ageDays <= 90) return 'nutricao_ativa';
  return 'futuro';
}

async function contactName(admin: AdminClient, channelId: string, waId: string) {
  const { data } = await admin
    .from('whatsapp_synced_contacts')
    .select('full_name,first_name')
    .eq('channel_id', channelId)
    .eq('wa_id', waId)
    .maybeSingle();
  return String(data?.first_name || data?.full_name || '').trim() || waId;
}

async function findOrCreateHistoricalLead(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  contactWaId: string;
  name: string;
  latestInbound: string | null;
  latestOutbound: string | null;
  latestActivity: string;
}) {
  const { data: matches, error: readError } = await args.admin
    .from('leads')
    .select('*')
    .eq('organization_id', args.channel.organization_id)
    .eq('kind', args.channel.role)
    .in('phone', phoneMatchVariants(args.contactWaId))
    .order('updated_at', { ascending: false })
    .limit(1);
  if (readError) throw readError;

  const existing = (matches?.[0] ?? null) as Lead | null;
  const now = new Date().toISOString();
  const identity = normalizeLeadIdentity(args.name, existing?.company);

  if (existing) {
    const updates: Record<string, unknown> = {
      last_inbound_at: maxIso(existing.last_inbound_at, args.latestInbound),
      last_outbound_at: maxIso(existing.last_outbound_at, args.latestOutbound),
      last_human_activity_at: maxIso(existing.last_human_activity_at, args.latestOutbound),
      updated_at: maxIso(existing.updated_at, args.latestActivity) ?? existing.updated_at,
      metadata: {
        ...(existing.metadata || {}),
        whatsapp_channel_id: args.channel.id,
        whatsapp_history_imported_at: now,
        whatsapp_history_last_message_at: args.latestActivity,
        whatsapp_canonical_wa_id: args.contactWaId,
      },
    };
    if (leadNameLooksGeneric(existing.name, args.contactWaId) && identity.displayName) {
      updates.name = identity.displayName;
      updates.first_name = identity.firstName;
      updates.last_name = identity.lastName;
    } else if (!existing.first_name) {
      const split = splitLeadFullName(existing.name);
      updates.first_name = split.firstName;
      updates.last_name = split.lastName;
    }
    if ((!existing.company || existing.company === 'Não informada') && identity.company) updates.company = identity.company;
    if (!existing.creci && identity.creci) updates.creci = identity.creci;
    const { data, error } = await args.admin.from('leads').update(updates).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return data as Lead;
  }

  const { data, error } = await args.admin.from('leads').insert({
    organization_id: args.channel.organization_id,
    kind: args.channel.role,
    name: identity.displayName || args.contactWaId,
    first_name: identity.firstName,
    last_name: identity.lastName,
    phone: args.contactWaId,
    stage: stageForHistoricalContact(args.latestActivity),
    source: 'WhatsApp Business · histórico',
    company: identity.company || (args.channel.role === 'corretor' ? 'Não informada' : null),
    creci: identity.creci,
    temperature: 0,
    ai_enabled: false,
    automation_paused: true,
    owner_mode: 'human',
    last_inbound_at: args.latestInbound,
    last_outbound_at: args.latestOutbound,
    last_human_activity_at: args.latestOutbound,
    metadata: {
      whatsapp_channel_id: args.channel.id,
      whatsapp_history_imported_at: now,
      whatsapp_history_last_message_at: args.latestActivity,
      whatsapp_canonical_wa_id: args.contactWaId,
      historical_pipeline_seed: true,
    },
    created_at: args.latestActivity,
    updated_at: args.latestActivity,
  }).select('*').single();
  if (error) throw error;
  return data as Lead;
}

async function ensureHistoricalConversation(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  contactWaId: string;
  leadId: string;
  latestInbound: string | null;
  latestActivity: string;
}) {
  const { data: existing, error: readError } = await args.admin
    .from('whatsapp_conversations')
    .select('*')
    .eq('channel_id', args.channel.id)
    .eq('contact_wa_id', args.contactWaId)
    .maybeSingle();
  if (readError) throw readError;

  const windowExpiresAt = args.latestInbound ? windowExpiresFromInbound(args.latestInbound) : null;
  if (existing) {
    const { data, error } = await args.admin.from('whatsapp_conversations').update({
      lead_id: args.leadId,
      last_inbound_at: maxIso(existing.last_inbound_at, args.latestInbound),
      window_expires_at: maxIso(existing.window_expires_at, windowExpiresAt),
      updated_at: maxIso(existing.updated_at, args.latestActivity) ?? existing.updated_at,
    }).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await args.admin.from('whatsapp_conversations').insert({
    organization_id: args.channel.organization_id,
    channel_id: args.channel.id,
    contact_wa_id: args.contactWaId,
    lead_id: args.leadId,
    last_inbound_at: args.latestInbound,
    window_expires_at: windowExpiresAt,
    created_at: args.latestActivity,
    updated_at: args.latestActivity,
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function upsertMessages(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  leadId: string;
  conversationId: string;
  contactWaId: string;
  messages: HistoryMessage[];
}) {
  const businessWaId = normalizeWaId(args.channel.display_phone_number || '');
  const transportRows: Array<Record<string, unknown>> = [];
  const crmRows: Array<Record<string, unknown>> = [];

  args.messages.forEach((message, index) => {
    const sentAt = metaTimestamp(message.timestamp);
    const from = normalizeWaId(String(message.from ?? ''));
    const direction = businessWaId && from === businessWaId ? 'out' : 'in';
    const wamid = String(message.id ?? '').trim() || `history:${args.channel.id}:${args.contactWaId}:${String(message.timestamp ?? '')}:${index}`;
    const body = bodyOf(message);
    const status = String(message.history_context?.status || (direction === 'out' ? 'sent' : 'received'));
    const payload = { source: 'whatsapp_business_app_history', history_message: message };

    transportRows.push({
      organization_id: args.channel.organization_id,
      channel_id: args.channel.id,
      conversation_id: args.conversationId,
      lead_id: args.leadId,
      wamid,
      direction,
      sender_kind: direction === 'in' ? 'lead' : 'humano',
      type: message.type || 'unknown',
      body,
      payload,
      status,
      category: null,
      sent_at: sentAt,
      created_at: sentAt,
    });

    crmRows.push({
      organization_id: args.channel.organization_id,
      lead_id: args.leadId,
      whatsapp_connection_id: args.channel.legacy_connection_id ?? null,
      whatsapp_channel_id: args.channel.id,
      whatsapp_conversation_id: args.conversationId,
      direction,
      sender_kind: direction === 'in' ? 'lead' : 'humano',
      body: direction === 'out' ? `📱 WhatsApp Business: ${body}` : body,
      status,
      whatsapp_message_id: wamid,
      raw_payload: payload,
      created_at: sentAt,
    });
  });

  for (let start = 0; start < transportRows.length; start += 200) {
    const transportBatch = transportRows.slice(start, start + 200);
    const crmBatch = crmRows.slice(start, start + 200);
    if (transportBatch.length) {
      const { error } = await args.admin.from('whatsapp_messages')
        .upsert(transportBatch, { onConflict: 'wamid', ignoreDuplicates: true });
      if (error) throw error;
    }
    if (crmBatch.length) {
      const { error } = await args.admin.from('messages')
        .upsert(crmBatch, { onConflict: 'whatsapp_message_id', ignoreDuplicates: true });
      if (error) throw error;
    }
  }
}

export async function importHistory(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  history: HistoryChunk[];
}) {
  let importedThreads = 0;
  let importedMessages = 0;
  let maxProgress = 0;
  let maxPhase: number | null = null;

  for (const chunk of args.history ?? []) {
    if (chunk.errors?.length) {
      const message = chunk.errors.map((item) => item.message || item.title || `Erro ${item.code ?? ''}`).join(' · ');
      await args.admin.from('whatsapp_channels').update({
        history_sync_error: message.slice(0, 2000),
        history_sync_completed_at: new Date().toISOString(),
      }).eq('id', args.channel.id);
      continue;
    }

    const progress = Number(chunk.metadata?.progress ?? 0);
    if (Number.isFinite(progress)) maxProgress = Math.max(maxProgress, Math.min(100, Math.max(0, progress)));
    if (Number.isFinite(Number(chunk.metadata?.phase))) maxPhase = Math.max(maxPhase ?? 0, Number(chunk.metadata?.phase));

    for (const thread of chunk.threads ?? []) {
      const contactWaId = normalizeWaId(String(thread.id ?? ''));
      if (!contactWaId || !(thread.messages?.length)) continue;

      const ordered = [...thread.messages].sort((a, b) => new Date(metaTimestamp(a.timestamp)).getTime() - new Date(metaTimestamp(b.timestamp)).getTime());
      const businessWaId = normalizeWaId(args.channel.display_phone_number || '');
      let latestInbound: string | null = null;
      let latestOutbound: string | null = null;
      let latestActivity: string | null = null;

      for (const message of ordered) {
        const sentAt = metaTimestamp(message.timestamp);
        latestActivity = maxIso(latestActivity, sentAt);
        const from = normalizeWaId(String(message.from ?? ''));
        if (businessWaId && from === businessWaId) latestOutbound = maxIso(latestOutbound, sentAt);
        else latestInbound = maxIso(latestInbound, sentAt);
      }
      if (!latestActivity) continue;

      const name = await contactName(args.admin, args.channel.id, contactWaId);
      const lead = await findOrCreateHistoricalLead({
        admin: args.admin,
        channel: args.channel,
        contactWaId,
        name,
        latestInbound,
        latestOutbound,
        latestActivity,
      });
      const conversation = await ensureHistoricalConversation({
        admin: args.admin,
        channel: args.channel,
        contactWaId,
        leadId: lead.id,
        latestInbound,
        latestActivity,
      });
      await upsertMessages({
        admin: args.admin,
        channel: args.channel,
        leadId: lead.id,
        conversationId: conversation.id,
        contactWaId,
        messages: ordered,
      });
      importedThreads++;
      importedMessages += ordered.length;
    }
  }

  const update: Record<string, unknown> = {
    history_sync_progress: maxProgress,
    history_sync_phase: maxPhase,
    history_sync_error: null,
  };
  if (maxProgress >= 100) update.history_sync_completed_at = new Date().toISOString();
  await args.admin.from('whatsapp_channels').update(update).eq('id', args.channel.id);
  return { importedThreads, importedMessages, progress: maxProgress, phase: maxPhase };
}

export async function importStateSync(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  stateSync: StateSyncItem[];
}) {
  const rows: Array<Record<string, unknown>> = [];
  const names = new Map<string, { firstName: string | null; fullName: string | null }>();

  for (const item of args.stateSync ?? []) {
    if (item.type && item.type !== 'contact') continue;
    const waId = normalizeWaId(String(item.contact?.phone_number ?? ''));
    if (!waId) continue;
    const fullName = String(item.contact?.full_name || '').trim() || null;
    const firstName = String(item.contact?.first_name || '').trim() || null;
    rows.push({
      organization_id: args.channel.organization_id,
      channel_id: args.channel.id,
      wa_id: waId,
      full_name: fullName,
      first_name: firstName,
      action: item.action || null,
      synced_at: item.metadata?.timestamp ? metaTimestamp(item.metadata.timestamp) : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (fullName || firstName) names.set(waId, { firstName, fullName });
  }

  if (rows.length) {
    const { error } = await args.admin.from('whatsapp_synced_contacts')
      .upsert(rows, { onConflict: 'channel_id,wa_id' });
    if (error) throw error;
  }

  // Se o histórico já criou o card antes do nome chegar, melhora o card do pipeline
  // sem sobrescrever nomes já curados/importados no CRM.
  for (const [waId, contact] of names) {
    const { data: leads } = await args.admin.from('leads')
      .select('id,name,first_name,last_name,company,creci')
      .eq('organization_id', args.channel.organization_id)
      .eq('kind', args.channel.role)
      .in('phone', phoneMatchVariants(waId))
      .limit(5);
    for (const lead of leads ?? []) {
      const identity = chooseLeadIdentity([contact.firstName, contact.fullName], lead.company);
      const patch: Record<string, unknown> = {};
      if (leadNameLooksGeneric(lead.name, waId) && identity.displayName) {
        patch.name = identity.displayName;
        patch.first_name = identity.firstName;
        patch.last_name = identity.lastName;
      } else if (!lead.first_name) {
        const split = splitLeadFullName(lead.name);
        patch.first_name = split.firstName;
        patch.last_name = split.lastName;
      }
      if ((!lead.company || lead.company === 'Não informada') && identity.company) patch.company = identity.company;
      if (!lead.creci && identity.creci) patch.creci = identity.creci;
      if (Object.keys(patch).length) await args.admin.from('leads').update(patch).eq('id', lead.id);
    }
  }

  await args.admin.from('whatsapp_channels').update({
    contacts_sync_completed_at: new Date().toISOString(),
    contacts_sync_error: null,
  }).eq('id', args.channel.id);
  return { contacts: rows.length };
}

export async function requestSmbAppDataSync(channel: WhatsAppChannelRecord, syncType: 'history' | 'smb_app_state_sync') {
  const version = process.env.META_GRAPH_VERSION?.trim();
  if (!version) throw new Error('META_GRAPH_VERSION não configurada.');
  const { accessToken, phoneNumberId } = channelAccess(channel);
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/smb_app_data`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({})) as {
    request_id?: string;
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok) {
    const suffix = payload.error?.code ? ` (Meta ${payload.error.code}${payload.error.error_subcode ? `/${payload.error.error_subcode}` : ''})` : '';
    throw new Error(`${payload.error?.message || `Falha HTTP ${response.status} ao solicitar sincronização`}${suffix}`);
  }
  return { requestId: payload.request_id ?? null };
}
