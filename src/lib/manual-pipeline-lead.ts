import { isHomologation } from './homologation/policy';

/** Only columns already writable by a human session; RLS remains authoritative. */
export function pipelineLeadAutomation() {
  return isHomologation()
    ? { ai_enabled: false, owner_mode: 'human', automation_paused: true }
    : { ai_enabled: true, owner_mode: 'ai' };
}
