import { createAdminClient } from '@/lib/supabase/admin';

export type AgendaEventType = 'reuniao_cliente' | 'apresentacao' | 'visita' | 'ligacao' | 'tarefa' | 'outro';
export type AgendaMeetingMode = 'presencial' | 'video' | 'telefone';

export type AgendaEvent = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_by_kind: 'human' | 'ai' | 'system';
  agent: 'nara' | 'plantao' | null;
  title: string;
  description: string | null;
  event_type: AgendaEventType;
  meeting_mode: AgendaMeetingMode;
  location: string | null;
  video_url: string | null;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function findAgendaConflicts(input: {
  organizationId: string;
  assignedTo: string;
  startsAt: string;
  endsAt: string;
  excludeEventId?: string | null;
}) {
  const admin = createAdminClient();
  let query = admin
    .from('agenda_events')
    .select('id,title,starts_at,ends_at,assigned_to,event_type,meeting_mode')
    .eq('organization_id', input.organizationId)
    .eq('assigned_to', input.assignedTo)
    .eq('status', 'scheduled')
    .lt('starts_at', input.endsAt)
    .gt('ends_at', input.startsAt)
    .order('starts_at', { ascending: true });
  if (input.excludeEventId) query = query.neq('id', input.excludeEventId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createAgendaEventFromAi(input: {
  organizationId: string;
  leadId: string;
  assignedTo: string;
  agent: 'nara' | 'plantao';
  title: string;
  description?: string | null;
  eventType: AgendaEventType;
  meetingMode: AgendaMeetingMode;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const conflicts = await findAgendaConflicts({
    organizationId: input.organizationId,
    assignedTo: input.assignedTo,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });
  if (conflicts.length) return { created: false as const, conflicts };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('agenda_events')
    .insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      assigned_to: input.assignedTo,
      created_by_kind: 'ai',
      agent: input.agent,
      title: input.title,
      description: input.description ?? null,
      event_type: input.eventType,
      meeting_mode: input.meetingMode,
      location: input.location ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();
  if (error) throw error;
  return { created: true as const, event: data as AgendaEvent, conflicts: [] };
}
