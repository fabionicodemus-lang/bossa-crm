import assert from 'node:assert/strict';
import { handleMixedPlantaoConversation } from '../src/lib/whatsapp/plantaoMixedRouting.ts';
import { isCurrentBrokerPriceTable, requestedBrokerPriceTables } from '../src/lib/ai-file-ranking.ts';
import { makeDb } from './nara-cadence/fakedb.mjs';
import { sent } from './nara-cadence/stubs/cs.mjs';

globalThis.NOW = Date.now();

function fixture(mode, body, { kind = 'geral', active = true, metadata = {} } = {}) {
  sent.length = 0;
  const lead = { id: 'lead', organization_id: 'org', kind, metadata };
  const tables = {
    ai_agent_configs: [{ organization_id: 'org', agent: 'plantao', active }],
    leads: [lead],
    messages: [{ id: 'incoming', body }],
  };
  const admin = makeDb(tables);
  admin.rpc = async () => ({ data: true, error: null });
  const args = {
    admin, lead, sourceMessageId: 'incoming',
    channel: { id: 'channel', organization_id: 'org', role: 'corretor', routing_mode: mode,
      legacy_connection_id: mode === 'mixed_plantao' ? 'legacy' : null },
    conversation: { id: 'conversation', contact_wa_id: '15550100001' },
  };
  return { tables, run: () => handleMixedPlantaoConversation(args) };
}

for (const mode of ['mixed_plantao', 'direct_role']) {
  const known = fixture(mode, 'Me envia a tabela do Flow?', { kind: 'corretor' });
  assert.equal((await known.run()).handled, false);
  const general = fixture(mode, 'Não sou!', { metadata: { plantao_triage_status: 'awaiting_broker_answer' } });
  await general.run();
  assert.equal(general.tables.leads[0].metadata.plantao_triage_status, 'not_broker');
  general.tables.whatsapp_messages[0]['payload->>routing_reason'] = 'general_not_broker';
  general.tables.messages[0].body = 'Minha ideia seria uma permuta de um imóvel.';
  await general.run();
  assert.equal(sent.length, 1);
  assert.equal(general.tables.lead_tasks.length, 1);
  assert.equal(general.tables.leads[0].metadata.plantao_triage_answer, 'Não sou!');
  const off = fixture(mode, 'Quero a planta do duplex', { kind: 'corretor', active: false });
  assert.equal((await off.run()).handled, true);
  assert.equal(sent.length, 0);

  const triage = fixture(mode, 'Oi!');
  await triage.run();
  const outbound = triage.tables.messages.find((row) => row.direction === 'out');
  assert.equal(outbound.whatsapp_channel_id, 'channel');
  assert.equal(outbound.whatsapp_connection_id, mode === 'mixed_plantao' ? 'legacy' : null);
  assert.equal(sent.length, 1);
  // O adaptador de teste usa chaves literais para filtros JSON do PostgREST.
  triage.tables.whatsapp_messages[0]['payload->>routing_reason'] = 'broker_question_first';
  await triage.run();
  assert.equal(sent.length, 1);
  assert.equal(triage.tables.lead_tasks.length, 1);

  triage.tables.messages[0].body = 'Estou apresentando para um cliente. Tem planta do duplex?';
  const result = await triage.run();
  assert.equal(result.promotedToBroker, true);
  assert.equal(triage.tables.leads[0].kind, 'corretor');
  assert.equal(sent.length, 1);
}

const november = { category: 'tabela', version_label: 'Novembro', valid_from: '2026-11-01T03:00:00Z', valid_until: '2026-12-01T02:59:59Z' };
const testDate = Date.parse('2026-11-23T22:00:00Z');
assert.equal(isCurrentBrokerPriceTable(november, testDate), true);
for (const fields of [{ valid_until: null }, { version_label: ' ' }, { valid_from: 'invalid' },
  { valid_from: '2026-12-01T03:00:00Z' }, { valid_until: '2026-11-01T03:00:00Z' }]) {
  assert.equal(isCurrentBrokerPriceTable({ ...november, ...fields }, testDate), false);
}

const catalog = ['Flow Aptos', 'Alma Seahouses'].map((name) => ({
  ...november, id: name, title: 'Tabela de vendas · ' + name, version_label: 'Novembro 2026',
}));
const selectTables = (text, files = catalog) => requestedBrokerPriceTables(files, text, testDate).map((file) => file.id);
assert.deepEqual(selectTables('Teste do plantão: sou corretor e gostaria da tabela do Flow'), ['Flow Aptos']);
assert.deepEqual(selectTables('Sou corretor. Pode me enviar as tabelas em PDF de novembro do Flow Aptos e do Alma Seahouses?'),
  ['Flow Aptos', 'Alma Seahouses']);
for (const text of ['Não quero a tabela do Flow', 'Tabela do Flow e planta do duplex', 'Tabela de outubro do Flow',
  'Me passa a tabela?', 'A tabela do Alma tem a unidade 2101?', 'Quanto custa a tabela do Flow?']) {
  assert.deepEqual(selectTables(text), []);
}
assert.deepEqual(selectTables('Tabelas Flow e Alma', [catalog[0]]), []);
assert.deepEqual(selectTables('Tabela Flow', [catalog[0], catalog[0]]), []);

const manual = fixture('mixed_plantao', 'Estou apresentando para um cliente', {
  metadata: { contact_kind_manually_confirmed: 'geral' },
});
assert.equal((await manual.run()).handled, true);
assert.equal(manual.tables.leads[0].kind, 'geral');
assert.equal(sent.length, 0);
console.log('Plantão validado nos dois canais, com triagem, horários e registro do envio.');
