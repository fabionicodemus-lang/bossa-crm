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

function normalizedPhone(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

function usefulCompany(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Boolean(normalized && !['não informada', 'nao informada', 'autônomo', 'autonomo'].includes(normalized));
}

function leadQualityScore(lead: Lead): number {
  let score = 0;
  if (lead.creci?.trim()) score += 12;
  if (usefulCompany(lead.company)) score += 8;
  if (lead.group_name?.trim()) score += 5;
  if (lead.enterprise?.trim()) score += 5;
  if (lead.first_name?.trim()) score += 2;
  if (lead.last_name?.trim()) score += 1;
  if (lead.ai_summary?.trim()) score += 1;
  if (lead.source?.trim()) score += 1;
  return score;
}

function updatedAtMs(lead: Lead): number {
  const value = new Date(lead.updated_at).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function dedupePipelineLeads(rows: Lead[]): Lead[] {
  const bestByIdentity = new Map<string, Lead>();
  for (const lead of rows) {
    const phone = normalizedPhone(lead.phone);
    const key = phone ? `${lead.kind}:phone:${phone}` : `${lead.kind}:id:${lead.id}`;
    const current = bestByIdentity.get(key);
    if (!current) {
      bestByIdentity.set(key, lead);
      continue;
    }

    const score = leadQualityScore(lead);
    const currentScore = leadQualityScore(current);
    if (score > currentScore || (score === currentScore && updatedAtMs(lead) > updatedAtMs(current))) {
      bestByIdentity.set(key, lead);
    }
  }

  return [...bestByIdentity.values()].sort((a, b) => updatedAtMs(b) - updatedAtMs(a));
}

export function toPipelineLead(row: unknown): Lead {
  const { metadata_ad, ...rest } = row as PipelineLeadRow;
  return { ...rest, metadata: metadata_ad ? { ad: metadata_ad } : {} } as Lead;
}

export function toPipelineLeads(rows: unknown[] | null | undefined): Lead[] {
  return dedupePipelineLeads((rows ?? []).map(toPipelineLead));
}
