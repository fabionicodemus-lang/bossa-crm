import { maybeScheduleAgendaFromAi, type AgendaAiResult } from '@/lib/agenda-ai-core';
import { getMicrosoftConnection, pushMicrosoftEvent } from '@/lib/microsoft-calendar';

/** Só confirma ao contato após a reserva no CRM e a confirmação do Outlook conectado. */
export async function maybeScheduleAgendaWithMicrosoft(
  args: Parameters<typeof maybeScheduleAgendaFromAi>[0],
): Promise<AgendaAiResult> {
  const result = await maybeScheduleAgendaFromAi(args);
  if (result.status !== 'created') return result;

  // A reserva local ainda não autoriza confirmação quando houver Outlook conectado.
  // Limpa também a flag que o core atribui antes de qualquer leitura/sincronização.
  args.turn.agenda_confirmed = false;
  try {
    const connection = await getMicrosoftConnection(args.organizationId, result.assignedTo);
    if (!connection) {
      args.turn.agenda_confirmed = true;
      return result;
    }
    const { data: event, error } = await args.admin.from('agenda_events').select('*')
      .eq('organization_id', args.organizationId).eq('id', result.eventId).single();
    if (!error && event) {
      if ((event.microsoft_sync_status === 'synced' && event.microsoft_event_id)
        || await pushMicrosoftEvent(event) === 'synced') {
        args.turn.agenda_confirmed = true;
        return result;
      }
    }
  } catch {
    // Não presume ausência de conexão quando sua consulta falha.
    console.error('[agenda ai Microsoft] Não foi possível confirmar a sincronização.');
  }
  args.turn.handoff = true;
  return {
    status: 'needs_details',
    requiresHuman: true,
    message: 'Registrei a solicitação, mas não consegui confirmar o compromisso no Outlook. O responsável precisa conferir antes de considerar o horário agendado.',
  };
}
