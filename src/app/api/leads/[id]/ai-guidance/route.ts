import { NextResponse } from 'next/server';
import { generateSupervisedAiTurn, type AiFileOption } from '@/lib/ai-v120';
import { loadAiContext } from '@/lib/ai-context';
import { rankAiFilesForConversation } from '@/lib/ai-file-ranking';
import { recordAiUsage } from '@/lib/ai-usage';
import { loadNaraCommercialTurnContext } from '@/lib/nara-unit-queries';
import { loadNaraDynamicTurnContext } from '@/lib/nara-dynamic-context';
import { loadNaraForeignContext } from '@/lib/nara-exterior';
import { loadNaraOperationalContext } from '@/lib/nara-operations';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Lead } from '@/lib/types';
import type { WhatsAppMediaType } from '@/lib/whatsapp/channelProvider';
import {
  channelAccess,
  ensureConversation,
  findChannelById,
  findChannelByRole,
  roleForLeadKind,
  type WhatsAppChannelRecord,
  type WhatsAppConversationRecord,
} from '@/lib/whatsapp/channelService';
import { isCustomerServiceWindowOpen, leadWindowExpiresAt, OUTSIDE_WINDOW_MESSAGE } from '@/lib/whatsapp/window';
import { normalizeWaId } from '@/lib/whatsapp/utils';
import { mergeSupervisorAttachmentIds, promoteSupervisorFiles } from '@/lib/nara-supervisor-guidance';

export const runtime = 'nodejs';
export const maxDuration = 60;

function mediaType(file: AiFileOption): WhatsAppMediaType {
  const mime = (file.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

async function recordOutbound(args: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  body: string;
  type: string;
  wamid: string | null;
  providerPayload: Record<string, unknown>;
  crmPayload?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const crmPayload = args.crmPayload ?? {};
  const transport = {
    organization_id: args.organizationId,
    channel_id: args.channel.id,
    conversation_id: args.conversation.id,
    lead_id: args.lead.id,
    wamid: args.wamid,
    direction: 'out',
    sender_kind: 'ia',
    type: args.type,
    body: args.body,
    payload: { provider: args.providerPayload, crm: crmPayload },
    status: 'sent',
    category: 'service',
    sent_at: now,
  };
  if (args.wamid) {
    const { error } = await args.admin.from('whatsapp_messages')
      .upsert(transport, { onConflict: 'wamid', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await args.admin.from('whatsapp_messages').insert(transport);
    if (error) throw error;
  }

  const { data: message, error } = await args.admin.from('messages').insert({
    organization_id: args.organizationId,
    lead_id: args.lead.id,
    whatsapp_connection_id: args.channel.legacy_connection_id ?? null,
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: args.conversation.id,
    direction: 'out',
    sender_kind: 'ia',
    sender_user_id: null,
    body: args.body,
    status: 'sent',
    whatsapp_message_id: args.wamid,
    raw_payload: crmPayload,
  }).select('*').single();
  if (error) throw error;
  return message;
}

async function sendFiles(args: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  channel: WhatsAppChannelRecord;
  conversation: WhatsAppConversationRecord;
  lead: Lead;
  destination: string;
  files: AiFileOption[];
  attachmentIds: string[];
  supervisorUserId: string;
  instruction: string;
}) {
  const selected = args.attachmentIds
    .map((id) => args.files.find((file) => file.id === id))
    .filter((file): file is AiFileOption => Boolean(file))
    .slice(0, 3);
  const { provider, accessToken, phoneNumberId } = channelAccess(args.channel);
  const sentIds: string[] = [];

  for (const file of selected) {
    try {
      const { data: signed, error: signedError } = await args.admin.storage
        .from(file.storage_bucket)
        .createSignedUrl(file.storage_path, 3600);
      if (signedError || !signed?.signedUrl) throw signedError ?? new Error('Falha ao preparar arquivo.');

      const preferred = mediaType(file);
      let sentAs: WhatsAppMediaType = preferred;
      let result: Awaited<ReturnType<typeof provider.sendMedia>>;
      try {
        result = await provider.sendMedia({
          phoneNumberId,
          accessToken,
          to: args.destination,
          type: preferred,
          link: signed.signedUrl,
          caption: preferred === 'audio' ? undefined : file.title,
          filename: preferred === 'document' ? file.original_name : undefined,
        });
      } catch (firstError) {
        if (preferred === 'document') throw firstError;
        sentAs = 'document';
        result = await provider.sendMedia({
          phoneNumberId,
          accessToken,
          to: args.destination,
          type: 'document',
          link: signed.signedUrl,
          caption: file.title,
          filename: file.original_name,
        });
      }

      sentIds.push(file.id);
      await recordOutbound({
        admin: args.admin,
        organizationId: args.organizationId,
        channel: args.channel,
        conversation: args.conversation,
        lead: args.lead,
        body: `📎 ${file.title}`,
        type: sentAs,
        wamid: result.messageId,
        providerPayload: result.raw,
        crmPayload: {
          ai_file_id: file.id,
          category: file.category,
          original_name: file.original_name,
          mime_type: file.mime_type,
          sent_as: sentAs,
          ai_supervised: true,
          supervisor_user_id: args.supervisorUserId,
        },
      });
    } catch (error) {
      console.error('[guided nara file]', file.id, error);
      await args.admin.from('activities').insert({
        organization_id: args.organizationId,
        lead_id: args.lead.id,
        user_id: args.supervisorUserId,
        type: 'falha_arquivo_ia_supervisionada',
        title: `Falha ao enviar “${file.title}”`,
        description: error instanceof Error ? error.message : 'Erro desconhecido.',
        metadata: { ai_file_id: file.id, supervisor_instruction: args.instruction },
      });
    }
  }
  return sentIds;
}

function adjustReplyForFiles(reply: string, requested: number, sent: number) {
  if (!requested || requested === sent) return reply;
  if (!sent) return 'Não consegui concluir o envio das imagens agora. Posso tentar novamente ou te mostrar outro material.';
  return 'Enviei as imagens que concluíram normalmente. Uma delas não terminou de sair; posso tentar esse material de novo.';
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

    const { data: membership } = await supabase.from('memberships')
      .select('organization_id,role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (!membership || membership.role === 'viewer') {
      return NextResponse.json({ error: 'Você não possui permissão para orientar a Nara.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { instruction?: unknown };
    const instruction = String(body.instruction ?? '').trim().slice(0, 1500);
    if (!instruction) return NextResponse.json({ error: 'Escreva a orientação para a Nara.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: leadData } = await admin.from('leads').select('*')
      .eq('id', id)
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    const lead = leadData as Lead | null;
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (lead.kind !== 'cliente') return NextResponse.json({ error: 'Esta orientação é exclusiva da Nara no pipeline de clientes.' }, { status: 400 });
    if (lead.archived_at) return NextResponse.json({ error: 'Restaure o lead antes de enviar mensagens.' }, { status: 409 });
    if (lead.opt_out) return NextResponse.json({ error: 'Este contato pediu descadastro.' }, { status: 409 });
    if (lead.owner_mode !== 'ai' || !lead.ai_enabled) {
      return NextResponse.json({ error: 'A Nara precisa ser a responsável ativa para receber uma orientação.' }, { status: 409 });
    }
    if (!lead.phone) return NextResponse.json({ error: 'O contato não possui telefone válido.' }, { status: 400 });

    const { data: latestConversation, error: conversationError } = await admin
      .from('whatsapp_conversations')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('organization_id', membership.organization_id)
      .order('last_inbound_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conversationError) throw conversationError;

    let channel = latestConversation
      ? await findChannelById(admin, membership.organization_id, latestConversation.channel_id)
      : null;
    if (channel?.status !== 'connected') channel = null;
    channel ??= await findChannelByRole(admin, membership.organization_id, roleForLeadKind(lead.kind));
    if (!channel) return NextResponse.json({ error: 'O WhatsApp de clientes não está conectado.' }, { status: 409 });

    const storedConversation = latestConversation?.channel_id === channel.id
      ? latestConversation as WhatsAppConversationRecord
      : null;
    const destination = normalizeWaId(storedConversation?.contact_wa_id ?? lead.phone);
    if (!destination) return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 });

    const conversation = storedConversation ?? await ensureConversation({
      admin,
      channel,
      contactWaId: destination,
      leadId: lead.id,
    });
    const windowExpiresAt = conversation.window_expires_at ?? leadWindowExpiresAt(lead);
    if (!isCustomerServiceWindowOpen(windowExpiresAt)) {
      return NextResponse.json({ error: OUTSIDE_WINDOW_MESSAGE, code: 'WHATSAPP_WINDOW_CLOSED' }, { status: 409 });
    }

    const { data: rows, error: historyError } = await admin.from('messages')
      .select('direction,body,created_at')
      .eq('lead_id', lead.id)
      .neq('direction', 'system')
      .order('created_at', { ascending: true })
      .limit(100);
    if (historyError) throw historyError;
    const history = (rows ?? []).map((row) => ({
      role: row.direction === 'in' ? 'user' as const : 'assistant' as const,
      content: String(row.body ?? ''),
    }));
    if (!history.length) return NextResponse.json({ error: 'Ainda não existe histórico suficiente para a Nara responder.' }, { status: 409 });

    const context = await loadAiContext(admin, membership.organization_id, lead.kind);
    if (context.config?.active === false) {
      return NextResponse.json({ error: 'A Nara está desativada nas configurações.' }, { status: 409 });
    }
    const allFiles = context.files ?? [];
    const rankedFiles = rankAiFilesForConversation(
      allFiles,
      [...history, { role: 'user', content: instruction }],
      lead,
      40,
    );
    context.files = promoteSupervisorFiles({
      instruction,
      allFiles,
      rankedFiles,
      limit: 40,
    });

    const [commercial, dynamic, operational] = await Promise.all([
      loadNaraCommercialTurnContext(admin, membership.organization_id, lead, history),
      loadNaraDynamicTurnContext(admin, membership.organization_id, lead.id),
      loadNaraOperationalContext(admin, membership.organization_id),
    ]);
    const foreign = await loadNaraForeignContext(admin, history, commercial);
    context.commercial = commercial;
    context.dynamic = dynamic;
    context.operational = operational;
    context.foreign = foreign;
    context.supervisor_instruction = instruction;

    const turn = await generateSupervisedAiTurn(lead, history, context);
    if (!turn?.reply?.trim()) {
      return NextResponse.json({ error: 'A Nara não conseguiu montar uma resposta para essa orientação.' }, { status: 500 });
    }
    turn.attachment_ids = mergeSupervisorAttachmentIds({
      instruction,
      files: context.files ?? [],
      modelAttachmentIds: turn.attachment_ids ?? [],
    });

    const sentFileIds = await sendFiles({
      admin,
      organizationId: membership.organization_id,
      channel,
      conversation,
      lead,
      destination,
      files: context.files ?? [],
      attachmentIds: turn.attachment_ids,
      supervisorUserId: user.id,
      instruction,
    });

    const reply = adjustReplyForFiles(turn.reply.trim(), turn.attachment_ids.length, sentFileIds.length);
    const { provider, accessToken, phoneNumberId } = channelAccess(channel);
    const sent = await provider.sendText({
      phoneNumberId,
      accessToken,
      to: destination,
      body: reply,
    });

    const message = await recordOutbound({
      admin,
      organizationId: membership.organization_id,
      channel,
      conversation,
      lead,
      body: reply,
      type: 'text',
      wamid: sent.messageId,
      providerPayload: sent.raw,
      crmPayload: {
        category: 'service',
        ai_supervised: true,
        supervisor_user_id: user.id,
        supervisor_instruction: instruction,
        ai_model: turn.model_used ?? null,
        ai_compacted: turn.compacted ?? false,
        ai_usage: turn.usage_records ?? [],
        ai_attachment_ids: turn.attachment_ids,
        ai_sent_file_ids: sentFileIds,
      },
    });

    const now = new Date().toISOString();
    await Promise.all([
      admin.from('leads').update({
        last_outbound_at: now,
        last_ai_activity_at: now,
        updated_at: now,
      }).eq('id', lead.id),
      admin.from('activities').insert({
        organization_id: membership.organization_id,
        lead_id: lead.id,
        user_id: user.id,
        type: 'orientacao_ia_manual',
        title: 'Gestor orientou a próxima fala da Nara',
        description: instruction,
        metadata: {
          generated_reply: reply,
          requested_attachment_ids: turn.attachment_ids,
          sent_file_ids: sentFileIds,
          whatsapp_message_id: sent.messageId,
        },
      }),
      recordAiUsage({
        admin,
        organizationId: membership.organization_id,
        leadId: lead.id,
        records: turn.usage_records ?? [],
      }),
    ]);

    return NextResponse.json({
      ok: true,
      message,
      reply,
      requested_attachment_ids: turn.attachment_ids,
      sent_file_ids: sentFileIds,
      owner_mode: lead.owner_mode,
      ai_enabled: lead.ai_enabled,
    });
  } catch (error) {
    console.error('[nara guidance]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Não foi possível orientar a Nara.',
    }, { status: 500 });
  }
}
