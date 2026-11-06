import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context || context.role === 'viewer')
    return NextResponse.json({ error: 'Acesso de operador necessário.' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const campaignId = String(body.campaignId ?? '');
  const workerId = String(body.workerId ?? '');
  const action = String(body.action ?? '');
  if (!UUID.test(campaignId) || !UUID.test(workerId))
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 400 });
  const supabase = await createClient();
  try {
    if (action === 'claim') {
      const { data, error } = await supabase.rpc('browser_campaign_claim', {
        p_campaign_id: campaignId, p_worker_id: workerId,
      });
      if (error) throw error;
      return NextResponse.json({ recipient: data?.[0] ?? null });
    }
    if (action === 'release-sender') {
      const { data, error } = await supabase.rpc('browser_campaign_release_sender', {
        p_campaign_id: campaignId,
      });
      if (error) throw error;
      return NextResponse.json({ released: data === true });
    }
    const recipientId = String(body.recipientId ?? '');
    if (!UUID.test(recipientId)) return NextResponse.json({ error: 'Destinatário inválido.' }, { status: 400 });
    if (action === 'heartbeat') {
      const { data, error } = await supabase.rpc('browser_campaign_heartbeat', {
        p_campaign_id: campaignId, p_worker_id: workerId, p_recipient_id: recipientId,
      });
      if (error) throw error;
      return NextResponse.json({ active: data === true });
    }
    if (action === 'ack') {
      const index = Number(body.itemIndex);
      const result = String(body.result ?? '');
      if (!Number.isInteger(index) || index < 0 || !['observed', 'uncertain', 'skipped'].includes(result))
        return NextResponse.json({ error: 'Confirmação inválida.' }, { status: 400 });
      const { data, error } = await supabase.rpc('browser_campaign_ack', {
        p_campaign_id: campaignId, p_worker_id: workerId, p_recipient_id: recipientId,
        p_item_index: index, p_result: result, p_detail: String(body.detail ?? '').slice(0, 500),
      });
      if (error) throw error;
      return NextResponse.json({ status: data });
    }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Falha de comunicação com a fila.' }, { status: 409 });
  }
}
