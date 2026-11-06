import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context || context.role === 'viewer')
    return NextResponse.json({ error: 'Permissão insuficiente.' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const campaignId = String(body.campaignId ?? '');
  const recipientId = String(body.recipientId ?? '');
  const resolution = String(body.resolution ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !/^[0-9a-f-]{36}$/i.test(recipientId)
    || !['sent', 'skipped'].includes(resolution))
    return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: campaign } = await admin.from('browser_campaigns').select('id,status')
    .eq('id', campaignId).eq('organization_id', context.organization.id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
  const { data: row, error } = await admin.from('browser_campaign_recipients')
    .update({ status: resolution, detail: `Conferido manualmente por ${context.fullName}.`, finished_at: new Date().toISOString() })
    .eq('id', recipientId).eq('campaign_id', campaignId).eq('organization_id', context.organization.id)
    .eq('status', 'uncertain').select('id,next_item_index').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!row) return NextResponse.json({ error: 'Este destinatário já foi conferido.' }, { status: 409 });
  await admin.from('browser_campaign_events').insert({
    organization_id: context.organization.id, campaign_id: campaignId,
    recipient_id: recipientId, operator_id: context.userId,
    item_index: row.next_item_index,
    result: resolution === 'sent' ? 'reconciled_sent' : 'reconciled_skipped',
    detail: 'Conferência manual no WhatsApp Web.',
  });
  const { count } = await admin.from('browser_campaign_recipients').select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).in('status', ['queued', 'claimed', 'uncertain']);
  if (count === 0 && ['running', 'paused'].includes(campaign.status))
    await admin.from('browser_campaigns').update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaignId).eq('organization_id', context.organization.id)
      .in('status', ['running', 'paused']);
  return NextResponse.json({ status: resolution });
}
