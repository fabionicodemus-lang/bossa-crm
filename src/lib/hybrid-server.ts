import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiTurn } from './ai';
import { deriveHybridDecision, type HybridDecision } from './hybrid';
import type { Lead } from './types';

export type AdminClient = SupabaseClient;

function changed(value: unknown, previous: unknown): boolean {
  return JSON.stringify(value ?? null) !== JSON.stringify(previous ?? null);
}

export async function applyHybridDecision(args: {
  admin: AdminClient;
  organizationId: string;
  lead: Lead;
  turn: AiTurn;
  lastUserMessage: string;
  sourceMessageId?: string | null;
}): Promise<HybridDecision> {
  const decision = deriveHybridDecision({
    lead: args.lead,
    turn: args.turn,
    lastUserMessage: args.lastUserMessage,
  });
  const now = new Date().toISOString();
  const metadata = {
    ...(args.lead.metadata || {}),
    ai_extracted: {
      ...((args.lead.metadata?.ai_extracted && typeof args.lead.metadata.ai_extracted === 'object')
        ? args.lead.metadata.ai_extracted as Record<string, unknown>
        : {}),
      ...Object.fromEntries(Object.entries(args.turn.extracted).filter(([, value]) => value.trim() !== '')),
    },
    hybrid_last_decision: {
      priority_class: decision.priorityClass,
      stage: decision.stage,
      handoff_required: decision.handoffRequired,
      handoff_reason: decision.handoffReason,
      decided_at: now,
    },
  };

  const updatePayload: Record<string, unknown> = {
    stage: decision.stage,
    owner_mode: decision.ownerMode,
    ai_enabled: decision.aiEnabled,
    priority_class: decision.priorityClass,
    temperature: Math.max(0, Math.min(100, Math.round(args.turn.score))),
    ai_classification: args.turn.classification,
    ai_summary: args.turn.summary,
    ai_next_action: args.turn.next_action,
    ai_last_classified_at: now,
    next_action: decision.nextAction,
    next_action_type: decision.nextActionType,
    next_action_due_at: decision.nextActionDueAt,
    reactivation_at: decision.reactivationAt,
    last_ai_activity_at: now,
    metadata,
  };

  if (decision.handoffRequired && args.lead.owner_mode !== 'human') {
    updatePayload.handoff_requested_at = args.lead.handoff_requested_at || now;
  }
  if (decision.stage === 'encerrado' && /opt-out/i.test(decision.nextAction)) {
    updatePayload.opt_out = true;
  }

  const { error: updateError } = await args.admin
    .from('leads')
    .update(updatePayload)
    .eq('id', args.lead.id)
    .eq('organization_id', args.organizationId);
  if (updateError) throw updateError;

  const shouldLog = changed(decision.stage, args.lead.stage)
    || changed(decision.priorityClass, args.lead.priority_class)
    || changed(args.turn.classification, args.lead.ai_classification)
    || changed(decision.nextAction, args.lead.next_action);

  if (shouldLog) {
    await args.admin.from('activities').insert({
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      type: 'analise_hibrida_ia',
      title: decision.noteTitle,
      description: decision.noteDescription,
      metadata: {
        source_message_id: args.sourceMessageId ?? null,
        stage_before: args.lead.stage,
        stage_after: decision.stage,
        owner_mode: decision.ownerMode,
        priority_class: decision.priorityClass,
        classification: args.turn.classification,
        score: args.turn.score,
        handoff_required: decision.handoffRequired,
        next_action: decision.nextAction,
        next_action_due_at: decision.nextActionDueAt,
      },
    });
  }

  if (decision.taskTitle && decision.taskDedupeKey) {
    const task = {
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      assigned_to: decision.ownerMode === 'human' ? args.lead.owner_id : null,
      assigned_mode: decision.ownerMode === 'human' ? 'human' : 'ai',
      type: decision.nextActionType,
      title: decision.taskTitle,
      description: decision.taskDescription,
      priority: decision.taskPriority,
      status: 'pending',
      due_at: decision.taskDueAt,
      created_by_kind: 'ai',
      dedupe_key: decision.taskDedupeKey,
      metadata: {
        source_message_id: args.sourceMessageId ?? null,
        priority_class: decision.priorityClass,
        stage: decision.stage,
      },
    };
    const { data: existingTask } = await args.admin
      .from('lead_tasks')
      .select('id')
      .eq('lead_id', args.lead.id)
      .eq('dedupe_key', decision.taskDedupeKey)
      .eq('status', 'pending')
      .maybeSingle();
    const taskQuery = existingTask?.id
      ? args.admin.from('lead_tasks').update(task).eq('id', existingTask.id)
      : args.admin.from('lead_tasks').insert(task);
    const { error: taskError } = await taskQuery;
    if (taskError) console.error('[hybrid task]', taskError.message);
  }

  if (decision.handoffRequired && args.lead.owner_mode !== 'human') {
    const expiresAt = decision.nextActionDueAt;
    const handoff = {
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      requested_by: 'ai',
      offered_to: args.lead.owner_id,
      backup_to: args.lead.backup_owner_id,
      priority_class: decision.priorityClass,
      reason: decision.handoffReason,
      briefing: {
        lead_name: args.lead.name,
        phone: args.lead.phone,
        source: args.lead.source,
        enterprise: args.turn.extracted.enterprise || args.lead.enterprise,
        purpose: args.turn.extracted.purpose,
        typology: args.turn.extracted.typology,
        budget: args.turn.extracted.budget,
        deadline: args.turn.extracted.deadline,
        decision_maker: args.turn.extracted.decision_maker,
        main_objection: args.turn.summary,
        next_best_action: decision.nextAction,
      },
      status: 'pending',
      expires_at: expiresAt,
    };
    const { data: existing } = await args.admin
      .from('lead_handoffs')
      .select('id')
      .eq('lead_id', args.lead.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existing?.id) {
      await args.admin.from('lead_handoffs').update(handoff).eq('id', existing.id);
    } else {
      await args.admin.from('lead_handoffs').insert(handoff);
    }
  }

  return decision;
}
