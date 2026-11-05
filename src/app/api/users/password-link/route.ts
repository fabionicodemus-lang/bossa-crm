import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmAccountOrigin, globalAccountManagementScope } from '@/lib/security/crm-user-access';

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
  const { data: profile, error: profileError } = await admin.from('profiles').select('id,email').eq('email', email).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Não foi possível verificar as permissões desta conta.' }, { status: 503 });

  if (profile) {
    const scope = await globalAccountManagementScope(admin, membership.organization_id, profile.id);
    if (scope === 'unavailable') {
      return NextResponse.json({ error: 'Não foi possível verificar as permissões desta conta.' }, { status: 503 });
    }
    if (scope !== 'allowed') {
      return NextResponse.json({ error: 'Esta conta não pode ter um link de senha emitido por esta empresa. O titular deve usar “Esqueci minha senha”.' }, { status: 403 });
    }
    // Profile fields are editable. The account's verified Auth identity determines
    // which email may receive a global recovery token for this scoped user ID.
    const { data: authAccount, error: authAccountError } = await admin.auth.admin.getUserById(profile.id);
    if (authAccountError || !authAccount.user) {
      return NextResponse.json({ error: 'Não foi possível verificar a identidade desta conta.' }, { status: 503 });
    }
    if (authAccount.user.email?.trim().toLowerCase() !== email) {
      return NextResponse.json({ error: 'O e-mail cadastrado não corresponde à conta de acesso. O titular deve usar “Esqueci minha senha”.' }, { status: 403 });
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

  const type = profile ? 'recovery' as const : 'invite' as const;
  const { data, error } = await admin.auth.admin.generateLink({ type, email });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Check the actual identity returned by Auth, including pending invitations.
  // An editable profile or an invitation row alone cannot authorize a global token.
  const generatedUser = data.user;
  if (!generatedUser?.id || generatedUser.email?.trim().toLowerCase() !== email
    || (profile && generatedUser.id !== profile.id)) {
    return NextResponse.json({ error: 'Não foi possível confirmar o destinatário do link de senha.' }, { status: 403 });
  }
  const generatedScope = await globalAccountManagementScope(admin, membership.organization_id, generatedUser.id);
  if (generatedScope === 'unavailable') {
    return NextResponse.json({ error: 'Não foi possível verificar as permissões desta conta.' }, { status: 503 });
  }
  if (generatedScope !== 'allowed') {
    return NextResponse.json({ error: 'Esta conta não pode ter um link de senha emitido por esta empresa. O titular deve usar “Esqueci minha senha”.' }, { status: 403 });
  }

  const properties = data.properties as { hashed_token?: string } | undefined;
  const tokenHash = properties?.hashed_token;
  if (!tokenHash) {
    return NextResponse.json({ error: 'A Supabase não devolveu o token seguro para gerar o link.' }, { status: 500 });
  }

  const callbackUrl = new URL('/auth/callback', crmAccountOrigin());
  callbackUrl.searchParams.set('token_hash', tokenHash);
  callbackUrl.searchParams.set('type', type);
  callbackUrl.searchParams.set('next', '/atualizar-senha');

  return NextResponse.json({ link: callbackUrl.toString(), type });
}
