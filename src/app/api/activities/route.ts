import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const leadId = String(body.leadId ?? '');
  const title = String(body.title ?? 'Anotação').trim().slice(0, 150);
  const description = String(body.description ?? '').trim().slice(0, 5000);
  if (!leadId || !description) return NextResponse.json({ error: 'Anotação inválida.' }, { status: 400 });
  const { data: lead } = await supabase.from('leads').select('organization_id').eq('id', leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Contato não encontrado.' }, { status: 404 });
  const { data, error } = await supabase.from('activities').insert({ organization_id: lead.organization_id, lead_id: leadId, user_id: user.id, type: 'nota', title, description }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ activity: data });
}
