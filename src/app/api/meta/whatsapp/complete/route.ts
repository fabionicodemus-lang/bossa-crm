import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getChannelProvider } from '@/lib/whatsapp/channelService';
import type { WhatsAppChannelRole } from '@/lib/whatsapp/channelProvider';
import { encryptToken } from '@/lib/whatsapp/crypto';
import { ensureCoexistenceWebhookFields } from '@/lib/whatsapp/metaAppWebhook';
import { exchangeEmbeddedSignupCode } from '@/lib/whatsapp/providers/metaCloud';

export const runtime = 'nodejs';

type ChannelSlot = 'clientes' | 'corretores' | 'corretores_extra';

function channelSlot(value: unknown): ChannelSlot | null {
  if (value === 'clientes' || value === 'corretores' || value === 'corretores_extra') return value;
  return null;
}

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
    const slot = channelSlot(body.channel);
    const role: WhatsAppChannelRole | null = slot === 'clientes'
      ? 'cliente'
      : slot === 'corretores' || slot === 'corretores_extra'
        ? 'corretor'
        : null;
    const legacyChannel = slot === 'clientes'
      ? 'clientes'
      : slot === 'corretores'
        ? 'corretores'
        : null;
    const requestedChannelId = String(body.channelId ?? '').trim() || null;
    const code = String(body.code ?? '').trim();
    const wabaId = String(body.wabaId ?? '').trim();
    const phoneNumberId = String(body.phoneNumberId ?? '').trim();
    const businessId = String(body.businessId ?? '').trim() || null;

    if (!slot || !role || !code || !wabaId || !phoneNumberId) {
      return NextResponse.json({ error: 'Dados incompletos devolvidos pela Meta.' }, { status: 400 });
    }

    const accessToken = await exchangeEmbeddedSignupCode(code);
    const provider = getChannelProvider('meta_cloud');
    const validation = await provider.testConnection({ wabaId, phoneNumberId, accessToken });
    if (!validation.belongsToWaba) {
      throw new Error('O número devolvido pela Meta não pertence à conta do WhatsApp selecionada.');
    }

    let coexistenceWebhooksError: string | null = null;
    let coexistenceWebhooksEnsuredAt: string | null = null;
    try {
      await ensureCoexistenceWebhookFields();
      coexistenceWebhooksEnsuredAt = new Date().toISOString();
    } catch (webhookError) {
      coexistenceWebhooksError = webhookError instanceof Error
        ? webhookError.message.slice(0, 2000)
        : 'Não foi possível configurar os webhooks de Coexistência.';
      console.error('[whatsapp coexistence app webhooks]', webhookError);
    }

    await provider.subscribeWebhook({ wabaId, accessToken });

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const encrypted = encryptToken(accessToken);
    let canonicalChannelId = requestedChannelId;
    let legacyConnectionId: string | null = null;

    if (legacyChannel) {
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
        .select('id')
        .single();
      if (legacyError) throw legacyError;
      canonicalChannelId = legacy.id;
      legacyConnectionId = legacy.id;
    } else if (requestedChannelId) {
      const { data: current, error: currentError } = await admin
        .from('whatsapp_channels')
        .select('id,role,legacy_connection_id')
        .eq('id', requestedChannelId)
        .eq('organization_id', membership.organization_id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current || current.role !== 'corretor' || current.legacy_connection_id) {
        return NextResponse.json({ error: 'O Canal 3 informado não é um canal comercial adicional válido.' }, { status: 400 });
      }
    }

    const channelValues = {
      organization_id: membership.organization_id,
      label: slot === 'clientes'
        ? 'Clientes finais · Nara'
        : slot === 'corretores'
          ? 'Corretores · Plantão'
          : 'Comercial 2 · Corretores',
      role,
      routing_mode: slot === 'corretores' ? 'mixed_plantao' : 'direct_role',
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
      legacy_connection_id: legacyConnectionId,
      coexistence_webhooks_ensured_at: coexistenceWebhooksEnsuredAt,
      coexistence_webhooks_error: coexistenceWebhooksError,
    };

    const write = canonicalChannelId
      ? admin
        .from('whatsapp_channels')
        .update(channelValues)
        .eq('id', canonicalChannelId)
        .eq('organization_id', membership.organization_id)
      : admin.from('whatsapp_channels').insert(channelValues);

    const { data: saved, error: channelError } = await write
      .select('id,display_phone_number,verified_name,quality_rating,status,registered_at,created_at')
      .single();
    if (channelError) throw channelError;

    return NextResponse.json({
      connection: {
        id: saved.id,
        channel: slot,
        display_phone_number: saved.display_phone_number,
        verified_name: saved.verified_name,
        quality_rating: saved.quality_rating,
        status: saved.status,
        connected_at: saved.registered_at ?? saved.created_at,
      },
      mode: 'coexistence',
      message: slot === 'corretores_extra'
        ? 'Canal comercial adicional conectado ao pipeline de corretores.'
        : 'WhatsApp conectado ao CRM sem sair do aplicativo WhatsApp Business.',
    });
  } catch (error) {
    console.error('[whatsapp coexistence complete]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Falha inesperada ao conectar o WhatsApp.',
    }, { status: 500 });
  }
}
