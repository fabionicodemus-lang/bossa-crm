import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recoverPlantaoHumanPauses } from '@/lib/whatsapp/plantaoPauseRecovery';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...await recoverPlantaoHumanPauses(createAdminClient()) });
}
