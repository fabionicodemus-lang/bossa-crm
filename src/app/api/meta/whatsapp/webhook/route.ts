import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyMetaSignature } from '@/lib/whatsapp/crypto';
import { dispatchWebhookEvent } from '@/lib/whatsapp/webhookDispatcher';
import type { MetaWebhookPayload } from '@/lib/whatsapp/webhookTypes';

export const runtime = 'nodejs';
export const maxDuration = 60;

function webhookVerifyToken() {
  const value = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!value) throw new Error('Variável de ambiente ausente: WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  return value;
}

function rawJson(rawBody: string) {
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { raw_text: rawBody };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  try {
    if (mode === 'subscribe' && token === webhookVerifyToken()) {
      return new Response(challenge ?? '', { status: 200 });
    }
  } catch (error) {
    console.error('[whatsapp webhook handshake]', error);
    return new Response('Webhook not configured', { status: 500 });
  }

  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const admin = createAdminClient();
  const signatureValid = verifyMetaSignature(
    rawBody,
    request.headers.get('x-hub-signature-256'),
  );

  if (!signatureValid) {
    const now = new Date().toISOString();
    const { error } = await admin.from('whatsapp_webhook_events').insert({
      raw: rawJson(rawBody),
      signature_valid: false,
      processed_at: now,
      error: 'Assinatura X-Hub-Signature-256 inválida.',
    });
    if (error) console.error('[whatsapp invalid signature log]', error.message);
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    const now = new Date().toISOString();
    await admin.from('whatsapp_webhook_events').insert({
      raw: { raw_text: rawBody },
      signature_valid: true,
      processed_at: now,
      error: 'Corpo JSON inválido.',
    });
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rows: Array<{
    phone_number_id: string | null;
    raw: Record<string, unknown>;
    signature_valid: true;
  }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      rows.push({
        phone_number_id: String(change.value?.metadata?.phone_number_id ?? '').trim() || null,
        raw: {
          object: payload.object,
          entry_id: entry.id,
          change,
        },
        signature_valid: true,
      });
    }
  }

  if (!rows.length) {
    rows.push({
      phone_number_id: null,
      raw: payload as Record<string, unknown>,
      signature_valid: true,
    });
  }

  const { data: events, error } = await admin
    .from('whatsapp_webhook_events')
    .insert(rows)
    .select('id');

  if (error || !events?.length) {
    console.error('[whatsapp webhook queue]', error?.message ?? 'Evento não gravado.');
    return NextResponse.json({ error: 'Webhook queue unavailable' }, { status: 500 });
  }

  after(async () => {
    for (const event of events) {
      try {
        await dispatchWebhookEvent(event.id);
      } catch (processError) {
        console.error('[whatsapp webhook async]', event.id, processError);
      }
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}