import { maybeScheduleAgendaFromAi } from '@/lib/agenda-ai';
import { getMicrosoftConnection, pushMicrosoftEvent } from '@/lib/microsoft-calendar';
import type { AiTurn } from '@/lib/ai';
import type { Lead } from '@/lib/types';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Confirma a reunião ao WhatsApp apenas depois da reserva no CRM e, para contas
 * conectadas, depois da confirmação de criação/atualização no Microsoft Graph. */
export async function maybeScheduleAgendaWithMicrosoft(args: {
  admin: AdminClient; organizationId: string; lead: Lead; turn: AiTurn; lastUserMessage: string;
}) {
  const result = await maybeScheduleAgendaFromAi(args);
  if (result.status !== 'created') return result;
  const connection = await getMicrosoftConnection(args.organizationId, result.assignedTo);
  if (!connection) return result;
  const { data: event, error } = await args.admin.from('agenda_events').select('*')
    .eq('organization_id', args.organizationId).eq('id', result.eventId).single();
  if (error || !event) {
    return { status: 'needs_details' as const,
      message: 'O horário foi solicitado, mas ainda não consegui confirmar o registro na agenda do responsável. Vou pedir ao time que confirme.' };
  }
  if (event.microsoft_sync_status === 'synced' && event.microsoft_event_id) return result;
  try {
    const synced = await pushMicrosoftEvent(event);
    if (synced === 'synced') return result;
  } catch (cause) {
    console.error('[agenda ai Microsoft]', cause instanceof Error ? cause.message : 'Falha');
  }
  return { status: 'needs_details' as const,
    message: 'Registrei a solicitação, mas não consegui confirmar o compromisso no Outlook. O responsável precisa conferir antes de considerar o horário agendado.' };
}
