import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'openid profile email offline_access User.Read Calendars.ReadWrite';
const CALLBACK = 'https://crm.bossaempreendimentos.com.br/api/microsoft/callback';
const TZ = 'America/Sao_Paulo';

type Connection = {
  organization_id: string; user_id: string; microsoft_user_id: string; microsoft_email: string; tenant_id: string;
  refresh_token_ciphertext: string; access_token_ciphertext: string; access_token_expires_at: string;
  last_synced_at: string | null; last_error: string | null;
};
type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
export type GraphEvent = {
  id: string; subject?: string; isCancelled?: boolean; showAs?: string;
  start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string };
  location?: { displayName?: string }; isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string }; webLink?: string;
  transactionId?: string;
};

function key() {
  const raw = process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY_BASE64 || '';
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32) throw new Error('Configure MICROSOFT_TOKEN_ENCRYPTION_KEY_BASE64 (32 bytes em Base64).');
  return bytes;
}

export function microsoftIsConfigured() {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET &&
    Buffer.from(process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY_BASE64 || '', 'base64').length === 32);
}

function clientId() { return process.env.MICROSOFT_CLIENT_ID || ''; }
function tenant() { return process.env.MICROSOFT_TENANT_ID || 'organizations'; }
function redirectUri() { return process.env.MICROSOFT_REDIRECT_URI || CALLBACK; }
function tokenUrl() { return `https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/token`; }

export function microsoftAuthorizeUrl(state: string, challenge: string) {
  if (!microsoftIsConfigured()) throw new Error('Integração Microsoft ainda não configurada no servidor.');
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/authorize`);
  for (const [k, v] of Object.entries({ client_id: clientId(), response_type: 'code', redirect_uri: redirectUri(),
    response_mode: 'query', scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' })) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export function encryptMicrosoftToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}
function decryptMicrosoftToken(value: string) {
  const [iv, tag, ciphertext] = value.split('.');
  if (!iv || !tag || !ciphertext) throw new Error('Credencial Microsoft inválida; reconecte a conta.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export async function microsoftExchangeCode(code: string, verifier: string): Promise<TokenReply> {
  const response = await fetch(tokenUrl(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: process.env.MICROSOFT_CLIENT_SECRET || '', grant_type: 'authorization_code',
      code, code_verifier: verifier, redirect_uri: redirectUri(), scope: SCOPES }), cache: 'no-store' });
  const data = await response.json() as TokenReply;
  if (!response.ok || !data.access_token || !data.refresh_token) throw new Error(data.error_description || 'Falha na autorização Microsoft.');
  return data;
}

export async function microsoftCurrentUser(accessToken: string) {
  const response = await fetch(`${GRAPH}/me?$select=id,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível verificar a identidade da conta Microsoft.');
  return response.json() as Promise<{ id: string; mail?: string; userPrincipalName?: string }>;
}

export async function getMicrosoftConnection(organizationId: string, userId: string): Promise<Connection | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('microsoft_calendar_connections').select('*')
    .eq('organization_id', organizationId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as Connection | null;
}

async function accessToken(connection: Connection): Promise<string> {
  if (Date.parse(connection.access_token_expires_at) > Date.now() + 120_000) return decryptMicrosoftToken(connection.access_token_ciphertext);
  const response = await fetch(tokenUrl(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
      grant_type: 'refresh_token', refresh_token: decryptMicrosoftToken(connection.refresh_token_ciphertext), scope: SCOPES }), cache: 'no-store' });
  const data = await response.json() as TokenReply;
  if (!response.ok || !data.access_token) {
    await createAdminClient().from('microsoft_calendar_connections').update({ last_error: 'Sessão Microsoft expirada; reconecte a conta.' })
      .eq('organization_id', connection.organization_id).eq('user_id', connection.user_id);
    throw new Error('A conexão Microsoft expirou. Reconecte a conta na Agenda.');
  }
  const patch = {
    access_token_ciphertext: encryptMicrosoftToken(data.access_token),
    refresh_token_ciphertext: encryptMicrosoftToken(data.refresh_token || decryptMicrosoftToken(connection.refresh_token_ciphertext)),
    access_token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(), last_error: null,
  };
  const { error } = await createAdminClient().from('microsoft_calendar_connections').update(patch)
    .eq('organization_id', connection.organization_id).eq('user_id', connection.user_id);
  if (error) throw error;
  return data.access_token;
}

async function graphRequest(connection: Connection, path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, GRAPH);
  if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/')) throw new Error('Endereço Microsoft inválido.');
  const token = await accessToken(connection);
  const response = await fetch(url, { ...init, cache: 'no-store', headers: {
    Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"',
    'Content-Type': 'application/json', ...(init.headers || {}),
  } });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    throw new Error(`Microsoft Graph indisponível (${response.status}${payload?.error?.code ? `, ${payload.error.code}` : ''}).`);
  }
  return response;
}

export function graphEventTimes(event: GraphEvent) {
  function convert(input: { dateTime: string; timeZone: string }) {
    // Todas as consultas/alterações solicitam UTC explicitamente no Graph.
    const value = input.dateTime.replace(/\.(\d{3})\d+/, '.$1');
    const instant = /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`;
    const parsed = new Date(instant);
    if (!Number.isFinite(parsed.getTime())) throw new Error('Evento da Microsoft com data inválida.');
    return parsed.toISOString();
  }
  return { starts_at: convert(event.start), ends_at: convert(event.end) };
}

export async function microsoftCalendarView(connection: Connection, start: string, end: string): Promise<GraphEvent[]> {
  const first = new URL(`${GRAPH}/me/calendarView`);
  first.searchParams.set('startDateTime', start);
  first.searchParams.set('endDateTime', end);
  first.searchParams.set('$top', '100');
  const items: GraphEvent[] = [];
  let next: string | null = first.toString();
  for (let page = 0; next && page < 20; page += 1) {
    const response = await graphRequest(connection, next);
    const data = await response.json() as { value?: GraphEvent[]; '@odata.nextLink'?: string };
    items.push(...(data.value || []));
    next = data['@odata.nextLink'] || null;
  }
  if (next) throw new Error('A consulta da agenda Microsoft excedeu o limite; sincronização interrompida para evitar dados incompletos.');
  return items;
}

export async function microsoftBusyConflicts(organizationId: string, userId: string, startsAt: string, endsAt: string, ignoreMicrosoftId?: string | null) {
  const connection = await getMicrosoftConnection(organizationId, userId);
  if (!connection) return [];
  const remote = await microsoftCalendarView(connection, startsAt, endsAt);
  return remote.filter((item) => !item.isCancelled && item.id !== ignoreMicrosoftId && !['free','workingElsewhere'].includes(item.showAs || '')
    && (() => { const date = graphEventTimes(item); return date.starts_at < endsAt && date.ends_at > startsAt; })())
    .map((item) => ({ id: item.id, title: 'Compromisso no Outlook', starts_at: graphEventTimes(item).starts_at, ends_at: graphEventTimes(item).ends_at }));
}

type CrmEvent = { id: string; organization_id: string; assigned_to: string | null; title: string; description: string | null;
  meeting_mode: string; location: string | null; starts_at: string; ends_at: string; microsoft_event_id: string | null;
  microsoft_sync_status: string; video_url: string | null; };
function graphPayload(event: CrmEvent) {
  return {
    subject: event.title,
    body: { contentType: 'text', content: event.description || 'Compromisso criado na Agenda BOSSA CRM.' },
    start: { dateTime: event.starts_at.replace(/Z$/, ''), timeZone: 'UTC' },
    end: { dateTime: event.ends_at.replace(/Z$/, ''), timeZone: 'UTC' },
    location: { displayName: event.location || '' },
  };
}

export async function pushMicrosoftEvent(event: CrmEvent): Promise<'not_connected' | 'synced'> {
  if (!event.assigned_to || event.microsoft_sync_status === 'imported') return 'not_connected';
  const connection = await getMicrosoftConnection(event.organization_id, event.assigned_to);
  if (!connection) return 'not_connected';
  const admin = createAdminClient();
  try {
    const path = event.microsoft_event_id ? `${GRAPH}/me/events/${encodeURIComponent(event.microsoft_event_id)}` : `${GRAPH}/me/calendar/events`;
    const body = { ...graphPayload(event), ...(!event.microsoft_event_id && event.meeting_mode === 'video'
      ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', transactionId: event.id } : {}) };
    const response = await graphRequest(connection, path, { method: event.microsoft_event_id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    const remote = await response.json() as GraphEvent;
    const patch: Record<string, unknown> = { microsoft_event_id: remote.id || event.microsoft_event_id, microsoft_sync_status: 'synced' };
    if (remote.onlineMeeting?.joinUrl) patch.video_url = remote.onlineMeeting.joinUrl;
    const { error } = await admin.from('agenda_events').update(patch).eq('id', event.id).eq('organization_id', event.organization_id);
    if (error) throw error;
    await admin.from('microsoft_calendar_connections').update({ last_error: null }).eq('organization_id', connection.organization_id).eq('user_id', connection.user_id);
    return 'synced';
  } catch (error) {
    await admin.from('agenda_events').update({ microsoft_sync_status: 'failed' }).eq('id', event.id).eq('organization_id', event.organization_id);
    await admin.from('microsoft_calendar_connections').update({ last_error: error instanceof Error ? error.message.slice(0, 300) : 'Falha na sincronização.' })
      .eq('organization_id', connection.organization_id).eq('user_id', connection.user_id);
    throw error;
  }
}

export async function deleteMicrosoftEvent(event: CrmEvent) {
  if (!event.assigned_to || !event.microsoft_event_id || event.microsoft_sync_status === 'imported') return;
  const connection = await getMicrosoftConnection(event.organization_id, event.assigned_to);
  if (!connection) throw new Error('Reconecte a conta Microsoft antes de excluir este evento.');
  await graphRequest(connection, `${GRAPH}/me/events/${encodeURIComponent(event.microsoft_event_id)}`, { method: 'DELETE' });
}

export async function syncMicrosoftCalendar(organizationId: string, userId: string) {
  const connection = await getMicrosoftConnection(organizationId, userId);
  if (!connection) throw new Error('Conecte seu Outlook antes de sincronizar.');
  const admin = createAdminClient();
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const end = new Date(now.getTime() + 180 * 86_400_000).toISOString();
  const remote = await microsoftCalendarView(connection, start, end);
  const { data: local, error: localError } = await admin.from('agenda_events').select('*')
    .eq('organization_id', organizationId).eq('assigned_to', userId).not('microsoft_event_id', 'is', null)
    .gte('starts_at', start).lt('starts_at', end).limit(3000);
  if (localError) throw localError;
  const map = new Map((local || []).map((event) => [event.microsoft_event_id as string, event]));
  let imported = 0; let updated = 0; let skipped = 0;
  const received = new Set<string>();
  for (const item of remote) {
    if (!item.id) continue;
    received.add(item.id);
    const existing = map.get(item.id);
    if (item.isCancelled) {
      if (existing) await admin.from('agenda_events').update({ status: 'cancelled' }).eq('id', existing.id);
      continue;
    }
    const times = graphEventTimes(item);
    if (new Date(times.ends_at) <= new Date(times.starts_at)) continue;
    const mode = item.isOnlineMeeting ? 'video' : 'presencial';
    const patch = { starts_at: times.starts_at, ends_at: times.ends_at,
      ...(existing?.microsoft_sync_status === 'imported' ? { title: 'Ocupado · Outlook', description: null } : {}),
      location: item.location?.displayName || null, video_url: item.onlineMeeting?.joinUrl || null,
      ...(existing?.microsoft_sync_status === 'imported' ? { meeting_mode: mode } : {}), status: 'scheduled' };
    if (existing) {
      const { error } = await admin.from('agenda_events').update(patch).eq('id', existing.id);
      if (error) { skipped++; continue; }
      updated++;
      continue;
    }
    if (['free','workingElsewhere'].includes(item.showAs || '')) continue;
    const { error } = await admin.from('agenda_events').insert({
      organization_id: organizationId, assigned_to: userId, created_by_kind: 'system', title: 'Ocupado · Outlook',
      event_type: 'outro', meeting_mode: mode, ...patch, microsoft_event_id: item.id, microsoft_sync_status: 'imported',
      metadata: { source: 'outlook', private: true },
    });
    if (error) { skipped++; continue; }
    imported++;
  }
  for (const item of local || []) {
    if (item.microsoft_event_id && item.status === 'scheduled' && !received.has(item.microsoft_event_id)) {
      const { error } = await admin.from('agenda_events').update({ status: 'cancelled' }).eq('id', item.id);
      if (error) skipped++;
    }
  }
  await admin.from('microsoft_calendar_connections').update({ last_synced_at: new Date().toISOString(), last_error: skipped ? `${skipped} eventos não importados por conflito ou erro; confira os horários.` : null })
    .eq('organization_id', organizationId).eq('user_id', userId);
  return { imported, updated, skipped };
}
