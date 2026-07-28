import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stagesFor } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const stage = String(body.stage ?? '');
  const { data: lead, error: findError } = await supabase.from('leads').select('id,kind,stage,ai_enabled').eq('id', id).maybeSingle();
  if (findError || !lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

  const valid = stagesFor(lead.kind as LeadKind).some((item) => item.id === stage);
  if (!valid) return NextResponse.json({ error: 'Etapa inválida.' }, { status: 400 });

  const aiEnabled = lead.kind === 'cliente'
    ? stage === 'ia'
    : lead.ai_enabled && !['n4', 'n5'].includes(stage);
  const { error } = await supabase.from('leads').update({ stage, ai_enabled: aiEnabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
