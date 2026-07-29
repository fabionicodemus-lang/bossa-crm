import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para registrar atividades.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const leadId = String(body.leadId ?? '');
  const title = String(body.title ?? 'Anotação').trim().slice(0, 150);
  const description = String(body.description ?? '').trim().slice(0, 5000);
  const nextAction = String(body.nextAction ?? '').trim().slice(0, 180);
  const nextActionType = String(body.nextActionType ?? 'followup').trim().slice(0, 80);
  const nextActionDueAt = String(body.nextActionDueAt ?? '').trim() || null;
  if (!leadId || !description) return NextResponse.json({ error: 'Anotação inválida.' }, { status: 400 });

  const { data: lead } = await supabase.from('leads').select('*')
    .eq('id', leadId).eq('organization_id', membership.organization_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Contato não encontrado.' }, { status: 404 });
  if (lead.owner_mode === 'human' && !nextAction && !nextActionDueAt) {
    return NextResponse.json({
      error: 'Em atendimento humano, registre também a próxima ação e o prazo. Isso evita que o lead fique sem sequência.',
    }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('activities').insert({
    organization_id: lead.organization_id,
    lead_id: leadId,
    user_id: user.id,
    type: String(body.type ?? 'nota').slice(0, 80),
    title,
    description,
    metadata: {
      result: body.result ? String(body.result).slice(0, 500) : null,
      objection: body.objection ? String(body.objection).slice(0, 1000) : null,
      next_action: nextAction || null,
      next_action_due_at: nextActionDueAt,
    },
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const leadUpdate: Record<string, unknown> = { last_human_activity_at: now, updated_at: now };
  if (nextAction) {
    leadUpdate.next_action = nextAction;
    leadUpdate.next_action_type = nextActionType;
    leadUpdate.next_action_due_at = nextActionDueAt;
  }
  if (body.lossReason) leadUpdate.loss_reason = String(body.lossReason).slice(0, 120);
  if (body.reactivationAt) leadUpdate.reactivation_at = String(body.reactivationAt);
  await supabase.from('leads').update(leadUpdate).eq('id', leadId);

  let task = null;
  if (nextAction) {
    const { data: createdTask } = await supabase.from('lead_tasks').insert({
      organization_id: lead.organization_id,
      lead_id: leadId,
      assigned_to: lead.owner_id || user.id,
      assigned_mode: 'human',
      type: nextActionType,
      title: nextAction,
      description,
      priority: String(body.priority ?? 'normal'),
      status: 'pending',
      due_at: nextActionDueAt,
      created_by_kind: 'human',
      created_by: user.id,
      metadata: { activity_id: data.id },
    }).select('*').single();
    task = createdTask;
  }

  return NextResponse.json({ activity: data, task });
}
