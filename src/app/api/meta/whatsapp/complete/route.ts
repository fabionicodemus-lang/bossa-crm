import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getChannelProvider,
  legacyChannelForRole,
} from '@/lib/whatsapp/channelService';
import type { WhatsAppChannelRole } from '@/lib/whatsapp/channelProvider';
import { encryptToken } from '@/lib/whatsapp/crypto';
import { exchangeEmbeddedSignupCode } from '@/lib/whatsapp/providers/metaCloud';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.FEATURE_EMBEDDED_SIGNUP === 'false') {
    return NextResponse.json({
      error: 'A Coexistência do WhatsApp está desativada no servidor.',
    }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id,role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores podem conectar o WhatsApp.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const legacyChannel = body.channel === 'corretores'
      ? 'corretores'
      : body.channel === 'clientes'
        ? 'clientes'
        : null;
    const role: WhatsAppChannelRole | null = legacyChannel === 'clientes'
      ? 'cliente'
      : legacyChannel === 'corretores'
        ? 'corretor'
        : null;
    const code = String(body.code ?? '').trim();
    const wabaId = String(body.wabaId ?? '').trim();
    const phoneNumberId = String(body.phoneNumberId ?? '').trim();
    const businessId = String(body.businessId ?? '').trim() || null;

    if (!legacyChannel || !role || !code || !wabaId || !phoneNumberId) {
      return NextResponse.json({ error: 'Dados incompletos devolvidos pela Meta.' }, { status: 400 });
    }

    const accessToken = await exchangeEmbeddedSignupCode(code);
    const provider = getChannelProvider('meta_cloud');
    const validation = await provider.testConnection({ wabaId, phoneNumberId, accessToken });
    if (!validation.belongsToWaba) {
      throw new Error('O número devolvido pela Meta não pertence à conta do WhatsApp selecionada.');
    }
    await provider.subscribeWebhook({ wabaId, accessToken });

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const encrypted = encryptToken(accessToken);

    const { data: legacy, error: legacyError } = await admin
      .from('whatsapp_connections')
      .upsert({
        organization_id: membership.organization_id,
        channel: legacyChannel,
        business_id: businessId,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: validation.phone.displayPhoneNumber,
        verified_name: validation.phone.verifiedName,
        quality_rating: validation.phone.qualityRating,
        encrypted_access_token: encrypted,
        status: 'connected',
        connected_at: now,
        updated_at: now,
      }, { onConflict: 'organization_id,channel' })
      .select('id,channel,display_phone_number,verified_name,quality_rating,status,connected_at')
      .single();
    if (legacyError) throw legacyError;

    const { data: existing, error: existingError } = await admin
      .from('whatsapp_channels')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('role', role)
      .maybeSingle();
    if (existingError) throw existingError;

    const channelValues = {
      organization_id: membership.organization_id,
      label: role === 'cliente' ? 'Clientes finais · Nara' : 'Corretores · Plantão',
      role,
      provider: 'meta_cloud',
      connection_mode: 'coexistence',
      business_id: businessId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: validation.phone.displayPhoneNumber,
      verified_name: validation.phone.verifiedName,
      quality_rating: validation.phone.qualityRating,
      token_encrypted: encrypted,
      status: 'connected',
      messaging_limit: validation.phone.messagingLimit,
      registration_pin_hash: null,
      registered_at: now,
      app_subscribed_at: now,
      last_tested_at: now,
      legacy_connection_id: legacy.id,
    };

    const write = existing
      ? admin.from('whatsapp_channels').update(channelValues).eq('id', existing.id)
      : admin.from('whatsapp_channels').insert({ id: legacy.id, ...channelValues });
    const { error: channelError } = await write;
    if (channelError) throw channelError;

    return NextResponse.json({
      connection: legacy,
      mode: 'coexistence',
      message: 'WhatsApp conectado ao CRM sem sair do aplicativo WhatsApp Business.',
    });
  } catch (error) {
    console.error('[whatsapp coexistence complete]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Falha inesperada ao conectar o WhatsApp.',
    }, { status: 500 });
  }
}