import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type LeadKind = 'cliente' | 'corretor';

const SEARCH_COLUMNS = ['name', 'phone', 'enterprise', 'company', 'group_name'] as const;
const FINAL_RESULT_LIMIT = 40;

export async function GET(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') as LeadKind | null;
  const query = searchParams.get('q')?.trim().slice(0, 100) ?? '';

  if (!kind || !['cliente', 'corretor'].includes(kind)) {
    return NextResponse.json({ error: 'Tipo de lead inválido.' }, { status: 400 });
  }
  if (query.length < 2) return NextResponse.json({ leads: [] });

  const safeQuery = query.replace(/[,%()]/g, ' ').trim();
  if (safeQuery.length < 2) return NextResponse.json({ leads: [] });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('id,kind,name,phone,enterprise,company,group_name')
    .eq('organization_id', context.organization.id)
    .eq('kind', kind)
    .is('archived_at', null)
    .or(SEARCH_COLUMNS.map((column) => `${column}.ilike.%${safeQuery}%`).join(','))
    .order('name')
    .limit(FINAL_RESULT_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ leads: data ?? [] }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
