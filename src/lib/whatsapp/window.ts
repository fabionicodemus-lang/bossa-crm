const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowExpiresFromInbound(receivedAt: string | Date) {
  const date = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  if (Number.isNaN(date.getTime())) throw new Error('Data de mensagem recebida inválida.');
  return new Date(date.getTime() + CUSTOMER_SERVICE_WINDOW_MS).toISOString();
}

export function isCustomerServiceWindowOpen(
  windowExpiresAt: string | null | undefined,
  now: number | Date = Date.now(),
) {
  if (!windowExpiresAt) return false;
  const expires = new Date(windowExpiresAt).getTime();
  const current = now instanceof Date ? now.getTime() : now;
  return Number.isFinite(expires) && expires > current;
}

export function leadWindowExpiresAt(lead: {
  last_inbound_at?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const metadataValue = lead.metadata?.whatsapp_window_expires_at;
  if (typeof metadataValue === 'string' && metadataValue) return metadataValue;
  if (!lead.last_inbound_at) return null;
  try {
    return windowExpiresFromInbound(lead.last_inbound_at);
  } catch {
    return null;
  }
}

export const OUTSIDE_WINDOW_MESSAGE = 'Fora da janela de 24h — use um modelo aprovado.';
