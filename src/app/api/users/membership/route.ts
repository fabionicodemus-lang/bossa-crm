import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function adminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 }) } as const;
  const { data: membership } = await supabase.from('memberships').select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== 'admin') return { error: NextResponse.json({ error: 'Apenas administradores podem alterar usuários.' }, { status: 403 }) } as const;
  return { supabase, user, organizationId: membership.organization_id } as const;
}

async function ensureAdminRemains(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string, targetId: string) {
  const { data: target } = await supabase.from('memberships').select('role').eq('id', targetId).eq('organization_id', organizationId).maybeSingle();
  if (!target) return { ok: false, error: 'Vínculo não encontrado.' };
  if (target.role !== 'admin') return { ok: true };
  const { count } = await supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('role', 'admin');
  if ((count ?? 0) <= 1) return { ok: false, error: 'A empresa precisa manter pelo menos um administrador.' };
  return { ok: true };
}

export async function PATCH(request: Request) {
  const context = await adminContext();
  if ('error' in context) return context.error;
  const body = await request.json().catch(() => ({}));
  const membershipId = String(body.membershipId ?? '');
  const role = ['admin', 'comercial', 'viewer'].includes(body.role) ? body.role : null;
  if (!membershipId || !role) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  if (role !== 'admin') {
    const validation = await ensureAdminRemains(context.supabase, context.organizationId, membershipId);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 409 });
  }
  const { error } = await context.supabase.from('memberships').update({ role }).eq('id', membershipId).eq('organization_id', context.organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await adminContext();
  if ('error' in context) return context.error;
  const body = await request.json().catch(() => ({}));
  const membershipId = String(body.membershipId ?? '');
  if (!membershipId) return NextResponse.json({ error: 'Vínculo inválido.' }, { status: 400 });
  const { data: target } = await context.supabase.from('memberships').select('user_id').eq('id', membershipId).eq('organization_id', context.organizationId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Vínculo não encontrado.' }, { status: 404 });
  if (target.user_id === context.user.id) return NextResponse.json({ error: 'Você não pode remover o próprio acesso.' }, { status: 409 });
  const validation = await ensureAdminRemains(context.supabase, context.organizationId, membershipId);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 409 });
  const { error } = await context.supabase.from('memberships').delete().eq('id', membershipId).eq('organization_id', context.organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
