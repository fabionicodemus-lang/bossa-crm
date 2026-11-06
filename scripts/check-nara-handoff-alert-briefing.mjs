// Exercise actual template consumer with synthetic in-memory storage and a recording fake provider.
// No imports of credentials, Supabase, WhatsApp or an external network implementation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = await readFile(new URL('../src/app/api/automation/handoff-alerts/route.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source).replace(/^import\s[\s\S]*?;\s*$/gm, '')
  .replace(/^export const /gm, 'const ').replace(/^export async function /gm, 'async function ');
const forbidden = () => { throw new Error('External action forbidden in synthetic test'); };
const sent = [];
const helpers = new Function('NextResponse', 'createAdminClient', 'channelAccess', 'findChannelById', 'normalizeManualPhone',
  `${executable}\nreturn { conversationFromBriefing, sendRecipient, DEFAULT_TEMPLATE, SECONDARY_TEMPLATE, POST_SALE_TEMPLATE };`)(
  { json: Response.json }, forbidden,
  () => ({ accessToken: 'synthetic-credential-not-in-body', phoneNumberId: 'synthetic-number', provider: {
    sendTemplate: async (args) => { sent.push(args); return { messageId: 'synthetic-wamid', raw: {} }; },
  } }), forbidden, (value) => value,
);
let passed = 0;
async function check(name, run) { await run(); passed += 1; console.log(`✓ ${name}`); }
const current = 'Aceitam R$ 200 mil de entrada e 60 parcelas?';
await check('Objeção ausente preserva o pedido financeiro direto, sem inventar aprovação', () => {
  const text = helpers.conversationFromBriefing({ main_objection: null, latest_client_request: current, summary: 'Cliente pediu avaliação comercial.' });
  assert.match(text, /Pedido atual do cliente: Aceitam R\$ 200 mil de entrada e 60 parcelas\?/);
  assert.match(text, /não representam condições aprovadas/);
  assert.doesNotMatch(text, /A Nara encaminhou/);
});
await check('Objeção presente e pedido atual são mantidos sem apagar um ao outro', () => {
  const text = helpers.conversationFromBriefing({ main_objection: 'O Flow é longe da praia.', latest_client_request: 'Quero comparar dois andares.', summary: 'Comparação solicitada.' });
  assert.match(text, /longe da praia/); assert.match(text, /comparar dois andares/); assert.match(text, /Comparação solicitada/);
});
await check('Briefing legado sem campos novos preserva o resumo anterior', () => {
  assert.match(helpers.conversationFromBriefing({ main_objection: 'Busca moradia e pediu atendimento.' }), /Busca moradia e pediu atendimento/);
  assert.match(helpers.conversationFromBriefing({ summary: 'Resumo disponível sem objeção.' }), /Resumo disponível sem objeção/);
  assert.match(helpers.conversationFromBriefing({ main_objection: `${'Contexto. '.repeat(45)}Pedido final preservado.` }), /Pedido final preservado/);
});
await check('Dados ausentes ou objetos não viram texto inventado nem JSON do briefing', () => {
  const fallback = 'A Nara encaminhou o atendimento ao comercial.';
  assert.equal(helpers.conversationFromBriefing({}), fallback);
  assert.equal(helpers.conversationFromBriefing({ main_objection: { api_key: 'private-synthetic' }, summary: 123 }), fallback);
});
await check('Texto respeita 900 caracteres e preserva o pedido mesmo com resumo longo', () => {
  const text = helpers.conversationFromBriefing({ latest_client_request: current, main_objection: 'x'.repeat(2000), summary: 'y'.repeat(5000) });
  assert.ok(text.length <= 900); assert.match(text, /60 parcelas/); assert.match(text, /não representam condições aprovadas/);
  assert.equal((helpers.conversationFromBriefing({ latest_client_request: current, main_objection: current, summary: current }).match(/Aceitam/g) || []).length, 1);
});
await check('Credenciais desconhecidas e reconhecíveis no texto não entram no parâmetro', () => {
  const text = helpers.conversationFromBriefing({ latest_client_request: 'Pedido. senha=synthetic123 Bearer synthetic.token.value api_key=synthetic-key',
    access_token: 'hidden-synthetic', secret: 'hidden-synthetic', service_role_key: 'hidden-synthetic' });
  assert.doesNotMatch(text, /synthetic123|synthetic\.token\.value|synthetic-key|hidden-synthetic/);
  assert.match(text, /credencial removida/);
});

function fakeAdmin() {
  const writes = [];
  return { writes, from(table) {
    assert.ok(['client_handoff_alert_jobs', 'lead_handoffs', 'whatsapp_messages', 'activities'].includes(table));
    const query = {
      select() { return query; }, eq() { return query; },
      async maybeSingle() { return { data: table === 'lead_handoffs' ? { status: 'pending', offered_to: 'synthetic-owner' } : { owner_status: 'queued', manager_status: 'queued' }, error: null }; },
      update(value) { writes.push({ table, value }); return query; },
      insert(value) { writes.push({ table, value }); return query; },
      upsert(value) { writes.push({ table, value }); return query; },
      then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); },
    };
    return query;
  } };
}
await check('Consumidor real mantém nome/schema/quatro parâmetros e só usa transporte simulado', async () => {
  const admin = fakeAdmin();
  await helpers.sendRecipient({ admin, job: { id: 'synthetic-job', organization_id: 'synthetic-org', lead_id: 'synthetic-lead', handoff_id: 'synthetic-handoff',
    owner_attempts: 0, recipient_kind: 'client', briefing: { lead_name: 'Contato sintético', latest_client_request: current, main_objection: null } },
    settings: { primary_owner_user_id: 'synthetic-owner', primary_owner_name: 'Consultor sintético', primary_owner_alert_phone: 'synthetic-phone', manager_name: 'Gestor sintético' },
    channel: {}, template: { name: helpers.DEFAULT_TEMPLATE.name, language: helpers.DEFAULT_TEMPLATE.language, status: 'APPROVED' }, recipient: 'owner' });
  assert.equal(sent.length, 1); const call = sent[0];
  assert.equal(call.name, 'alerta_passagem_nara'); assert.equal(call.language, 'pt_BR'); assert.equal(call.headerType, 'NONE');
  assert.equal(call.bodyParameters.length, 4); assert.match(call.bodyParameters[2], /60 parcelas/);
  assert.deepEqual(call.bodyParameters.map((value, index) => value.length <= [200, 950, 900, 900][index]), [true, true, true, true]);
  assert.doesNotMatch(JSON.stringify(call.bodyParameters), /synthetic-credential-not-in-body/);
  assert.match(admin.writes.find((row) => row.table === 'activities').value.description, /60 parcelas/);
  for (const template of [helpers.DEFAULT_TEMPLATE, helpers.SECONDARY_TEMPLATE, helpers.POST_SALE_TEMPLATE]) {
    assert.deepEqual([...template.body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]), ['1', '2', '3', '4']);
  }
});

console.log(`\nBriefing de alerta: ${passed}/${passed} verificações sintéticas aprovadas. Sem mensagens ou consultas reais.`);
