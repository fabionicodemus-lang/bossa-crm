import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAiStage, isHumanStage } from '@/lib/stages';

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

async function loadContext(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 }) } as const;

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: NextResponse.json({ error: 'Usuário sem acesso à organização.' }, { status: 403 }) } as const;

  const { data: lead, error: findError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();

  if (findError || !lead) return { error: NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 }) } as const;

  return { supabase, user, membership, lead } as const;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await loadContext(id);
  if ('error' in context) return context.error;
  const { supabase, user, membership, lead } = context;

  if (membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para arquivar ou restaurar leads.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { action?: unknown; reason?: unknown };
  const action = String(body.action ?? '');

  if (action === 'archive') {
    if (lead.archived_at) return NextResponse.json({ ok: true, lead });
    const now = new Date().toISOString();
    const reason = String(body.reason ?? '').trim() || null;
    const { data: updated, error } = await supabase
      .from('leads')
      .update({
        archived_at: now,
        archived_by: user.id,
        archived_reason: reason,
        owner_mode: 'none',
        ai_enabled: false,
        automation_paused: true,
        next_action: null,
        next_action_type: null,
        next_action_due_at: null,
      })
      .eq('id', id)
      .eq('organization_id', membership.organization_id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await Promise.all([
      supabase.from('lead_tasks').update({ status: 'cancelled' }).eq('lead_id', id).in('status', ['pending', 'overdue']),
      supabase.from('lead_handoffs').update({ status: 'cancelled' }).eq('lead_id', id).eq('status', 'pending'),
      supabase.from('activities').insert({
        organization_id: membership.organization_id,
        lead_id: id,
        user_id: user.id,
        type: 'arquivamento',
        title: 'Lead arquivado',
        description: reason || 'Contato retirado das pipelines ativas.',
        metadata: { archived_at: now, archived_by: user.id },
      }),
    ]);

    return NextResponse.json({ ok: true, lead: updated });
  }

  if (action === 'restore') {
    const ownerMode = isAiStage(lead.stage) ? 'ai' : isHumanStage(lead.stage) ? 'human' : 'none';
    const aiEnabled = ownerMode === 'ai' && !lead.opt_out;
    const { data: updated, error } = await supabase
      .from('leads')
      .update({
        archived_at: null,
        archived_by: null,
        archived_reason: null,
        owner_mode: ownerMode,
        ai_enabled: aiEnabled,
        automation_paused: false,
      })
      .eq('id', id)
      .eq('organization_id', membership.organization_id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from('activities').insert({
      organization_id: membership.organization_id,
      lead_id: id,
      user_id: user.id,
      type: 'restauracao',
      title: 'Lead restaurado',
      description: 'Contato devolvido à operação ativa.',
      metadata: { restored_by: user.id },
    });

    return NextResponse.json({ ok: true, lead: updated });
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await loadContext(id);
  if ('error' in context) return context.error;
  const { supabase, membership, lead } = context;

  if (membership.role !== 'admin') {
    return NextResponse.json({ error: 'Somente administradores podem excluir leads permanentemente.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { confirmName?: unknown };
  const confirmName = String(body.confirmName ?? '');
  if (!confirmName || normalizedName(confirmName) !== normalizedName(lead.name)) {
    return NextResponse.json({ error: 'Digite exatamente o nome do lead para confirmar a exclusão.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)
    .eq('organization_id', membership.organization_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
