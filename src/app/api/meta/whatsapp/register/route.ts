import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { channelAccess, findChannelById } from '@/lib/whatsapp/channelService';
import { hashRegistrationPin } from '@/lib/whatsapp/crypto';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem registrar o número.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const channelId = String(body.channelId ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  if (!channelId) return NextResponse.json({ error: 'Canal não informado.' }, { status: 400 });
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'O PIN deve conter exatamente seis dígitos.' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const channel = await findChannelById(admin, membership.organization_id, channelId);
    if (!channel) return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 });

    const { provider, accessToken, phoneNumberId, wabaId } = channelAccess(channel);
    const result = await provider.registerPhone({ phoneNumberId, accessToken, pin });
    if (!result.success) throw new Error('A Meta não confirmou o registro do número.');
    await provider.subscribeWebhook({ wabaId, accessToken });

    const now = new Date().toISOString();
    const { error: channelError } = await admin.from('whatsapp_channels').update({
      status: 'connected',
      registration_pin_hash: hashRegistrationPin(pin),
      registered_at: now,
      app_subscribed_at: now,
      last_tested_at: now,
    }).eq('id', channel.id);
    if (channelError) throw channelError;

    if (channel.legacy_connection_id) {
      const { error: legacyError } = await admin.from('whatsapp_connections').update({
        status: 'connected',
        connected_at: now,
        updated_at: now,
      }).eq('id', channel.legacy_connection_id);
      if (legacyError) throw legacyError;
    }

    return NextResponse.json({
      ok: true,
      status: 'connected',
      registeredAt: now,
      message: 'Número registrado e pronto para enviar mensagens pela Cloud API.',
    });
  } catch (error) {
    console.error('[whatsapp register]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Não foi possível registrar o número.',
    }, { status: 400 });
  }
}
