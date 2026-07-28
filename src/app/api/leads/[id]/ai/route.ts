import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);
  const { data: lead } = await supabase.from('leads').select('id,organization_id,kind,stage').eq('id', id).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });

  if (enabled && lead.kind === 'cliente' && lead.stage !== 'ia') {
    return NextResponse.json({ error: 'A Nara só pode ser ativada na etapa IA Atendendo.' }, { status: 400 });
  }
  if (enabled && lead.kind === 'corretor' && ['n4', 'n5'].includes(lead.stage)) {
    return NextResponse.json({ error: 'O Plantão fica pausado em Negociando e Parceiro Bossa.' }, { status: 400 });
  }

  const { error } = await supabase.from('leads').update({ ai_enabled: enabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const persona = lead.kind === 'cliente' ? 'Nara' : 'Plantão';
  await supabase.from('activities').insert({
    organization_id: lead.organization_id,
    lead_id: id,
    user_id: user.id,
    type: 'ia',
    title: enabled ? `${persona} ativado` : 'Conversa assumida pelo comercial',
    description: enabled ? `${persona} voltou a responder este contato.` : 'A IA foi pausada para evitar respostas duplicadas.',
  });
  return NextResponse.json({ ok: true });
}
