import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmAccountOrigin } from '@/lib/security/crm-user-access';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const { data: membership } = await supabase.from('memberships').select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== 'admin') return NextResponse.json({ error: 'Apenas administradores podem convidar usuários.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = ['admin', 'comercial', 'viewer'].includes(body.role) ? body.role : 'comercial';
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: existingProfile, error: profileError } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Não foi possível verificar o convite.' }, { status: 503 });
  if (existingProfile) {
    const { data: existingMembership, error: membershipError } = await admin.from('memberships')
      .select('id').eq('organization_id', membership.organization_id)
      .eq('user_id', existingProfile.id).maybeSingle();
    if (membershipError) return NextResponse.json({ error: 'Não foi possível verificar o convite.' }, { status: 503 });
    if (!existingMembership) {
      // Knowing an email address is not consent to attach an existing identity.
      // A tenant admin must not gain password-reset rights over another account.
      return NextResponse.json({ error: 'Este e-mail já possui cadastro. O acesso deve ser vinculado pelo titular da conta.' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Este usuário já possui acesso à empresa. Altere a permissão na lista de usuários.' });
  }

  const { error: inviteDbError } = await admin.from('pending_invites').upsert({ organization_id: membership.organization_id, email, role, invited_by: user.id }, { onConflict: 'organization_id,email' });
  if (inviteDbError) return NextResponse.json({ error: inviteDbError.message }, { status: 400 });

  const appUrl = crmAccountOrigin();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/atualizar-senha`,
    data: { organization_id: membership.organization_id, invited_role: role },
  });
  if (inviteError) {
    await admin.from('pending_invites').delete().eq('organization_id', membership.organization_id).eq('email', email).is('accepted_at', null);
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  return NextResponse.json({ message: 'Convite enviado por e-mail.' });
}
