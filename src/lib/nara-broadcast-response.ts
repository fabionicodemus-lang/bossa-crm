import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from '@/lib/types';
import { phoneMatchVariants } from '@/lib/whatsapp/utils';
export {
  broadcastResponseAction,
  clientNoReplyReason,
  shouldForceBroadcastReply,
} from '@/lib/nara-broadcast-rules';

const BROADCAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type RecentBroadcast = {
  id: string;
  leadId: string;
  broadcastId: string;
  broadcastName: string;
  body: string;
  createdAt: string;
};

export async function findRecentBroadcastForLead(args: {
  admin: SupabaseClient;
  organizationId: string;
  lead: Lead;
  sourceCreatedAt: string;
}): Promise<RecentBroadcast | null> {
  const variants = phoneMatchVariants(args.lead.phone);
  if (!variants.length) return null;

  const { data: peerLeads, error: peerError } = await args.admin
    .from('leads')
    .select('id')
    .eq('organization_id', args.organizationId)
    .eq('kind', 'cliente')
    .in('phone', variants)
    .limit(20);
  if (peerError) throw peerError;

  const leadIds = [...new Set([args.lead.id, ...(peerLeads ?? []).map((item) => String(item.id))])];
  const sourceTime = new Date(args.sourceCreatedAt).getTime();
  if (!Number.isFinite(sourceTime)) return null;
  const windowStart = new Date(sourceTime - BROADCAST_WINDOW_MS).toISOString();

  const { data: rows, error } = await args.admin
    .from('messages')
    .select('id,lead_id,body,created_at,raw_payload')
    .eq('organization_id', args.organizationId)
    .in('lead_id', leadIds)
    .eq('direction', 'out')
    .gte('created_at', windowStart)
    .lte('created_at', args.sourceCreatedAt)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const message = (rows ?? []).find((row) => {
    const raw = row.raw_payload && typeof row.raw_payload === 'object' && !Array.isArray(row.raw_payload)
      ? row.raw_payload as Record<string, unknown>
      : null;
    return Boolean(String(raw?.broadcast_id ?? '').trim());
  });
  if (!message) return null;

  const raw = message.raw_payload as Record<string, unknown>;
  const broadcastId = String(raw.broadcast_id ?? '').trim();
  if (!broadcastId) return null;

  const { data: broadcast } = await args.admin
    .from('broadcasts')
    .select('name')
    .eq('organization_id', args.organizationId)
    .eq('id', broadcastId)
    .maybeSingle();

  return {
    id: String(message.id),
    leadId: String(message.lead_id),
    broadcastId,
    broadcastName: String(broadcast?.name ?? '').trim() || broadcastId,
    body: String(message.body ?? ''),
    createdAt: String(message.created_at),
  };
}

export async function reactivateLeadFromBroadcast(args: {
  admin: SupabaseClient;
  organizationId: string;
  lead: Lead;
  broadcast: RecentBroadcast;
}): Promise<Lead> {
  const now = new Date().toISOString();
  const metadata = {
    ...(args.lead.metadata ?? {}),
    broadcast_reactivation: {
      broadcast_id: args.broadcast.broadcastId,
      broadcast_name: args.broadcast.broadcastName,
      reactivated_at: now,
    },
  };

  const { data, error } = await args.admin
    .from('leads')
    .update({
      stage: 'nutricao_ativa',
      owner_mode: 'ai',
      ai_enabled: true,
      automation_paused: false,
      reactivation_at: null,
      loss_reason: null,
      metadata,
      updated_at: now,
    })
    .eq('organization_id', args.organizationId)
    .eq('id', args.lead.id)
    .select('*')
    .single();
  if (error) throw error;

  await args.admin.from('activities').insert({
    organization_id: args.organizationId,
    lead_id: args.lead.id,
    type: 'lead_reativado_transmissao',
    title: `Lead reativado pela transmissão “${args.broadcast.broadcastName}”`,
    description: 'O contato respondeu a uma transmissão recente e voltou para atendimento da Nara.',
    metadata: {
      broadcast_id: args.broadcast.broadcastId,
      broadcast_message_id: args.broadcast.id,
    },
  });

  return data as Lead;
}

async function loadCommercialSettings(admin: SupabaseClient, organizationId: string) {
  const { data, error } = await admin
    .from('client_handoff_settings')
    .select('primary_owner_user_id,primary_owner_name,enabled')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw error;
  return data ?? null;
}

async function upsertUrgentTask(args: {
  admin: SupabaseClient;
  organizationId: string;
  lead: Lead;
  assignedTo: string | null;
  sourceMessageId: string;
  title: string;
  description: string;
  type: string;
  dedupePrefix: string;
  metadata?: Record<string, unknown>;
}) {
  const dueAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const dedupeKey = `${args.dedupePrefix}:${args.sourceMessageId}`;
  const task = {
    organization_id: args.organizationId,
    lead_id: args.lead.id,
    assigned_to: args.assignedTo,
    assigned_mode: 'human',
    type: args.type,
    title: args.title,
    description: args.description,
    priority: 'urgent',
    status: 'pending',
    due_at: dueAt,
    created_by_kind: 'system',
    dedupe_key: dedupeKey,
    metadata: {
      source_message_id: args.sourceMessageId,
      ...(args.metadata ?? {}),
    },
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await args.admin
    .from('lead_tasks')
    .select('id')
    .eq('lead_id', args.lead.id)
    .eq('dedupe_key', dedupeKey)
    .eq('status', 'pending')
    .maybeSingle();
  if (existingError) throw existingError;

  const { error } = existing?.id
    ? await args.admin.from('lead_tasks').update(task).eq('id', existing.id)
    : await args.admin.from('lead_tasks').insert(task);
  if (error) throw error;
}

export async function queueBroadcastAttention(args: {
  admin: SupabaseClient;
  organizationId: string;
  lead: Lead;
  broadcast: RecentBroadcast;
  sourceMessageId: string;
  inboundText: string;
  mode: 'closed_won' | 'human';
}) {
  const settings = await loadCommercialSettings(args.admin, args.organizationId);
  const responsibleId = args.mode === 'human'
    ? args.lead.owner_id ?? settings?.primary_owner_user_id ?? null
    : settings?.primary_owner_user_id ?? args.lead.owner_id ?? null;
  const responsibleName = args.mode === 'human' && args.lead.owner_id
    ? 'consultor atual'
    : String(settings?.primary_owner_name ?? 'comercial');
  const title = args.mode === 'closed_won'
    ? 'Cliente já comprador respondeu à transmissão'
    : 'Lead com consultor respondeu à transmissão';
  const description = `Transmissão “${args.broadcast.broadcastName}”. Resposta: ${args.inboundText || 'sem texto'}`;

  await upsertUrgentTask({
    admin: args.admin,
    organizationId: args.organizationId,
    lead: args.lead,
    assignedTo: responsibleId,
    sourceMessageId: args.sourceMessageId,
    title,
    description: `${description}. Responsável: ${responsibleName}.`,
    type: 'resposta_transmissao',
    dedupePrefix: 'broadcast-reply',
    metadata: {
      broadcast_id: args.broadcast.broadcastId,
      mode: args.mode,
    },
  });

  const dueAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const briefing = {
    lead_name: args.lead.name,
    phone: args.lead.phone,
    source: args.lead.source,
    enterprise: args.lead.enterprise,
    priority_class: 'A1',
    main_objection: description,
    next_best_action: args.mode === 'closed_won'
      ? 'Atender manualmente sem reabrir a venda pela Nara.'
      : 'O consultor atual deve responder o lead imediatamente.',
    responsible_name: responsibleName,
    source_message_id: args.sourceMessageId,
    broadcast_id: args.broadcast.broadcastId,
  };

  const { data: pendingRows, error: pendingError } = await args.admin
    .from('lead_handoffs')
    .select('id,briefing')
    .eq('lead_id', args.lead.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20);
  if (pendingError) throw pendingError;

  const existing = (pendingRows ?? []).find((row) => {
    const rowBriefing = row.briefing && typeof row.briefing === 'object' && !Array.isArray(row.briefing)
      ? row.briefing as Record<string, unknown>
      : {};
    return String(rowBriefing.source_message_id ?? '') === args.sourceMessageId;
  });

  const handoffPayload = {
    organization_id: args.organizationId,
    lead_id: args.lead.id,
    requested_by: 'system',
    offered_to: responsibleId,
    backup_to: args.lead.backup_owner_id ?? null,
    priority_class: 'A1',
    reason: description,
    briefing,
    status: 'pending',
    expires_at: dueAt,
    updated_at: new Date().toISOString(),
  };

  let handoffId: string;
  if (existing?.id) {
    const { data, error } = await args.admin
      .from('lead_handoffs')
      .update(handoffPayload)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw error;
    handoffId = String(data.id);
  } else {
    const { data, error } = await args.admin
      .from('lead_handoffs')
      .insert(handoffPayload)
      .select('id')
      .single();
    if (error) throw error;
    handoffId = String(data.id);
  }

  const { error: alertError } = await args.admin
    .from('client_handoff_alert_jobs')
    .upsert({
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      handoff_id: handoffId,
      briefing,
      recipient_kind: 'commercial',
      owner_status: 'queued',
      manager_status: 'queued',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'handoff_id' });
  if (alertError && alertError.code !== '42P01' && alertError.code !== 'PGRST205') throw alertError;

  await args.admin.from('activities').insert({
    organization_id: args.organizationId,
    lead_id: args.lead.id,
    type: args.mode === 'closed_won' ? 'resposta_transmissao_fechado_ganho' : 'resposta_transmissao_humano',
    title,
    description,
    metadata: {
      broadcast_id: args.broadcast.broadcastId,
      source_message_id: args.sourceMessageId,
      handoff_id: handoffId,
      owner_preserved: args.mode === 'human',
    },
  });
}

export async function recordClientNoReplySafetyNet(args: {
  admin: SupabaseClient;
  organizationId: string;
  lead: Lead;
  sourceMessageId: string;
  inboundText: string;
  reason: string;
}) {
  await args.admin.from('activities').insert({
    organization_id: args.organizationId,
    lead_id: args.lead.id,
    type: 'ia_nao_respondeu',
    title: `IA não respondeu: ${args.reason}`,
    description: args.inboundText || 'Mensagem recebida sem texto.',
    metadata: {
      source_message_id: args.sourceMessageId,
      stage: args.lead.stage,
      owner_mode: args.lead.owner_mode,
      ai_enabled: args.lead.ai_enabled,
      automation_paused: args.lead.automation_paused,
    },
  });

  if (args.lead.owner_id) return;

  const settings = await loadCommercialSettings(args.admin, args.organizationId);
  await upsertUrgentTask({
    admin: args.admin,
    organizationId: args.organizationId,
    lead: args.lead,
    assignedTo: settings?.primary_owner_user_id ?? null,
    sourceMessageId: args.sourceMessageId,
    title: 'Verificar mensagem sem resposta da Nara',
    description: `${args.reason}. Mensagem: ${args.inboundText || 'sem texto'}`,
    type: 'atendimento_sem_resposta_ia',
    dedupePrefix: 'nara-no-reply',
    metadata: { reason: args.reason },
  });
}
