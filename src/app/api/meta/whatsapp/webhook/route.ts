import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAiTurn, type AiFileOption, type AiTrainingContext } from '@/lib/ai';
import type { Lead, LeadKind } from '@/lib/types';
import { decryptToken, normalizeWaId, sendWhatsAppMedia, sendWhatsAppText, type WhatsAppMediaType, verifyMetaSignature } from '@/lib/whatsapp';

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

interface MetaMessage {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string | number;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string };
  document?: { caption?: string; filename?: string };
  video?: { caption?: string };
  [key: string]: unknown;
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        statuses?: Array<{ id?: string; status?: string }>;
        messages?: MetaMessage[];
      };
    }>;
  }>;
}

const CLIENT_STAGES = ['ia', 'qualificado', 'agendado'] as const;
const BROKER_STAGES = ['n1', 'n2', 'n3', 'n4', 'n5'] as const;

function allowedStage(kind: LeadKind, stage: string): boolean {
  return kind === 'cliente'
    ? CLIENT_STAGES.includes(stage as (typeof CLIENT_STAGES)[number])
    : BROKER_STAGES.includes(stage as (typeof BROKER_STAGES)[number]);
}

function aiMayRespond(lead: Lead): boolean {
  if (!lead.ai_enabled) return false;
  if (lead.kind === 'cliente') return lead.stage === 'ia';
  return !['n4', 'n5'].includes(lead.stage);
}

function messageBody(message: MetaMessage): string {
  if (message.type === 'text') return String(message.text?.body ?? '');
  if (message.type === 'button') return String(message.button?.text ?? '');
  if (message.type === 'interactive') return String(message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? 'Resposta interativa');
  if (message.type === 'image') return String(message.image?.caption ?? '[Imagem]');
  if (message.type === 'document') return String(message.document?.caption ?? `[Documento${message.document?.filename ? `: ${message.document.filename}` : ''}]`);
  if (message.type === 'audio') return '[Áudio]';
  if (message.type === 'video') return String(message.video?.caption ?? '[Vídeo]');
  if (message.type === 'location') return '[Localização]';
  if (message.type === 'contacts') return '[Contato compartilhado]';
  return `[Mensagem ${message.type || 'desconhecida'}]`;
}

function mergeExtractedMetadata(current: Record<string, unknown>, extracted: Record<string, string>) {
  const previous = current.ai_extracted && typeof current.ai_extracted === 'object'
    ? current.ai_extracted as Record<string, unknown>
    : {};
  const useful = Object.fromEntries(Object.entries(extracted).filter(([, value]) => value.trim() !== ''));
  return {
    ...current,
    ai_extracted: { ...previous, ...useful },
  };
}

function whatsappMediaType(file: AiFileOption): WhatsAppMediaType {
  const mime = (file.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

async function loadAiContext(organizationId: string, kind: LeadKind): Promise<AiTrainingContext> {
  const admin = createAdminClient();
  const agent = kind === 'cliente' ? 'nara' : 'plantao';
  const [configResult, examplesResult, filesResult] = await Promise.all([
    admin
      .from('ai_agent_configs')
      .select('persona,knowledge,first_message,active')
      .eq('organization_id', organizationId)
      .eq('agent', agent)
      .maybeSingle(),
    admin
      .from('ai_training_examples')
      .select('user_message,assistant_message,rating,correction,notes')
      .eq('organization_id', organizationId)
      .eq('agent', agent)
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('ai_files')
      .select('id,category,title,description,trigger_keywords,storage_bucket,storage_path,original_name,mime_type')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .in('agent', [agent, 'both'])
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  if (configResult.error) console.error('[ai config]', configResult.error.message);
  if (examplesResult.error) console.error('[ai examples]', examplesResult.error.message);
  if (filesResult.error) console.error('[ai files]', filesResult.error.message);

  return {
    config: configResult.data ?? null,
    examples: examplesResult.data ?? [],
    files: (filesResult.data ?? []) as AiFileOption[],
  };
}

async function sendSelectedFiles(args: {
  organizationId: string;
  lead: Lead;
  connectionId: string;
  phoneNumberId: string;
  accessToken: string;
  destination: string;
  files: AiFileOption[];
  attachmentIds: string[];
}) {
  const admin = createAdminClient();
  const selected = args.attachmentIds
    .map((id) => args.files.find((file) => file.id === id))
    .filter((file): file is AiFileOption => Boolean(file))
    .slice(0, 3);

  for (const file of selected) {
    try {
      const { data: signed, error: signedError } = await admin.storage
        .from(file.storage_bucket)
        .createSignedUrl(file.storage_path, 3600);
      if (signedError || !signed?.signedUrl) throw signedError ?? new Error('Não foi possível gerar o link temporário do arquivo.');

      const type = whatsappMediaType(file);
      const result = await sendWhatsAppMedia({
        phoneNumberId: args.phoneNumberId,
        accessToken: args.accessToken,
        to: args.destination,
        type,
        link: signed.signedUrl,
        caption: type === 'audio' ? undefined : file.title,
        filename: type === 'document' ? file.original_name : undefined,
      });

      await admin.from('messages').insert({
        organization_id: args.organizationId,
        lead_id: args.lead.id,
        whatsapp_connection_id: args.connectionId,
        direction: 'out',
        sender_kind: 'ia',
        body: `📎 ${file.title}`,
        status: 'sent',
        whatsapp_message_id: result.messages?.[0]?.id ?? null,
        raw_payload: {
          ai_file_id: file.id,
          category: file.category,
          original_name: file.original_name,
          mime_type: file.mime_type,
        },
      });

      await admin.from('activities').insert({
        organization_id: args.organizationId,
        lead_id: args.lead.id,
        type: 'arquivo_ia_enviado',
        title: `IA enviou o arquivo “${file.title}”`,
        description: `${file.original_name} enviado automaticamente pelo WhatsApp.`,
        metadata: { ai_file_id: file.id, category: file.category, mime_type: file.mime_type },
      });
    } catch (error) {
      console.error('[whatsapp ai file]', file.id, error);
      await admin.from('activities').insert({
        organization_id: args.organizationId,
        lead_id: args.lead.id,
        type: 'falha_arquivo_ia',
        title: `Falha ao enviar o arquivo “${file.title}”`,
        description: error instanceof Error ? error.message : 'Erro desconhecido no envio do arquivo.',
        metadata: { ai_file_id: file.id },
      });
    }
  }
}

async function processAiTurn(args: { organizationId: string; leadId: string; connectionId: string; phoneNumberId: string; encryptedToken: string }) {
  const admin = createAdminClient();
  const { data: leadData } = await admin.from('leads').select('*').eq('id', args.leadId).maybeSingle();
  const lead = leadData as Lead | null;
  if (!lead || !aiMayRespond(lead)) return;

  const context = await loadAiContext(args.organizationId, lead.kind);
  if (context.config?.active === false) return;

  const { data: historyRows } = await admin
    .from('messages')
    .select('direction,sender_kind,body')
    .eq('lead_id', lead.id)
    .neq('direction', 'system')
    .order('created_at', { ascending: true })
    .limit(40);

  const history = (historyRows ?? []).map((row) => ({
    role: row.direction === 'in' ? 'user' as const : 'assistant' as const,
    content: row.body,
  }));
  const turn = await generateAiTurn(lead, history, context);
  if (!turn) return;

  const destination = normalizeWaId(lead.phone ?? '');
  const reply = turn.reply.trim();
  if (!destination || !reply) return;

  const accessToken = decryptToken(args.encryptedToken);
  const result = await sendWhatsAppText({
    phoneNumberId: args.phoneNumberId,
    accessToken,
    to: destination,
    body: reply,
  });

  await admin.from('messages').insert({
    organization_id: args.organizationId,
    lead_id: lead.id,
    whatsapp_connection_id: args.connectionId,
    direction: 'out',
    sender_kind: 'ia',
    body: reply,
    status: 'sent',
    whatsapp_message_id: result.messages?.[0]?.id ?? null,
  });

  if (turn.attachment_ids.length) {
    await sendSelectedFiles({
      organizationId: args.organizationId,
      lead,
      connectionId: args.connectionId,
      phoneNumberId: args.phoneNumberId,
      accessToken,
      destination,
      files: context.files ?? [],
      attachmentIds: turn.attachment_ids,
    });
  }

  const nextStage = allowedStage(lead.kind, turn.stage) ? turn.stage : lead.stage;
  const pauseForStage = lead.kind === 'cliente'
    ? nextStage !== 'ia'
    : ['n4', 'n5'].includes(nextStage);
  const nextAiEnabled = !turn.handoff && !pauseForStage;
  const score = Math.max(0, Math.min(100, Math.round(turn.score)));
  const persona = lead.kind === 'cliente' ? 'Nara' : 'Plantão';
  const metadata = mergeExtractedMetadata(lead.metadata || {}, turn.extracted);

  const { error: updateError } = await admin.from('leads').update({
    stage: nextStage,
    temperature: score,
    ai_enabled: nextAiEnabled,
    ai_classification: turn.classification,
    ai_summary: turn.summary,
    ai_next_action: turn.next_action,
    ai_last_classified_at: new Date().toISOString(),
    metadata,
  }).eq('id', lead.id);
  if (updateError) throw updateError;

  await admin.from('activities').insert({
    organization_id: args.organizationId,
    lead_id: lead.id,
    type: 'classificacao_ia',
    title: `${persona} classificou o contato como ${turn.classification}`,
    description: `${turn.summary}${turn.next_action ? ` Próxima ação: ${turn.next_action}` : ''}`,
    metadata: {
      persona: persona.toLowerCase(),
      classification: turn.classification,
      score,
      stage: nextStage,
      handoff: turn.handoff,
      attachment_ids: turn.attachment_ids,
      extracted: turn.extracted,
    },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    if (!verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
      return new Response('Invalid signature', { status: 401 });
    }
    const payload = JSON.parse(rawBody) as MetaWebhookPayload;
    const admin = createAdminClient();
    const aiJobs: Array<Parameters<typeof processAiTurn>[0]> = [];

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const phoneNumberId = String(value.metadata?.phone_number_id ?? '');
        if (!phoneNumberId) continue;
        const { data: connection } = await admin
          .from('whatsapp_connections')
          .select('*')
          .eq('phone_number_id', phoneNumberId)
          .eq('status', 'connected')
          .maybeSingle();
        if (!connection) continue;

        for (const status of value.statuses ?? []) {
          const wamid = String(status.id ?? '');
          if (wamid) await admin.from('messages').update({ status: String(status.status ?? 'unknown') }).eq('whatsapp_message_id', wamid);
        }

        const contactName = String(value.contacts?.[0]?.profile?.name ?? '').trim();
        for (const message of value.messages ?? []) {
          const waId = normalizeWaId(String(message.from ?? value.contacts?.[0]?.wa_id ?? ''));
          if (!waId) continue;
          const kind: LeadKind = connection.channel === 'clientes' ? 'cliente' : 'corretor';
          let { data: lead } = await admin
            .from('leads')
            .select('*')
            .eq('organization_id', connection.organization_id)
            .eq('kind', kind)
            .eq('phone', waId)
            .maybeSingle();

          if (!lead) {
            const initialStage = kind === 'cliente' ? 'ia' : 'n1';
            const { data: inserted, error } = await admin.from('leads').insert({
              organization_id: connection.organization_id,
              kind,
              name: contactName || waId,
              phone: waId,
              stage: initialStage,
              source: 'WhatsApp',
              company: kind === 'corretor' ? 'Não informada' : null,
              temperature: 0,
              ai_enabled: true,
              metadata: {},
            }).select('*').single();
            if (error) throw error;
            lead = inserted;
          }

          const inboundWamid = String(message.id ?? '').trim();
          if (!inboundWamid) continue;
          const body = messageBody(message);
          const { data: storedMessage, error: messageError } = await admin.from('messages').upsert({
            organization_id: connection.organization_id,
            lead_id: lead.id,
            whatsapp_connection_id: connection.id,
            direction: 'in',
            sender_kind: 'lead',
            body,
            status: 'received',
            whatsapp_message_id: inboundWamid,
            raw_payload: message,
            created_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
          }, { onConflict: 'whatsapp_message_id', ignoreDuplicates: true }).select('id').maybeSingle();
          if (messageError) throw messageError;
          if (!storedMessage) continue;

          await admin.from('leads').update({
            name: lead.name === lead.phone && contactName ? contactName : lead.name,
            updated_at: new Date().toISOString(),
          }).eq('id', lead.id);

          const typedLead = lead as Lead;
          if (aiMayRespond(typedLead)) {
            aiJobs.push({
              organizationId: connection.organization_id,
              leadId: lead.id,
              connectionId: connection.id,
              phoneNumberId: connection.phone_number_id,
              encryptedToken: connection.encrypted_access_token,
            });
          }
        }
      }
    }

    if (aiJobs.length) {
      after(async () => {
        for (const job of aiJobs) {
          try { await processAiTurn(job); } catch (error) { console.error('[whatsapp ai]', error); }
        }
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[whatsapp webhook]', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
