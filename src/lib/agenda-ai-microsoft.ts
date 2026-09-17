import { maybeScheduleAgendaFromAi } from '@/lib/agenda-ai-core';
import { getMicrosoftConnection, pushMicrosoftEvent } from '@/lib/microsoft-calendar';
import type { AiTurn } from '@/lib/ai';
import type { Lead } from '@/lib/types';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Só confirma ao contato após a reserva no CRM e a confirmação do Outlook conectado. */
export async function maybeScheduleAgendaWithMicrosoft(args: {
  admin: AdminClient; organizationId: string; lead: Lead; turn: AiTurn; lastUserMessage: string;
}) {
  const result = await maybeScheduleAgendaFromAi(args);
  if (result.status !== 'created') return result;
  const connection = await getMicrosoftConnection(args.organizationId, result.assignedTo);
  if (!connection) return result;
  const { data: event, error } = await args.admin.from('agenda_events').select('*')
    .eq('organization_id', args.organizationId).eq('id', result.eventId).single();
  if (error || !event) return {
    status: 'needs_details' as const,
    message: 'Não consegui confirmar o compromisso na agenda. O responsável precisa verificar o horário.',
  };
  if (event.microsoft_sync_status === 'synced' && event.microsoft_event_id) return result;
  try {
    if (await pushMicrosoftEvent(event) === 'synced') return result;
  } catch (cause) { console.error('[agenda ai Microsoft]', cause instanceof Error ? cause.message : 'Falha'); }
  args.turn.handoff = true;
  return {
    status: 'needs_details' as const,
    message: 'Registrei a solicitação, mas não consegui confirmar o compromisso no Outlook. O responsável precisa conferir antes de considerar o horário agendado.',
  };
}
