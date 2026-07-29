import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function resolveAppOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host') || requestUrl.host;
  const protocol = forwardedProto || requestUrl.protocol.replace(':', '') || 'https';

  try {
    const requestOrigin = new URL(`${protocol}://${host}`);
    if (!isLocalHostname(requestOrigin.hostname)) return requestOrigin.origin;
  } catch {
    // Tenta a URL configurada abaixo.
  }

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    try {
      const configuredOrigin = new URL(configuredUrl);
      if (!isLocalHostname(configuredOrigin.hostname)) return configuredOrigin.origin;
    } catch {
      // Usa o domínio público de produção como último recurso.
    }
  }

  return 'https://bossa-crm-phi.vercel.app';
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

  const type = profile ? 'recovery' as const : 'invite' as const;
  const { data, error } = await admin.auth.admin.generateLink({ type, email });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const properties = data.properties as { hashed_token?: string } | undefined;
  const tokenHash = properties?.hashed_token;
  if (!tokenHash) {
    return NextResponse.json({ error: 'A Supabase não devolveu o token seguro para gerar o link.' }, { status: 500 });
  }

  const callbackUrl = new URL('/auth/callback', resolveAppOrigin(request));
  callbackUrl.searchParams.set('token_hash', tokenHash);
  callbackUrl.searchParams.set('type', type);
  callbackUrl.searchParams.set('next', '/atualizar-senha');

  return NextResponse.json({ link: callbackUrl.toString(), type });
}
