import type { SupabaseClient } from '@supabase/supabase-js';
import { brokerBroadcastEligibility, groupLeadsByPhone, type IdentityLead } from './contact-identity';
import { safeBrowserMedia } from './browser-campaigns';
import {
  selectPendingBrowserRecipients,
  type BrowserTransferRecipient,
} from './browser-campaign-api-transfer';
import { normalizeWaId } from './whatsapp/utils';

const PAGE_SIZE = 500;
const MAX_BROWSER_RECIPIENTS = 1500;

type TransferLead = IdentityLead & {
  name: string;
  stage: string;
  kind: 'cliente' | 'corretor' | 'geral';
  opt_out: boolean | null;
  automation_paused: boolean | null;
  enterprise: string | null;
  company: string | null;
  group_name: string | null;
  source: string | null;
};

export type TransferReadyRecipient = {
  source_browser_recipient_id: string;
  lead_id: string;
  lead_name: string;
  phone: string;
  stage: string;
  lead_snapshot: Record<string, unknown>;
};

async function pagedRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows: number,
) {
  const result: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return result;
  }
  // Nao trabalhar com um corte silencioso de audiencia.
  throw new Error('Campanha acima do limite de paginacao; revise a audiencia antes de transferir.');
}

export async function loadBrowserCampaignTransfer(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string,
) {
  const { data: campaign, error: campaignError } = await admin.from('browser_campaigns')
    .select('id,name,sender_phone,status,recipient_count,consent_confirmed_at,media')
    .eq('id', campaignId).eq('organization_id', organizationId).maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) return null;

  const [recipients, receipts, leads, existingResult, runResult, connectionResult] = await Promise.all([
    pagedRows<BrowserTransferRecipient>((from, to) => admin.from('browser_campaign_recipients')
      .select('id,lead_id,lead_name,phone,stage,status,next_item_index,position')
      .eq('campaign_id', campaignId).eq('organization_id', organizationId)
      .order('position').range(from, to), MAX_BROWSER_RECIPIENTS + PAGE_SIZE),
    pagedRows<{ recipient_id: string }>((from, to) => admin.from('browser_campaign_echo_receipts')
      .select('recipient_id').eq('campaign_id', campaignId).eq('organization_id', organizationId)
      .order('created_at').range(from, to), MAX_BROWSER_RECIPIENTS * 4 + PAGE_SIZE),
    pagedRows<TransferLead>((from, to) => admin.from('leads')
      .select('id,kind,name,phone,stage,creci,metadata,updated_at,archived_at,opt_out,automation_paused,enterprise,company,group_name,source')
      .eq('organization_id', organizationId).is('archived_at', null)
      .order('id').range(from, to), 30_000),
    admin.from('broadcasts').select('id,status').eq('organization_id', organizationId)
      .eq('source_browser_campaign_id', campaignId).maybeSingle(),
    admin.from('browser_campaign_standalone_runs').select('status')
      .eq('campaign_id', campaignId).eq('organization_id', organizationId).maybeSingle(),
    admin.from('whatsapp_connections')
      .select('id,display_phone_number,status,quality_rating')
      .eq('organization_id', organizationId).eq('channel', 'corretores').maybeSingle(),
  ]);
  if (existingResult.error) throw existingResult.error;
  if (runResult.error) throw runResult.error;
  if (connectionResult.error) throw connectionResult.error;

  const { safe, counts } = selectPendingBrowserRecipients(
    recipients, new Set(receipts.map((receipt) => receipt.recipient_id)),
  );
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  const byPhone = groupLeadsByPhone(leads);
  const ready: TransferReadyRecipient[] = [];
  const excluded = { changedOrMissing: 0, optOut: 0, notBroker: 0 };

  for (const row of safe) {
    const phone = normalizeWaId(String(row.phone ?? ''));
    const lead = byId.get(String(row.lead_id ?? ''));
    if (!lead || !phone || normalizeWaId(lead.phone || '') !== phone || lead.kind !== 'corretor') {
      excluded.changedOrMissing++;
      continue;
    }
    const identities = byPhone.get(phone) ?? [];
    if (identities.some((identity) => identity.opt_out)) {
      excluded.optOut++;
      continue;
    }
    // A pausa da Nara nao equivale a opt-out de marketing. A selecao original
    // pelo navegador ja distinguia as duas situacoes; preservar essa regra.
    if (!brokerBroadcastEligibility(identities).eligible) {
      excluded.notBroker++;
      continue;
    }
    ready.push({
      source_browser_recipient_id: row.id,
      lead_id: lead.id,
      lead_name: lead.name,
      phone,
      stage: lead.stage,
      lead_snapshot: {
        name: lead.name, enterprise: lead.enterprise, company: lead.company,
        group_name: lead.group_name, source: lead.source, stage: lead.stage,
      },
    });
  }

  const connection = connectionResult.data;
  const senderMatches = Boolean(connection?.status === 'connected'
    && normalizeWaId(connection.display_phone_number || '') === normalizeWaId(campaign.sender_phone));

  return {
    campaign,
    counts,
    eligible: ready.length,
    eligibleRecipients: ready,
    excluded,
    files: safeBrowserMedia(organizationId, campaign.media) ?? [],
    existingBroadcast: existingResult.data,
    hasActiveRun: runResult.data?.status === 'active',
    senderMatches,
    connection,
  };
}
