import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Confirmacao explicita, sem envios: somente apos parar o ChatGPT externo. */
export async function POST(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  if (context.role === 'viewer') return NextResponse.json({ error: 'Permissão de edição necessária.' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const campaignId = String(body.campaignId ?? '');
  if (!UUID.test(campaignId) || body.confirmedChatGPTStopped !== true) {
    return NextResponse.json({ error: 'Confirme que interrompeu o ChatGPT e identifique a campanha correta.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('browser_campaign_freeze_for_api', { p_campaign_id: campaignId });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  if (data !== true) return NextResponse.json({ error: 'Não foi possível congelar a execução.' }, { status: 409 });
  return NextResponse.json({ frozen: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
