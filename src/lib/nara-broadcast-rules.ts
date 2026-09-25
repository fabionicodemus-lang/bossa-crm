export type ClientBroadcastState = {
  stage: string;
  owner_mode?: string | null;
  opt_out?: boolean | null;
  ai_enabled?: boolean | null;
  automation_paused?: boolean | null;
};

const HUMAN_STAGES = new Set(['humano_ativo', 'agendado', 'pos_reuniao', 'proposta_negociacao']);

export type BroadcastResponseAction =
  | 'none'
  | 'reactivate_ai'
  | 'handoff_closed_won'
  | 'notify_human'
  | 'ignore_opt_out';

export function broadcastResponseAction(
  lead: ClientBroadcastState,
  hasRecentBroadcast: boolean,
  explicitOptOut = false,
): BroadcastResponseAction {
  if (!hasRecentBroadcast) return 'none';
  if (lead.opt_out || explicitOptOut) return 'ignore_opt_out';
  if (lead.stage === 'fechado_ganho') return 'handoff_closed_won';
  if (lead.owner_mode === 'human' || HUMAN_STAGES.has(lead.stage)) return 'notify_human';
  if (lead.stage === 'encerrado' || lead.stage === 'futuro') return 'reactivate_ai';
  return 'none';
}

export function shouldForceBroadcastReply(
  action: BroadcastResponseAction,
  hasRecentBroadcast: boolean,
) {
  if (!hasRecentBroadcast) return false;
  return !['handoff_closed_won', 'notify_human', 'ignore_opt_out'].includes(action);
}

export function clientNoReplyReason(lead: ClientBroadcastState): string {
  if (lead.opt_out) return 'lead em opt-out';
  if (lead.owner_mode === 'human') return 'lead com atendimento humano';
  if (HUMAN_STAGES.has(lead.stage)) return `etapa humana ${lead.stage}`;
  if (lead.stage === 'encerrado') return 'lead encerrado';
  if (lead.stage === 'fechado_ganho') return 'lead fechado_ganho';
  if (lead.automation_paused) return 'automação pausada';
  if (!lead.ai_enabled) return 'IA desligada para o lead';
  return `estado do lead não permite resposta da IA (etapa ${lead.stage})`;
}
