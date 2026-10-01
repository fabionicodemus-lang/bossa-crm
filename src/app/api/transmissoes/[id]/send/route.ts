import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  channelAccess,
  ensureConversation,
  findChannelById,
} from '@/lib/whatsapp/channelService';
import type { WhatsAppMessageCategory } from '@/lib/whatsapp/channelProvider';
import { normalizeWaId, phoneMatchVariants } from '@/lib/whatsapp/utils';
import { stageLabel } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';
import { brokerBroadcastEligibility, type IdentityLead } from '@/lib/contact-identity';

export const maxDuration = 60;
// Para de pegar novos destinatários após este tempo, deixando folga até o limite de 60s.
const TIME_BUDGET_MS = 25_000;
// Tempo máximo de espera por resposta da Meta em cada envio.
const META_TIMEOUT_MS = 15_000;
// Quantos destinatários na fila são lidos por chamada; o orçamento de tempo decide quantos são enviados.
const QUEUE_FETCH_LIMIT = 100;

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

function messageCategory(value: unknown): WhatsAppMessageCategory {
  const category = String(value ?? '').toLowerCase();
  if (category === 'utility' || category === 'authentication' || category === 'service') return category;
  return 'marketing';
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const resumeRequested = new URL(request.url).searchParams.get('resume') === '1';
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
  if (broadcast.status === 'paused' && !resumeRequested) {
    return NextResponse.json({ error: 'Transmissão pausada.', paused: true }, { status: 409 });
  }

  const channelId = String(broadcast.whatsapp_channel_id ?? broadcast.whatsapp_connection_id ?? '');
  const channel = await findChannelById(admin, membership.organization_id, channelId);
  const { data: template } = await admin.from('whatsapp_templates')
    .select('*').eq('id', broadcast.template_id).eq('organization_id', membership.organization_id).maybeSingle();
  if (!channel || channel.status !== 'connected') return NextResponse.json({ error: 'O canal do WhatsApp não está conectado.' }, { status: 409 });
  if (!template || String(template.status).toUpperCase() !== 'APPROVED') return NextResponse.json({ error: 'O modelo deixou de estar aprovado na Meta.' }, { status: 409 });

  const { data: queuedRows, error: queueError } = await admin.from('broadcast_recipients')
    .select('id,lead_id,lead_name,phone,stage,lead_snapshot')
    .eq('broadcast_id', id).eq('status', 'queued').order('created_at').limit(QUEUE_FETCH_LIMIT);
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
    await admin.from('broadcasts').update({
      status: 'running',
      started_at: broadcast.started_at || now,
      whatsapp_channel_id: channel.id,
    }).eq('id', id);
  }

  let mediaLink: string | undefined;
  if (broadcast.media_bucket && broadcast.media_path) {
    const { data: signed, error: signedError } = await admin.storage
      .from(broadcast.media_bucket).createSignedUrl(broadcast.media_path, 3600);
    if (signedError || !signed?.signedUrl) return NextResponse.json({ error: 'Não foi possível acessar o anexo da transmissão.' }, { status: 400 });
    mediaLink = signed.signedUrl;
  }

  const kind: LeadKind = channel.role;
  const mappings = Array.isArray(broadcast.variable_mappings) ? broadcast.variable_mappings as VariableMapping[] : [];
  const { provider, accessToken, phoneNumberId } = channelAccess(channel);
  const category = messageCategory(template.category);

  let processed = 0;
  for (const recipient of recipients) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    // Reserva o destinatário somente se ele ainda estiver na fila, evitando envio duplicado.
    const { data: claimed } = await admin.from('broadcast_recipients').update({ status: 'sending' })
      .eq('id', recipient.id).eq('status', 'queued').select('id').maybeSingle();
    if (!claimed) continue;
    processed++;
    try {
      const destination = normalizeWaId(recipient.phone ?? '');
      if (!destination) throw new Error('Telefone inválido.');

      const { data: identityRows, error: identityError } = await admin.from('leads')
        .select('id,kind,phone,creci,metadata,updated_at,archived_at,opt_out,automation_paused')
        .eq('organization_id', membership.organization_id)
        .in('phone', phoneMatchVariants(destination))
        .is('archived_at', null)
        .limit(50);
      if (identityError) throw identityError;

      if (broadcast.channel === 'corretores') {
        const eligibility = brokerBroadcastEligibility((identityRows ?? []) as IdentityLead[]);
        const recipientLead = (identityRows ?? []).find((lead) => lead.id === recipient.lead_id);
        if (!eligibility.eligible || (recipientLead && recipientLead.kind !== 'corretor')) {
          await admin.from('broadcast_recipients').update({
            status: 'skipped',
            error_message: eligibility.eligible
              ? 'A ficha selecionada deixou de ser corretor.'
              : `Excluído da transmissão de corretores: ${eligibility.reason}`,
          }).eq('id', recipient.id);
          continue;
        }
      }

      const optedOut = (identityRows ?? []).some((lead) => Boolean(lead.opt_out));
      const paused = (identityRows ?? []).some((lead) => Boolean(lead.automation_paused) && lead.id === recipient.lead_id);
      if (optedOut || paused) {
        await admin.from('broadcast_recipients').update({
          status: 'skipped',
          error_message: optedOut ? 'Número descadastrado.' : 'Automação pausada para este contato.',
        }).eq('id', recipient.id);
        continue;
      }
      const snapshot = recipient.lead_snapshot || {};
      const values = mappings.map((mapping) => mappingValue(mapping, snapshot, kind));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
      let result: Awaited<ReturnType<typeof provider.sendTemplate>>;
      try {
        result = await provider.sendTemplate({
          phoneNumberId,
          accessToken,
          to: destination,
          name: broadcast.template_name,
          language: broadcast.template_language,
          bodyParameters: values,
          headerType: broadcast.header_type,
          headerMediaLink: mediaLink,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(`Tempo limite de ${META_TIMEOUT_MS / 1000}s excedido aguardando resposta da Meta.`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      const wamid = result.messageId;
      const sentAt = new Date().toISOString();
      await admin.from('broadcast_recipients').update({
        status: 'sent', whatsapp_message_id: wamid, sent_at: sentAt, error_code: null, error_message: null,
      }).eq('id', recipient.id);

      if (recipient.lead_id) {
        const rendered = renderBody(String(template.body_text ?? ''), values);
        const conversation = await ensureConversation({
          admin,
          channel,
          contactWaId: destination,
          leadId: recipient.lead_id,
        });
        const transport = {
          organization_id: membership.organization_id,
          channel_id: channel.id,
          conversation_id: conversation.id,
          lead_id: recipient.lead_id,
          wamid,
          direction: 'out',
          sender_kind: 'humano',
          type: 'template',
          body: rendered || `[Modelo ${broadcast.template_name}]`,
          payload: {
            provider: result.raw,
            broadcast_id: id,
            template_name: broadcast.template_name,
            template_language: broadcast.template_language,
          },
          status: 'sent',
          category,
          sent_at: sentAt,
        };
        if (wamid) {
          await admin.from('whatsapp_messages').upsert(transport, { onConflict: 'wamid', ignoreDuplicates: true });
        } else {
          await admin.from('whatsapp_messages').insert(transport);
        }

        await Promise.all([
          admin.from('messages').insert({
            organization_id: membership.organization_id,
            lead_id: recipient.lead_id,
            whatsapp_connection_id: channel.legacy_connection_id ?? null,
            whatsapp_channel_id: channel.id,
            whatsapp_conversation_id: conversation.id,
            direction: 'out',
            sender_kind: 'humano',
            sender_user_id: user.id,
            body: rendered || `[Modelo ${broadcast.template_name}]`,
            status: 'sent',
            whatsapp_message_id: wamid,
            raw_payload: {
              broadcast_id: id,
              template_name: broadcast.template_name,
              template_language: broadcast.template_language,
              template_category: category,
            },
          }),
          admin.from('activities').insert({
            organization_id: membership.organization_id,
            lead_id: recipient.lead_id,
            user_id: user.id,
            type: 'transmissao_whatsapp',
            title: `Transmissão “${broadcast.name}” enviada`,
            description: rendered || `Modelo ${broadcast.template_name} enviado pelo WhatsApp.`,
            metadata: { broadcast_id: id, template_id: broadcast.template_id, whatsapp_message_id: wamid, category },
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

  return NextResponse.json({ done, remaining: counts.queued, processed, counts });
}
