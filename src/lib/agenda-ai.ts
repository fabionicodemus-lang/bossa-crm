// Ponto de entrada único usado pelo atendimento da Nara e do Plantão.
// A confirmação só é liberada após o registro no CRM e, se conectado, no Outlook.
export { maybeScheduleAgendaWithMicrosoft as maybeScheduleAgendaFromAi } from '@/lib/agenda-ai-microsoft';
