// Route and actual React list exercised with synthetic data only.
// No real database, sending provider, browser session or external account is loaded.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { recordNaraFunnelEvent, summarizeNaraFunnelEvents } from '../src/lib/nara-funnel-events.ts';

const ORG = '10000000-0000-4000-8000-000000000001';
const LEAD = '20000000-0000-4000-8000-000000000002';
const PROPOSAL = '30000000-0000-4000-8000-000000000003';
const ACTOR = '40000000-0000-4000-8000-000000000004';
const OTHER = '90000000-0000-4000-8000-000000000009';
const createdAt = new Date(Date.now() - 86400000).toISOString();
const happenedAt = new Date(Date.now() - 2000).toISOString();
const proposal = {
  id: PROPOSAL, organization_id: ORG, lead_id: LEAD, version: 1, created_at: createdAt,
  updated_at: createdAt, proposal_number: 123, status: 'rascunho',
  proposed_price: 100, list_price: 100, discount_amount: 0,
  snapshot: { development_name: 'Empreendimento sintético', unit_code: 'QA01', lead_name: 'Contato sintético' },
};

const route = await readFile(new URL('../src/app/api/nara/funnel/outcomes/route.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(route)
  .replace(/^import\s.*?;\s*$/gm, '')
  .replace(/^export const /gm, 'const ')
  .replace(/^export async function /gm, 'async function ');

function fixture(options = {}) {
  const tables = {
    proposals: options.noProposal ? [] : [{ ...structuredClone(proposal), ...(options.proposal ?? {}) }],
    leads: options.noLead ? [] : [{ id: LEAD, organization_id: ORG, kind: 'cliente', source: 'synthetic', enterprise: 'Empreendimento sintético', owner_id: ACTOR, ...(options.lead ?? {}) }],
    activities: [],
  };
  const calls = [];
  const client = {
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
      calls.push({ table });
      const filters = []; let payload; let config;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push((item) => item[key] === value); calls.push({ table, key, value }); return query; },
        upsert(value, settings) { payload = value; config = settings; return query; },
        maybeSingle() { return execute(true); },
        then(resolve, reject) { return execute(false).then(resolve, reject); },
      };
      async function execute(single) {
        if (options.failTable === table) return { data: null, error: { message: 'Synthetic failure' } };
        if (payload) {
          assert.equal(table, 'activities', 'Only the explicit event may be written.');
          assert.deepEqual(config, { onConflict: 'id', ignoreDuplicates: true });
          const existing = tables.activities.find((row) => row.id === payload.id);
          if (existing) return { data: [], error: null };
          tables.activities.push(structuredClone(payload));
          return { data: [{ id: payload.id }], error: null };
        }
        const selected = tables[table].filter((item) => filters.every((check) => check(item)));
        return { data: single ? structuredClone(selected[0] ?? null) : structuredClone(selected), error: null };
      }
      return query;
    },
  };
  const post = new Function('getCurrentContext', 'createClient', 'recordNaraFunnelEvent', `${executable}\nreturn POST;`)(
    async () => options.unauthenticated ? null : { userId: ACTOR, role: options.role ?? 'comercial', organization: { id: ORG } },
    async () => { calls.push({ sessionClient: true }); return client; },
    recordNaraFunnelEvent,
  );
  async function request(overrides = {}, requestOptions = {}) {
    const body = { proposal_id: PROPOSAL, expected_version: 1, outcome: 'proposta_enviada',
      occurred_at: happenedAt, confirmed: true, ...overrides };
    return post(new Request('https://synthetic.invalid/api/nara/funnel/outcomes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(requestOptions.headers ?? {}) },
      body: requestOptions.rawBody ?? JSON.stringify(body),
    }));
  }
  return { request, tables, calls };
}

let passed = 0;
async function check(name, run) { await run(); passed += 1; console.log(`✓ ${name}`); }

for (const [label, options, status] of [
  ['sem sessão', { unauthenticated: true }, 401], ['visualizador', { role: 'viewer' }, 403],
]) await check(`Bloqueia ${label} sem consultar/escrever dados`, async () => {
  const test = fixture(options); const response = await test.request();
  assert.equal(response.status, status); assert.equal(test.calls.length, 0);
});

for (const [label, overrides] of [
  ['ID inválido', { proposal_id: 'not-a-uuid' }],
  ['tipo de resultado não autorizado', { outcome: 'nao_compareceu' }],
  ['ausência de declaração', { confirmed: false }],
  ['declaração não booleana', { confirmed: 'true' }],
  ['versão ausente', { expected_version: undefined }],
  ['versão textual', { expected_version: '1' }],
  ['data inválida', { occurred_at: 'not-a-date' }],
  ['ação futura', { occurred_at: new Date(Date.now() + 3600000).toISOString() }],
]) await check(`Valida ${label} antes de acessar o banco`, async () => {
  const test = fixture(); const response = await test.request(overrides);
  assert.equal(response.status, 400); assert.equal(test.calls.length, 0);
});

await check('Recusa JSON inválido e listas sem acessar banco', async () => {
  const test = fixture();
  assert.equal((await test.request({}, { rawBody: '{invalid' })).status, 400);
  assert.equal((await test.request({}, { rawBody: '[]' })).status, 400);
  assert.equal(test.calls.length, 0);
});

await check('Recusa origem cruzada autenticada sem escrita', async () => {
  const test = fixture();
  assert.equal((await test.request({}, { headers: { origin: 'https://foreign.invalid' } })).status, 403);
  assert.equal(test.calls.length, 0);
});

for (const [label, options, status] of [
  ['proposta inexistente', { noProposal: true }, 404],
  ['proposta de outra empresa', { proposal: { organization_id: OTHER } }, 404],
  ['contato de outra empresa', { lead: { organization_id: OTHER } }, 404],
  ['contato inexistente', { noLead: true }, 404],
  ['proposta sem contato', { proposal: { lead_id: null } }, 400],
  ['versão alterada', { proposal: { version: 2 } }, 409],
  ['falha na leitura da proposta', { failTable: 'proposals' }, 503],
  ['falha na leitura do contato', { failTable: 'leads' }, 503],
]) await check(`Não registra em ${label}`, async () => {
  const test = fixture(options); const response = await test.request();
  assert.equal(response.status, status); assert.equal(test.tables.activities.length, 0);
});

await check('Não aceita ocorrência anterior à criação da proposta', async () => {
  const test = fixture();
  const response = await test.request({ occurred_at: new Date(Date.parse(createdAt) - 1000).toISOString() });
  assert.equal(response.status, 400); assert.equal(test.tables.activities.length, 0);
});

await check('Registro humano grava só evento auditável e mantém proposta/contato inalterados', async () => {
  const test = fixture(); const beforeProposal = structuredClone(test.tables.proposals[0]); const beforeLead = structuredClone(test.tables.leads[0]);
  const response = await test.request({ actorId: OTHER, organizationId: OTHER, lead_id: OTHER });
  assert.equal(response.status, 201); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const result = await response.json();
  assert.equal(result.no_message_sent, true); assert.equal(result.workflow_unchanged, true);
  assert.equal(test.tables.activities.length, 1);
  const activity = test.tables.activities[0];
  assert.equal(activity.user_id, ACTOR); assert.equal(activity.organization_id, ORG); assert.equal(activity.lead_id, LEAD);
  assert.equal(activity.metadata.evidence.proposal_id, PROPOSAL);
  assert.equal(activity.metadata.dimensions.proposal_version, 1);
  assert.equal(activity.metadata.occurred_at, happenedAt);
  assert.deepEqual(test.tables.proposals[0], beforeProposal); assert.deepEqual(test.tables.leads[0], beforeLead);
  assert.ok(test.calls.some((call) => call.table === 'proposals' && call.key === 'organization_id' && call.value === ORG));
  assert.ok(test.calls.some((call) => call.table === 'leads' && call.key === 'organization_id' && call.value === ORG));
});

await check('Repetir o registro da mesma versão não duplica nem muda data/autor originais', async () => {
  const test = fixture();
  assert.equal((await test.request()).status, 201);
  const original = structuredClone(test.tables.activities[0]);
  const response = await test.request({ occurred_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal(response.status, 200); assert.equal((await response.json()).already_recorded, true);
  assert.equal(test.tables.activities.length, 1); assert.deepEqual(test.tables.activities[0], original);
});

await check('Apresentação é independente: não cria envio ou comparecimento automaticamente', async () => {
  const test = fixture();
  assert.equal((await test.request({ outcome: 'proposta_apresentada' })).status, 201);
  const summary = summarizeNaraFunnelEvents(test.tables.activities, { organizationId: ORG });
  assert.equal(summary.counts.proposta_apresentada.events, 1);
  assert.equal(summary.counts.proposta_enviada.events, 0);
  assert.equal(summary.counts.compromisso_realizado.events, 0);
});

await check('Nova versão declarada e enviada tem identidade própria de evento', async () => {
  const test = fixture(); await test.request();
  test.tables.proposals[0].version = 2;
  assert.equal((await test.request({ expected_version: 2 })).status, 201);
  assert.equal(test.tables.activities.length, 2);
  assert.notEqual(test.tables.activities[0].id, test.tables.activities[1].id);
});

await check('Falha de gravação não devolve sucesso nem envia coisa alguma', async () => {
  const test = fixture({ failTable: 'activities' });
  const response = await test.request();
  assert.equal(response.status, 503); assert.equal(test.tables.activities.length, 0);
});

// Render the actual ProposalList component; no mock HTML copied from implementation.
const require = createRequire(import.meta.url);
function evaluateTsx(source, filename, imports = {}) {
  const compiled = ts.transpileModule(source, { fileName: filename,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const evaluatedModule = { exports: {} };
  new Function('require', 'exports', 'module', compiled)((name) => Object.hasOwn(imports, name) ? imports[name] : require(name), evaluatedModule.exports, evaluatedModule);
  return evaluatedModule.exports;
}
const model = evaluateTsx(await readFile(new URL('../src/components/proposals/model.tsx', import.meta.url), 'utf8'), 'model.tsx');
const { ProposalList } = evaluateTsx(await readFile(new URL('../src/components/proposals/ProposalList.tsx', import.meta.url), 'utf8'), 'ProposalList.tsx', { './model': model });
function listProps(canEdit, rows = [proposal], onRecordOutcome = () => {}) {
  return { proposals: rows, filteredProposals: rows, developments: [], canEdit,
    search: '', setSearch() {}, statusFilter: '', setStatusFilter() {}, developmentFilter: '', setDevelopmentFilter() {},
    sentCount: 0, activeValue: 0, approvedValue: 0, onNew() {}, onExport() {}, onEdit() {}, onChangeStatus() {}, onRecordOutcome };
}
function walk(element, predicate, results = []) {
  if (!element || typeof element !== 'object') return results;
  if (predicate(element)) results.push(element);
  for (const child of React.Children.toArray(element.props?.children)) walk(child, predicate, results);
  return results;
}

await check('UI renderiza avisos e ações explícitas só para editor', () => {
  const html = renderToStaticMarkup(React.createElement(ProposalList, listProps(true)));
  assert.match(html, /Registrar envio/); assert.match(html, /Registrar apresentação/);
  assert.match(html, /não enviam mensagens nem alteram o status comercial/);
  const readOnly = renderToStaticMarkup(React.createElement(ProposalList, listProps(false)));
  assert.doesNotMatch(readOnly, /Registrar envio/); assert.doesNotMatch(readOnly, /Registrar apresentação/);
});

await check('Botões reais chamam o registro correto com a proposta certa', () => {
  const calls = [];
  const element = ProposalList(listProps(true, [proposal], (target, outcome) => calls.push({ target, outcome })));
  const buttons = walk(element, (item) => item.type === 'button' && String(item.props['aria-label'] || '').startsWith('Registrar '));
  assert.equal(buttons.length, 2);
  buttons.forEach((button) => button.props.onClick());
  assert.deepEqual(calls.map((call) => call.outcome), ['proposta_enviada', 'proposta_apresentada']);
  assert.ok(calls.every((call) => call.target.id === PROPOSAL));
});

await check('UI impede registro sem contato vinculado', () => {
  const element = ProposalList(listProps(true, [{ ...proposal, lead_id: null }]));
  const buttons = walk(element, (item) => item.type === 'button' && String(item.props['aria-label'] || '').startsWith('Registrar '));
  assert.ok(buttons.every((button) => button.props.disabled === true));
});

const managerSource = await readFile(new URL('../src/components/ProposalsManager.tsx', import.meta.url), 'utf8');
await check('Formulário exige declaração, data efetiva e modal nativo sem mudar o fluxo comercial', () => {
  assert.match(managerSource, /<dialog ref=\{outcomeDialog\}/);
  assert.match(managerSource, /type="datetime-local"/);
  assert.match(managerSource, /type="checkbox" required/);
  assert.match(managerSource, /if \(!response\.ok\)/);
  assert.match(managerSource, /payload\.recorded !== true && payload\.already_recorded !== true/);
  const method = managerSource.slice(managerSource.indexOf('async function saveOutcome'), managerSource.indexOf('const selectedLead'));
  assert.doesNotMatch(method, /whatsapp\/send|supabase\.from\('proposals'\)|changeStatus\(/);
});

console.log(`\nResultados humanos de propostas: ${passed}/${passed} verificações sintéticas aprovadas. Sem envio, mudança de status ou dado real.`);
