import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMicrosoftConnection, microsoftIsConfigured, syncMicrosoftCalendar } from '@/lib/microsoft-calendar';

export const runtime = 'nodejs';

export async function GET() {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return Response.json({ error: 'Não autenticado.' }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('microsoft_calendar_connections')
    .select('user_id,microsoft_email,last_synced_at,last_error')
    .eq('organization_id', context.organization.id);
  if (error) return Response.json({ error: 'Não foi possível verificar as conexões.' }, { status: 500 });
  return Response.json({ configured: microsoftIsConfigured(),
    own: (data || []).find((item) => item.user_id === context.userId) || null,
    team: (data || []).map((item) => ({ user_id: item.user_id, connected: true, last_synced_at: item.last_synced_at })) });
}

export async function POST() {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return Response.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!['admin', 'comercial'].includes(context.role)) return Response.json({ error: 'Sem permissão.' }, { status: 403 });
  if (!microsoftIsConfigured()) return Response.json({ error: 'Configure as credenciais Microsoft no servidor.' }, { status: 503 });
  try {
    const result = await syncMicrosoftCalendar(context.organization.id, context.userId);
    return Response.json(result);
  } catch (error) {
    console.error('[microsoft calendar sync]', error instanceof Error ? error.message : 'Erro');
    return Response.json({ error: error instanceof Error ? error.message : 'Falha de sincronização.' }, { status: 502 });
  }
}

export async function DELETE() {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return Response.json({ error: 'Não autenticado.' }, { status: 401 });
  const current = await getMicrosoftConnection(context.organization.id, context.userId);
  if (!current) return Response.json({ ok: true });
  const admin = createAdminClient();
  const { error } = await admin.from('microsoft_calendar_connections').delete()
    .eq('organization_id', context.organization.id).eq('user_id', context.userId);
  if (error) return Response.json({ error: 'Não foi possível desconectar o Outlook.' }, { status: 500 });
  await admin.from('agenda_events').delete().eq('organization_id', context.organization.id)
    .eq('assigned_to', context.userId).eq('microsoft_sync_status', 'imported');
  return Response.json({ ok: true });
}
