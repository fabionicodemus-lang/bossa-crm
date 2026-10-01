import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para pausar transmissões.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: broadcast, error } = await admin.from('broadcasts')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .in('status', ['ready','running'])
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!broadcast) {
    const { data: existing } = await admin.from('broadcasts')
      .select('id,status')
      .eq('id', id)
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Transmissão não encontrada.' }, { status: 404 });
    return NextResponse.json({ broadcast: existing, paused: existing.status === 'paused' });
  }

  return NextResponse.json({ broadcast, paused: true });
}
