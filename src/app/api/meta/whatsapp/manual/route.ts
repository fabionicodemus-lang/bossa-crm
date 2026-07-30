import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  channelAccess,
  findChannelById,
  getChannelProvider,
  legacyChannelForRole,
  type WhatsAppChannelRecord,
} from '@/lib/whatsapp/channelService';
import type { WhatsAppChannelRole } from '@/lib/whatsapp/channelProvider';
import { encryptToken } from '@/lib/whatsapp/crypto';

export const runtime = 'nodejs';

type Action = 'test' | 'save' | 'test_saved';

function identifier(value: unknown) {
  return String(value ?? '').trim();
}

function validMetaId(value: string) {
  return /^\d{5,40}$/.test(value);
}

function roleFromBody(body: Record<string, unknown>): WhatsAppChannelRole | null {
  if (body.role === 'cliente' || body.channel === 'clientes') return 'cliente';
  if (body.role === 'corretor' || body.channel === 'corretores') return 'corretor';
  return null;
}

function publicChannel(channel: WhatsAppChannelRecord) {
  return {
    id: channel.id,
    label: channel.label,
    role: channel.role,
    provider: channel.provider,
    business_id: channel.business_id,
    waba_id: channel.waba_id,
    phone_number_id: channel.phone_number_id,
    display_phone_number: channel.display_phone_number,
    verified_name: channel.verified_name,
    quality_rating: channel.quality_rating,
    status: channel.status,
    messaging_limit: channel.messaging_limit,
    registered_at: channel.registered_at,
    app_subscribed_at: channel.app_subscribed_at,
    last_tested_at: channel.last_tested_at,
    created_at: channel.created_at,
    updated_at: channel.updated_at,
  };
}

export async function POST(request: Request) {
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
  const action: Action = body.action === 'save'
    ? 'save'
    : body.action === 'test_saved'
      ? 'test_saved'
      : 'test';
  const admin = createAdminClient();

  try {
    if (action === 'test_saved') {
      const channelId = identifier(body.channelId);
      const channel = await findChannelById(admin, membership.organization_id, channelId);
      if (!channel) return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 });

      const { provider, accessToken } = channelAccess(channel);
      const result = await provider.testConnection({
        wabaId: channel.waba_id,
        phoneNumberId: channel.phone_number_id,
        accessToken,
      });
      if (!result.belongsToWaba) {
        throw new Error('O Phone Number ID salvo não pertence mais ao WABA informado.');
      }

      const now = new Date().toISOString();
      const { data: updated, error } = await admin.from('whatsapp_channels').update({
        display_phone_number: result.phone.displayPhoneNumber,
        verified_name: result.phone.verifiedName,
        quality_rating: result.phone.qualityRating,
        messaging_limit: result.phone.messagingLimit,
        last_tested_at: now,
      }).eq('id', channel.id).select('*').single();
      if (error) throw error;

      return NextResponse.json({
        ok: true,
        validation: {
          wabaId: channel.waba_id,
          phoneNumberId: channel.phone_number_id,
          displayPhoneNumber: result.phone.displayPhoneNumber,
          verifiedName: result.phone.verifiedName,
          qualityRating: result.phone.qualityRating,
          messagingLimit: result.phone.messagingLimit,
        },
        channel: publicChannel(updated as WhatsAppChannelRecord),
      });
    }

    const role = roleFromBody(body);
    const label = identifier(body.label)
      || (role === 'cliente' ? 'Clientes finais · Nara' : 'Corretores · Plantão');
    const wabaId = identifier(body.wabaId);
    const phoneNumberId = identifier(body.phoneNumberId);
    const businessId = identifier(body.businessId) || null;
    const accessToken = identifier(body.accessToken);

    if (!role) return NextResponse.json({ error: 'Selecione o papel cliente ou corretor.' }, { status: 400 });
    if (label.length < 2 || label.length > 120) {
      return NextResponse.json({ error: 'Informe um rótulo entre 2 e 120 caracteres.' }, { status: 400 });
    }
    if (!validMetaId(wabaId)) {
      return NextResponse.json({ error: 'Informe um WABA ID válido, usando somente números.' }, { status: 400 });
    }
    if (!validMetaId(phoneNumberId)) {
      return NextResponse.json({ error: 'Informe um Phone Number ID válido, usando somente números.' }, { status: 400 });
    }
    if (businessId && !validMetaId(businessId)) {
      return NextResponse.json({ error: 'O Business Manager ID deve conter somente números.' }, { status: 400 });
    }
    if (accessToken.length < 20) {
      return NextResponse.json({ error: 'Cole o token completo do Usuário do Sistema da Meta.' }, { status: 400 });
    }

    const provider = getChannelProvider('meta_cloud');
    const result = await provider.testConnection({ wabaId, phoneNumberId, accessToken });
    if (!result.belongsToWaba) {
      return NextResponse.json({
        error: 'O Phone Number ID não pertence ao WABA ID informado ou o token não possui acesso aos dois recursos.',
      }, { status: 400 });
    }

    const validation = {
      wabaId,
      phoneNumberId,
      displayPhoneNumber: result.phone.displayPhoneNumber,
      verifiedName: result.phone.verifiedName,
      qualityRating: result.phone.qualityRating,
      messagingLimit: result.phone.messagingLimit,
    };
    if (action === 'test') return NextResponse.json({ ok: true, validation });

    await provider.subscribeWebhook({ wabaId, accessToken });

    const now = new Date().toISOString();
    const encrypted = encryptToken(accessToken);
    const legacyChannel = legacyChannelForRole(role);
    const { data: legacy, error: legacyError } = await admin.from('whatsapp_connections').upsert({
      organization_id: membership.organization_id,
      channel: legacyChannel,
      business_id: businessId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: result.phone.displayPhoneNumber,
      verified_name: result.phone.verifiedName,
      quality_rating: result.phone.qualityRating,
      encrypted_access_token: encrypted,
      status: 'disconnected',
      connected_at: now,
      updated_at: now,
    }, { onConflict: 'organization_id,channel' }).select('id').single();
    if (legacyError) throw legacyError;

    const { data: existing, error: existingError } = await admin
      .from('whatsapp_channels')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('role', role)
      .maybeSingle();
    if (existingError) throw existingError;

    const values = {
      organization_id: membership.organization_id,
      label,
      role,
      provider: 'meta_cloud',
      business_id: businessId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: result.phone.displayPhoneNumber,
      verified_name: result.phone.verifiedName,
      quality_rating: result.phone.qualityRating,
      token_encrypted: encrypted,
      status: 'pending_registration',
      messaging_limit: result.phone.messagingLimit,
      registration_pin_hash: null,
      registered_at: null,
      app_subscribed_at: now,
      last_tested_at: now,
      legacy_connection_id: legacy.id,
    };

    const write = existing
      ? admin.from('whatsapp_channels').update(values).eq('id', existing.id)
      : admin.from('whatsapp_channels').insert({ id: legacy.id, ...values });
    const { data: channel, error: channelError } = await write.select('*').single();
    if (channelError) throw channelError;

    return NextResponse.json({
      ok: true,
      validation,
      channel: publicChannel(channel as WhatsAppChannelRecord),
    });
  } catch (error) {
    console.error('[whatsapp direct connection]', error instanceof Error ? error.message : error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Não foi possível validar as credenciais na Meta.',
    }, { status: 400 });
  }
}
