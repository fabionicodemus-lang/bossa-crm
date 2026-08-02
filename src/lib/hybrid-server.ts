import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiTurn } from './ai';
import { deriveHybridDecision, type HybridDecision } from './hybrid';
import type { Lead } from './types';

export type AdminClient = SupabaseClient;

function changed(value: unknown, previous: unknown): boolean {
  return JSON.stringify(value ?? null) !== JSON.stringify(previous ?? null);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function explicitlyIdentifiesAsBroker(value: string): boolean {
  const text = normalize(value);
  if (/\b(nao sou|não sou) (?:um |uma )?corretor(?:a)?\b/.test(text)) return false;
  return /\b(?:sou|trabalho como|atuo como|falo como) (?:um |uma )?corretor(?:a)?(?: de imoveis)?\b/.test(text)
    || /\b(?:sou|trabalho|atuo) (?:em|numa|na) (?:uma )?imobiliaria\b/.test(text)
    || /\bmeu creci\b/.test(text)
    || /\bcorretor(?:a)? parceiro(?:a)?\b/.test(text);
}

function brokerRoutingDecision(base: HybridDecision, turn: AiTurn): HybridDecision {
  return {
    ...base,
    stage: 'qualificacao_ia',
    priorityClass: 'B',
    ownerMode: 'ai',
    aiEnabled: true,
    handoffRequired: false,
    handoffReason: '',
    nextAction: 'Continuar a qualificação pelo Plantão no pipeline de corretores.',
    nextActionType: 'qualificar_corretor',
    nextActionDueAt: null,
    reactivationAt: null,
    noteTitle: 'Nara direcionou o contato ao pipeline de corretores',
    noteDescription: turn.summary
      ? `${turn.summary} O contato se identificou como corretor e foi transferido automaticamente para o Plantão.`
      : 'O contato se identificou como corretor e foi transferido automaticamente para o Plantão.',
    taskTitle: 'Continuar qualificação do corretor no Plantão',
    taskDescription: 'O contato veio pelo atendimento de clientes e se identificou como corretor. O Plantão deve continuar a qualificação.',
    taskPriority: 'normal',
    taskDueAt: null,
    taskDedupeKey: 'ai:corretor:qualificacao',
  };
}

export async function applyHybridDecision(args: {
  admin: AdminClient;
  organizationId: string;
  lead: Lead;
  turn: AiTurn;
  lastUserMessage: string;
  sourceMessageId?: string | null;
}): Promise<HybridDecision> {
  const baseDecision = deriveHybridDecision({
    lead: args.lead,
    turn: args.turn,
    lastUserMessage: args.lastUserMessage,
  });
  const routedToBroker = args.lead.kind === 'cliente'
    && explicitlyIdentifiesAsBroker(args.lastUserMessage);
  const decision = routedToBroker
    ? brokerRoutingDecision(baseDecision, args.turn)
    : baseDecision;
  const classification = routedToBroker ? 'cadastrado' : args.turn.classification;
  const now = new Date().toISOString();
  const metadata = {
    ...(args.lead.metadata || {}),
    ...(routedToBroker ? {
      contact_kind_routed_from: 'cliente',
      contact_kind_routed_to: 'corretor',
      contact_kind_routed_at: now,
      contact_kind_routed_reason: args.lastUserMessage,
    } : {}),
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
      routed_to_kind: routedToBroker ? 'corretor' : null,
      decided_at: now,
    },
  };

  const updatePayload: Record<string, unknown> = {
    ...(routedToBroker ? { kind: 'corretor' } : {}),
    stage: decision.stage,
    owner_mode: decision.ownerMode,
    ai_enabled: decision.aiEnabled,
    priority_class: decision.priorityClass,
    temperature: routedToBroker
      ? Math.max(20, Math.min(100, Math.round(args.turn.score)))
      : Math.max(0, Math.min(100, Math.round(args.turn.score))),
    ai_classification: classification,
    ai_summary: args.turn.summary,
    ai_next_action: decision.nextAction,
    ai_last_classified_at: now,
    next_action: decision.nextAction,
    next_action_type: decision.nextActionType,
    next_action_due_at: decision.nextActionDueAt,
    reactivation_at: decision.reactivationAt,
    last_ai_activity_at: now,
    metadata,
  };

  if (routedToBroker) {
    if (args.turn.extracted.company.trim()) updatePayload.company = args.turn.extracted.company.trim();
    if (args.turn.extracted.creci.trim()) updatePayload.creci = args.turn.extracted.creci.trim();
  }
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

  if (routedToBroker) {
    await Promise.all([
      args.admin.from('lead_handoffs')
        .update({ status: 'cancelled' })
        .eq('lead_id', args.lead.id)
        .eq('status', 'pending'),
      args.admin.from('lead_tasks')
        .update({ status: 'cancelled', completed_at: now })
        .eq('lead_id', args.lead.id)
        .eq('status', 'pending')
        .eq('dedupe_key', 'handoff:pending'),
    ]);
  }

  const shouldLog = routedToBroker
    || changed(decision.stage, args.lead.stage)
    || changed(decision.priorityClass, args.lead.priority_class)
    || changed(classification, args.lead.ai_classification)
    || changed(decision.nextAction, args.lead.next_action);

  if (shouldLog) {
    await args.admin.from('activities').insert({
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      type: routedToBroker ? 'lead_direcionado_corretor' : 'analise_hibrida_ia',
      title: decision.noteTitle,
      description: decision.noteDescription,
      metadata: {
        source_message_id: args.sourceMessageId ?? null,
        kind_before: args.lead.kind,
        kind_after: routedToBroker ? 'corretor' : args.lead.kind,
        stage_before: args.lead.stage,
        stage_after: decision.stage,
        owner_mode: decision.ownerMode,
        priority_class: decision.priorityClass,
        classification,
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
        routed_to_kind: routedToBroker ? 'corretor' : null,
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
