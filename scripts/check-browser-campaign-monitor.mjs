import assert from 'node:assert/strict';
import {
  BROWSER_CAMPAIGN_MONITOR_IDLE_MS, BROWSER_CAMPAIGN_MONITOR_POLL_MS, browserCampaignMonitor,
} from '../src/lib/browser-campaign-monitor.ts';

const now = Date.parse('2026-11-09T15:00:00.000Z');
const baseline = {
  campaignStatus: 'running', startedAt: '2026-11-09T14:50:00.000Z',
  lastObservedAt: null, recipientStatuses: ['queued', 'queued'],
  expectedRecipients: 2, nowMs: now,
};
assert.equal(BROWSER_CAMPAIGN_MONITOR_POLL_MS, 120_000);
assert.equal(BROWSER_CAMPAIGN_MONITOR_IDLE_MS, 900_000);
assert.equal(browserCampaignMonitor(baseline).state, 'active', 'monitorar desde a liberação da fila');
assert.equal(browserCampaignMonitor({ ...baseline, startedAt: '2026-11-09T14:45:00.000Z' }).state, 'idle', 'parar após exatamente 15 min sem observação');
assert.equal(browserCampaignMonitor({ ...baseline, startedAt: '2026-11-09T14:40:00.000Z', lastObservedAt: '2026-11-09T14:58:00.000Z' }).state, 'active', 'nova mensagem observada reinicia a janela');
assert.equal(browserCampaignMonitor({ ...baseline, campaignStatus: 'completed' }).state, 'complete');
assert.equal(browserCampaignMonitor({ ...baseline, recipientStatuses: ['sent', 'skipped'] }).state, 'complete');
assert.equal(browserCampaignMonitor({ ...baseline, campaignStatus: 'paused' }).state, 'off');
assert.equal(browserCampaignMonitor({ ...baseline, startedAt: null }).state, 'idle', 'não inventar uma hora de início');
assert.equal(browserCampaignMonitor({ ...baseline, recipientStatuses: ['sent', 'uncertain'] }).state, 'active', 'pendência não é campanha concluída');

console.log('Monitor do CRM: 2 minutos por leitura, limite de 15 minutos sem envio observado, conclusão e pausa OK.');
