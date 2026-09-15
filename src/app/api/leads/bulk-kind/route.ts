import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { LeadKind } from '@/lib/types';

const VALID_KINDS = new Set<LeadKind>(['cliente', 'corretor', 'geral']);

function targetState(kind: LeadKind, currentOwnerId: string | null, actorId: string) {
  if (kind === 'corretor') {
    return {
      stage: 'qualificacao_ia',
      ai_enabled: true,
      automation_paused: false,
      owner_mode: 'ai',
      owner_id: null,
      priority_class: null,
      temperature: 0,
    };
  }
  if (kind === 'cliente') {
    return {
      stage: 'humano_ativo',
      ai_enabled: false,
      automation_paused: true,
      owner_mode: 'human',
      owner_id: currentOwnerId || actorId,
      priority_class: null,
      temperature: 0,
    };
  }
  return {
    stage: 'novo_triagem',
    ai_enabled: false,
    automation_paused: true,
    owner_mode: 'human',
    owner_id: currentOwnerId || actorId,
    priority_class: null,
    temperature: 0,
  };
}

export async function POST(request: Request) {
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
    return NextResponse.json({ error: 'Você não possui permissão para transferir contatos.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { ids?: unknown; kind?: unknown };
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((value) => String(value)).filter(Boolean))]
    : [];
  const target = String(body.kind ?? '') as LeadKind;

  if (!VALID_KINDS.has(target)) {
    return NextResponse.json({ error: 'Pipeline de destino inválida.' }, { status: 400 });
  }
  if (!ids.length) return NextResponse.json({ error: 'Selecione pelo menos um contato.' }, { status: 400 });
  if (ids.length > 300) return NextResponse.json({ error: 'Selecione no máximo 300 contatos por vez.' }, { status: 400 });

  const { data: leads, error: readError } = await supabase
    .from('leads')
    .select('id,kind,name,owner_id,metadata')
    .eq('organization_id', membership.organization_id)
    .in('id', ids)
    .is('archived_at', null);
  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });

  const rows = leads ?? [];
  const selectedCustomers = rows.filter((lead) => lead.kind === 'cliente' && target !== 'cliente');
  if (selectedCustomers.length) {
    return NextResponse.json({
      error: 'Clientes são protegidos e não podem sair do pipeline em massa. Essa regra evita que um cliente que já comprou seja reclassificado por engano.',
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  let updated = 0;
  const errors: string[] = [];

  for (const lead of rows) {
    if (lead.kind === target) continue;
    const metadata = {
      ...((lead.metadata && typeof lead.metadata === 'object') ? lead.metadata as Record<string, unknown> : {}),
      contact_kind_manually_confirmed: target,
      contact_kind_manually_confirmed_at: now,
      contact_kind_manually_confirmed_by: user.id,
      contact_kind_routed_from: lead.kind,
      contact_kind_routed_to: target,
      bulk_pipeline_transfer: true,
    };
    const update = {
      kind: target,
      ...targetState(target, lead.owner_id, user.id),
      company: target === 'corretor' ? undefined : undefined,
      ai_classification: null,
      ai_summary: null,
      ai_next_action: null,
      ai_last_classified_at: null,
      next_action: null,
      next_action_type: null,
      next_action_due_at: null,
      reactivation_at: null,
      handoff_requested_at: null,
      metadata,
      updated_at: now,
    } as Record<string, unknown>;

    if (target === 'corretor') {
      const { data: current } = await supabase.from('leads').select('company').eq('id', lead.id).maybeSingle();
      update.company = current?.company || 'Não informada';
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(update)
      .eq('id', lead.id)
      .eq('organization_id', membership.organization_id);
    if (updateError) {
      errors.push(`${lead.name || lead.id}: ${updateError.message}`);
      continue;
    }

    await Promise.all([
      supabase.from('lead_handoffs').update({ status: 'cancelled' }).eq('lead_id', lead.id).eq('status', 'pending'),
      supabase.from('lead_tasks').update({ status: 'cancelled', completed_at: now }).eq('lead_id', lead.id).eq('status', 'pending'),
      supabase.from('activities').insert({
        organization_id: membership.organization_id,
        lead_id: lead.id,
        user_id: user.id,
        type: 'transferencia_pipeline_manual',
        title: 'Pipeline alterada manualmente',
        description: `Contato transferido manualmente de ${lead.kind} para ${target}.`,
        metadata: { kind_before: lead.kind, kind_after: target, bulk: true },
      }),
    ]);
    updated++;
  }

  if (errors.length && updated === 0) {
    return NextResponse.json({ error: errors.slice(0, 5).join(' | ') }, { status: 400 });
  }

  return NextResponse.json({
    updated,
    skipped: rows.length - updated,
    errors: errors.slice(0, 10),
    message: `${updated} ${updated === 1 ? 'contato transferido' : 'contatos transferidos'} para ${target}.`,
  });
}
