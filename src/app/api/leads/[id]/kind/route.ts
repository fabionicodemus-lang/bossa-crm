import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    return NextResponse.json({ error: 'Você não possui permissão para classificar contatos.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { kind?: unknown };
  const target = String(body.kind ?? '');
  if (!['cliente', 'corretor'].includes(target)) {
    return NextResponse.json({ error: 'Classificação inválida.' }, { status: 400 });
  }

  const { data: lead, error: readError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (readError || !lead) return NextResponse.json({ error: 'Contato não encontrado.' }, { status: 404 });

  // Cliente é classificação protegida. Depois que alguém é cliente, nenhuma
  // classificação desta rota (nem a IA) pode retirá-lo desse pipeline.
  if (lead.kind === 'cliente') {
    return NextResponse.json({ error: 'Este contato já é cliente e sua classificação é protegida.' }, { status: 409 });
  }
  if (target === 'corretor' && lead.kind !== 'geral') {
    return NextResponse.json({ error: 'Somente contatos gerais podem ser promovidos automaticamente para corretor.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const metadata = {
    ...(lead.metadata || {}),
    contact_kind_manually_confirmed: target,
    contact_kind_manually_confirmed_at: now,
    contact_kind_manually_confirmed_by: user.id,
    contact_kind_routed_from: lead.kind,
    contact_kind_routed_to: target,
  };
  const update = target === 'cliente'
    ? {
        kind: 'cliente',
        stage: 'humano_ativo',
        company: null,
        ai_enabled: false,
        automation_paused: true,
        owner_mode: 'human',
        owner_id: lead.owner_id || user.id,
        metadata,
        updated_at: now,
      }
    : {
        kind: 'corretor',
        stage: 'qualificacao_ia',
        company: lead.company || 'Não informada',
        ai_enabled: true,
        automation_paused: false,
        owner_mode: 'ai',
        owner_id: null,
        metadata,
        updated_at: now,
      };

  const { data: updated, error: updateError } = await supabase
    .from('leads')
    .update(update)
    .eq('id', lead.id)
    .eq('organization_id', membership.organization_id)
    .select('*')
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  await supabase.from('activities').insert({
    organization_id: membership.organization_id,
    lead_id: lead.id,
    user_id: user.id,
    type: 'classificacao_manual_contato',
    title: target === 'cliente' ? 'Contato classificado manualmente como cliente' : 'Contato classificado manualmente como corretor',
    description: target === 'cliente'
      ? 'Classificação manual protegida. O Plantão não poderá alterar este contato para corretor.'
      : 'O contato geral foi confirmado como corretor e seguirá para o Plantão.',
    metadata: { kind_before: lead.kind, kind_after: target },
  });

  return NextResponse.json({ lead: updated });
}
