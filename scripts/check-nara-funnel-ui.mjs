// Actual React rendering, query builder, read-only fetch and authenticated page with synthetic data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function evaluate(source, filename, imports = {}) {
  const code = ts.transpileModule(source, { fileName: filename,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const evaluatedModule = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => Object.hasOwn(imports, name) ? imports[name] : require(name), evaluatedModule.exports, evaluatedModule);
  return evaluatedModule.exports;
}
const source = await readFile(new URL('../src/components/NaraFunnelPanel.tsx', import.meta.url), 'utf8');
const { buildNaraFunnelQuery, fetchNaraFunnelSummary, NaraFunnelReport, NaraFunnelPanel } = evaluate(source, 'NaraFunnelPanel.tsx');
let passed = 0;
async function check(name, run) { await run(); passed += 1; console.log(`✓ ${name}`); }
const base = { from: '2026-11-01', to: '2026-11-06', kind: 'cliente' };

await check('Datas de Brasília incluem o último dia e separam o tipo de contato', () => {
  const params = new URLSearchParams(buildNaraFunnelQuery(base));
  assert.equal(params.get('from'), '2026-11-01T03:00:00.000Z');
  assert.equal(params.get('to'), '2026-11-07T03:00:00.000Z');
  assert.equal(params.get('kind'), 'cliente');
  assert.equal(new URLSearchParams(buildNaraFunnelQuery({ ...base, kind: 'corretor' })).get('kind'), 'corretor');
});
for (const [label, value] of [
  ['início ausente', { from: '' }], ['data impossível', { from: '2026-02-30' }],
  ['mês inválido', { from: '2026-99-01' }], ['período invertido', { from: '2026-11-08' }],
  ['mais de 93 dias', { from: '2026-01-01', to: '2026-04-04' }], ['tipo inválido', { kind: 'admin' }],
]) await check(`Valida ${label} sem consultar o servidor`, () => assert.throws(() => buildNaraFunnelQuery({ ...base, ...value })));
await check('Aceita um dia e o limite exato de 93 dias', () => {
  assert.doesNotThrow(() => buildNaraFunnelQuery({ ...base, from: base.to }));
  assert.doesNotThrow(() => buildNaraFunnelQuery({ ...base, from: '2026-01-01', to: '2026-04-03' }));
});

const events = ['compromisso_solicitado', 'compromisso_confirmado', 'compromisso_realizado', 'proposta_enviada', 'proposta_apresentada', 'encaminhado', 'assumido'];
const summary = {
  counts: Object.fromEntries(events.map((event) => [event, { events: 2, unique_leads: 1, collection: 'human_record' }])),
  collection_catalog: Object.fromEntries([...events.map((event) => [event, { mode: 'human_record', note: 'Registro explícito sintético.' }]),
    ['primeira_resposta_util', { mode: 'not_instrumented', note: 'Sem coletor conectado.' }]]),
  conversion_rates: null,
  coverage: { observed_from: null, observed_until: null, records_examined: 14, accepted_events: 14,
    ignored_records: 0, duplicate_records: 0, truncated: false, max_records: 10000 },
};
await check('Consulta utiliza apenas GET, sessão normal e no-store, sem organização fornecida pelo cliente', async () => {
  const query = buildNaraFunnelQuery(base); const signal = new AbortController().signal;
  const result = await fetchNaraFunnelSummary(query, signal, async (url, options) => {
    assert.equal(url, `/api/nara/funnel?${query}`); assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store'); assert.equal(options.signal, signal);
    assert.equal(options.body, undefined); assert.doesNotMatch(url, /organization|actor|user_id/);
    return Response.json(summary);
  });
  assert.deepEqual(result, summary);
});
await check('Falha de servidor e resposta inválida não viram funil zerado', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(fetchNaraFunnelSummary('', signal, async () => Response.json({ error: 'Indisponível' }, { status: 503 })), /Indisponível/);
  await assert.rejects(fetchNaraFunnelSummary('', signal, async () => Response.json({ counts: {} })), /inválida/);
});
await check('Renderiza os sete cards, pessoas únicas e eventos sem taxas inventadas', () => {
  const html = renderToStaticMarkup(React.createElement(NaraFunnelReport, { summary, kind: 'cliente' }));
  assert.equal((html.match(/class="kpi"/g) || []).length, 7);
  assert.match(html, /contatos únicos/); assert.match(html, /2 evento/); assert.doesNotMatch(html, /%/);
  assert.match(html, /histórico anterior não foi reconstruído/); assert.match(html, /métricas legadas/);
});
await check('Null aparece Não coletado, sem confundir com zero; corretores ficam identificados', () => {
  const unavailable = structuredClone(summary); unavailable.counts.proposta_enviada = { events: null, unique_leads: null, collection: 'not_instrumented' };
  const html = renderToStaticMarkup(React.createElement(NaraFunnelReport, { summary: unavailable, kind: 'corretor' }));
  assert.match(html, /Corretores/); assert.match(html, /Não coletado/); assert.match(html, /Sem coletor disponível/);
});
await check('Limite de leitura e ausência de eventos são explícitos', () => {
  const limited = structuredClone(summary); limited.coverage.truncated = true;
  const html = renderToStaticMarkup(React.createElement(NaraFunnelReport, { summary: limited, kind: 'cliente' }));
  assert.match(html, /role="alert"/); assert.match(html, /reduza o período/); assert.match(html, /Sem evento registrado no período/);
});
await check('Painel inicial apresenta filtros e limites sem acionar rede no servidor', () => {
  const html = renderToStaticMarkup(React.createElement(NaraFunnelPanel, { initialFrom: base.from, initialTo: base.to }));
  assert.match(html, /Taxas de conversão não disponíveis/); assert.match(html, /93 dias/);
  assert.match(html, /Nenhum experimento A\/B/); assert.match(html, /role="status"/);
  assert.match(html, /<option value="cliente"/); assert.match(html, /<option value="corretor"/);
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PATCH|DELETE|PUT)['"]|createClient|supabase\.from/);
});

const pageSource = await readFile(new URL('../src/app/(crm)/nara/funil/page.tsx', import.meta.url), 'utf8');
function pageFixture(context) {
  return evaluate(pageSource, 'page.tsx', {
    'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
    '@/lib/auth': { getCurrentContext: async () => context },
    '@/components/PageTopbar': { PageTopbar: ({ title }) => React.createElement('h1', null, title) },
    '@/components/NaraFunnelPanel': { NaraFunnelPanel: ({ initialFrom, initialTo }) => React.createElement('p', null, buildNaraFunnelQuery({ from: initialFrom, to: initialTo, kind: 'cliente' })) },
  }).default;
}
await check('Página exige sessão e respeita restrição do hub para visualizador', async () => {
  await assert.rejects(pageFixture(null)(), /REDIRECT:\/login/);
  await assert.rejects(pageFixture({ role: 'viewer' })(), /REDIRECT:\/hoje/);
});
await check('Página autenticada fornece período inicial válido de 30 dias', async () => {
  const html = renderToStaticMarkup(await pageFixture({ role: 'comercial' })());
  assert.match(html, /Funil explícito da Nara/); assert.match(html, /kind=cliente/);
  assert.match(pageSource, /29 \* 86400000/);
});
await check('Hub real possui link de leitura para o funil', async () => {
  const hub = await readFile(new URL('../src/app/(crm)/nara/page.tsx', import.meta.url), 'utf8');
  const page = evaluate(hub, 'hub.tsx', {
    'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
    'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
    '@/lib/auth': { getCurrentContext: async () => ({ role: 'comercial' }) },
    '@/components/PageTopbar': { PageTopbar: () => null },
  }).default;
  assert.match(renderToStaticMarkup(await page()), /href="\/nara\/funil"/);
});

console.log(`\nTela do funil: ${passed}/${passed} verificações sintéticas aprovadas. Somente leitura; nenhuma consulta real.`);
