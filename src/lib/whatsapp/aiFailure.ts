import { createAdminClient } from '@/lib/supabase/admin';
import type { Lead } from '@/lib/types';
import type {
  WhatsAppChannelRecord,
  WhatsAppConversationRecord,
} from '@/lib/whatsapp/channelService';
import { isCustomerServiceWindowOpen, OUTSIDE_WINDOW_MESSAGE } from '@/lib/whatsapp/window';

type AdminClient = ReturnType<typeof createAdminClient>;

type FailureArgs = {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  error: unknown;
};

type PendingTask = {
  id: string;
};

async function findPendingTask(args: {
  admin: AdminClient;
  organizationId: string;
  dedupeKey: string;
  leadId?: string;
}) {
  let query = args.admin
    .from('lead_tasks')
    .select('id')
    .eq('organization_id', args.organizationId)
    .eq('dedupe_key', args.dedupeKey)
    .eq('status', 'pending')
    .limit(1);
  if (args.leadId) query = query.eq('lead_id', args.leadId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error('[ai failure task lookup]', error.message);
    return null;
  }
  return data as PendingTask | null;
}

async function upsertPendingTask(args: {
  admin: AdminClient;
  organizationId: string;
  leadId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  searchAcrossOrganization?: boolean;
}) {
  const existing = await findPendingTask({
    admin: args.admin,
    organizationId: args.organizationId,
    dedupeKey: args.dedupeKey,
    leadId: args.searchAcrossOrganization ? undefined : args.leadId,
  });
  const query = existing?.id
    ? args.admin.from('lead_tasks').update(args.payload).eq('id', existing.id)
    : args.admin.from('lead_tasks').insert({
        organization_id: args.organizationId,
        lead_id: args.leadId,
        dedupe_key: args.dedupeKey,
        ...args.payload,
      });
  const { error } = await query;
  if (error) console.error('[ai failure task]', error.message);
  return !existing;
}

async function lastSuccessfulAiResponseAt(
  admin: AdminClient,
  organizationId: string,
  channelId: string,
) {
  const { data, error } = await admin
    .from('messages')
    .select('created_at,raw_payload')
    .eq('organization_id', organizationId)
    .eq('whatsapp_channel_id', channelId)
    .eq('direction', 'out')
    .eq('sender_kind', 'ia')
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('[ai success lookup]', error.message);
    return null;
  }
  return (data ?? []).find((row) => {
    const payload = row.raw_payload && typeof row.raw_payload === 'object'
      ? row.raw_payload as Record<string, unknown>
      : null;
    return payload?.ai_fallback_message !== true;
  })?.created_at ?? null;
}

async function consecutiveFailureCount(args: {
  admin: AdminClient;
  organizationId: string;
  channelId: string;
}) {
  const lastSuccessAt = await lastSuccessfulAiResponseAt(
    args.admin,
    args.organizationId,
    args.channelId,
  );
  let query = args.admin
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', args.organizationId)
    .eq('type', 'falha_ia')
    .contains('metadata', { channel_id: args.channelId });
  if (lastSuccessAt) query = query.gt('created_at', lastSuccessAt);
  const { count, error } = await query;
  if (error) {
    console.error('[ai consecutive failures]', error.message);
    return 1;
  }
  return Math.max(1, count ?? 1);
}

export async function handleAiFailure(args: FailureArgs) {
  const technicalMessage = args.error instanceof Error
    ? args.error.message
    : 'Falha desconhecida na IA.';
  const windowOpen = isCustomerServiceWindowOpen(args.conversation.window_expires_at);
  const now = new Date().toISOString();

  const { error: activityError } = await args.admin.from('activities').insert({
    organization_id: args.channel.organization_id,
    lead_id: args.lead.id,
    type: 'falha_ia',
    title: 'IA precisa de atendimento humano',
    description: `Erro técnico interno: ${technicalMessage}`,
    metadata: {
      channel_id: args.channel.id,
      channel_label: args.channel.label,
      conversation_id: args.conversation.id,
      customer_notified: false,
      requires_human: true,
      window_open: windowOpen,
    },
  });
  if (activityError) console.error('[ai failure activity]', activityError.message);

  const failureCount = await consecutiveFailureCount({
    admin: args.admin,
    organizationId: args.channel.organization_id,
    channelId: args.channel.id,
  });

  const { error: leadError } = await args.admin.from('leads').update({
    ai_enabled: false,
    automation_paused: true,
    owner_mode: 'human',
    stage: 'passagem_pendente',
    next_action: windowOpen
      ? 'O time comercial deve assumir; a IA está indisponível.'
      : `${OUTSIDE_WINDOW_MESSAGE} O time comercial deve assumir.`,
    next_action_type: 'falha_ia',
    next_action_due_at: now,
    metadata: {
      ...(args.lead.metadata || {}),
      ai_attention_required: true,
      ai_last_error_at: now,
      ai_failure_consecutive_count: failureCount,
      ai_failure_channel_id: args.channel.id,
    },
  }).eq('id', args.lead.id).eq('organization_id', args.channel.organization_id);
  if (leadError) console.error('[ai failure lead]', leadError.message);

  await upsertPendingTask({
    admin: args.admin,
    organizationId: args.channel.organization_id,
    leadId: args.lead.id,
    dedupeKey: 'system:ai-failure',
    payload: {
      assigned_mode: 'manager',
      type: 'falha_ia',
      title: 'Assumir atendimento após falha da IA',
      description: technicalMessage,
      priority: 'urgent',
      status: 'pending',
      due_at: now,
      created_by_kind: 'system',
      metadata: {
        channel_id: args.channel.id,
        channel_label: args.channel.label,
        customer_notified: false,
        consecutive_failures: failureCount,
        window_open: windowOpen,
      },
    },
  });

  if (failureCount >= 2) {
    const channelDedupeKey = `system:ai-channel-failure:${args.channel.id}`;
    const created = await upsertPendingTask({
      admin: args.admin,
      organizationId: args.channel.organization_id,
      leadId: args.lead.id,
      dedupeKey: channelDedupeKey,
      searchAcrossOrganization: true,
      payload: {
        assigned_mode: 'manager',
        type: 'falha_ia_canal',
        title: `Falhas consecutivas da IA no canal ${args.channel.label}`,
        description: `${failureCount} falhas consecutivas desde a última resposta bem-sucedida. Último erro: ${technicalMessage}`,
        priority: 'urgent',
        status: 'pending',
        due_at: now,
        created_by_kind: 'system',
        metadata: {
          channel_id: args.channel.id,
          channel_label: args.channel.label,
          consecutive_failures: failureCount,
          last_error: technicalMessage,
        },
      },
    });

    if (created) {
      const { error } = await args.admin.from('activities').insert({
        organization_id: args.channel.organization_id,
        lead_id: args.lead.id,
        type: 'falhas_consecutivas_ia',
        title: `Falhas consecutivas da IA no canal ${args.channel.label}`,
        description: `${failureCount} falhas consecutivas foram detectadas. O gestor deve verificar a configuração da IA.`,
        metadata: {
          channel_id: args.channel.id,
          channel_label: args.channel.label,
          consecutive_failures: failureCount,
          requires_manager: true,
        },
      });
      if (error) console.error('[ai channel failure activity]', error.message);
    }
  }
}

export async function resolveAiChannelFailure(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  lead: Lead;
  succeededAt: string;
}) {
  const dedupeKey = `system:ai-channel-failure:${args.channel.id}`;
  const existing = await findPendingTask({
    admin: args.admin,
    organizationId: args.channel.organization_id,
    dedupeKey,
  });
  if (!existing) return;

  const { error: taskError } = await args.admin.from('lead_tasks').update({
    status: 'completed',
    completed_at: args.succeededAt,
    metadata: {
      channel_id: args.channel.id,
      channel_label: args.channel.label,
      recovered_at: args.succeededAt,
    },
  }).eq('id', existing.id);
  if (taskError) {
    console.error('[ai channel recovery task]', taskError.message);
    return;
  }

  const { error: activityError } = await args.admin.from('activities').insert({
    organization_id: args.channel.organization_id,
    lead_id: args.lead.id,
    type: 'ia_canal_recuperada',
    title: `IA voltou a responder no canal ${args.channel.label}`,
    description: 'A tarefa de falhas consecutivas foi concluída automaticamente após uma resposta bem-sucedida.',
    metadata: {
      channel_id: args.channel.id,
      channel_label: args.channel.label,
      recovered_at: args.succeededAt,
    },
  });
  if (activityError) console.error('[ai channel recovery activity]', activityError.message);
}
