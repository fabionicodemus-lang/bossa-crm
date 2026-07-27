import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptToken, exchangeEmbeddedSignupCode, getPhoneNumber, subscribeAppToWaba } from '@/lib/whatsapp';

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => ({}));
    const channel = body.channel === 'corretores' ? 'corretores' : body.channel === 'clientes' ? 'clientes' : null;
    const code = String(body.code ?? '').trim();
    const wabaId = String(body.wabaId ?? '').trim();
    const phoneNumberId = String(body.phoneNumberId ?? '').trim();
    const businessId = String(body.businessId ?? '').trim() || null;
    if (!channel || !code || !wabaId || !phoneNumberId) {
      return NextResponse.json({ error: 'Dados incompletos devolvidos pela Meta.' }, { status: 400 });
    }

    const accessToken = await exchangeEmbeddedSignupCode(code);
    await subscribeAppToWaba(wabaId, accessToken);
    const phone = await getPhoneNumber(phoneNumberId, accessToken);
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

    return NextResponse.json({ connection: data });
  } catch (error) {
    console.error('[whatsapp complete]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha inesperada ao conectar o WhatsApp.' }, { status: 500 });
  }
}
