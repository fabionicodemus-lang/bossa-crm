import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function dueFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para assumir este lead.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { action?: unknown; ownerId?: unknown };
  const action = String(body.action ?? 'accept');
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

  if (action === 'release') {
    const now = new Date().toISOString();
    await supabase.from('lead_handoffs').update({ status: 'cancelled', updated_at: now })
      .eq('lead_id', id).eq('status', 'pending');
    const { error } = await supabase.from('leads').update({
      owner_id: null,
      owner_mode: 'ai',
      stage: 'nutricao_ativa',
      ai_enabled: !lead.opt_out && !lead.automation_paused,
      next_action: 'Nara/Plantão reassumiu o contato após devolução do consultor.',
      next_action_type: 'resgate_ia',
      next_action_due_at: dueFromNow(24 * 60),
      updated_at: now,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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

  if (!['accept', 'transfer'].includes(action)) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  const requestedOwnerId = String(body.ownerId ?? '').trim();
  if (action === 'transfer' && !requestedOwnerId) {
    return NextResponse.json({ error: 'Escolha quem vai receber o atendimento.' }, { status: 400 });
  }
  const ownerId = requestedOwnerId || user.id;
  const { data: targetMembership } = await supabase
    .from('memberships')
    .select('user_id,role,profiles(full_name,email)')
    .eq('organization_id', membership.organization_id)
    .eq('user_id', ownerId)
    .maybeSingle();
  if (!targetMembership || targetMembership.role === 'viewer') {
    return NextResponse.json({ error: 'O atendente escolhido não está disponível para receber leads.' }, { status: 400 });
  }
  const targetProfileRaw = targetMembership.profiles;
  const targetProfile = Array.isArray(targetProfileRaw) ? targetProfileRaw[0] : targetProfileRaw;
  const targetEmail = String(targetProfile?.email ?? '').toLowerCase();
  const ownerName = targetEmail === 'contato@bossaempreendimentos.com.br'
    ? 'Cíntia'
    : String(targetProfile?.full_name ?? '').trim() || 'Atendente';
  const now = new Date().toISOString();
  const contactDue = dueFromNow(lead.priority_class === 'A1' ? 10 : 24 * 60);
  const preservedHumanStages = ['agendado', 'pos_reuniao', 'proposta_negociacao', 'fechado_ganho'];
  const humanStage = preservedHumanStages.includes(lead.stage) ? lead.stage : 'humano_ativo';

  const { data: pending } = await supabase
    .from('lead_handoffs')
    .select('id')
    .eq('lead_id', id)
    .eq('status', 'pending')
    .maybeSingle();
  if (pending?.id) {
    await supabase.from('lead_handoffs').update({
      status: 'accepted',
      accepted_by: ownerId,
      accepted_at: now,
      updated_at: now,
    }).eq('id', pending.id);
  } else {
    await supabase.from('lead_handoffs').insert({
      organization_id: membership.organization_id,
      lead_id: id,
      requested_by: 'human',
      offered_to: ownerId,
      accepted_by: ownerId,
      priority_class: lead.priority_class,
      reason: lead.ai_next_action || 'Lead assumido manualmente.',
      briefing: { summary: lead.ai_summary, next_action: lead.ai_next_action },
      status: 'accepted',
      accepted_at: now,
      expires_at: now,
    });
  }

  const { error: leadError } = await supabase.from('leads').update({
    owner_id: ownerId,
    owner_mode: 'human',
    stage: humanStage,
    ai_enabled: false,
    automation_paused: false,
    handoff_accepted_at: now,
    last_human_activity_at: now,
    next_action: lead.priority_class === 'A1'
      ? 'Fazer o primeiro contato humano em até 10 minutos.'
      : 'Dar continuidade ao atendimento e registrar o resultado.',
    next_action_type: 'primeiro_contato_humano',
    next_action_due_at: contactDue,
    updated_at: now,
  }).eq('id', id);
  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 400 });

  await supabase.from('lead_tasks').update({ status: 'completed', completed_at: now })
    .eq('lead_id', id).eq('status', 'pending').eq('dedupe_key', 'handoff:pending');

  const { data: existingTask } = await supabase.from('lead_tasks').select('id')
    .eq('lead_id', id).eq('status', 'pending').eq('dedupe_key', 'human:first-contact').maybeSingle();
  const task = {
    organization_id: membership.organization_id,
    lead_id: id,
    assigned_to: ownerId,
    assigned_mode: 'human',
    type: 'primeiro_contato_humano',
    title: lead.priority_class === 'A1' ? 'Contatar lead A1 agora' : 'Realizar primeiro contato',
    description: lead.ai_next_action || lead.ai_summary || 'Leia o briefing e continue sem repetir perguntas.',
    priority: lead.priority_class === 'A1' ? 'urgent' : 'high',
    status: 'pending',
    due_at: contactDue,
    created_by_kind: 'system',
    dedupe_key: 'human:first-contact',
    metadata: { accepted_at: now, priority_class: lead.priority_class },
  };
  if (existingTask?.id) await supabase.from('lead_tasks').update(task).eq('id', existingTask.id);
  else await supabase.from('lead_tasks').insert(task);

  await supabase.from('activities').insert({
    organization_id: membership.organization_id,
    lead_id: id,
    user_id: user.id,
    type: action === 'transfer' ? 'atendimento_transferido' : 'passagem_aceita',
    title: action === 'transfer' ? `Atendimento transferido para ${ownerName}` : 'Passagem aceita pelo consultor',
    description: action === 'transfer'
      ? `${ownerName} passou a ser responsável pelo atendimento. A IA foi silenciada.`
      : 'O atendimento humano assumiu o lead. A IA permanece em silêncio, mas continua analisando a conversa.',
    metadata: { owner_id: ownerId, owner_name: ownerName, accepted_at: now, due_at: contactDue, action },
  });

  return NextResponse.json({ ok: true, action, owner_id: ownerId, owner_name: ownerName, stage: humanStage, due_at: contactDue });
}
