import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  encryptToken,
  getPhoneNumber,
  subscribeAppToWaba,
} from '@/lib/whatsapp';

type Channel = 'clientes' | 'corretores';
type Action = 'test' | 'save';

const graphVersion = process.env.META_GRAPH_VERSION || 'v25.0';
const graphBase = `https://graph.facebook.com/${graphVersion}`;

async function getWabaPhoneNumbers(wabaId: string, accessToken: string) {
  const fields = encodeURIComponent('id,verified_name,display_phone_number,quality_rating');
  const response = await fetch(`${graphBase}/${wabaId}/phone_numbers?limit=100&fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const data = await response.json() as {
    data?: Array<{ id: string }>;
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok) {
    const suffix = data.error?.code
      ? ` (Meta ${data.error.code}${data.error.error_subcode ? `/${data.error.error_subcode}` : ''})`
      : '';
    throw new Error(`${data.error?.message || `Meta Graph API: HTTP ${response.status}`}${suffix}`);
  }
  return data;
}

function identifier(value: unknown) {
  return String(value ?? '').trim();
}

function validMetaId(value: string) {
  return /^\d{5,40}$/.test(value);
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
  const action: Action = body.action === 'save' ? 'save' : 'test';
  const channel: Channel | null = body.channel === 'clientes'
    ? 'clientes'
    : body.channel === 'corretores'
      ? 'corretores'
      : null;
  const wabaId = identifier(body.wabaId);
  const phoneNumberId = identifier(body.phoneNumberId);
  const businessId = identifier(body.businessId) || null;
  const accessToken = identifier(body.accessToken);

  if (!channel) {
    return NextResponse.json({ error: 'Selecione o canal de clientes ou corretores.' }, { status: 400 });
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
    return NextResponse.json({ error: 'Cole o token de acesso completo gerado pela Meta.' }, { status: 400 });
  }

  try {
    const [phone, wabaPhones] = await Promise.all([
      getPhoneNumber(phoneNumberId, accessToken),
      getWabaPhoneNumbers(wabaId, accessToken),
    ]);

    const belongsToWaba = (wabaPhones.data ?? []).some((item) => item.id === phoneNumberId);
    if (!belongsToWaba) {
      return NextResponse.json({
        error: 'O Phone Number ID não pertence ao WABA ID informado ou o token não possui acesso aos dois recursos.',
      }, { status: 400 });
    }

    const validation = {
      wabaId,
      phoneNumberId,
      displayPhoneNumber: phone.display_phone_number ?? null,
      verifiedName: phone.verified_name ?? null,
      qualityRating: phone.quality_rating ?? null,
    };

    if (action === 'test') {
      return NextResponse.json({ ok: true, validation });
    }

    await subscribeAppToWaba(wabaId, accessToken);

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('whatsapp_connections')
      .upsert({
        organization_id: membership.organization_id,
        channel,
        business_id: businessId,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: phone.display_phone_number ?? null,
        verified_name: phone.verified_name ?? null,
        quality_rating: phone.quality_rating ?? null,
        encrypted_access_token: encryptToken(accessToken),
        status: 'connected',
        connected_at: now,
        updated_at: now,
      }, { onConflict: 'organization_id,channel' })
      .select('id,channel,display_phone_number,verified_name,quality_rating,status,connected_at')
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, validation, connection: data });
  } catch (error) {
    console.error('[whatsapp manual connection]', error instanceof Error ? error.message : error);
    return NextResponse.json({
      error: error instanceof Error
        ? error.message
        : 'Não foi possível validar as credenciais na Meta.',
    }, { status: 400 });
  }
}
