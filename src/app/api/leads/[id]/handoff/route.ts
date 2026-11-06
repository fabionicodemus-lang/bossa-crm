import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readNaraJourney } from '@/lib/nara-journey';
import { tryRecordNaraFunnelEvent } from '@/lib/nara-funnel-events';

function dueFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  if (typeof id !== 'string' || !id.trim() || id.length > 200) return NextResponse.json({ error: 'Lead inválido.' }, { status: 400 });

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('organization_id,role,profiles(full_name,email)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Não foi possível verificar sua permissão.' }, { status: 503 });
  if (!membership || !['admin', 'comercial'].includes(membership.role)) {
    return NextResponse.json({ error: 'Você não possui permissão para assumir este lead.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { action?: unknown; ownerId?: unknown };
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || (body.action !== undefined && typeof body.action !== 'string')
    || (body.ownerId !== undefined && (typeof body.ownerId !== 'string' || body.ownerId.length > 200))) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }
  const action = body.action ?? 'accept';
  if (!['accept', 'transfer', 'release'].includes(action)) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  const { data: lead, error: leadReadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (leadReadError) return NextResponse.json({ error: 'Não foi possível verificar o lead.' }, { status: 503 });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

  if (action === 'release') {
    if (lead.owner_mode === 'ai' && !lead.owner_id && lead.next_action_type === 'resgate_ia') {
      return NextResponse.json({ ok: true, action, idempotent: true });
    }
    const now = new Date().toISOString();
    let releaseQuery = supabase.from('leads').update({
      owner_id: null,
      owner_mode: 'ai',
      stage: 'nutricao_ativa',
      ai_enabled: !lead.opt_out && !lead.automation_paused,
      next_action: 'Nara/Plantão reassumiu o contato após devolução do consultor.',
      next_action_type: 'resgate_ia',
      next_action_due_at: dueFromNow(24 * 60),
      metadata: { ...(lead.metadata || {}), nara_journey: {
        ...readNaraJourney(lead.metadata), requested_next_step: null, pending_reason: null,
      } },
      updated_at: now,
    }).eq('id', id).eq('organization_id', membership.organization_id);
    if (lead.updated_at) releaseQuery = releaseQuery.eq('updated_at', lead.updated_at);
    const { data: released, error } = await releaseQuery.select('id').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!released) return NextResponse.json({ error: 'O lead foi alterado. Atualize antes de devolver o atendimento.' }, { status: 409 });
    await supabase.from('lead_handoffs').update({ status: 'cancelled', updated_at: now })
      .eq('lead_id', id).eq('organization_id', membership.organization_id).eq('status', 'pending');
    await supabase.from('activities').insert({
      organization_id: membership.organization_id,
      lead_id: id,
      user_id: user.id,
      type: 'devolucao_para_ia',
      title: `${lead.kind === 'cliente' ? 'Nara' : 'Plantão'} reassumiu o contato`,
      description: 'O consultor devolveu o lead para a rede de proteção da IA.',
      metadata: { released_by: user.id },
    });
    return NextResponse.json({ ok: true, action });
  }

  const requestedOwnerId = String(body.ownerId ?? '').trim();
  if (action === 'transfer' && !requestedOwnerId) {
    return NextResponse.json({ error: 'Escolha quem vai receber o atendimento.' }, { status: 400 });
  }
  if (action === 'accept' && requestedOwnerId && requestedOwnerId !== user.id) {
    return NextResponse.json({ error: 'Somente o próprio responsável pode aceitar. Use transferir para oferecer a outro atendente.' }, { status: 400 });
  }
  const ownerId = requestedOwnerId || user.id;
  const { data: targetMembership, error: targetMembershipError } = await supabase
    .from('memberships')
    .select('user_id,role,profiles(full_name,email)')
    .eq('organization_id', membership.organization_id)
    .eq('user_id', ownerId)
    .maybeSingle();
  if (targetMembershipError) return NextResponse.json({ error: 'Não foi possível verificar o responsável.' }, { status: 503 });
  if (!targetMembership || !['admin', 'comercial'].includes(targetMembership.role)) {
    return NextResponse.json({ error: 'O atendente escolhido não está disponível para receber leads.' }, { status: 400 });
  }
  const targetProfileRaw = targetMembership.profiles;
  const targetProfile = Array.isArray(targetProfileRaw) ? targetProfileRaw[0] : targetProfileRaw;
  const targetEmail = String(targetProfile?.email ?? '').toLowerCase();
  const ownerName = targetEmail === 'contato@bossaempreendimentos.com.br'
    ? 'Cíntia'
    : String(targetProfile?.full_name ?? '').trim() || 'Atendente';
  const now = new Date().toISOString();
  const acknowledgedByAssignee = action === 'accept' && ownerId === user.id;
  const contactDue = dueFromNow(lead.priority_class === 'A1' ? 10 : 24 * 60);
  const preservedHumanStages = ['agendado', 'pos_reuniao', 'proposta_negociacao', 'fechado_ganho'];
  const humanStage = preservedHumanStages.includes(lead.stage) ? lead.stage : 'humano_ativo';

  const { data: pending, error: pendingError } = await supabase
    .from('lead_handoffs')
    .select('id,offered_to,expires_at')
    .eq('lead_id', id)
    .eq('organization_id', membership.organization_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1)
    .maybeSingle();
  if (pendingError) return NextResponse.json({ error: 'Não foi possível verificar a passagem.' }, { status: 503 });
  if (action === 'transfer' && pending?.offered_to === ownerId && lead.owner_mode === 'human'
    && lead.owner_id === ownerId && !lead.handoff_accepted_at) {
    return NextResponse.json({ ok: true, action, idempotent: true, owner_id: ownerId, owner_name: ownerName,
      stage: lead.stage, due_at: lead.next_action_due_at || pending.expires_at });
  }
  if (acknowledgedByAssignee && !pending && lead.owner_mode === 'human' && lead.owner_id === ownerId && lead.handoff_accepted_at) {
    const { data: accepted, error: acceptedReadError } = await supabase.from('lead_handoffs').select('id')
      .eq('organization_id', membership.organization_id).eq('lead_id', id).eq('status', 'accepted')
      .eq('accepted_by', ownerId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (acceptedReadError) return NextResponse.json({ error: 'Não foi possível verificar o aceite.' }, { status: 503 });
    if (accepted) return NextResponse.json({ ok: true, action, idempotent: true, owner_id: ownerId,
      owner_name: ownerName, stage: lead.stage, due_at: lead.next_action_due_at });
  }

  // Reserve this state transition before writing evidence. A stale request cannot
  // claim acceptance/transfer after another operator has already changed the lead.
  let leadQuery = supabase.from('leads').update({
    owner_id: ownerId, owner_mode: 'human', stage: humanStage, ai_enabled: false,
    handoff_requested_at: acknowledgedByAssignee ? lead.handoff_requested_at || now : now,
    handoff_accepted_at: acknowledgedByAssignee ? now : null,
    last_human_activity_at: now,
    next_action: acknowledgedByAssignee
      ? lead.priority_class === 'A1' ? 'Fazer o primeiro contato humano em até 10 minutos.' : 'Dar continuidade ao atendimento e registrar o resultado.'
      : `${ownerName} deve aceitar a transferência antes de iniciar o atendimento.`,
    next_action_type: acknowledgedByAssignee ? 'primeiro_contato_humano' : 'aceitar_passagem',
    next_action_due_at: contactDue, updated_at: now,
  }).eq('id', id).eq('organization_id', membership.organization_id);
  if (lead.updated_at) leadQuery = leadQuery.eq('updated_at', lead.updated_at);
  const { data: transitioned, error: leadError } = await leadQuery.select('id').maybeSingle();
  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 400 });
  if (!transitioned) return NextResponse.json({ error: 'O lead foi alterado. Atualize antes de transferir ou aceitar.' }, { status: 409 });

  let handoffId: string | null = pending?.id ?? null;
  if (pending?.id) {
    const { data: updatedHandoff, error: handoffError } = await supabase.from('lead_handoffs').update({
      offered_to: ownerId,
      status: acknowledgedByAssignee ? 'accepted' : 'pending',
      accepted_by: acknowledgedByAssignee ? ownerId : null,
      accepted_at: acknowledgedByAssignee ? now : null,
      expires_at: contactDue,
      updated_at: now,
    }).eq('id', pending.id).eq('organization_id', membership.organization_id).eq('status', 'pending').select('id').maybeSingle();
    if (handoffError) return NextResponse.json({ error: handoffError.message }, { status: 400 });
    if (!updatedHandoff) return NextResponse.json({ error: 'A passagem foi alterada. Atualize antes de aceitar; o aceite não foi confirmado.' }, { status: 409 });
  } else {
    const { data: insertedHandoff, error: insertedHandoffError } = await supabase.from('lead_handoffs').insert({
      organization_id: membership.organization_id,
      lead_id: id,
      requested_by: 'human',
      offered_to: ownerId,
      accepted_by: acknowledgedByAssignee ? ownerId : null,
      priority_class: lead.priority_class,
      reason: lead.ai_next_action || (acknowledgedByAssignee ? 'Lead assumido manualmente.' : 'Atendimento oferecido por transferência; aguardando aceite.'),
      briefing: { summary: lead.ai_summary, next_action: lead.ai_next_action },
      status: acknowledgedByAssignee ? 'accepted' : 'pending',
      accepted_at: acknowledgedByAssignee ? now : null,
      expires_at: contactDue,
    }).select('id').single();
    if (insertedHandoffError) return NextResponse.json({ error: insertedHandoffError.message }, { status: 400 });
    handoffId = insertedHandoff.id;
  }

  const admin = createAdminClient();
  if (handoffId) await tryRecordNaraFunnelEvent(admin, {
    organizationId: membership.organization_id, leadId: id,
    event: acknowledgedByAssignee ? 'assumido' : 'encaminhado',
    dedupeKey: acknowledgedByAssignee ? undefined : ownerId,
    source: 'human_handoff_action', actorId: user.id, evidence: { handoff_id: handoffId },
    dimensions: { contact_kind: lead.kind === 'corretor' ? 'corretor' : 'cliente', responsible_id: ownerId },
  });

  if (acknowledgedByAssignee) {
    await supabase.from('lead_tasks').update({ status: 'completed', completed_at: now })
      .eq('organization_id', membership.organization_id).eq('lead_id', id).in('status', ['pending', 'overdue']).eq('dedupe_key', 'handoff:pending');
  } else {
    // The old assignee's first-contact task was not completed by a transfer.
    await supabase.from('lead_tasks').update({ status: 'cancelled', completed_at: now })
      .eq('organization_id', membership.organization_id).eq('lead_id', id).in('status', ['pending', 'overdue']).eq('dedupe_key', 'human:first-contact');
  }

  const taskKey = acknowledgedByAssignee ? 'human:first-contact' : 'handoff:pending';
  const { data: existingTask } = await supabase.from('lead_tasks').select('id')
    .eq('organization_id', membership.organization_id).eq('lead_id', id).eq('status', 'pending').eq('dedupe_key', taskKey).maybeSingle();
  const task = {
    organization_id: membership.organization_id,
    lead_id: id,
    assigned_to: ownerId,
    assigned_mode: 'human',
    type: acknowledgedByAssignee ? 'primeiro_contato_humano' : 'aceitar_passagem',
    title: acknowledgedByAssignee ? lead.priority_class === 'A1' ? 'Contatar lead A1 agora' : 'Realizar primeiro contato' : 'Aceitar transferência de atendimento',
    description: lead.ai_next_action || lead.ai_summary || 'Leia o briefing e continue sem repetir perguntas.',
    priority: lead.priority_class === 'A1' ? 'urgent' : 'high',
    status: 'pending',
    due_at: contactDue,
    created_by_kind: 'system',
    dedupe_key: taskKey,
    metadata: { handoff_id: handoffId, priority_class: lead.priority_class,
      ...(acknowledgedByAssignee ? { accepted_at: now, accepted_by: user.id } : { offered_at: now, offered_by: user.id }) },
  };
  if (existingTask?.id) await supabase.from('lead_tasks').update(task).eq('id', existingTask.id).eq('organization_id', membership.organization_id);
  else await supabase.from('lead_tasks').insert(task);

  await supabase.from('activities').insert({
    organization_id: membership.organization_id,
    lead_id: id,
    user_id: user.id,
    type: acknowledgedByAssignee ? 'passagem_aceita' : 'atendimento_transferido',
    title: acknowledgedByAssignee ? 'Passagem aceita pelo consultor' : `Atendimento oferecido para ${ownerName}`,
    description: !acknowledgedByAssignee
      ? `${ownerName} recebeu a transferência para aceitar. A IA está silenciada; o aceite ainda não foi confirmado.`
      : 'O atendimento humano assumiu o lead. A IA permanece em silêncio, mas continua analisando a conversa.',
    metadata: { owner_id: ownerId, owner_name: ownerName, due_at: contactDue, action,
      ...(acknowledgedByAssignee ? { accepted_at: now, accepted_by: user.id } : { offered_at: now, offered_by: user.id }) },
  });

  if (action === 'transfer' && ownerId !== user.id && handoffId) {
    const requesterProfileRaw = membership.profiles;
    const requesterProfile = Array.isArray(requesterProfileRaw) ? requesterProfileRaw[0] : requesterProfileRaw;
    const requesterName = String(requesterProfile?.full_name ?? '').trim() || 'Outro usuário';

    const { data: existingNotification } = await admin
      .from('user_notifications')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('user_id', ownerId)
      .eq('handoff_id', handoffId)
      .maybeSingle();

    const notificationPayload = {
      organization_id: membership.organization_id,
      user_id: ownerId,
      kind: 'handoff',
      source: 'usuario',
      title: 'Atendimento transferido para você',
      body: `${lead.name} · enviado por ${requesterName}`,
      lead_id: id,
      handoff_id: handoffId,
      status: 'open',
      accepted_at: null,
      resolved_at: null,
      metadata: {
        action: 'acknowledge_transfer',
        transferred_by: user.id,
        transferred_by_name: requesterName,
        due_at: contactDue,
      },
      updated_at: now,
    };
    if (existingNotification?.id) {
      await admin.from('user_notifications').update(notificationPayload).eq('id', existingNotification.id).eq('organization_id', membership.organization_id);
    } else {
      await admin.from('user_notifications').insert({ ...notificationPayload, created_at: now });
    }
  }

  return NextResponse.json({ ok: true, action, owner_id: ownerId, owner_name: ownerName, stage: humanStage, due_at: contactDue });
}
