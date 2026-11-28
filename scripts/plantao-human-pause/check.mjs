import assert from 'node:assert/strict';
import { processEcho } from '../../src/lib/whatsapp/webhookDispatcher.ts';
import { whatsappCanStillReply } from '../../src/lib/whatsapp/aiTurnSafety.ts';
import { makeDb } from '../nara-cadence/fakedb.mjs';
globalThis.NOW = Date.now();
function fixture(type = 'text', campaign = false, options = {}) {
  const lead = { id: 'lead', organization_id: 'org', kind: 'corretor', phone: '5547999990000',
    metadata: {}, ai_enabled: true, automation_paused: false, owner_mode: 'ai', opt_out: false };
  const tables = { leads: [lead], messages: [], whatsapp_messages: [] };
  const admin = makeDb(tables, options);
  admin.rpc = async () => ({ data: campaign, error: null });
  const channel = { id: 'tais', organization_id: 'org', role: 'corretor' };
  const args = { admin, channel, echo: { id: 'wamid-test', to: lead.phone, type,
    timestamp: Math.floor(Date.now() / 1000), text: { body: 'Vou atender' } }, fallbackContact: '', contactName: '' };
  return { admin, tables, args, run: () => processEcho(args) };
}
for (const type of ['text', 'audio', 'image', 'document']) {
  for (const id of ['tais', 'cintia']) {
    const f = fixture(type); f.args.channel.id = id;
    await f.run();
    assert.equal(f.tables.leads[0].automation_paused, true);
    assert.equal(f.tables.leads[0].ai_enabled, false);
    assert.equal(f.tables.leads[0].metadata.whatsapp_manual_takeover, true);
    assert.equal(f.tables.messages[0].whatsapp_channel_id, id);
    await f.run();
    assert.equal(f.tables.messages.length, 1);
    assert.equal(f.tables.activities.length, 1);
  }
}
let failMirror = true;
const retry = fixture('audio', false, { queryResult: (table, op) =>
  failMirror && table === 'messages' && op === 'upsert' ? { error: new Error('Mirror failed') } : null });
await assert.rejects(retry.run(), /Mirror failed/);
assert.equal(retry.tables.whatsapp_messages.length, 1);
failMirror = false;
await retry.run();
assert.equal(retry.tables.messages.length, 1);
assert.equal(retry.tables.leads[0].automation_paused, true);
let failPause = true;
const retryPause = fixture('audio', false, { queryResult: (table, op) =>
  failPause && table === 'leads' && op === 'update' ? { error: new Error('Pause failed') } : null });
await assert.rejects(retryPause.run(), /Pause failed/);
failPause = false;
await retryPause.run();
assert.equal(retryPause.tables.leads[0].automation_paused, true);
const campaign = fixture('text', true);
await campaign.run();
assert.equal(campaign.tables.leads[0].automation_paused, false);
assert.equal(campaign.tables.messages[0].raw_payload.browser_campaign_echo, true);
const api = fixture();
api.tables.whatsapp_messages.push({ id: 'api', wamid: 'wamid-test', payload: { provider: {} } });
await api.run();
assert.equal(api.tables.leads[0].automation_paused, false);
assert.equal(api.tables.messages.length, 0);
const concurrent = fixture();
concurrent.admin.rpc = async (fn) => ({ data: fn !== 'browser_campaign_record_echo', error: null });
const now = new Date().toISOString();
concurrent.tables.messages.push({ id: 'source', created_at: now });
const turn = { admin: concurrent.admin, leadId: 'lead', conversationId: 'conversation', sourceId: 'source' };
assert.equal(await whatsappCanStillReply(turn), true);
await concurrent.run();
assert.equal(await whatsappCanStillReply(turn), false);
console.log('Plantão: two channels, text/audio/media, retries, campaigns, API echoes and in-flight takeover passed.');

const resumed = fixture();
await resumed.run();
Object.assign(resumed.tables.leads[0], { ai_enabled: true, automation_paused: false, owner_mode: 'ai', metadata: { whatsapp_manual_takeover: false } });
await resumed.run();
assert.equal(resumed.tables.leads[0].automation_paused, false, 'completed echo replay must not undo explicit resume');

const { plantaoResumedAfterHumanPause, PLANTAO_HUMAN_PAUSE_MS } = await import('../../src/lib/whatsapp/plantaoHumanPause.ts');
const { aiCanReply, deriveHybridDecision } = await import('../../src/lib/hybrid.ts');
const { recoverPlantaoHumanPauses } = await import('../../src/lib/whatsapp/plantaoPauseRecovery.ts');
const clock = Date.now();
const resumedBroker = { id: 'lead', kind: 'corretor', stage: 'proposta_negociacao', owner_mode: 'ai',
  ai_enabled: true, automation_paused: false, opt_out: false,
  plantao_human_pause_until: new Date(clock).toISOString() };
assert.equal(plantaoResumedAfterHumanPause(resumedBroker, clock - 1), false);
assert.equal(plantaoResumedAfterHumanPause(resumedBroker, clock), true);
assert.equal(aiCanReply(resumedBroker), true);
const decision = deriveHybridDecision({ lead: resumedBroker, now: new Date(clock),
  lastUserMessage: 'Obrigado, preciso da planta', turn: { score: 50, classification: 'ativo', handoff: false,
    next_action: 'Enviar planta', summary: 'Pedido de planta' } });
assert.equal(decision.stage, 'proposta_negociacao');
assert.equal(decision.aiEnabled, true);
for (const extra of [{ kind: 'cliente' }, { automation_paused: true }, { opt_out: true },
  { owner_mode: 'human' }, { stage: 'encerrado' }, { plantao_human_pause_until: null },
  { plantao_human_pause_until: new Date(clock + PLANTAO_HUMAN_PAUSE_MS).toISOString() }]) {
  assert.equal(plantaoResumedAfterHumanPause({ ...resumedBroker, ...extra }, clock), false);
}
function recoveryFixture({ answered = false, repaused = false, off = false } = {}) {
  globalThis.PAUSE_PROCESSED = [];
  globalThis.TEST_CHANNEL = { id: 'channel', organization_id: 'org', role: 'corretor' };
  const tables = {
    leads: [{ ...resumedBroker, organization_id: 'org',
      plantao_human_pause_until: new Date(clock - 60_000).toISOString(), automation_paused: repaused }],
    ai_agent_configs: [{ organization_id: 'org', agent: 'plantao', active: !off }],
    messages: [{ id: 'pending', lead_id: 'lead', direction: 'in', sender_kind: 'lead',
      created_at: new Date(clock - 120_000).toISOString(), whatsapp_conversation_id: 'conversation', whatsapp_channel_id: 'channel' }],
    whatsapp_conversations: [{ id: 'conversation', lead_id: 'lead', channel_id: 'channel', window_expires_at: new Date(clock + 3600000).toISOString() }],
  };
  if (answered) tables.messages.push({ id: 'answered', direction: 'out', created_at: new Date(clock - 60000).toISOString(), whatsapp_conversation_id: 'conversation' });
  const admin = makeDb(tables);
  admin.rpc = async (fn) => ({ data: fn === 'plantao_human_pause_candidates' ? [{ lead_id: 'lead' }] : false, error: null });
  return { tables, run: () => recoverPlantaoHumanPauses(admin) };
}
const pending = recoveryFixture();
assert.equal((await pending.run()).attempted, 1);
assert.deepEqual(globalThis.PAUSE_PROCESSED, ['pending']);
for (const options of [{ answered: true }, { repaused: true }, { off: true }]) {
  const fixture = recoveryFixture(options);
  assert.equal((await fixture.run()).attempted, 0);
  assert.deepEqual(globalThis.PAUSE_PROCESSED, []);
}
console.log('Thirty-minute boundary, renewed pause, negotiation stage, pending reply and off-hours recovery passed.');
