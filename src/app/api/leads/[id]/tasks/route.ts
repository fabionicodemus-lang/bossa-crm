import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para criar tarefas.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = String(body.title ?? '').trim().slice(0, 180);
  const description = String(body.description ?? '').trim().slice(0, 5000) || null;
  const dueAt = String(body.dueAt ?? '').trim() || null;
  const requestedAssignedTo = String(body.assignedTo ?? '').trim();
  let assignedTo = user.id;
  if (membership.role === 'admin' && requestedAssignedTo) {
    const { data: assignedMembership } = await supabase.from('memberships')
      .select('user_id')
      .eq('organization_id', membership.organization_id)
      .eq('user_id', requestedAssignedTo)
      .maybeSingle();
    if (!assignedMembership) {
      return NextResponse.json({ error: 'O responsável selecionado não pertence a esta organização.' }, { status: 400 });
    }
    assignedTo = requestedAssignedTo;
  }
  const priority = ['urgent', 'high', 'normal', 'low'].includes(String(body.priority))
    ? String(body.priority)
    : 'normal';
  if (!title) return NextResponse.json({ error: 'Informe o título da tarefa.' }, { status: 400 });

  const { data: lead } = await supabase.from('leads').select('id,organization_id')
    .eq('id', id).eq('organization_id', membership.organization_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

  const { data: task, error } = await supabase.from('lead_tasks').insert({
    organization_id: membership.organization_id,
    lead_id: id,
    assigned_to: assignedTo,
    assigned_mode: 'human',
    type: String(body.type ?? 'followup').slice(0, 80),
    title,
    description,
    priority,
    status: 'pending',
    due_at: dueAt,
    created_by_kind: 'human',
    created_by: user.id,
    metadata: {},
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('leads').update({
    next_action: title,
    next_action_type: String(body.type ?? 'followup').slice(0, 80),
    next_action_due_at: dueAt,
    last_human_activity_at: new Date().toISOString(),
  }).eq('id', id);
  await supabase.from('activities').insert({
    organization_id: membership.organization_id,
    lead_id: id,
    user_id: user.id,
    type: 'tarefa_criada',
    title: `Tarefa criada: ${title}`,
    description,
    metadata: { task_id: task.id, due_at: dueAt, assigned_to: assignedTo },
  });

  return NextResponse.json({ task });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para alterar tarefas.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const taskId = String(body.taskId ?? '');
  const action = String(body.action ?? 'complete');
  if (!taskId || !['complete', 'cancel', 'reopen'].includes(action)) {
    return NextResponse.json({ error: 'Ação de tarefa inválida.' }, { status: 400 });
  }

  const { data: existingTask } = await supabase.from('lead_tasks')
    .select('id,lead_id,assigned_to')
    .eq('id', taskId)
    .eq('lead_id', leadId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!existingTask) return NextResponse.json({ error: 'Tarefa não encontrada.' }, { status: 404 });
  if (membership.role !== 'admin' && existingTask.assigned_to !== user.id) {
    return NextResponse.json({ error: 'Você só pode alterar tarefas atribuídas a você.' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const status = action === 'complete' ? 'completed' : action === 'cancel' ? 'cancelled' : 'pending';
  const { data: task, error } = await supabase.from('lead_tasks').update({
    status,
    completed_at: status === 'completed' ? now : null,
  }).eq('id', taskId).eq('lead_id', leadId).eq('organization_id', membership.organization_id)
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('activities').insert({
    organization_id: membership.organization_id,
    lead_id: leadId,
    user_id: user.id,
    type: status === 'completed' ? 'tarefa_concluida' : 'tarefa_atualizada',
    title: status === 'completed' ? `Tarefa concluída: ${task.title}` : `Tarefa ${status}: ${task.title}`,
    description: task.description,
    metadata: { task_id: task.id, status },
  });
  await supabase.from('leads').update({ last_human_activity_at: now }).eq('id', leadId);

  return NextResponse.json({ task });
}
