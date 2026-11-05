import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { globalAccountManagementScope } from '@/lib/security/crm-user-access';

const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 72;

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
    return NextResponse.json({ error: 'Somente administradores podem redefinir senhas.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { userId?: unknown; password?: unknown };
  const targetUserId = String(body.userId ?? '').trim();
  const password = String(body.password ?? '');

  if (!targetUserId) {
    return NextResponse.json({ error: 'Usuário inválido.' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` }, { status: 400 });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `A senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.` }, { status: 400 });
  }

  const admin = createAdminClient();
  const scope = await globalAccountManagementScope(admin, membership.organization_id, targetUserId);
  if (scope === 'unavailable') {
    return NextResponse.json({ error: 'Não foi possível verificar as permissões desta conta.' }, { status: 503 });
  }
  if (scope !== 'allowed') {
    return NextResponse.json({ error: 'Esta conta não pode ter a senha alterada por esta empresa. O titular deve usar “Esqueci minha senha”.' }, { status: 403 });
  }
  const { error } = await admin.auth.admin.updateUserById(targetUserId, { password });

  if (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível redefinir a senha.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
