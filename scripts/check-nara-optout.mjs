// Offline regression for L08. Executed by the existing test:nara-round3 gate.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { aiCanReply, deriveHybridDecision, optOutSignal } from '../src/lib/hybrid.ts';
import { metaWaId, phoneMatchVariants } from '../src/lib/whatsapp/utils.ts';

const exactL08 = 'Não quero mais receber mensagens. Retire meu contato dos próximos envios.';
const positives = [
  exactL08,
  'Não quero mais receber mensagens.',
  'Não quero receber mais mensagens.',
  'Por favor, não quero receber mensagens.',
  'Retire meu contato dos próximos envios.',
  'Retire o meu contato dos próximos envios, por favor.',
  'Remova meu contato da lista.',
  'Exclua meu telefone das campanhas.',
  'Retire meu número.',
  'Remova meu numero por favor',
  'Tira meu número da lista.',
  'Me tira da lista',
  'Quero sair da lista',
  'Cancele as mensagens',
  'Não me mande mais.',
  'Por favor não me mande mais mensagens',
  'Pare de me mandar mensagem',
  'STOP',
  'Não retire meu contato da proposta, mas retire meu contato dos próximos envios.',
  'Quero uma proposta com 200 mil de entrada, mas não quero mais receber mensagens.',
  'Retire meu contato dos próximos envios. Quero falar sobre as parcelas com um consultor.',
];
const negatives = [
  'Não retire meu contato dos próximos envios.',
  'Por favor não remova meu número.',
  'Não quero que você retire meu contato da lista.',
  'Nunca remova meu número da lista.',
  'Não me tira da lista.',
  'Não quero sair da lista.',
  'Não cancele as mensagens.',
  'Retire meu contato da proposta, está incorreto.',
  'Remova meu número do contrato.',
  'Retire meu contato do financeiro, prefiro o outro email.',
  'Não quero mais receber ligação, prefiro por aqui.',
  'Não quero receber ligação, prefiro por aqui.',
  'Não me mande mais áudio, pode ser texto?',
  'Para de mandar áudio, pode ser por texto?',
  'Não quero receber o contrato por email, pode ser impresso?',
  'Não quero nada muito caro, tem algo mais em conta?',
  'Não quero receber proposta agora, só saber o preço.',
  'Não me encaminhe ao comercial; me explica as opções por aqui.',
  'Não compartilhe meu contato com um vendedor.',
  'Não quero mais sair da lista',
  'Quero negociar 200 mil de entrada e parcelas de 5 mil.',
];
const lead = { id: 'lead-a', organization_id: 'org-a', kind: 'cliente', phone: '5547999990001',
  name: 'Pessoa sintética', stage: 'novo_triagem', owner_mode: 'ai', ai_enabled: true,
  opt_out: false, automation_paused: false, metadata: {} };
// Match the real L08 output: do not make the model say "sem_interesse" to pass.
const coldTurn = { reply: 'Vou solicitar a retirada do seu contato dos próximos envios.',
  classification: 'frio', score: 0, stage: 'ia', handoff: false, next_action: '',
  attachment_ids: [], extracted: {} };
for (const text of positives) {
  assert.equal(optOutSignal(text), true, text);
  for (const turn of [coldTurn, { ...coldTurn, score: 99, handoff: true, classification: 'quente' }]) {
    const decision = deriveHybridDecision({ lead, turn, lastUserMessage: text });
    assert.equal(decision.stage, 'encerrado', text);
    assert.equal(decision.priorityClass, 'D', text);
    assert.equal(decision.aiEnabled, false, text);
    assert.equal(decision.ownerMode, 'none', text);
    assert.equal(decision.handoffRequired, false, text);
    assert.equal(decision.nextActionType, 'encerrar', text);
  }
}
for (const text of negatives) assert.equal(optOutSignal(text), false, text);
const financial = deriveHybridDecision({ lead, turn: coldTurn, lastUserMessage: negatives.at(-1) });
assert.equal(financial.handoffRequired, true, 'Financial intent still routes normally without opt-out.');
assert.equal(financial.priorityClass, 'A1');

const source = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const start = source.indexOf('export async function processConversation(');
const end = source.indexOf('\nasync function processStatus(', start);
assert.ok(start >= 0 && end > start, 'Exercise the real current webhook conversation function.');
const conversationCode = stripTypeScriptTypes(source.slice(start, end)).replace(/^export\s+/m, '');
// Both the quiet-hours bypass and broadcast routing use the same detector.
assert.match(source, /!optOutSignal\(inboundBody\?\.body \|\| ''\)/);
assert.match(source, /const explicitOptOut = lead\.kind === 'cliente' && optOutSignal\(String\(source\.body \?\? ''\)\)/);
const simulation = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
assert.match(simulation, /deriveHybridDecision\(\{ lead, turn, lastUserMessage \}\)/);
assert.match(simulation, /stage: hybridDecision\.stage/);

async function exerciseWebhook(text, expectedSuppression) {
  const tables = {
    leads: [structuredClone(lead), { ...structuredClone(lead), id: 'lead-duplicate' },
      { ...structuredClone(lead), id: 'foreign', organization_id: 'org-b' },
      { ...structuredClone(lead), id: 'other-number', phone: '5547999990002' }],
    messages: [{ id: 'source-a', lead_id: lead.id, direction: 'in', sender_kind: 'contato', body: text,
      created_at: '2026-11-06T15:00:00.000Z' }],
    nara_followup_sequences: [{ id: 'seq-a', lead_id: lead.id, status: 'active' }],
    nara_deferred_replies: [{ id: 'deferred-a', lead_id: lead.id, status: 'pending' }],
    broadcast_recipients: [{ id: 'recipient-a', organization_id: 'org-a', phone: lead.phone, status: 'queued' },
      { id: 'foreign-recipient', organization_id: 'org-b', phone: lead.phone, status: 'queued' }],
  };
  const sent = [], events = [], recorded = [];
  let claims = 0, writes = 0;
  const admin = { from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table: ${table}`);
    const filters = []; let patch;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      neq(key, value) { filters.push((row) => row[key] !== value); return query; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
      gte(key, value) { filters.push((row) => row[key] >= value); return query; },
      order() { return query; }, limit() { return query; },
      update(value) { patch = value; return query; },
      maybeSingle() { return Promise.resolve(execute(true)); },
      then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); },
    };
    function execute(single) {
      const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (patch) for (const row of rows) { Object.assign(row, structuredClone(patch)); writes++; }
      return { data: structuredClone(single ? rows[0] || null : rows), error: null };
    }
    return query;
  } };
  const deps = {
    optOutSignal, aiCanReply, phoneMatchVariants, metaWaId,
    autoRouteEarlyOperationalBroker: async () => ({ routedToGeneral: false }),
    completePendingBrokerPortfolio: async () => ({ handled: false }),
    handleMixedPlantaoConversation: async () => ({ handled: false, promotedToBroker: false }),
    findRecentBroadcastForLead: async () => null,
    broadcastResponseAction: (_lead, _recent, optOut) => { assert.equal(optOut, expectedSuppression); return 'none'; },
    loadAiContext: async () => ({ config: { active: true } }),
    tryRecordNaraFunnelEvent: async (_admin, event) => { events.push(event); return { error: null }; },
    channelAccess: () => ({ phoneNumberId: 'mock-only', accessToken: 'mock-only', provider: {
      sendText: async (message) => {
        assert.equal(tables.leads[0].opt_out, true, 'Suppression must persist before the confirmation.');
        assert.equal(tables.nara_followup_sequences[0].status, 'cancelled');
        assert.equal(tables.nara_deferred_replies[0].status, 'cancelled');
        assert.equal(tables.broadcast_recipients[0].status, 'skipped');
        sent.push(message); return { messageId: 'fake-confirmation', raw: {} };
      },
    } }),
    recordOutbound: async (record) => recorded.push(record),
    whatsappClaimAiTurn: async () => { claims++; return false; },
    handleAiFailure: async () => { throw new Error('Unexpected AI failure path.'); },
    recordClientNoReplySafetyNet: async () => { throw new Error('Unexpected safety-net path.'); },
  };
  const processConversation = new Function(...Object.keys(deps), `${conversationCode}\nreturn processConversation;`)(...Object.values(deps));
  const args = { admin, channel: { id: 'channel-a', role: 'cliente', organization_id: 'org-a' },
    conversation: { id: 'conversation-a', contact_wa_id: lead.phone }, leadId: lead.id, sourceMessageId: 'source-a' };
  await processConversation(args);
  if (expectedSuppression) {
    for (const row of tables.leads.slice(0, 2)) {
      assert.equal(row.opt_out, true); assert.equal(row.ai_enabled, false);
      assert.equal(row.automation_paused, true); assert.equal(row.owner_mode, 'none');
      assert.equal(row.stage, 'encerrado'); assert.equal(aiCanReply(row), false);
    }
    assert.equal(tables.leads[2].opt_out, false, 'No cross-organization suppression.');
    assert.equal(tables.leads[3].opt_out, false, 'No unrelated phone suppression.');
    assert.equal(tables.broadcast_recipients[1].status, 'queued');
    assert.equal(events.length, 1); assert.equal(events[0].event, 'opt_out');
    assert.equal(events[0].evidence.source_message_id, 'source-a');
    assert.equal(claims, 0, 'No model/commercial path is entered.');
    assert.equal(sent.length, 1); assert.equal(recorded.length, 1);
    assert.match(sent[0].body, /Seu número foi removido/);
    const previousWrites = writes;
    await processConversation(args);
    assert.equal(writes, previousWrites, 'Retry of already suppressed lead is idempotent.');
    assert.equal(sent.length, 1, 'No duplicate opt-out confirmation.');
  } else {
    assert.equal(writes, 0); assert.equal(sent.length, 0); assert.equal(events.length, 0);
    assert.equal(claims, 1, 'A scoped refusal does not globally suppress the contact.');
  }
}

const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Network/provider access forbidden in opt-out tests.'); };
try {
  for (const text of [exactL08, positives[4], positives.at(-2), positives.at(-1)]) await exerciseWebhook(text, true);
  for (const text of [negatives[0], negatives[7], negatives[10], negatives[17]]) await exerciseWebhook(text, false);
} finally { globalThis.fetch = originalFetch; }
console.log(`Nara opt-out: ${positives.length} positives, ${negatives.length} negatives, 8 real webhook-path scenarios (offline) passed.`);
