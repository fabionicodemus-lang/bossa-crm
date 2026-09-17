import { getCurrentContext } from '@/lib/auth';
import { findAgendaConflicts } from '@/lib/agenda';
import { deleteMicrosoftEvent, getMicrosoftConnection, pushMicrosoftEvent } from '@/lib/microsoft-calendar';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type AgendaPayload = {
  id?: string; lead_id?: string | null; assigned_to?: string | null;
  title?: string; description?: string | null; event_type?: string; meeting_mode?: string;
  location?: string | null; video_url?: string | null; starts_at?: string; ends_at?: string; status?: string;
};
const eventTypes = new Set(['reuniao_cliente', 'apresentacao', 'visita', 'ligacao', 'tarefa', 'outro']);
const meetingModes = new Set(['presencial', 'video', 'telefone']);
const statuses = new Set(['scheduled', 'completed', 'cancelled']);
const err = (message: string, status = 400) => Response.json({ error: message }, { status });
function validDate(value: string | undefined) { return Boolean(value && Number.isFinite(new Date(value).getTime())); }
function validateTime(start?: string, end?: string) {
  return validDate(start) && validDate(end) && new Date(end!).getTime() > new Date(start!).getTime();
}
async function authorization(write = false) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return { context: null, response: err('Não autenticado.', 401) };
  if (write && !['admin','comercial'].includes(context.role)) return { context: null, response: err('Sem permissão.', 403) };
  return { context, response: null };
}
async function conflictsOrFailure(input: Parameters<typeof findAgendaConflicts>[0]) {
  try { return { conflicts: await findAgendaConflicts(input), error: '' }; }
  catch (cause) { console.error('[agenda availability]', cause instanceof Error ? cause.message : 'Erro');
    return { conflicts: [], error: 'Não foi possível verificar toda a disponibilidade, inclusive Outlook. Tente novamente.' }; }
}

export async function GET(request: Request) {
  const auth = await authorization();
  if (!auth.context) return auth.response!;
  const params = new URL(request.url).searchParams;
  const start = params.get('start'); const end = params.get('end'); const assignedTo = params.get('assigned_to');
  const admin = createAdminClient();
  let query = admin.from('agenda_events').select('*').eq('organization_id', auth.context.organization.id)
    .order('starts_at', { ascending: true }).limit(3000);
  if (start) query = query.gte('starts_at', start);
  if (end) query = query.lt('starts_at', end);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);
  const { data, error } = await query;
  if (error) return err(error.message, 500);
  return Response.json({ events: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authorization(true);
  if (!auth.context) return auth.response!;
  const body = await request.json().catch(() => ({})) as AgendaPayload;
  if (!body.title?.trim() || !body.assigned_to) return err('Informe título e responsável.');
  if (!validateTime(body.starts_at, body.ends_at)) return err('Informe início e término válidos.');
  if (!eventTypes.has(body.event_type || '') || !meetingModes.has(body.meeting_mode || '')) return err('Tipo ou formato inválido.');
  const availability = await conflictsOrFailure({ organizationId: auth.context.organization.id,
    assignedTo: body.assigned_to, startsAt: body.starts_at!, endsAt: body.ends_at! });
  if (availability.error) return err(availability.error, 503);
  if (availability.conflicts.length) return Response.json({ error: 'Responsável já possui compromisso nesse horário.', conflicts: availability.conflicts }, { status: 409 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('agenda_events').insert({
    organization_id: auth.context.organization.id, lead_id: body.lead_id || null, assigned_to: body.assigned_to,
    created_by: auth.context.userId, created_by_kind: 'human', title: body.title.trim(),
    description: body.description?.trim() || null, event_type: body.event_type, meeting_mode: body.meeting_mode,
    location: body.location?.trim() || null, video_url: body.video_url?.trim() || null,
    starts_at: body.starts_at, ends_at: body.ends_at,
  }).select('*').single();
  if (error) return err(error.code === '23P01' ? 'Outro compromisso foi criado nesse horário. Atualize a agenda.' : error.message, error.code === '23P01' ? 409 : 500);
  try {
    const syncStatus = await pushMicrosoftEvent(data);
    const { data: refreshed } = await admin.from('agenda_events').select('*').eq('id', data.id).single();
    return Response.json({ event: refreshed || data, syncStatus }, { status: 201 });
  } catch (cause) {
    console.error('[agenda outlook create]', cause instanceof Error ? cause.message : 'Erro');
    return Response.json({ event: data, warning: 'Compromisso salvo no CRM, mas não confirmado no Outlook. Verifique a conexão e sincronize antes de avisar o participante.' }, { status: 202 });
  }
}

export async function PATCH(request: Request) {
  const auth = await authorization(true);
  if (!auth.context) return auth.response!;
  const body = await request.json().catch(() => ({})) as AgendaPayload;
  if (!body.id) return err('Evento não informado.');
  const admin = createAdminClient();
  const { data: current } = await admin.from('agenda_events').select('*').eq('id', body.id)
    .eq('organization_id', auth.context.organization.id).maybeSingle();
  if (!current) return err('Evento não encontrado.', 404);
  if (current.microsoft_sync_status === 'imported') return err('Este bloqueio veio do Outlook. Edite-o diretamente no Outlook e sincronize novamente.', 403);
  const assignedTo = body.assigned_to ?? current.assigned_to;
  const startsAt = body.starts_at ?? current.starts_at;
  const endsAt = body.ends_at ?? current.ends_at;
  if (!assignedTo || !validateTime(startsAt, endsAt)) return err('Responsável ou período inválido.');
  if (current.microsoft_event_id && assignedTo !== current.assigned_to) return err('Para trocar o responsável de um evento sincronizado, cancele e crie um novo compromisso.', 409);
  const nextStatus = body.status ?? current.status;
  if (!statuses.has(nextStatus)) return err('Status inválido.');
  if (body.event_type !== undefined && !eventTypes.has(body.event_type)) return err('Tipo inválido.');
  if (body.meeting_mode !== undefined && !meetingModes.has(body.meeting_mode)) return err('Formato inválido.');
  if (nextStatus === 'scheduled') {
    const availability = await conflictsOrFailure({ organizationId: auth.context.organization.id, assignedTo,
      startsAt, endsAt, excludeEventId: body.id, excludeMicrosoftId: current.microsoft_event_id });
    if (availability.error) return err(availability.error, 503);
    if (availability.conflicts.length) return Response.json({ error: 'Responsável já possui compromisso nesse horário.', conflicts: availability.conflicts }, { status: 409 });
  }
  const patch: Record<string, unknown> = {};
  for (const key of ['lead_id','assigned_to','title','description','location','video_url','starts_at','ends_at','status','event_type','meeting_mode'] as const) {
    if (key in body) patch[key] = body[key] ?? null;
  }
  const { data, error } = await admin.from('agenda_events').update(patch).eq('id', body.id)
    .eq('organization_id', auth.context.organization.id).select('*').single();
  if (error) return err(error.code === '23P01' ? 'Conflito de horário; atualize a agenda.' : error.message, error.code === '23P01' ? 409 : 500);
  try {
    if (nextStatus === 'cancelled') await deleteMicrosoftEvent(data);
    else await pushMicrosoftEvent(data);
    const { data: refreshed } = await admin.from('agenda_events').select('*').eq('id', data.id).single();
    return Response.json({ event: refreshed || data });
  } catch (cause) {
    console.error('[agenda outlook update]', cause instanceof Error ? cause.message : 'Erro');
    return Response.json({ event: data, warning: 'Atualizado no CRM, porém não confirmado no Outlook. Confira antes de avisar o participante.' }, { status: 202 });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorization(true);
  if (!auth.context) return auth.response!;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return err('Evento não informado.');
  const admin = createAdminClient();
  const { data: current } = await admin.from('agenda_events').select('*').eq('id', id)
    .eq('organization_id', auth.context.organization.id).maybeSingle();
  if (!current) return err('Evento não encontrado.', 404);
  if (current.microsoft_sync_status === 'imported') return err('Exclua este compromisso pelo Outlook.', 403);
  try { await deleteMicrosoftEvent(current); }
  catch (cause) { return err(cause instanceof Error ? cause.message : 'Não foi possível cancelar no Outlook.', 502); }
  const { error } = await admin.from('agenda_events').delete().eq('id', id).eq('organization_id', auth.context.organization.id);
  if (error) return err(error.message, 500);
  return Response.json({ ok: true });
}
