import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  estimateMarketingCostBrl, MARKETING_RATE_BRL_2026, selectPendingBrowserRecipients,
} from '../src/lib/browser-campaign-api-transfer.ts';

const root = resolve(import.meta.dirname, '..');
const row = (id, status, position = 0, next_item_index = 0, phone = `55479999${String(id).padStart(5, '0')}`) => ({
  id, lead_id: `lead-${id}`, lead_name: `Contato ${id}`, phone,
  stage: 'futuro', status, next_item_index, position,
});

// Caso real: 1.150 contatos, 123 enviados, 1.027 na fila e um com
// comprovante parcial. A transferencia jamais podera escolher 1.027.
const all = [
  ...Array.from({ length: 123 }, (_, index) => row(`sent-${index}`, 'sent', index)),
  ...Array.from({ length: 1027 }, (_, index) => row(`queued-${index}`, 'queued', index + 123)),
];
const partialId = 'queued-175';
const partial = selectPendingBrowserRecipients(all, new Set([partialId]));
assert.deepEqual(partial.counts, {
  total: 1150, queued: 1027, sent: 123, claimed: 0, uncertain: 0,
  skipped: 0, partialOrObserved: 1, duplicateOrInvalidPhone: 0,
});
assert.equal(partial.safe.length, 1026);
assert(!partial.safe.some((entry) => entry.id === partialId));
assert(!partial.safe.some((entry) => entry.status === 'sent'));

const edgeCases = selectPendingBrowserRecipients([
  row('sent', 'sent', 0), row('claimed', 'claimed', 1), row('uncertain', 'uncertain', 2),
  row('skipped', 'skipped', 3), row('partial', 'queued', 4, 1),
  row('observed', 'queued', 5), row('unique', 'queued', 6, 0, '5547999999999'),
  row('duplicate', 'queued', 7, 0, '55 (47) 99999-9999'),
  row('invalid', 'queued', 8, 0, '555'),
], new Set(['observed']));
assert.deepEqual(edgeCases.safe.map((entry) => entry.id), ['unique']);
assert.equal(edgeCases.counts.partialOrObserved, 2);
assert.equal(edgeCases.counts.duplicateOrInvalidPhone, 2);
assert.equal(edgeCases.counts.claimed, 1);
assert.equal(edgeCases.counts.uncertain, 1);

assert.equal(MARKETING_RATE_BRL_2026, 0.3217);
assert.equal(estimateMarketingCostBrl(1026), 330.06);
assert.equal(estimateMarketingCostBrl(0), 0);

const migration = readFileSync(resolve(root,
  'supabase/migrations/20261111133119_browser_campaign_api_transfer.sql'), 'utf8');
const prepare = readFileSync(resolve(root,
  'src/app/api/transmissoes/navegador/transferencia/route.ts'), 'utf8');
const send = readFileSync(resolve(root,
  'src/app/api/transmissoes/[id]/send/route.ts'), 'utf8');
const oldCampaign = readFileSync(resolve(root,
  'src/app/api/transmissoes/navegador/route.ts'), 'utf8');
const freeze = readFileSync(resolve(root,
  'src/app/api/transmissoes/navegador/transferencia/congelar/route.ts'), 'utf8');
assert.match(migration, /unique index[^;]*broadcasts_source_browser_campaign_uidx/is);
assert.match(migration, /unique index[^;]*broadcast_recipients_source_browser_uidx/is);
assert.match(migration, /function public\.browser_campaign_freeze_for_api/);
assert.match(migration, /last_observed_at>now\(\)-interval '1 hour'/);
assert.match(migration, /coalesce\(r\.next_item_index,0\)>0/);
assert.match(prepare, /refreshed\.hasActiveRun/);
assert.match(prepare, /status: 'ready'/);
assert.doesNotMatch(prepare, /provider\.sendTemplate\(/);
assert.match(freeze, /confirmedChatGPTStopped !== true/);
assert.match(send, /source\.status !== 'queued'/);
assert.match(send, /browser_campaign_echo_receipts/);
assert.match(send, /paused && !broadcast\.source_browser_campaign_id/);
assert.match(oldCampaign, /source_browser_campaign_id/);

console.log('Transferencia de pendentes: 1.026 seguros de 1.027 na fila, 123 enviados preservados, travas e custo conferidos.');
