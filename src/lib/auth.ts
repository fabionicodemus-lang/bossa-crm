import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserContext } from '@/lib/types';

interface MembershipRow {
  role: UserContext['role'];
  organizations: { id: string; name: string; slug: string } | null;
}

export async function getCurrentContext(options: { redirectIfMissing?: boolean } = {}): Promise<UserContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (options.redirectIfMissing !== false) redirect('/login');
    return null;
  }

  const { data } = await supabase
    .from('memberships')
    .select('role, organizations(id,name,slug)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const membership = data as MembershipRow | null;
  if (!membership?.organizations) {
    if (options.redirectIfMissing !== false) redirect('/onboarding');
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário',
    organization: membership.organizations,
    role: membership.role,
  };
}

export async function requireAdmin() {
  const context = await getCurrentContext();
  if (!context || context.role !== 'admin') redirect('/dashboard');
  return context;
}
