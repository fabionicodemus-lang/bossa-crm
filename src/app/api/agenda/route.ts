import { getCurrentContext } from '@/lib/auth';
import { findAgendaConflicts } from '@/lib/agenda';
import { deleteMicrosoftEvent, pushMicrosoftEvent } from '@/lib/microsoft-calendar';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { tryRecordNaraFunnelEvent } from '@/lib/nara-funnel-events';

export const runtime = 'nodejs';

type AgendaPayload = {
  id?: string; lead_id?: string | null; assigned_to?: string | null;
  title?: string; description?: string | null; event_type?: string; meeting_mode?: string;
  location?: string | null; video_url?: string | null; starts_at?: string; ends_at?: string; status?: string;
  outcome?: 'no_show'; expected_starts_at?: string;
};
const eventTypes = new Set(['reuniao_cliente', 'apresentacao', 'visita', 'ligacao', 'tarefa', 'outro']);
const meetingModes = new Set(['presencial', 'video', 'telefone']);
const statuses = new Set(['scheduled', 'completed', 'cancelled']);
const err = (message: string, status = 400) => Response.json({ error: message }, { status });
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function validateTime(start?: string, end?: string) {
  return validDate(start) && validDate(end) && new Date(end!).getTime() > new Date(start!).getTime();
}
function referenceId(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 200) return undefined;
  return value.trim() || null;
}
function invalidTextField(body: AgendaPayload) {
  const limits = { title: 500, description: 10000, location: 2000, video_url: 2048 };
  return Object.entries(limits).some(([key, limit]) => {
    const value = body[key as keyof typeof limits];
    return value !== undefined && value !== null && (typeof value !== 'string' || value.length > limit);
  }) || ('title' in body && (typeof body.title !== 'string' || !body.title.trim()));
}
async function verifyReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  assignedTo: string,
  leadId: string | null,
): Promise<Response | null> {
  // Reference IDs are untrusted. Verify them through the caller's RLS view and
  // explicit company filters before any privileged write or Outlook operation.
  const [assignee, lead] = await Promise.all([
    supabase.from('memberships').select('user_id')
      .eq('organization_id', organizationId).eq('user_id', assignedTo).maybeSingle(),
    leadId ? supabase.from('leads').select('id')
      .eq('organization_id', organizationId).eq('id', leadId).maybeSingle() : null,
  ]);
  if (assignee.error || lead?.error) return err('Não foi possível verificar o responsável e o contato. Tente novamente.', 503);
  if (!assignee.data) return err('Responsável não encontrado nesta empresa.', 404);
  if (leadId && !lead?.data) return err('Contato não encontrado nesta empresa.', 404);
  return null;
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
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err('Dados inválidos.');
  if (invalidTextField(body)) return err('Texto inválido ou muito longo.');
  if (body.outcome !== undefined || body.status === 'completed') return err('Crie o compromisso antes de registrar o resultado.');
  const assignedTo = referenceId(body.assigned_to);
  const leadId = referenceId(body.lead_id);
  if (typeof body.title !== 'string' || !body.title.trim() || !assignedTo) return err('Informe título e responsável.');
  if (leadId === undefined) return err('Contato inválido.');
  if (!validateTime(body.starts_at, body.ends_at)) return err('Informe início e término válidos.');
  if (!eventTypes.has(body.event_type || '') || !meetingModes.has(body.meeting_mode || '')) return err('Tipo ou formato inválido.');
  const supabase = await createClient();
  const referenceError = await verifyReferences(supabase, auth.context.organization.id, assignedTo, leadId);
  if (referenceError) return referenceError;
  const availability = await conflictsOrFailure({ organizationId: auth.context.organization.id,
    assignedTo, startsAt: body.starts_at!, endsAt: body.ends_at! });
  if (availability.error) return err(availability.error, 503);
  if (availability.conflicts.length) return Response.json({ error: 'Responsável já possui compromisso nesse horário.', conflicts: availability.conflicts }, { status: 409 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('agenda_events').insert({
    organization_id: auth.context.organization.id, lead_id: leadId, assigned_to: assignedTo,
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
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err('Dados inválidos.');
  if (typeof body.id !== 'string' || !body.id.trim() || body.id.length > 200) return err('Evento não informado.');
  if (invalidTextField(body)) return err('Texto inválido ou muito longo.');
  if (body.expected_starts_at !== undefined && !validDate(body.expected_starts_at)) return err('Versão do compromisso inválida.');
  if (body.outcome !== undefined && body.outcome !== 'no_show') return err('Resultado inválido.');
  const noShow = body.outcome === 'no_show';
  const completing = body.status === 'completed';
  const recordingOutcome = noShow || completing;
  if (recordingOutcome) {
    const allowed = new Set(['id', 'expected_starts_at', noShow ? 'outcome' : 'status']);
    if (Object.keys(body).some((key) => !allowed.has(key))) return err('Registre o resultado separadamente das alterações do compromisso.');
    if (!validDate(body.expected_starts_at)) return err('Informe a versão do compromisso antes de registrar o resultado.');
  }
  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase.from('agenda_events').select('*').eq('id', body.id)
    .eq('organization_id', auth.context.organization.id).maybeSingle();
  if (currentError) return err('Não foi possível verificar o compromisso. Tente novamente.', 503);
  if (!current) return err('Evento não encontrado.', 404);
  if (body.expected_starts_at && Date.parse(body.expected_starts_at) !== Date.parse(current.starts_at)) return err('O compromisso foi alterado. Atualize a agenda antes de registrar o resultado.', 409);
  if (current.microsoft_sync_status === 'imported') return err('Este bloqueio veio do Outlook. Edite-o diretamente no Outlook e sincronize novamente.', 403);
  if (recordingOutcome) {
    if (!validDate(current.starts_at) || current.status === 'cancelled' || Date.parse(current.starts_at) > Date.now()) return err('Registre o resultado apenas após o início de um compromisso não cancelado.', 409);
    if ((noShow && current.status === 'completed') || (completing && current.metadata?.nara_outcome === 'no_show')) return err('Já existe outro resultado registrado para este compromisso. Revise o histórico antes de corrigir.', 409);
    if ((noShow && current.metadata?.nara_outcome === 'no_show') || (completing && current.status === 'completed')) {
      return Response.json({ event: current, idempotent: true });
    }
    const assignedTo = referenceId(current.assigned_to);
    const leadId = referenceId(current.lead_id);
    if (!assignedTo || leadId === undefined) return err('Responsável ou contato inválido.');
    const referenceError = await verifyReferences(supabase, auth.context.organization.id, assignedTo, leadId);
    if (referenceError) return referenceError;
    const admin = createAdminClient();
    const recordedAt = new Date().toISOString();
    let outcomeQuery = admin.from('agenda_events').update({
      ...(completing ? { status: 'completed' } : {}),
      metadata: { ...(current.metadata || {}), nara_outcome: noShow ? 'no_show' : 'completed',
        nara_outcome_recorded_by: auth.context.userId, nara_outcome_recorded_at: recordedAt },
    }).eq('id', current.id).eq('organization_id', auth.context.organization.id)
      .eq('starts_at', current.starts_at).eq('ends_at', current.ends_at).eq('status', current.status);
    // Optimistic lock prevents a reschedule or competing result between read and write.
    if (current.updated_at) outcomeQuery = outcomeQuery.eq('updated_at', current.updated_at);
    const { data, error } = await outcomeQuery.select('*').maybeSingle();
    if (error) return err('Não foi possível registrar o resultado. Tente novamente.', 503);
    if (!data) return err('O compromisso foi alterado. Atualize a agenda antes de registrar o resultado.', 409);
    let warning: string | undefined;
    if (leadId) {
      const { data: eventLead } = await supabase.from('leads').select('kind')
        .eq('organization_id', auth.context.organization.id).eq('id', leadId).maybeSingle();
      const funnelResult = await tryRecordNaraFunnelEvent(admin, { organizationId: auth.context.organization.id, leadId,
        event: noShow ? 'nao_compareceu' : 'compromisso_realizado',
        source: noShow ? 'agenda_human_no_show' : 'agenda_human_completed', actorId: auth.context.userId,
        evidence: { agenda_event_id: data.id },
        dimensions: { contact_kind: eventLead?.kind === 'cliente' || eventLead?.kind === 'corretor' ? eventLead.kind : undefined,
          responsible_id: assignedTo, meeting_mode: data.meeting_mode } });
      if ('error' in funnelResult) warning = 'Resultado salvo na agenda, mas o marco do funil ficou pendente. Confira o relatório; não é necessário repetir o resultado.';
    }
    // Attendance is not a calendar invitation or a customer message, with or without a lead.
    return Response.json({ event: data, ...(warning ? { warning } : {}) });
  }
  const assignedTo = referenceId(body.assigned_to ?? current.assigned_to);
  const leadId = referenceId('lead_id' in body ? body.lead_id : current.lead_id);
  const startsAt = body.starts_at ?? current.starts_at;
  const endsAt = body.ends_at ?? current.ends_at;
  if (!assignedTo || !validateTime(startsAt, endsAt)) return err('Responsável ou período inválido.');
  if (leadId === undefined) return err('Contato inválido.');
  if (current.microsoft_event_id && assignedTo !== current.assigned_to) return err('Para trocar o responsável de um evento sincronizado, cancele e crie um novo compromisso.', 409);
  const nextStatus = body.status ?? current.status;
  if (!statuses.has(nextStatus)) return err('Status inválido.');
  if (body.event_type !== undefined && !eventTypes.has(body.event_type)) return err('Tipo inválido.');
  if (body.meeting_mode !== undefined && !meetingModes.has(body.meeting_mode)) return err('Formato inválido.');
  const referenceError = await verifyReferences(supabase, auth.context.organization.id, assignedTo, leadId);
  if (referenceError) return referenceError;
  if (nextStatus === 'scheduled') {
    const availability = await conflictsOrFailure({ organizationId: auth.context.organization.id, assignedTo,
      startsAt, endsAt, excludeEventId: body.id, excludeMicrosoftId: current.microsoft_event_id });
    if (availability.error) return err(availability.error, 503);
    if (availability.conflicts.length) return Response.json({ error: 'Responsável já possui compromisso nesse horário.', conflicts: availability.conflicts }, { status: 409 });
  }
  const patch: Record<string, unknown> = {};
  if ('lead_id' in body) patch.lead_id = leadId;
  if ('assigned_to' in body) patch.assigned_to = assignedTo;
  for (const key of ['title','description','location','video_url','starts_at','ends_at','status','event_type','meeting_mode'] as const) {
    if (key in body) patch[key] = body[key] ?? null;
  }
  const admin = createAdminClient();
  if (!Object.keys(patch).length) return err('Nenhuma alteração informada.');
  let updateQuery = admin.from('agenda_events').update(patch).eq('id', body.id)
    .eq('organization_id', auth.context.organization.id).eq('starts_at', current.starts_at).eq('status', current.status);
  if (current.updated_at) updateQuery = updateQuery.eq('updated_at', current.updated_at);
  const { data, error } = await updateQuery.select('*').maybeSingle();
  if (error) return err(error.code === '23P01' ? 'Conflito de horário; atualize a agenda.' : error.message, error.code === '23P01' ? 409 : 500);
  if (!data) return err('O compromisso foi alterado. Atualize a agenda antes de salvar.', 409);
  const { data: eventLead } = leadId ? await supabase.from('leads').select('kind')
    .eq('organization_id', auth.context.organization.id).eq('id', leadId).maybeSingle() : { data: null };
  const contactKind = eventLead?.kind === 'cliente' || eventLead?.kind === 'corretor' ? eventLead.kind : undefined;
  try {
    if (nextStatus === 'cancelled') await deleteMicrosoftEvent(data);
    else await pushMicrosoftEvent(data);
    if (leadId && nextStatus === 'cancelled' && current.status !== 'cancelled') {
      await tryRecordNaraFunnelEvent(admin, { organizationId: auth.context.organization.id, leadId,
        event: 'cancelado', source: 'agenda_human_cancelled', actorId: auth.context.userId,
        evidence: { agenda_event_id: data.id }, dimensions: { contact_kind: contactKind, responsible_id: assignedTo, meeting_mode: data.meeting_mode } });
    }
    if (leadId && nextStatus === 'scheduled' && (startsAt !== current.starts_at || endsAt !== current.ends_at)) {
      await tryRecordNaraFunnelEvent(admin, { organizationId: auth.context.organization.id, leadId,
        event: 'reagendado', source: 'agenda_human_rescheduled', actorId: auth.context.userId,
        dedupeKey: `${data.id}:${startsAt}:${endsAt}`, evidence: { agenda_event_id: data.id },
        dimensions: { contact_kind: contactKind, responsible_id: assignedTo, meeting_mode: data.meeting_mode } });
    }
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
