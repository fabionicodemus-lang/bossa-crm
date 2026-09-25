import type { Lead } from '@/lib/types';

// Colunas que os quadros de pipeline realmente usam. O campo `metadata` é o mais
// pesado (memória da Nara, extrações, histórico de anúncios); do metadata o quadro
// só precisa da atribuição do anúncio (`metadata.ad`), então ela vem sozinha.
// Os cards nunca gravam o metadata de volta: mudanças de etapa vão por /api/leads.
export const PIPELINE_LEAD_COLUMNS = [
  'id', 'organization_id', 'kind', 'kommo_id', 'name', 'first_name', 'last_name', 'phone', 'email', 'stage', 'source',
  'enterprise', 'company', 'group_name', 'creci', 'temperature', 'ai_enabled',
  'ai_classification', 'ai_summary', 'ai_next_action', 'ai_last_classified_at', 'owner_id',
  'owner_mode', 'backup_owner_id', 'priority_class', 'next_action', 'next_action_type',
  'next_action_due_at', 'reactivation_at', 'handoff_requested_at', 'handoff_accepted_at',
  'last_inbound_at', 'last_outbound_at', 'last_human_activity_at', 'last_ai_activity_at',
  'loss_reason', 'opt_out', 'automation_paused', 'archived_at', 'archived_by', 'archived_reason',
  'created_at', 'updated_at', 'metadata_ad:metadata->ad',
].join(',');

type PipelineLeadRow = Omit<Lead, 'metadata'> & { metadata_ad?: unknown };

export function toPipelineLead(row: unknown): Lead {
  const { metadata_ad, ...rest } = row as PipelineLeadRow;
  return { ...rest, metadata: metadata_ad ? { ad: metadata_ad } : {} } as Lead;
}

export function toPipelineLeads(rows: unknown[] | null | undefined): Lead[] {
  return (rows ?? []).map(toPipelineLead);
}
