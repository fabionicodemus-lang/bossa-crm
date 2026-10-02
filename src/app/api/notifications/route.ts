import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });

  const { data, error } = await supabase
    .from('user_notifications')
    .select('id,kind,source,title,body,lead_id,handoff_id,task_id,status,metadata,created_at,updated_at')
    .eq('organization_id', membership.organization_id)
    .eq('user_id', user.id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notifications: data ?? [], count: data?.length ?? 0 }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { id?: unknown; action?: unknown };
  const id = String(body.id ?? '').trim();
  const action = String(body.action ?? 'accept');
  if (!id || action !== 'accept') {
    return NextResponse.json({ error: 'Ação de notificação inválida.' }, { status: 400 });
  }

  const { data: notification, error: notificationError } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .eq('user_id', user.id)
    .eq('status', 'open')
    .maybeSingle();

  if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 400 });
  if (!notification) return NextResponse.json({ ok: true, alreadyResolved: true });

  const metadata = notification.metadata && typeof notification.metadata === 'object'
    ? notification.metadata as Record<string, unknown>
    : {};
  if (metadata.action === 'accept_handoff') {
    return NextResponse.json({
      error: 'Esta passagem precisa ser aceita pelo fluxo do atendimento.',
      requiresHandoff: true,
      leadId: notification.lead_id,
    }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (notification.kind === 'task' && notification.task_id) {
    const { data: task, error: taskError } = await supabase
      .from('lead_tasks')
      .select('id,status,assigned_to,metadata')
      .eq('id', notification.task_id)
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (taskError) return NextResponse.json({ error: taskError.message }, { status: 400 });

    if (task && ['pending', 'overdue'].includes(task.status) && task.assigned_to === user.id) {
      const taskMetadata = task.metadata && typeof task.metadata === 'object'
        ? task.metadata as Record<string, unknown>
        : {};
      const { error: acceptTaskError } = await supabase
        .from('lead_tasks')
        .update({
          accepted_at: now,
          accepted_by: user.id,
          metadata: { ...taskMetadata, notification_accepted_at: now, notification_accepted_by: user.id },
          updated_at: now,
        })
        .eq('id', task.id)
        .eq('assigned_to', user.id);
      if (acceptTaskError) return NextResponse.json({ error: acceptTaskError.message }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from('user_notifications')
    .update({ status: 'resolved', accepted_at: now, resolved_at: now, updated_at: now })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
