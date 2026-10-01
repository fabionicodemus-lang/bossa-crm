import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processCommercialIntelligenceBatch } from '@/lib/commercial-conversation-intelligence';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  const admin = createAdminClient();
  const {error: rankingError} = await admin.rpc('enqueue_broker_performance');
  if (rankingError) throw new Error(rankingError.message);
  const result = await processCommercialIntelligenceBatch(admin, 20);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
