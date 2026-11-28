import type { Lead } from '@/lib/types';

export const PLANTAO_HUMAN_PAUSE_MS = 30 * 60_000;

/** The database must have explicitly resumed this temporary pause first. */
export function plantaoResumedAfterHumanPause(lead: Partial<Lead>, now = Date.now()): boolean {
  const deadline = Date.parse(lead.plantao_human_pause_until || '');
  return lead.kind === 'corretor' && Number.isFinite(deadline) && deadline <= now
    && lead.owner_mode === 'ai' && lead.ai_enabled === true && !lead.automation_paused
    && !lead.opt_out && !lead.archived_at && !['fechado_ganho', 'encerrado'].includes(lead.stage || '');
}
