import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiFileOption } from '@/lib/ai';
import { loadAiContext } from '@/lib/ai-context';
import { optOutSignal } from '@/lib/hybrid';
import { isBrokerRoutingSignal, normalizeNaraRoutingText } from '@/lib/nara-contact-routing';
import { selectAllEnterpriseFacadeIds } from '@/lib/nara-supervisor-guidance';
import type { Lead } from '@/lib/types';
import type { WhatsAppMediaType, WhatsAppMessageCategory } from '@/lib/whatsapp/channelProvider';
import {
  channelAccess,
  ensureConversation,
  type WhatsAppChannelRecord,
  type WhatsAppConversationRecord,
} from '@/lib/whatsapp/channelService';
import { isCustomerServiceWindowOpen } from '@/lib/whatsapp/window';
import { normalizeWaId } from '@/lib/whatsapp/utils';

type AdminClient = SupabaseClient;

const WELCOME_TEMPLATE = 'boas_vindas_mact74';
const WELCOME_LANGUAGE = 'pt_BR';
const PORTFOLIO_INSTRUCTION = 'mande a fachada de cada empreendimento Soul, Flow e Alma';

const PORTFOLIO_CAPTIONS = [
  'Soul — empreendimento entregue em Itapema, uma opção pronta da Bossa.',
  'Flow Aptos — apartamentos de 2 suítes e opções duplex, em Porto Belo, com entrega prevista para 2027.',
  'Alma Seahouses — apartamentos de 3 suítes em Perequê, Porto Belo, com entrega prevista para 2030.',
];

const PORTFOLIO_FOLLOWUP = 'Esses são os três produtos da Bossa hoje. Quer tabela, plantas, condições comerciais ou mais material de algum deles?';

function metadataOf(lead: Lead) {
  return (lead.metadata && typeof lead.metadata === 'object' ? lead.metadata : {}) as Record<string, unknown>;
}

function displayName(lead: Lead) {
  const name = String(lead.name || '').trim();
  const generic = /^(?:corretor|corretora|cliente|contato|lead)$/i.test(name);
  if (generic && lead.enterprise) return String(lead.enterprise).trim();
  return name || 'parceiro';
}

function extractCreci(text: string) {
  const match = text.match(/\bcreci\s*[-:]?\s*([0-9]{3,8}\s*[A-Za-z]?)\b/i);
  return match?.[1]?.replace(/\s+/g, '').toUpperCase() ?? '';
}

function extractCompany(text: string) {
  const match = text.match(/\b(?:da|do|de)\s+([\p{L}0-9&.' -]{2,60}(?:im[oó]veis|imobili[aá]ria))\b/iu);
  return match?.[1]?.trim() ?? '';
}

export function clientBroadcastBrokerSignal(text: string): boolean {
  return isBrokerRoutingSignal(text);
}

export function brokerIdentityEvidence(text: string) {
  return {
    signal: clientBroadcastBrokerSignal(text),
    creci: extractCreci(text),
    company: extractCompany(text),
    normalized: normalizeNaraRoutingText(text),
  };
}

async function plantaoChannel(admin: AdminClient, organizationId: string) {
  const { data, error } = await admin
    .from('whatsapp_channels')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('role', 'corretor')
    .eq('status', 'connected')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const channels = (data ?? []) as WhatsAppChannelRecord[];
  return channels.find((item) => item.routing_mode === 'mixed_plantao')
    ?? channels[0]
    ?? null;
}

async function recordOutbound(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  body: string;
  type: string;
  category: WhatsAppMessageCategory;
  wamid: string | null;
  providerPayload: Record<string, unknown>;
  crmPayload?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const crmPayload = args.crmPayload ?? {};
  const transport = {
    organization_id: args.channel.organization_id,
    channel_id: args.channel.id,
    conversation_id: args.conversation.id,
    lead_id: args.lead.id,
    wamid: args.wamid,
    direction: 'out',
    sender_kind: 'ia',
    type: args.type,
    body: args.body,
    payload: { provider: args.providerPayload, crm: crmPayload },
    status: 'sent',
    category: args.category,
    sent_at: now,
  };

  if (args.wamid) {
    const { error } = await args.admin.from('whatsapp_messages')
      .upsert(transport, { onConflict: 'wamid', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await args.admin.from('whatsapp_messages').insert(transport);
    if (error) throw error;
  }

  const { error: legacyError } = await args.admin.from('messages').insert({
    organization_id: args.channel.organization_id,
    lead_id: args.lead.id,
    whatsapp_connection_id: args.channel.legacy_connection_id ?? null,
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: args.conversation.id,
    direction: 'out',
    sender_kind: 'ia',
    sender_user_id: null,
    body: args.body,
    status: 'sent',
    whatsapp_message_id: args.wamid,
    raw_payload: crmPayload,
    created_at: now,
  });
  if (legacyError) throw legacyError;

  await args.admin.from('leads').update({
    last_outbound_at: now,
    last_ai_activity_at: now,
    updated_at: now,
  }).eq('id', args.lead.id);
}

function whatsappMediaType(file: AiFileOption): WhatsAppMediaType {
  const mime = String(file.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

async function sendPortfolio(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
}) {
  const context = await loadAiContext(args.admin, args.lead.organization_id, 'corretor');
  const files = context.files ?? [];
  const ids = selectAllEnterpriseFacadeIds(PORTFOLIO_INSTRUCTION, files);
  const { provider, accessToken, phoneNumberId } = channelAccess(args.channel);
  const destination = normalizeWaId(args.lead.phone ?? args.conversation.contact_wa_id ?? '');
  if (!destination) throw new Error('Telefone do corretor inválido.');

  const sentIds: string[] = [];
  for (let index = 0; index < ids.length; index++) {
    const file = files.find((item) => item.id === ids[index]);
    if (!file) continue;
    const { data: signed, error: signedError } = await args.admin.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, 3600);
    if (signedError || !signed?.signedUrl) throw signedError ?? new Error('Falha ao preparar fachada.');

    const type = whatsappMediaType(file);
    const result = await provider.sendMedia({
      phoneNumberId,
      accessToken,
      to: destination,
      type,
      link: signed.signedUrl,
      caption: PORTFOLIO_CAPTIONS[index] ?? file.title,
      filename: type === 'document' ? file.original_name : undefined,
    });
    sentIds.push(file.id);
    await recordOutbound({
      admin: args.admin,
      channel: args.channel,
      conversation: args.conversation,
      lead: args.lead,
      body: '📎 ' + file.title + ' — ' + (PORTFOLIO_CAPTIONS[index] ?? ''),
      type,
      category: 'service',
      wamid: result.messageId,
      providerPayload: result.raw,
      crmPayload: {
        broker_transfer_intro: true,
        ai_file_id: file.id,
        enterprise_index: index,
        sent_as: type,
      },
    });
  }

  const result = await provider.sendText({
    phoneNumberId,
    accessToken,
    to: destination,
    body: PORTFOLIO_FOLLOWUP,
  });
  await recordOutbound({
    admin: args.admin,
    channel: args.channel,
    conversation: args.conversation,
    lead: args.lead,
    body: PORTFOLIO_FOLLOWUP,
    type: 'text',
    category: 'service',
    wamid: result.messageId,
    providerPayload: result.raw,
    crmPayload: {
      broker_transfer_intro: true,
      portfolio_facade_ids: sentIds,
    },
  });

  return sentIds;
}

async function ensureHumanTask(admin: AdminClient, lead: Lead, sourceMessageId: string | null) {
  const dedupeKey = 'cliente-corretor:' + lead.id;
  const { data: existing } = await admin.from('lead_tasks')
    .select('id')
    .eq('lead_id', lead.id)
    .eq('status', 'pending')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();
  if (existing?.id) return;

  await admin.from('lead_tasks').insert({
    organization_id: lead.organization_id,
    lead_id: lead.id,
    assigned_to: lead.owner_id ?? null,
    assigned_mode: 'human',
    type: 'corretor_transferido_clientes',
    title: 'Corretor transferido do canal de Clientes',
    description: 'O contato se identificou como corretor após uma transmissão. O Plantão iniciou a apresentação e o atendimento agora fica para o time comercial.',
    priority: 'high',
    status: 'pending',
    due_at: new Date().toISOString(),
    created_by_kind: 'system',
    dedupe_key: dedupeKey,
    metadata: {
      source: 'client_broker_transfer',
      source_message_id: sourceMessageId,
    },
  });
}

async function markHumanControl(args: {
  admin: AdminClient;
  lead: Lead;
  metadata: Record<string, unknown>;
  completed: boolean;
  sentFacadeIds?: string[];
}) {
  const now = new Date().toISOString();
  const { data, error } = await args.admin.from('leads').update({
    kind: 'corretor',
    stage: 'humano_ativo',
    owner_mode: 'human',
    ai_enabled: false,
    automation_paused: true,
    metadata: {
      ...args.metadata,
      client_broker_transfer_status: args.completed ? 'portfolio_sent_human' : 'awaiting_plantao_reply',
      client_broker_transfer_human_at: now,
      ...(args.completed ? {
        client_broker_portfolio_sent_at: now,
        client_broker_portfolio_facade_ids: args.sentFacadeIds ?? [],
      } : {}),
    },
    updated_at: now,
  }).eq('id', args.lead.id).select('*').single();
  if (error) throw error;
  return data as Lead;
}

async function sendWelcomeTemplate(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
}) {
  const destination = normalizeWaId(args.lead.phone ?? '');
  if (!destination) throw new Error('Telefone do corretor inválido.');
  const { provider, accessToken, phoneNumberId } = channelAccess(args.channel);
  const name = displayName(args.lead);
  const result = await provider.sendTemplate({
    phoneNumberId,
    accessToken,
    to: destination,
    name: WELCOME_TEMPLATE,
    language: WELCOME_LANGUAGE,
    bodyParameters: [name],
  });
  const body = 'Olá, ' + name + '. Aqui é a equipe da Bossa Empreendimentos. Estamos organizando este canal para compartilhar tabelas, materiais e atualizações dos empreendimentos com corretores parceiros. Se deseja receber essas informações, responda por aqui.';
  await recordOutbound({
    admin: args.admin,
    channel: args.channel,
    conversation: args.conversation,
    lead: args.lead,
    body,
    type: 'template',
    category: 'marketing',
    wamid: result.messageId,
    providerPayload: result.raw,
    crmPayload: {
      broker_transfer_intro_template: true,
      template_name: WELCOME_TEMPLATE,
      template_language: WELCOME_LANGUAGE,
    },
  });
  return result.messageId;
}

export async function routeClientBrokerFromBroadcast(args: {
  admin: AdminClient;
  lead: Lead;
  sourceMessageId: string | null;
  sourceText: string;
  broadcastId?: string | null;
  force?: boolean;
}) {
  const evidence = brokerIdentityEvidence(args.sourceText);
  if (!args.force && (!evidence.signal || args.lead.kind !== 'cliente')) {
    return { handled: false, reason: 'not_broker_signal' };
  }
  if (args.lead.opt_out) return { handled: true, reason: 'opt_out' };

  const metadata = metadataOf(args.lead);
  if (String(metadata.client_broker_transfer_status || '') === 'portfolio_sent_human') {
    return { handled: true, reason: 'already_completed' };
  }

  const now = new Date().toISOString();
  const channel = await plantaoChannel(args.admin, args.lead.organization_id);
  if (!channel) throw new Error('Canal do Plantão não está conectado.');

  const destination = normalizeWaId(args.lead.phone ?? '');
  if (!destination) throw new Error('Telefone do corretor inválido.');
  const conversation = await ensureConversation({
    admin: args.admin,
    channel,
    contactWaId: destination,
    leadId: args.lead.id,
  });

  const nextMetadata = {
    ...metadata,
    client_broker_transfer_detected_at: now,
    client_broker_transfer_source_message_id: args.sourceMessageId,
    client_broker_transfer_source_text: args.sourceText.slice(0, 500),
    client_broker_transfer_broadcast_id: args.broadcastId ?? null,
    client_broker_transfer_from_kind: args.lead.kind,
    client_broker_transfer_to_kind: 'corretor',
    client_broker_transfer_plantao_channel_id: channel.id,
    client_broker_transfer_plantao_phone: channel.display_phone_number,
  };

  const { data: promoted, error: promoteError } = await args.admin.from('leads').update({
    kind: 'corretor',
    stage: 'humano_ativo',
    company: evidence.company || args.lead.company || null,
    creci: evidence.creci || args.lead.creci || null,
    owner_mode: 'human',
    ai_enabled: false,
    automation_paused: true,
    metadata: nextMetadata,
    updated_at: now,
  }).eq('id', args.lead.id).select('*').single();
  if (promoteError) throw promoteError;
  const lead = promoted as Lead;

  await Promise.all([
    args.admin.from('nara_followup_sequences').update({ status: 'cancelled', updated_at: now })
      .eq('lead_id', lead.id).eq('status', 'active'),
    args.admin.from('nara_deferred_replies').update({ status: 'cancelled', updated_at: now })
      .eq('lead_id', lead.id).in('status', ['pending', 'processing']),
    args.admin.from('activities').insert({
      organization_id: lead.organization_id,
      lead_id: lead.id,
      type: 'cliente_identificado_corretor',
      title: 'Lead transferido de Clientes para Corretores',
      description: evidence.creci
        ? 'O contato informou CRECI ' + evidence.creci + ' e foi transferido para o Plantão.'
        : 'O próprio contato se identificou como corretor e foi transferido para o Plantão.',
      metadata: {
        source_message_id: args.sourceMessageId,
        source_text: args.sourceText.slice(0, 500),
        broadcast_id: args.broadcastId ?? null,
        creci: evidence.creci || null,
        company: evidence.company || null,
        plantao_channel_id: channel.id,
      },
    }),
  ]);

  await ensureHumanTask(args.admin, lead, args.sourceMessageId);

  if (isCustomerServiceWindowOpen(conversation.window_expires_at)) {
    const sentIds = await sendPortfolio({
      admin: args.admin,
      channel,
      conversation,
      lead,
    });
    await markHumanControl({
      admin: args.admin,
      lead,
      metadata: nextMetadata,
      completed: true,
      sentFacadeIds: sentIds,
    });
    return { handled: true, reason: 'portfolio_sent', channelId: channel.id, sentFacadeIds: sentIds };
  }

  const templateId = await sendWelcomeTemplate({
    admin: args.admin,
    channel,
    conversation,
    lead,
  });
  await markHumanControl({
    admin: args.admin,
    lead,
    metadata: {
      ...nextMetadata,
      client_broker_transfer_template_sent_at: new Date().toISOString(),
      client_broker_transfer_template_wamid: templateId,
    },
    completed: false,
  });
  return { handled: true, reason: 'template_sent_waiting_reply', channelId: channel.id };
}

export async function completePendingBrokerPortfolio(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  sourceMessageId: string;
}) {
  const metadata = metadataOf(args.lead);
  if (args.channel.role !== 'corretor') return { handled: false };
  if (String(metadata.client_broker_transfer_status || '') !== 'awaiting_plantao_reply') {
    return { handled: false };
  }

  const { data: source } = await args.admin.from('messages')
    .select('body')
    .eq('id', args.sourceMessageId)
    .maybeSingle();
  const text = String(source?.body || '');
  if (optOutSignal(text)) {
    const now = new Date().toISOString();
    await args.admin.from('leads').update({
      opt_out: true,
      ai_enabled: false,
      automation_paused: true,
      owner_mode: 'none',
      metadata: {
        ...metadata,
        client_broker_transfer_status: 'opt_out',
        client_broker_transfer_opt_out_at: now,
      },
      updated_at: now,
    }).eq('id', args.lead.id);
    return { handled: true, reason: 'opt_out' };
  }

  const sentIds = await sendPortfolio({
    admin: args.admin,
    channel: args.channel,
    conversation: args.conversation,
    lead: args.lead,
  });
  await markHumanControl({
    admin: args.admin,
    lead: args.lead,
    metadata,
    completed: true,
    sentFacadeIds: sentIds,
  });
  await args.admin.from('activities').insert({
    organization_id: args.lead.organization_id,
    lead_id: args.lead.id,
    type: 'plantao_apresentacao_corretor',
    title: 'Plantão apresentou Soul, Flow e Alma',
    description: 'O corretor recebeu as fachadas e uma apresentação inicial dos três empreendimentos. O atendimento ficou em controle humano.',
    metadata: {
      source_message_id: args.sourceMessageId,
      facade_ids: sentIds,
      channel_id: args.channel.id,
    },
  });
  return { handled: true, reason: 'portfolio_sent_human', sentFacadeIds: sentIds };
}
