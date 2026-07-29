import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken, normalizeWaId, sendWhatsAppTemplate } from '@/lib/whatsapp';
import { stageLabel } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';

export const maxDuration = 60;
const BATCH_SIZE = 15;

type VariableMapping = { source: 'name' | 'enterprise' | 'company' | 'stage' | 'fixed'; value?: string };
type Recipient = {
  id: string;
  lead_id: string | null;
  lead_name: string;
  phone: string | null;
  stage: string | null;
  lead_snapshot: Record<string, unknown>;
};

function mappingValue(mapping: VariableMapping, snapshot: Record<string, unknown>, kind: LeadKind) {
  if (mapping.source === 'fixed') return String(mapping.value ?? '');
  if (mapping.source === 'name') return String(snapshot.name ?? '');
  if (mapping.source === 'enterprise') return String(snapshot.enterprise ?? '');
  if (mapping.source === 'company') return String(snapshot.company ?? '');
  if (mapping.source === 'stage') return stageLabel(kind, String(snapshot.stage ?? ''));
  return '';
}

function renderBody(text: string, values: string[]) {
  return values.reduce((current, value, index) => current.replaceAll(`{{${index + 1}}}`, value), text);
}

function statusCounts(rows: Array<{ status: string }>) {
  const counts = { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    if (row.status in counts) counts[row.status as keyof typeof counts]++;
  }
  return counts;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para enviar transmissões.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: broadcast, error: broadcastError } = await admin.from('broadcasts')
    .select('*').eq('id', id).eq('organization_id', membership.organization_id).maybeSingle();
  if (broadcastError || !broadcast) return NextResponse.json({ error: 'Transmissão não encontrada.' }, { status: 404 });
  if (['cancelled', 'completed'].includes(broadcast.status)) {
    return NextResponse.json({ error: `A transmissão já está ${broadcast.status === 'completed' ? 'concluída' : 'cancelada'}.` }, { status: 409 });
  }

  const [{ data: connection }, { data: template }] = await Promise.all([
    admin.from('whatsapp_connections').select('id,phone_number_id,encrypted_access_token,status,channel')
      .eq('id', broadcast.whatsapp_connection_id).eq('organization_id', membership.organization_id).maybeSingle(),
    admin.from('whatsapp_templates').select('*').eq('id', broadcast.template_id).eq('organization_id', membership.organization_id).maybeSingle(),
  ]);
  if (!connection || connection.status !== 'connected') return NextResponse.json({ error: 'O canal do WhatsApp não está conectado.' }, { status: 409 });
  if (!template || String(template.status).toUpperCase() !== 'APPROVED') return NextResponse.json({ error: 'O modelo deixou de estar aprovado na Meta.' }, { status: 409 });

  const { data: queuedRows, error: queueError } = await admin.from('broadcast_recipients')
    .select('id,lead_id,lead_name,phone,stage,lead_snapshot')
    .eq('broadcast_id', id).eq('status', 'queued').order('created_at').limit(BATCH_SIZE);
  if (queueError) return NextResponse.json({ error: queueError.message }, { status: 400 });

  const recipients = (queuedRows ?? []) as Recipient[];
  if (!recipients.length) {
    const { data: allRows } = await admin.from('broadcast_recipients').select('status').eq('broadcast_id', id);
    const counts = statusCounts((allRows ?? []) as Array<{ status: string }>);
    await admin.from('broadcasts').update({
      status: 'completed',
      queued_count: counts.queued,
      sent_count: counts.sent,
      delivered_count: counts.delivered,
      read_count: counts.read,
      failed_count: counts.failed,
      skipped_count: Number(broadcast.skipped_count) + counts.skipped,
      completed_at: new Date().toISOString(),
    }).eq('id', id);
    return NextResponse.json({ done: true, remaining: 0, counts });
  }

  const now = new Date().toISOString();
  if (broadcast.status !== 'running') {
    await admin.from('broadcasts').update({ status: 'running', started_at: broadcast.started_at || now }).eq('id', id);
  }

  let mediaLink: string | undefined;
  if (broadcast.media_bucket && broadcast.media_path) {
    const { data: signed, error: signedError } = await admin.storage
      .from(broadcast.media_bucket).createSignedUrl(broadcast.media_path, 3600);
    if (signedError || !signed?.signedUrl) return NextResponse.json({ error: 'Não foi possível acessar o anexo da transmissão.' }, { status: 400 });
    mediaLink = signed.signedUrl;
  }

  const kind: LeadKind = broadcast.channel === 'clientes' ? 'cliente' : 'corretor';
  const mappings = Array.isArray(broadcast.variable_mappings) ? broadcast.variable_mappings as VariableMapping[] : [];
  const accessToken = decryptToken(connection.encrypted_access_token);

  for (const recipient of recipients) {
    await admin.from('broadcast_recipients').update({ status: 'sending' }).eq('id', recipient.id);
    try {
      const destination = normalizeWaId(recipient.phone ?? '');
      if (!destination) throw new Error('Telefone inválido.');
      const snapshot = recipient.lead_snapshot || {};
      const values = mappings.map((mapping) => mappingValue(mapping, snapshot, kind));
      const result = await sendWhatsAppTemplate({
        phoneNumberId: connection.phone_number_id,
        accessToken,
        to: destination,
        name: broadcast.template_name,
        language: broadcast.template_language,
        bodyParameters: values,
        headerType: broadcast.header_type,
        headerMediaLink: mediaLink,
      });
      const wamid = result.messages?.[0]?.id ?? null;
      const sentAt = new Date().toISOString();
      await admin.from('broadcast_recipients').update({
        status: 'sent', whatsapp_message_id: wamid, sent_at: sentAt, error_code: null, error_message: null,
      }).eq('id', recipient.id);

      if (recipient.lead_id) {
        const rendered = renderBody(String(template.body_text ?? ''), values);
        await Promise.all([
          admin.from('messages').insert({
            organization_id: membership.organization_id,
            lead_id: recipient.lead_id,
            whatsapp_connection_id: connection.id,
            direction: 'out',
            sender_kind: 'humano',
            sender_user_id: user.id,
            body: rendered || `[Modelo ${broadcast.template_name}]`,
            status: 'sent',
            whatsapp_message_id: wamid,
            raw_payload: { broadcast_id: id, template_name: broadcast.template_name, template_language: broadcast.template_language },
          }),
          admin.from('activities').insert({
            organization_id: membership.organization_id,
            lead_id: recipient.lead_id,
            user_id: user.id,
            type: 'transmissao_whatsapp',
            title: `Transmissão “${broadcast.name}” enviada`,
            description: rendered || `Modelo ${broadcast.template_name} enviado pelo WhatsApp.`,
            metadata: { broadcast_id: id, template_id: broadcast.template_id, whatsapp_message_id: wamid },
          }),
          admin.from('leads').update({ last_outbound_at: sentAt, updated_at: sentAt }).eq('id', recipient.lead_id),
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida no envio.';
      await admin.from('broadcast_recipients').update({
        status: 'failed', error_message: message.slice(0, 1000), error_code: message.match(/Meta (\d+)/)?.[1] ?? null,
      }).eq('id', recipient.id);
    }
  }

  const { data: allRows } = await admin.from('broadcast_recipients').select('status').eq('broadcast_id', id);
  const counts = statusCounts((allRows ?? []) as Array<{ status: string }>);
  const done = counts.queued === 0;
  await admin.from('broadcasts').update({
    status: done ? 'completed' : 'running',
    queued_count: counts.queued,
    sent_count: counts.sent,
    delivered_count: counts.delivered,
    read_count: counts.read,
    failed_count: counts.failed,
    skipped_count: Number(broadcast.skipped_count) + counts.skipped,
    ...(done ? { completed_at: new Date().toISOString() } : {}),
  }).eq('id', id);

  return NextResponse.json({ done, remaining: counts.queued, processed: recipients.length, counts });
}
