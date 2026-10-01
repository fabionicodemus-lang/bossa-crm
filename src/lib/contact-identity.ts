import type { LeadKind } from '@/lib/types';
import { normalizeWaId } from '@/lib/whatsapp/utils';

export type IdentityLead = {
  id: string;
  kind: LeadKind;
  phone: string | null;
  creci: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
  archived_at?: string | null;
};

type ManualDecision = {
  kind: LeadKind;
  at: number;
  lead: IdentityLead;
};

function metadataOf(lead: IdentityLead) {
  return lead.metadata && typeof lead.metadata === 'object'
    ? lead.metadata as Record<string, unknown>
    : {};
}

function timestamp(value: unknown) {
  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestManualDecision(leads: IdentityLead[]): ManualDecision | null {
  let latest: ManualDecision | null = null;
  for (const lead of leads) {
    const metadata = metadataOf(lead);
    const value = String(metadata.contact_kind_manually_confirmed || '');
    if (!['cliente', 'corretor', 'geral'].includes(value)) continue;
    const decision: ManualDecision = {
      kind: value as LeadKind,
      at: timestamp(metadata.contact_kind_manually_confirmed_at) || timestamp(lead.updated_at),
      lead,
    };
    if (!latest || decision.at > latest.at) latest = decision;
  }
  return latest;
}

function explicitlyVerifiedBroker(lead: IdentityLead) {
  if (lead.kind !== 'corretor') return false;
  const metadata = metadataOf(lead);
  return Boolean(
    lead.creci
    || metadata.client_broker_transfer_verified === true
    || metadata.plantao_triage_status === 'classified_broker'
    || metadata.contact_kind_manually_confirmed === 'corretor'
  );
}

function knownNonBroker(lead: IdentityLead) {
  const metadata = metadataOf(lead);
  return Boolean(
    metadata.auto_kind_triage_status === 'operational_non_broker'
    || metadata.plantao_triage_status === 'not_broker'
    || metadata.plantao_triage_status === 'operational_non_broker'
    || (metadata.pipeline_kind_cleanup_2026_09_30
      && typeof metadata.pipeline_kind_cleanup_2026_09_30 === 'object'
      && (metadata.pipeline_kind_cleanup_2026_09_30 as Record<string, unknown>).new_kind === 'geral')
  );
}

export function phoneIdentityKey(phone: string | null | undefined) {
  return normalizeWaId(String(phone ?? ''));
}

export function groupLeadsByPhone<T extends IdentityLead>(leads: T[]) {
  const map = new Map<string, T[]>();
  for (const lead of leads) {
    if (lead.archived_at) continue;
    const key = phoneIdentityKey(lead.phone);
    if (!key) continue;
    const group = map.get(key) ?? [];
    group.push(lead);
    map.set(key, group);
  }
  return map;
}

export function brokerBroadcastEligibility(leads: IdentityLead[]) {
  const active = leads.filter((lead) => !lead.archived_at);
  if (!active.length) return { eligible: false, reason: 'Telefone sem contato ativo.' };

  const manual = latestManualDecision(active);
  if (manual) {
    return manual.kind === 'corretor'
      ? { eligible: true, reason: 'Corretor confirmado manualmente.' }
      : { eligible: false, reason: `Classificação manual mais recente: ${manual.kind}.` };
  }

  if (active.some(knownNonBroker)) {
    return { eligible: false, reason: 'Contato já identificado como não corretor.' };
  }

  const verifiedBroker = active.some(explicitlyVerifiedBroker);
  if (active.some((lead) => lead.kind === 'cliente') && !verifiedBroker) {
    return { eligible: false, reason: 'Telefone também pertence a um cliente ativo.' };
  }

  if (!active.some((lead) => lead.kind === 'corretor')) {
    return { eligible: false, reason: 'Nenhuma ficha ativa de corretor para este telefone.' };
  }

  return {
    eligible: true,
    reason: verifiedBroker ? 'Corretor verificado.' : 'Classificado no pipeline de corretores sem conflito conhecido.',
  };
}

export function chooseCanonicalLeadForWhatsApp<T extends IdentityLead>(
  leads: T[],
  preferredKind: LeadKind,
): T | null {
  const active = leads
    .filter((lead) => !lead.archived_at)
    .sort((a, b) => timestamp(b.updated_at) - timestamp(a.updated_at));
  if (!active.length) return null;

  const manual = latestManualDecision(active);
  if (manual) {
    return active.find((lead) => lead.id === manual.lead.id)
      ?? active.find((lead) => lead.kind === manual.kind)
      ?? null;
  }

  const nonBroker = active.find((lead) => lead.kind === 'geral' && knownNonBroker(lead));
  if (nonBroker) return nonBroker;

  const verifiedBroker = active.find(explicitlyVerifiedBroker);
  if (verifiedBroker) return verifiedBroker;

  const client = active.find((lead) => lead.kind === 'cliente');
  if (client) return client;

  return active.find((lead) => lead.kind === preferredKind)
    ?? active.find((lead) => lead.kind === 'geral')
    ?? active[0]
    ?? null;
}
