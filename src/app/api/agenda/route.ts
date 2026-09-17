import { getCurrentContext } from '@/lib/auth';
import { findAgendaConflicts } from '@/lib/agenda';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type AgendaPayload = {
  id?: string;
  lead_id?: string | null;
  assigned_to?: string | null;
  title?: string;
  description?: string | null;
  event_type?: string;
  meeting_mode?: string;
  location?: string | null;
  video_url?: string | null;
  starts_at?: string;
  ends_at?: string;
  status?: string;
};

const eventTypes = new Set(['reuniao_cliente', 'apresentacao', 'visita', 'ligacao', 'tarefa', 'outro']);
const meetingModes = new Set(['presencial', 'video', 'telefone']);
const statuses = new Set(['scheduled', 'completed', 'cancelled']);

function validDate(value: string | undefined) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()));
}

async function canWrite() {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return { context: null, response: Response.json({ error: 'Não autenticado.' }, { status: 401 }) };
  if (!['admin', 'comercial'].includes(context.role)) {
    return { context: null, response: Response.json({ error: 'Seu perfil não pode alterar a agenda.' }, { status: 403 }) };
  }
  return { context, response: null };
}

export async function GET(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return Response.json({ error: 'Não autenticado.' }, { status: 401 });
  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const assignedTo = url.searchParams.get('assigned_to');
  const admin = createAdminClient();

  let query = admin
    .from('agenda_events')
    .select('*')
    .eq('organization_id', context.organization.id)
    .order('starts_at', { ascending: true })
    .limit(3000);
  if (start) query = query.gte('starts_at', start);
  if (end) query = query.lt('starts_at', end);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ events: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await canWrite();
  if (!auth.context) return auth.response!;
  const body = await request.json().catch(() => ({})) as AgendaPayload;
  if (!body.title?.trim()) return Response.json({ error: 'Informe o título.' }, { status: 400 });
  if (!body.assigned_to) return Response.json({ error: 'Escolha o responsável.' }, { status: 400 });
  if (!validDate(body.starts_at) || !validDate(body.ends_at)) return Response.json({ error: 'Informe data e horário válidos.' }, { status: 400 });
  if (new Date(body.ends_at!).getTime() <= new Date(body.starts_at!).getTime()) return Response.json({ error: 'O término deve ser depois do início.' }, { status: 400 });
  if (!eventTypes.has(body.event_type || '')) return Response.json({ error: 'Tipo de evento inválido.' }, { status: 400 });
  if (!meetingModes.has(body.meeting_mode || '')) return Response.json({ error: 'Formato inválido.' }, { status: 400 });

  const conflicts = await findAgendaConflicts({
    organizationId: auth.context.organization.id,
    assignedTo: body.assigned_to,
    startsAt: body.starts_at!,
    endsAt: body.ends_at!,
  });
  if (conflicts.length) return Response.json({ error: 'Este responsável já possui compromisso nesse horário.', conflicts }, { status: 409 });

  const admin = createAdminClient();
  const { data, error } = await admin.from('agenda_events').insert({
    organization_id: auth.context.organization.id,
    lead_id: body.lead_id || null,
    assigned_to: body.assigned_to,
    created_by: auth.context.userId,
    created_by_kind: 'human',
    title: body.title.trim(),
    description: body.description?.trim() || null,
    event_type: body.event_type,
    meeting_mode: body.meeting_mode,
    location: body.location?.trim() || null,
    video_url: body.video_url?.trim() || null,
    starts_at: body.starts_at,
    ends_at: body.ends_at,
  }).select('*').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ event: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await canWrite();
  if (!auth.context) return auth.response!;
  const body = await request.json().catch(() => ({})) as AgendaPayload;
  if (!body.id) return Response.json({ error: 'Evento não informado.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: current } = await admin.from('agenda_events').select('*')
    .eq('id', body.id).eq('organization_id', auth.context.organization.id).maybeSingle();
  if (!current) return Response.json({ error: 'Evento não encontrado.' }, { status: 404 });

  const assignedTo = body.assigned_to ?? current.assigned_to;
  const startsAt = body.starts_at ?? current.starts_at;
  const endsAt = body.ends_at ?? current.ends_at;
  if (!assignedTo) return Response.json({ error: 'Escolha o responsável.' }, { status: 400 });
  if (!validDate(startsAt) || !validDate(endsAt) || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return Response.json({ error: 'Período inválido.' }, { status: 400 });
  }
  const nextStatus = body.status ?? current.status;
  if (!statuses.has(nextStatus)) return Response.json({ error: 'Status inválido.' }, { status: 400 });
  if (nextStatus === 'scheduled') {
    const conflicts = await findAgendaConflicts({
      organizationId: auth.context.organization.id,
      assignedTo,
      startsAt,
      endsAt,
      excludeEventId: body.id,
    });
    if (conflicts.length) return Response.json({ error: 'Este responsável já possui compromisso nesse horário.', conflicts }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  for (const key of ['lead_id','assigned_to','title','description','location','video_url','starts_at','ends_at','status'] as const) {
    if (key in body) patch[key] = body[key] ?? null;
  }
  if (body.event_type !== undefined) {
    if (!eventTypes.has(body.event_type)) return Response.json({ error: 'Tipo de evento inválido.' }, { status: 400 });
    patch.event_type = body.event_type;
  }
  if (body.meeting_mode !== undefined) {
    if (!meetingModes.has(body.meeting_mode)) return Response.json({ error: 'Formato inválido.' }, { status: 400 });
    patch.meeting_mode = body.meeting_mode;
  }

  const { data, error } = await admin.from('agenda_events').update(patch)
    .eq('id', body.id).eq('organization_id', auth.context.organization.id).select('*').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ event: data });
}

export async function DELETE(request: Request) {
  const auth = await canWrite();
  if (!auth.context) return auth.response!;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Evento não informado.' }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from('agenda_events').delete().eq('id', id).eq('organization_id', auth.context.organization.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
