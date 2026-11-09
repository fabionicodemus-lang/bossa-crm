export const BROWSER_CAMPAIGN_MONITOR_POLL_MS = 2 * 60 * 1000;
export const BROWSER_CAMPAIGN_MONITOR_IDLE_MS = 15 * 60 * 1000;

export type BrowserCampaignMonitorState = 'off' | 'active' | 'idle' | 'complete';

export type BrowserCampaignMonitor = {
  state: BrowserCampaignMonitorState;
  lastActivityAt: string | null;
  lastObservedAt: string | null;
  checkedAt: string;
  pollIntervalMs: number;
  inactivityLimitMs: number;
};

/** A atividade é um envio observado pelo operador/IA, não entrega confirmada pelo WhatsApp. */
export function browserCampaignMonitor(input: {
  campaignStatus: string;
  startedAt: string | null;
  lastObservedAt: string | null;
  recipientStatuses: string[];
  expectedRecipients: number;
  nowMs: number;
}): BrowserCampaignMonitor {
  const { campaignStatus, startedAt, lastObservedAt, recipientStatuses, expectedRecipients, nowMs } = input;
  const startedMs = startedAt ? Date.parse(startedAt) : NaN;
  const observedMs = lastObservedAt ? Date.parse(lastObservedAt) : NaN;
  const lastActivityMs = Math.max(
    Number.isFinite(startedMs) ? startedMs : 0,
    Number.isFinite(observedMs) ? observedMs : 0,
  );
  const lastActivityAt = lastActivityMs > 0 ? new Date(lastActivityMs).toISOString() : null;
  const completedByRecipients = expectedRecipients > 0 && recipientStatuses.length === expectedRecipients
    && recipientStatuses.every((status) => status === 'sent' || status === 'skipped');
  let state: BrowserCampaignMonitorState = 'off';
  if (campaignStatus === 'completed' || completedByRecipients) state = 'complete';
  else if (campaignStatus === 'running') {
    state = !lastActivityMs || nowMs - lastActivityMs >= BROWSER_CAMPAIGN_MONITOR_IDLE_MS
      ? 'idle' : 'active';
  }
  return {
    state, lastActivityAt,
    lastObservedAt: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : null,
    checkedAt: new Date(nowMs).toISOString(),
    pollIntervalMs: BROWSER_CAMPAIGN_MONITOR_POLL_MS,
    inactivityLimitMs: BROWSER_CAMPAIGN_MONITOR_IDLE_MS,
  };
}
