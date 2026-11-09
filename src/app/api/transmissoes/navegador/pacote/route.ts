import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { phoneMatchVariants } from '@/lib/whatsapp/utils';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Congela uma lista única para o ChatGPT, com exclusão mútua por remetente. */
export async function POST(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context || context.role === 'viewer')
    return NextResponse.json({ error: 'Acesso de operador necessário.' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const campaignId = String(body.campaignId ?? '');
  if (!UUID.test(campaignId))
    return NextResponse.json({ error: 'Campanha inválida.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: campaign, error: campaignError } = await admin.from('browser_campaigns')
    .select('id,status,sender_phone').eq('id', campaignId)
    .eq('organization_id', context.organization.id).maybeSingle();
  if (campaignError) return NextResponse.json({ error: 'Falha ao consultar campanha.' }, { status: 500 });
  if (!campaign || campaign.status !== 'running')
    return NextResponse.json({ error: 'Libere a campanha antes de copiar a instrução.' }, { status: 409 });

  const variants = phoneMatchVariants(campaign.sender_phone);
  const { data: channels, error: channelError } = await admin.from('whatsapp_channels')
    .select('id,display_phone_number').eq('organization_id', context.organization.id)
    .eq('status', 'connected');
  if (channelError) return NextResponse.json({ error: 'Falha ao verificar a integração.' }, { status: 500 });
  const matches = (channels ?? []).filter((channel) => {
    const phones = phoneMatchVariants(channel.display_phone_number);
    return variants.some((phone) => phones.includes(phone));
  });
  if (matches.length !== 1) return NextResponse.json({
    error: matches.length === 0
      ? 'Esse remetente não está integrado para acompanhamento automático. Selecione o número comercial conectado ou use o modo antigo de teste.'
      : 'Mais de um canal corresponde ao remetente. Revise o cadastro antes de enviar.',
  }, { status: 409 });

  // Estar conectado à Cloud API, sozinho, não demonstra que o canal envia ecos
  // de mensagens do aplicativo/WhatsApp Web. Exigir evidência real recente.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: echoProof, error: echoError } = await admin.from('whatsapp_messages')
    .select('id').eq('organization_id', context.organization.id)
    .eq('channel_id', matches[0].id).eq('direction', 'out')
    .contains('payload', { source: 'whatsapp_business_app' })
    .gte('created_at', since).limit(1);
  if (echoError) return NextResponse.json({ error: 'Falha ao verificar os registros de saída.' }, { status: 500 });
  if (!echoProof?.length) return NextResponse.json({
    error: 'Esse canal está conectado, mas ainda não há registros recentes de envios feitos pelo WhatsApp Business. Valide dois contatos no modo antigo antes de usar o acompanhamento independente.',
  }, { status: 409 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('browser_campaign_prepare_standalone', {
    p_campaign_id: campaignId,
    p_channel_id: matches[0].id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** Não desliga o WhatsApp: exige que o operador já tenha parado o ChatGPT. */
export async function PATCH(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context || context.role === 'viewer')
    return NextResponse.json({ error: 'Acesso de operador necessário.' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const campaignId = String(body.campaignId ?? '');
  if (!UUID.test(campaignId) || body.confirmedChatGPTStopped !== true)
    return NextResponse.json({ error: 'Confirme que interrompeu o ChatGPT.' }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('browser_campaign_stop_standalone', {
    p_campaign_id: campaignId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ stopped: data === true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
