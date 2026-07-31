import { NextResponse } from 'next/server';
import { processPendingWebhookEvents } from '@/lib/whatsapp/webhookDispatcher';

export const runtime = 'nodejs';
export const maxDuration = 60;
const RECOVERY_BATCH_SIZE = 5;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return bearer === secret || request.headers.get('x-cron-secret') === secret;
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    ...(await processPendingWebhookEvents(RECOVERY_BATCH_SIZE)),
  });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}