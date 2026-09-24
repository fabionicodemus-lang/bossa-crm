import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiTurn } from './ai';
import { deriveHybridDecision, type HybridDecision } from './hybrid';
import type { Lead } from './types';
import { isAssistedSaleSignal, isBrokerRoutingSignal } from './nara-contact-routing';

export type AdminClient = SupabaseClient;

type ClientHandoffSettings = {
  organization_id: string;
  primary_owner_user_id: string | null;
  primary_owner_name: string;
  primary_owner_alert_phone: string | null;
  manager_user_id: string | null;
  manager_name: string;
  manager_alert_phone: string | null;
  alert_sender_channel_id: string | null;
  alert_template_name: string;
  enabled: boolean;
};

async function loadClientHandoffSettings(
  admin: AdminClient,
  organizationId: string,
): Promise<ClientHandoffSettings | null> {
  const { data, error } = await admin
    .from('client_handoff_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    // Durante deploy/migration o código continua funcionando com o roteamento antigo.
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw error;
  }
  return data as ClientHandoffSettings | null;
}

function changed(value: unknown, previous: unknown): boolean {
  return JSON.stringify(value ?? null) !== JSON.stringify(previous ?? null);
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
    noteTitle: 'Contato geral direcionado ao pipeline de corretores',
    noteDescription: turn.summary
      ? `${turn.summary} O contato se identificou como corretor e foi transferido automaticamente para o Plantão.`
      : 'O contato se identificou como corretor e foi transferido automaticamente para o Plantão.',
    taskTitle: 'Continuar qualificação do corretor no Plantão',
    taskDescription: 'O contato geral se identificou como corretor. O Plantão deve continuar a qualificação.',
    taskPriority: 'normal',
    taskDueAt: null,
    taskDedupeKey: 'ai:corretor:qualificacao',
  };
}

function assistedSaleDecision(base: HybridDecision, turn: AiTurn): HybridDecision {
  const dueAt = new Date(Date.now() + 5 * 60_000).toISOString();
  return {
    ...base,
    stage: 'passagem_pendente',
    priorityClass: 'A1',
    ownerMode: 'ai',
    aiEnabled: true,
    handoffRequired: true,
    handoffReason: 'O contato informou que veio indicado por corretor ou imobiliária; a parceria precisa ser preservada.',
    nextAction: 'Registrar o corretor e a imobiliária de origem e assumir o atendimento comercial sem condução direta pela Nara.',
    nextActionType: 'venda_assistida',
    nextActionDueAt: dueAt,
    reactivationAt: null,
    noteTitle: 'Nara identificou venda assistida por corretor',
    noteDescription: turn.summary
      ? `${turn.summary} A indicação do corretor deve ser registrada antes da continuidade comercial.`
      : 'O contato veio indicado por corretor ou imobiliária e foi encaminhado para continuidade humana.',
    taskTitle: 'Assumir venda assistida',
    taskDescription: 'Registrar corretor e imobiliária de origem e continuar o atendimento preservando a parceria.',
    taskPriority: 'urgent',
    taskDueAt: dueAt,
    taskDedupeKey: 'handoff:venda-assistida',
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

  // Regra de proteção: CLIENTE é uma classificação humana/persistente.
  // A IA nunca converte cliente em corretor. Somente um contato GERAL ainda
  // não classificado pode ser promovido automaticamente para CORRETOR.
  const routedToAssistedSale = args.lead.kind === 'cliente'
    && isAssistedSaleSignal(args.lastUserMessage);
  const routedToBroker = args.lead.kind === 'geral'
    && isBrokerRoutingSignal(args.lastUserMessage);

  const decision = routedToAssistedSale
    ? assistedSaleDecision(baseDecision, args.turn)
    : routedToBroker
      ? brokerRoutingDecision(baseDecision, args.turn)
      : baseDecision;
  const classification = routedToBroker ? 'cadastrado' : args.turn.classification;
  const now = new Date().toISOString();
  const clientHandoffSettings = decision.handoffRequired
    && args.lead.kind === 'cliente'
    && args.lead.owner_mode !== 'human'
    ? await loadClientHandoffSettings(args.admin, args.organizationId)
    : null;
  const designatedOwnerId = clientHandoffSettings?.enabled
    ? clientHandoffSettings.primary_owner_user_id
    : args.lead.owner_id;
  const designatedOwnerName = clientHandoffSettings?.enabled
    ? clientHandoffSettings.primary_owner_name
    : null;
  const resolvedNextAction = designatedOwnerName && decision.handoffRequired && args.lead.kind === 'cliente'
    ? decision.nextAction.replace(/^Um consultor deve/i, `${designatedOwnerName} deve`)
    : decision.nextAction;
  const metadata = {
    ...(args.lead.metadata || {}),
    ...(routedToBroker ? {
      contact_kind_routed_from: 'geral',
      contact_kind_routed_to: 'corretor',
      contact_kind_routed_at: now,
      contact_kind_routed_reason: args.lastUserMessage,
    } : {}),
    ...(routedToAssistedSale ? {
      sale_assisted: true,
      sale_assisted_detected_at: now,
      sale_assisted_source_message: args.lastUserMessage,
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
    ai_next_action: resolvedNextAction,
    ai_last_classified_at: now,
    next_action: resolvedNextAction,
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
    if (args.lead.kind === 'cliente' && designatedOwnerId) {
      updatePayload.owner_id = designatedOwnerId;
    }
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
    || routedToAssistedSale
    || changed(decision.stage, args.lead.stage)
    || changed(decision.priorityClass, args.lead.priority_class)
    || changed(classification, args.lead.ai_classification)
    || changed(decision.nextAction, args.lead.next_action);

  if (shouldLog) {
    await args.admin.from('activities').insert({
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      type: routedToBroker
        ? 'lead_direcionado_corretor'
        : routedToAssistedSale
          ? 'venda_assistida_identificada'
          : 'analise_hibrida_ia',
      title: decision.noteTitle,
      description: decision.noteDescription,
      metadata: {
        source_message_id: args.sourceMessageId ?? null,
        kind_before: args.lead.kind,
        kind_after: routedToBroker ? 'corretor' : args.lead.kind,
        sale_assisted: routedToAssistedSale,
        stage_before: args.lead.stage,
        stage_after: decision.stage,
        owner_mode: decision.ownerMode,
        priority_class: decision.priorityClass,
        classification,
        score: args.turn.score,
        handoff_required: decision.handoffRequired,
        next_action: resolvedNextAction,
        next_action_due_at: decision.nextActionDueAt,
      },
    });
  }

  if (decision.taskTitle && decision.taskDedupeKey) {
    const designatedHandoffTask = decision.handoffRequired
      && args.lead.kind === 'cliente'
      && Boolean(designatedOwnerId);
    const task = {
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      assigned_to: designatedHandoffTask
        ? designatedOwnerId
        : decision.ownerMode === 'human'
          ? args.lead.owner_id
          : null,
      assigned_mode: designatedHandoffTask
        ? 'human'
        : decision.ownerMode === 'human'
          ? 'human'
          : 'ai',
      type: decision.nextActionType,
      title: decision.taskTitle,
      description: designatedOwnerName && designatedHandoffTask
        ? `${decision.taskDescription} Responsável: ${designatedOwnerName}.`
        : decision.taskDescription,
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
        sale_assisted: routedToAssistedSale,
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
    const handoffBriefing = {
      lead_name: args.lead.name,
      phone: args.lead.phone,
      source: args.lead.source,
      enterprise: args.turn.extracted.enterprise || args.lead.enterprise,
      purpose: args.turn.extracted.purpose,
      typology: args.turn.extracted.typology,
      budget: args.turn.extracted.budget,
      deadline: args.turn.extracted.deadline,
      decision_maker: args.turn.extracted.decision_maker,
      location: args.turn.extracted.region
        || (typeof args.lead.metadata?.contact_time_preference_city === 'string'
          ? args.lead.metadata.contact_time_preference_city
          : ''),
      payment_method: typeof args.lead.metadata?.payment_method === 'string'
        ? args.lead.metadata.payment_method
        : '',
      best_contact_time_original: typeof args.lead.metadata?.contact_time_preference_original === 'string'
        ? args.lead.metadata.contact_time_preference_original
        : '',
      best_contact_time_brasilia: typeof args.lead.metadata?.contact_time_preference_brasilia === 'string'
        ? args.lead.metadata.contact_time_preference_brasilia
        : '',
      contact_timezone: typeof args.lead.metadata?.contact_time_preference_timezone === 'string'
        ? args.lead.metadata.contact_time_preference_timezone
        : '',
      main_objection: args.turn.summary,
      next_best_action: resolvedNextAction,
      priority_class: decision.priorityClass,
      responsible_name: designatedOwnerName,
    };
    const handoff = {
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      requested_by: 'ai',
      offered_to: designatedOwnerId,
      backup_to: args.lead.backup_owner_id,
      priority_class: decision.priorityClass,
      reason: decision.handoffReason,
      briefing: handoffBriefing,
      status: 'pending',
      expires_at: expiresAt,
    };
    const { data: existing } = await args.admin
      .from('lead_handoffs')
      .select('id')
      .eq('lead_id', args.lead.id)
      .eq('status', 'pending')
      .maybeSingle();

    let handoffId: string | null = existing?.id ?? null;
    if (existing?.id) {
      const { data: updatedHandoff, error } = await args.admin
        .from('lead_handoffs')
        .update(handoff)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw error;
      handoffId = updatedHandoff.id;
    } else {
      const { data: createdHandoff, error } = await args.admin
        .from('lead_handoffs')
        .insert(handoff)
        .select('id')
        .single();
      if (error) throw error;
      handoffId = createdHandoff.id;
    }

    if (
      handoffId
      && args.lead.kind === 'cliente'
      && clientHandoffSettings?.enabled
      && designatedOwnerId
    ) {
      const { error: queueError } = await args.admin
        .from('client_handoff_alert_jobs')
        .upsert({
          organization_id: args.organizationId,
          lead_id: args.lead.id,
          handoff_id: handoffId,
          briefing: handoffBriefing,
          owner_status: 'queued',
          manager_status: 'queued',
          updated_at: now,
        }, { onConflict: 'handoff_id', ignoreDuplicates: true });
      if (queueError && queueError.code !== '42P01' && queueError.code !== 'PGRST205') {
        console.error('[handoff alert queue]', queueError.message);
      }
    }
  }

  return decision;
}
