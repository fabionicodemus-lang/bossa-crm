import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type DbClient = Awaited<ReturnType<typeof createClient>>;

async function syncLeadNextAction(
  supabase: DbClient,
  organizationId: string,
  leadId: string,
) {
  const { data: nextTask } = await supabase
    .from('lead_tasks')
    .select('title,type,due_at')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .in('status', ['pending', 'overdue'])
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  await supabase
    .from('leads')
    .update({
      next_action: nextTask?.title ?? null,
      next_action_type: nextTask?.type ?? null,
      next_action_due_at: nextTask?.due_at ?? null,
      last_human_activity_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('organization_id', organizationId);
}

async function validateAssignee(
  supabase: DbClient,
  organizationId: string,
  requestedAssignedTo: string,
) {
  if (!requestedAssignedTo) return null;
  const { data } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('user_id', requestedAssignedTo)
    .maybeSingle();
  return data?.user_id ?? null;
}

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
  const dueAt = String(body.dueAt ?? '').trim();
  const requestedAssignedTo = String(body.assignedTo ?? '').trim();
  let assignedTo = user.id;

  if (!title) return NextResponse.json({ error: 'Informe o título da tarefa.' }, { status: 400 });
  if (!dueAt || !Number.isFinite(Date.parse(dueAt))) {
    return NextResponse.json({ error: 'Informe a data e o horário da tarefa.' }, { status: 400 });
  }

  if (membership.role === 'admin' && requestedAssignedTo) {
    const validAssignee = await validateAssignee(supabase, membership.organization_id, requestedAssignedTo);
    if (!validAssignee) {
      return NextResponse.json({ error: 'O responsável selecionado não pertence a esta organização.' }, { status: 400 });
    }
    assignedTo = validAssignee;
  }

  const priority = ['urgent', 'high', 'normal', 'low'].includes(String(body.priority))
    ? String(body.priority)
    : 'normal';

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

  await syncLeadNextAction(supabase, membership.organization_id, id);
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
  if (!taskId || !['complete', 'cancel', 'reopen', 'edit'].includes(action)) {
    return NextResponse.json({ error: 'Ação de tarefa inválida.' }, { status: 400 });
  }

  const { data: existingTask } = await supabase.from('lead_tasks')
    .select('id,lead_id,assigned_to,title,description,due_at,type,priority,status,completed_at')
    .eq('id', taskId)
    .eq('lead_id', leadId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!existingTask) return NextResponse.json({ error: 'Tarefa não encontrada.' }, { status: 404 });
  if (membership.role !== 'admin' && existingTask.assigned_to !== user.id) {
    return NextResponse.json({ error: 'Você só pode alterar tarefas atribuídas a você.' }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (action === 'edit') {
    const title = String(body.title ?? '').trim().slice(0, 180);
    const description = String(body.description ?? '').trim().slice(0, 5000) || null;
    const dueAt = String(body.dueAt ?? '').trim();
    const priority = ['urgent', 'high', 'normal', 'low'].includes(String(body.priority))
      ? String(body.priority)
      : existingTask.priority;
    let assignedTo = existingTask.assigned_to ?? user.id;

    if (!title) return NextResponse.json({ error: 'Informe o título da tarefa.' }, { status: 400 });
    if (!dueAt || !Number.isFinite(Date.parse(dueAt))) {
      return NextResponse.json({ error: 'Informe a data e o horário da tarefa.' }, { status: 400 });
    }

    if (membership.role === 'admin') {
      const requestedAssignedTo = String(body.assignedTo ?? '').trim();
      if (requestedAssignedTo) {
        const validAssignee = await validateAssignee(supabase, membership.organization_id, requestedAssignedTo);
        if (!validAssignee) {
          return NextResponse.json({ error: 'O responsável selecionado não pertence a esta organização.' }, { status: 400 });
        }
        assignedTo = validAssignee;
      }
    }

    const status = existingTask.status === 'overdue' ? 'pending' : existingTask.status;
    const { data: task, error } = await supabase.from('lead_tasks').update({
      title,
      description,
      due_at: dueAt,
      priority,
      assigned_to: assignedTo,
      status,
    })
      .eq('id', taskId)
      .eq('lead_id', leadId)
      .eq('organization_id', membership.organization_id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await syncLeadNextAction(supabase, membership.organization_id, leadId);
    await supabase.from('activities').insert({
      organization_id: membership.organization_id,
      lead_id: leadId,
      user_id: user.id,
      type: 'tarefa_atualizada',
      title: `Tarefa editada: ${task.title}`,
      description: task.description,
      metadata: { task_id: task.id, due_at: task.due_at, assigned_to: task.assigned_to },
    });

    return NextResponse.json({ task });
  }

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
  await syncLeadNextAction(supabase, membership.organization_id, leadId);

  return NextResponse.json({ task });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para excluir tarefas.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const taskId = String(body.taskId ?? '');
  if (!taskId) return NextResponse.json({ error: 'Tarefa inválida.' }, { status: 400 });

  const { data: existingTask } = await supabase.from('lead_tasks')
    .select('id,lead_id,assigned_to,title,description,due_at')
    .eq('id', taskId)
    .eq('lead_id', leadId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!existingTask) return NextResponse.json({ error: 'Tarefa não encontrada.' }, { status: 404 });
  if (membership.role !== 'admin' && existingTask.assigned_to !== user.id) {
    return NextResponse.json({ error: 'Você só pode excluir tarefas atribuídas a você.' }, { status: 403 });
  }

  const { error } = await supabase.from('lead_tasks')
    .delete()
    .eq('id', taskId)
    .eq('lead_id', leadId)
    .eq('organization_id', membership.organization_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('activities').insert({
    organization_id: membership.organization_id,
    lead_id: leadId,
    user_id: user.id,
    type: 'tarefa_excluida',
    title: `Tarefa excluída: ${existingTask.title}`,
    description: existingTask.description,
    metadata: { task_id: existingTask.id, due_at: existingTask.due_at },
  });
  await syncLeadNextAction(supabase, membership.organization_id, leadId);

  return NextResponse.json({ ok: true });
}
