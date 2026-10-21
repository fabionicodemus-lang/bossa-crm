import { sourceRequestFailure } from '@/lib/commercial/source-request';
import { getCurrentContext } from '@/lib/auth';
import { findAgendaConflicts } from '@/lib/agenda';
import { deleteMicrosoftEvent, pushMicrosoftEvent } from '@/lib/microsoft-calendar';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type AgendaPayload = {
  id?: string; lead_id?: string | null; assigned_to?: string | null;
  title?: string; description?: string | null; event_type?: string; meeting_mode?: string;
  location?: string | null; video_url?: string | null; starts_at?: string; ends_at?: string; status?: string;
};
type SessionClient = Awaited<ReturnType<typeof createClient>>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const eventTypes = new Set(['reuniao_cliente', 'apresentacao', 'visita', 'ligacao', 'tarefa', 'outro']);
const meetingModes = new Set(['presencial', 'video', 'telefone']);
const statuses = new Set(['scheduled', 'completed', 'cancelled']);
const err = (message: string, status = 400) => Response.json({ error: message }, { status });
const has = (value: object, key: string) => Object.hasOwn(value, key);
function validDate(value: string | undefined) { return Boolean(value && Number.isFinite(new Date(value).getTime())); }
function validateTime(start?: string, end?: string) {
  return validDate(start) && validDate(end) && new Date(end!).getTime() > new Date(start!).getTime();
}
async function payload(request: Request): Promise<AgendaPayload | null> {
  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  for (const key of ['id', 'title', 'event_type', 'meeting_mode', 'starts_at', 'ends_at', 'status']) {
    if (has(body, key) && typeof body[key] !== 'string') return null;
  }
  for (const key of ['lead_id', 'assigned_to', 'description', 'location', 'video_url']) {
    if (has(body, key) && body[key] !== null && typeof body[key] !== 'string') return null;
  }
  for (const key of ['id', 'lead_id', 'assigned_to']) {
    if (body[key] && !uuid.test(String(body[key]))) return null;
  }
  return body as AgendaPayload;
}
async function authorization(write = false) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return { context: null, response: err('Não autenticado.', 401) };
  if (write && !['admin', 'comercial'].includes(context.role)) return { context: null, response: err('Sem permissão.', 403) };
  return { context, response: null };
}
async function references(db: SessionClient, org: string, assignedTo: string, leadId: string | null, requireActiveLead: boolean) {
  const member = await db.from('memberships').select('user_id')
    .eq('organization_id', org).eq('user_id', assignedTo).maybeSingle();
  if (member.error) return err('Não foi possível conferir o responsável.', 503);
  if (!member.data) return err('Responsável não pertence à organização.');
  if (leadId) {
    const lead = await db.from('leads').select('id,archived_at')
      .eq('organization_id', org).eq('id', leadId).maybeSingle();
    if (lead.error) return err('Não foi possível conferir o contato.', 503);
    if (!lead.data || (requireActiveLead && lead.data.archived_at)) return err('Contato indisponível ou arquivado nesta organização.');
  }
  return null;
}
async function trackedSource(db: SessionClient, org: string, current: { id: string; opportunity_id?: string | null }) {
  if (current.opportunity_id) return { tracked: true, error: null };
  // Before the commercial migrations this column is absent: preserve legacy agenda use.
  if (!has(current, 'opportunity_id')) return { tracked: false, error: null };
  const review = await db.from('commercial_link_reviews').select('entity_id')
    .eq('organization_id', org).eq('entity_type', 'agenda_events').eq('entity_id', current.id).maybeSingle();
  if (review.error) return { tracked: false, error: err('Não foi possível conferir o histórico comercial. Nenhuma exclusão foi realizada.', 503) };
  return { tracked: Boolean(review.data), error: null };
}
async function conflictsOrFailure(input: Parameters<typeof findAgendaConflicts>[0]) {
  try { return { conflicts: await findAgendaConflicts(input), error: '' }; }
  catch (cause) {
    console.error('[agenda availability]', cause instanceof Error ? cause.message : 'Erro');
    return { conflicts: [], error: 'Não foi possível verificar toda a disponibilidade, inclusive Outlook. Tente novamente.' };
  }
}

export async function GET(request: Request) {
  const auth = await authorization();
  if (!auth.context) return auth.response!;
  const params = new URL(request.url).searchParams;
  const start = params.get('start'); const end = params.get('end'); const assignedTo = params.get('assigned_to');
  if ((assignedTo && !uuid.test(assignedTo)) || (start && !validDate(start)) || (end && !validDate(end))) return err('Filtro de agenda inválido.');
  const db = await createClient();
  let query = db.from('agenda_events').select('*').eq('organization_id', auth.context.organization.id)
    .order('starts_at', { ascending: true }).limit(3000);
  if (start) query = query.gte('starts_at', start);
  if (end) query = query.lt('starts_at', end);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);
  const { data, error } = await query;
  if (error) return err('Não foi possível consultar a agenda.', 503);
  return Response.json({ events: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authorization(true);
  if (!auth.context) return auth.response!;
  const body = await payload(request);
  if (!body) return err('Dados da agenda inválidos.');
  const requestId = request.headers.get('Idempotency-Key');
  if (!requestId || !uuid.test(requestId)) return err('Informe uma chave válida para salvar este compromisso.');
  if (!body.title?.trim() || !body.assigned_to) return err('Informe título e responsável.');
  if (!validateTime(body.starts_at, body.ends_at)) return err('Informe início e término válidos.');
  if (!eventTypes.has(body.event_type || '') || !meetingModes.has(body.meeting_mode || '')) return err('Tipo ou formato inválido.');
  if (body.status !== undefined && body.status !== 'scheduled') return err('Novos compromissos devem ser agendados; registre o desfecho depois.');
  // Never impersonate a user with a service-role write. The cookie-bound client
  // preserves auth.uid() in transactional commercial events and enforces RLS.
  const db = await createClient();
  const org = auth.context.organization.id;
  const creation = {
    lead_id: body.lead_id || null, assigned_to: body.assigned_to,
    title: body.title.trim(), description: body.description?.trim() || null,
    event_type: body.event_type, meeting_mode: body.meeting_mode,
    location: body.location?.trim() || null, video_url: body.video_url?.trim() || null,
    starts_at: new Date(body.starts_at!).toISOString(), ends_at: new Date(body.ends_at!).toISOString(),
  };
  const replay = await db.rpc('commercial_replay_source_request', {
    p_org: org, p_request: requestId, p_type: 'agenda_events', p_payload: creation,
  });
  if (replay.error) { const failure = sourceRequestFailure(replay.error); return Response.json({ error: failure.message, code: replay.error.code, definiteRollback: failure.definiteRollback }, { status: failure.status }); }
  // Do not repeat Outlook side effects, even if the original event has been cancelled or edited.
  if (replay.data !== null && (!replay.data?.record?.id || replay.data.replayed !== true)) return err('O servidor não confirmou a gravação anterior. Tente novamente com a mesma chave.', 503);
  if (replay.data) return Response.json({ event: replay.data.record, replayed: true,
    warning: 'Gravação anterior recuperada. Confira o estado atual e a sincronização com o Outlook antes de avisar o participante.' });
  const invalid = await references(db, org, body.assigned_to, body.lead_id || null, true);
  if (invalid) return invalid;
  const availability = await conflictsOrFailure({ organizationId: org,
    assignedTo: body.assigned_to, startsAt: body.starts_at!, endsAt: body.ends_at! });
  if (availability.error) return err(availability.error, 503);
  if (availability.conflicts.length) return Response.json({ error: 'Responsável já possui compromisso nesse horário.', conflicts: availability.conflicts, definiteRollback: true }, { status: 409 });
  const created = await db.rpc('commercial_create_agenda_once', { p_org: org, p_request: requestId, p_data: creation });
  if (created.error || !created.data?.record?.id || typeof created.data.replayed !== 'boolean') {
    const failure = sourceRequestFailure(created.error);
    return Response.json({ error: failure.message, code: created.error?.code, definiteRollback: failure.definiteRollback }, { status: failure.status });
  }
  const data = created.data.record;
  if (created.data.replayed) return Response.json({ event: data, replayed: true,
    warning: 'Compromisso já salvo por outra tentativa. Confira a sincronização com o Outlook; nenhum novo envio foi iniciado.' });
  try {
    const syncStatus = await pushMicrosoftEvent(data);
    const refreshed = await db.from('agenda_events').select('*').eq('organization_id', org).eq('id', data.id).maybeSingle();
    return Response.json({ event: refreshed.data || data, syncStatus }, { status: 201 });
  } catch (cause) {
    console.error('[agenda outlook create]', cause instanceof Error ? cause.message : 'Erro');
    return Response.json({ event: data, warning: 'Compromisso salvo no CRM, mas não confirmado no Outlook. Verifique a conexão e sincronize antes de avisar o participante.' }, { status: 202 });
  }
}

export async function PATCH(request: Request) {
  const auth = await authorization(true);
  if (!auth.context) return auth.response!;
  const body = await payload(request);
  if (!body?.id) return err('Evento ou dados não informados corretamente.');
  const db = await createClient();
  const org = auth.context.organization.id;
  const existing = await db.from('agenda_events').select('*').eq('id', body.id).eq('organization_id', org).maybeSingle();
  if (existing.error) return err('Não foi possível consultar o compromisso.', 503);
  const current = existing.data;
  if (!current) return err('Evento não encontrado.', 404);
  if (current.microsoft_sync_status === 'imported') return err('Este bloqueio veio do Outlook. Edite-o diretamente no Outlook e sincronize novamente.', 403);
  const leadId = has(body, 'lead_id') ? body.lead_id || null : current.lead_id;
  const assignedTo = has(body, 'assigned_to') ? body.assigned_to : current.assigned_to;
  const startsAt = body.starts_at ?? current.starts_at;
  const endsAt = body.ends_at ?? current.ends_at;
  if (!assignedTo || !validateTime(startsAt, endsAt)) return err('Responsável ou período inválido.');
  if (body.title !== undefined && !body.title.trim()) return err('Informe um título.');
  if (current.microsoft_event_id && assignedTo !== current.assigned_to) return err('Para trocar o responsável de um evento sincronizado, cancele e crie um novo compromisso.', 409);
  const nextStatus = body.status ?? current.status;
  if (!statuses.has(nextStatus)) return err('Status inválido.');
  if (body.event_type !== undefined && !eventTypes.has(body.event_type)) return err('Tipo inválido.');
  if (body.meeting_mode !== undefined && !meetingModes.has(body.meeting_mode)) return err('Formato inválido.');
  if (leadId !== current.lead_id || (body.event_type !== undefined && body.event_type !== current.event_type)) {
    const history = await trackedSource(db, org, current);
    if (history.error) return history.error;
    if (history.tracked) return err('Este compromisso tem histórico comercial. A troca de contato ou tipo exige revisão específica; o histórico foi preservado.', 409);
  }
  const invalid = await references(db, org, assignedTo, leadId, leadId !== current.lead_id);
  if (invalid) return invalid;
  if (nextStatus === 'scheduled') {
    const availability = await conflictsOrFailure({ organizationId: org, assignedTo,
      startsAt, endsAt, excludeEventId: body.id, excludeMicrosoftId: current.microsoft_event_id });
    if (availability.error) return err(availability.error, 503);
    if (availability.conflicts.length) return Response.json({ error: 'Responsável já possui compromisso nesse horário.', conflicts: availability.conflicts }, { status: 409 });
  }
  const patch: Record<string, unknown> = {};
  for (const key of ['lead_id', 'assigned_to', 'title', 'description', 'location', 'video_url', 'starts_at', 'ends_at', 'status', 'event_type', 'meeting_mode'] as const) {
    if (has(body, key)) patch[key] = key === 'lead_id' ? leadId : body[key] ?? null;
  }
  if (!Object.keys(patch).length) return err('Nenhuma alteração informada.');
  let update = db.from('agenda_events').update(patch).eq('id', body.id).eq('organization_id', org);
  if (current.updated_at) update = update.eq('updated_at', current.updated_at);
  const { data, error } = await update.select('*').maybeSingle();
  if (error) return err(error.code === '23P01' ? 'Conflito de horário; atualize a agenda.' : 'Não foi possível atualizar o compromisso com a sua sessão.', error.code === '23P01' ? 409 : 500);
  if (!data) return err('O compromisso mudou ou sua permissão foi alterada. Atualize a agenda.', 409);
  try {
    if (nextStatus === 'cancelled') await deleteMicrosoftEvent(data);
    else await pushMicrosoftEvent(data);
    const refreshed = await db.from('agenda_events').select('*').eq('organization_id', org).eq('id', data.id).maybeSingle();
    return Response.json({ event: refreshed.data || data });
  } catch (cause) {
    console.error('[agenda outlook update]', cause instanceof Error ? cause.message : 'Erro');
    return Response.json({ event: data, warning: 'Atualizado no CRM, porém não confirmado no Outlook. Confira antes de avisar o participante.' }, { status: 202 });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorization(true);
  if (!auth.context) return auth.response!;
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !uuid.test(id)) return err('Evento não informado corretamente.');
  const db = await createClient();
  const org = auth.context.organization.id;
  const existing = await db.from('agenda_events').select('*').eq('id', id).eq('organization_id', org).maybeSingle();
  if (existing.error) return err('Não foi possível consultar o compromisso.', 503);
  const current = existing.data;
  if (!current) return err('Evento não encontrado.', 404);
  if (current.microsoft_sync_status === 'imported') return err('Exclua este compromisso pelo Outlook.', 403);
  const history = await trackedSource(db, org, current);
  if (history.error) return history.error;
  if (history.tracked) return err('Este compromisso tem histórico comercial e não pode ser apagado. Registre o cancelamento para preservar os indicadores.', 409);
  // Legacy non-commercial deletion retains its existing synchronization order.
  // Commercial source deletion is blocked before any external side effect.
  try { await deleteMicrosoftEvent(current); }
  catch { return err('Não foi possível cancelar no Outlook.', 502); }
  let deletion = db.from('agenda_events').delete().eq('id', id).eq('organization_id', org);
  if (current.updated_at) deletion = deletion.eq('updated_at', current.updated_at);
  const deleted = await deletion.select('id').maybeSingle();
  if (deleted.error) return err('Não foi possível excluir no CRM. Confira a sincronização com o Outlook.', 500);
  if (!deleted.data) return err('O compromisso mudou. Atualize a agenda e confira a sincronização.', 409);
  return Response.json({ ok: true });
}
