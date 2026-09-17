import { createAdminClient } from '@/lib/supabase/admin';
import { microsoftIsConfigured, syncMicrosoftCalendar } from '@/lib/microsoft-calendar';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  if (!microsoftIsConfigured()) return Response.json({ configured: false, processed: 0 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('microsoft_calendar_connections')
    .select('organization_id,user_id,last_synced_at')
    .order('last_synced_at', { ascending: true, nullsFirst: true }).limit(10);
  if (error) return Response.json({ error: 'Falha ao consultar conexões.' }, { status: 500 });
  let processed = 0; let failures = 0;
  for (const connection of data || []) {
    try {
      await syncMicrosoftCalendar(connection.organization_id, connection.user_id);
      processed++;
    } catch (cause) {
      failures++;
      await admin.from('microsoft_calendar_connections').update({
        last_synced_at: new Date().toISOString(),
        last_error: cause instanceof Error ? cause.message.slice(0, 300) : 'Falha de sincronização.',
      }).eq('organization_id', connection.organization_id).eq('user_id', connection.user_id);
      console.error('[microsoft calendar cron]', connection.user_id, cause instanceof Error ? cause.message : 'Falha');
    }
  }
  return Response.json({ processed, failures });
}
