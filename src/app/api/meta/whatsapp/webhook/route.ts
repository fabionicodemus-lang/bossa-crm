import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAiReply } from '@/lib/ai';
import type { Lead } from '@/lib/types';
import { decryptToken, normalizeWaId, sendWhatsAppText, verifyMetaSignature } from '@/lib/whatsapp';

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

async function processAiReply(args: { organizationId: string; leadId: string; connectionId: string; phoneNumberId: string; encryptedToken: string }) {
  const admin = createAdminClient();
  const { data: leadData } = await admin.from('leads').select('*').eq('id', args.leadId).maybeSingle();
  const lead = leadData as Lead | null;
  if (!lead || !lead.ai_enabled || lead.kind !== 'cliente' || lead.stage === 'fechado') return;

  const { data: historyRows } = await admin
    .from('messages')
    .select('direction,sender_kind,body')
    .eq('lead_id', lead.id)
    .neq('direction', 'system')
    .order('created_at', { ascending: true })
    .limit(30);
  const history = (historyRows ?? []).map((row) => ({
    role: row.direction === 'in' ? 'user' as const : 'assistant' as const,
    content: row.body,
  }));
  const reply = await generateAiReply(lead, history);
  if (!reply) return;

  const destination = normalizeWaId(lead.phone ?? '');
  if (!destination) return;

  const result = await sendWhatsAppText({
    phoneNumberId: args.phoneNumberId,
    accessToken: decryptToken(args.encryptedToken),
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
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    if (!verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
      return new Response('Invalid signature', { status: 401 });
    }
    const payload = JSON.parse(rawBody) as MetaWebhookPayload;
    const admin = createAdminClient();
    const aiJobs: Array<Parameters<typeof processAiReply>[0]> = [];

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
          const kind = connection.channel === 'clientes' ? 'cliente' : 'corretor';
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
              ai_enabled: kind === 'cliente',
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
          if (!storedMessage) continue; // webhook repetido: não responder duas vezes

          await admin.from('leads').update({
            name: lead.name === lead.phone && contactName ? contactName : lead.name,
            updated_at: new Date().toISOString(),
            ai_enabled: lead.stage === 'fechado' ? false : lead.ai_enabled,
          }).eq('id', lead.id);

          if (kind === 'cliente' && lead.ai_enabled && lead.stage !== 'fechado') {
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
          try { await processAiReply(job); } catch (error) { console.error('[whatsapp ai]', error); }
        }
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[whatsapp webhook]', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
