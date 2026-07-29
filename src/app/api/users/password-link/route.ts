import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Somente administradores podem gerar links de senha.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { email?: unknown };
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('id,email').eq('email', email).maybeSingle();

  if (profile) {
    const { data: targetMembership } = await admin
      .from('memberships')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('user_id', profile.id)
      .maybeSingle();
    if (!targetMembership) {
      return NextResponse.json({ error: 'Este usuário não pertence à sua empresa.' }, { status: 403 });
    }
  } else {
    const { data: pendingInvite } = await admin
      .from('pending_invites')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('email', email)
      .is('accepted_at', null)
      .maybeSingle();
    if (!pendingInvite) {
      return NextResponse.json({ error: 'Usuário ou convite não encontrado nesta empresa.' }, { status: 404 });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const type = profile ? 'recovery' as const : 'invite' as const;
  const { data, error } = await admin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo: `${appUrl}/auth/callback?next=/atualizar-senha` },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const link = data.properties?.action_link;
  if (!link) return NextResponse.json({ error: 'A Supabase não devolveu o link seguro.' }, { status: 500 });

  return NextResponse.json({ link, type });
}
