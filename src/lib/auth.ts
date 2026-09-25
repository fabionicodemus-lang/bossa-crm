import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserContext } from '@/lib/types';

interface MembershipRow {
  role: UserContext['role'];
  organizations: { id: string; name: string; slug: string } | null;
}

type ContextLookup =
  | { status: 'ok'; context: UserContext }
  | { status: 'no_user' }
  | { status: 'no_membership' };

// Executa uma única vez por requisição: layout, página e componentes da mesma
// tela compartilham o resultado em vez de repetir as consultas de login.
const loadCurrentContext = cache(async (): Promise<ContextLookup> => {
  const supabase = await createClient();
  // getClaims valida a assinatura do token de sessão. Com chaves assimétricas a
  // validação é local (sem ida ao servidor de autenticação); com chaves antigas,
  // o próprio Supabase consulta o servidor, como o getUser fazia.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsError ? null : claimsData?.claims;
  const userId = typeof claims?.sub === 'string' ? claims.sub : null;
  if (!userId) return { status: 'no_user' };

  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from('memberships')
      .select('role, organizations(id,name,slug)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  const membership = data as MembershipRow | null;
  if (!membership?.organizations) return { status: 'no_membership' };

  const email = typeof claims?.email === 'string' ? claims.email : '';
  const metadata = (claims?.user_metadata ?? {}) as { full_name?: unknown };
  const metadataName = typeof metadata.full_name === 'string' ? metadata.full_name : '';

  return {
    status: 'ok',
    context: {
      userId,
      email,
      fullName: profile?.full_name || metadataName || email.split('@')[0] || 'Usuário',
      organization: membership.organizations,
      role: membership.role,
    },
  };
});

export async function getCurrentContext(options: { redirectIfMissing?: boolean } = {}): Promise<UserContext | null> {
  const lookup = await loadCurrentContext();
  if (lookup.status === 'ok') return lookup.context;
  if (options.redirectIfMissing !== false) redirect(lookup.status === 'no_user' ? '/login' : '/onboarding');
  return null;
}

export async function requireAdmin() {
  const context = await getCurrentContext();
  if (!context || context.role !== 'admin') redirect('/dashboard');
  return context;
}
