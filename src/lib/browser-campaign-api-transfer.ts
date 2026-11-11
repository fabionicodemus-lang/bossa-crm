import { normalizeWaId } from './whatsapp/utils';

export type BrowserTransferRecipient = {
  id: string;
  lead_id: string | null;
  lead_name: string;
  phone: string | null;
  stage: string | null;
  status: string;
  next_item_index: number | null;
  position: number;
};

// Tabela de lista da Meta para marketing no Brasil, vigente em 01/10/2026.
// Apenas referencia informativa: o preco real depende da moeda da conta,
// da tarifa vigente e das mensagens efetivamente entregues.
export const MARKETING_RATE_BRL_2026 = 0.3217;

export function estimateMarketingCostBrl(recipientCount: number) {
  return Math.round(recipientCount * MARKETING_RATE_BRL_2026 * 100) / 100;
}

export function selectPendingBrowserRecipients(
  recipients: BrowserTransferRecipient[],
  observedRecipientIds: ReadonlySet<string>,
) {
  const seenPhones = new Set<string>();
  const safe: BrowserTransferRecipient[] = [];
  const counts = {
    total: recipients.length,
    queued: 0,
    sent: 0,
    claimed: 0,
    uncertain: 0,
    skipped: 0,
    partialOrObserved: 0,
    duplicateOrInvalidPhone: 0,
  };

  for (const recipient of [...recipients].sort((a, b) => a.position - b.position)) {
    if (recipient.status !== 'queued') {
      if (recipient.status in counts) counts[recipient.status as 'sent' | 'claimed' | 'uncertain' | 'skipped']++;
      continue;
    }
    counts.queued++;

    // status='queued' nao basta: um registro pode ter um texto ou PDF ja
    // observado, ainda sem a conclusao dos demais itens da campanha.
    if (Number(recipient.next_item_index || 0) > 0 || observedRecipientIds.has(recipient.id)) {
      counts.partialOrObserved++;
      continue;
    }

    const phone = normalizeWaId(String(recipient.phone || ''));
    if (!/^[1-9]\d{7,14}$/.test(phone) || seenPhones.has(phone)) {
      counts.duplicateOrInvalidPhone++;
      continue;
    }
    seenPhones.add(phone);
    safe.push(recipient);
  }

  return { safe, counts };
}
