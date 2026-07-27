import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken, normalizeWaId, sendWhatsAppText } from '@/lib/whatsapp';

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
    if (!membership || membership.role === 'viewer') {
      return NextResponse.json({ error: 'Você não possui permissão para enviar mensagens.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const leadId = String(body.leadId ?? '');
    const text = String(body.body ?? '').trim().slice(0, 4096);
    if (!leadId || !text) return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: lead } = await admin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (!lead) return NextResponse.json({ error: 'Contato não encontrado.' }, { status: 404 });
    if (!lead.phone) return NextResponse.json({ error: 'O contato não possui telefone válido.' }, { status: 400 });
    if (lead.ai_enabled) return NextResponse.json({ error: 'Assuma a conversa antes de enviar uma mensagem humana.' }, { status: 409 });

    const channel = lead.kind === 'cliente' ? 'clientes' : 'corretores';
    const { data: connection } = await admin
      .from('whatsapp_connections')
      .select('id,phone_number_id,encrypted_access_token,status')
      .eq('organization_id', membership.organization_id)
      .eq('channel', channel)
      .eq('status', 'connected')
      .maybeSingle();
    if (!connection) return NextResponse.json({ error: 'O canal do WhatsApp ainda não está conectado.' }, { status: 409 });

    const destination = normalizeWaId(lead.phone);
    if (!destination) return NextResponse.json({ error: 'O telefone do contato não possui dígitos válidos.' }, { status: 400 });

    const result = await sendWhatsAppText({
      phoneNumberId: connection.phone_number_id,
      accessToken: decryptToken(connection.encrypted_access_token),
      to: destination,
      body: text,
    });
    const wamid = result.messages?.[0]?.id ?? null;
    const { data: message, error } = await admin.from('messages').insert({
      organization_id: membership.organization_id,
      lead_id: lead.id,
      whatsapp_connection_id: connection.id,
      direction: 'out',
      sender_kind: 'humano',
      sender_user_id: user.id,
      body: text,
      status: 'sent',
      whatsapp_message_id: wamid,
    }).select('*').single();
    if (error) throw error;

    await admin.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', lead.id);
    return NextResponse.json({ message });
  } catch (error) {
    console.error('[whatsapp send]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.' }, { status: 500 });
  }
}
