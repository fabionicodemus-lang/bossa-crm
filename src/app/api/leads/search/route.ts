import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type LeadKind = 'cliente' | 'corretor';

type LeadSearchRow = {
  id: string;
  kind: LeadKind;
  name: string;
  phone: string | null;
  enterprise: string | null;
  company: string | null;
  group_name: string | null;
};

const SEARCH_COLUMNS = ['name', 'phone', 'enterprise', 'company', 'group_name'] as const;
const RESULT_LIMIT_PER_COLUMN = 25;
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

  const supabase = await createClient();
  const searches = await Promise.all(SEARCH_COLUMNS.map((column) => supabase
    .from('leads')
    .select('id,kind,name,phone,enterprise,company,group_name')
    .eq('organization_id', context.organization.id)
    .eq('kind', kind)
    .is('archived_at', null)
    .ilike(column, `%${query}%`)
    .order('name')
    .limit(RESULT_LIMIT_PER_COLUMN)));

  const failedSearch = searches.find((result) => result.error);
  if (failedSearch?.error) {
    return NextResponse.json({ error: failedSearch.error.message }, { status: 400 });
  }

  const uniqueLeads = new Map<string, LeadSearchRow>();
  for (const result of searches) {
    for (const lead of (result.data ?? []) as LeadSearchRow[]) uniqueLeads.set(lead.id, lead);
  }

  const leads = [...uniqueLeads.values()]
    .sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'))
    .slice(0, FINAL_RESULT_LIMIT);

  return NextResponse.json({ leads }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
