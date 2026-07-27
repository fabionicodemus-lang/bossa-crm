import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);
  const { data: lead } = await supabase.from('leads').select('id,kind,stage').eq('id', id).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });
  if (enabled && lead.kind === 'cliente' && lead.stage !== 'ia') return NextResponse.json({ error: 'A IA só pode ser ativada na etapa IA Atendendo.' }, { status: 400 });
  if (enabled && lead.kind === 'cliente' && lead.stage === 'fechado') return NextResponse.json({ error: 'Clientes fechados não podem voltar ao atendimento da IA.' }, { status: 400 });
  const { error } = await supabase.from('leads').update({ ai_enabled: enabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from('activities').insert({
    organization_id: (await supabase.from('leads').select('organization_id').eq('id', id).single()).data?.organization_id,
    lead_id: id,
    user_id: user.id,
    type: 'ia',
    title: enabled ? 'Atendimento por IA ativado' : 'Conversa assumida pelo comercial',
    description: enabled ? 'A automação voltou a responder este contato.' : 'A IA foi pausada para evitar respostas duplicadas.',
  });
  return NextResponse.json({ ok: true });
}
