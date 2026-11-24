import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as bi from '../src/lib/site-bi.ts';
import * as analytics from '../src/lib/site-analytics.ts';
import {
  calcularBi, configuracaoBi, limitesBi, periodoBi, validarConfigBi, linhaCsvBi,
} from '../src/lib/site-bi.ts';

const oficial = 'www.bossaempreendimentos.com.br';
const preview = 'bossa-preview.vercel.app';
const inicio = '2026-11-23T10:00:00Z';
const sessao = (id, visitor_code, city, referrer, campos = {}) => ({
  id, visitor_code, hostname: oficial, started_at: inicio, visit_number: 1,
  referrer, utm: null, entry_page: '/', city, region: 'SC', country: 'BR', visitante: { device: 'celular' }, ...campos,
});
const evento = (s, name, props = {}, page = '/', created_at = inicio) => ({
  visitor_code: s.visitor_code, session_id: s.id, hostname: s.hostname, name, props, page, created_at,
});
const a = sessao('s1', 'A', 'Itapema', 'https://google.com/');
const b = sessao('s2', 'A', 'Porto Belo', 'https://instagram.com/', { visit_number: 2 });
const c = sessao('s3', 'B', 'Itapema', 'https://google.com/');
const d = sessao('s4', 'C', 'Curitiba', null, { region: 'PR', visitante: { device: 'computador' } });
const teste = sessao('st', 'T', 'Itapema', 'https://facebook.com/', { hostname: preview });
const antigo = sessao('s5', 'D', 'Itapema', 'https://google.com/', { started_at: '2026-11-22T01:00:00Z' });
const semAtividade = sessao('s6', 'X', 'Itapema', null, { started_at: '2026-11-22T01:00:00Z' });
const historico = sessao('sh', 'H', 'Itapema', null, { hostname: null });
const sessoes = [a, b, c, d, teste, antigo, semAtividade, historico];
const flow = { empreendimento: 'flow-aptos', ambiente: 'Passeio virtual 3D · na página' };
const alma = { empreendimento: 'alma-seahouses', ambiente: 'Passeio virtual 3D · celular' };
const eventos = [
  evento(a, 'page_view', {}, '/empreendimentos/flow-aptos'),
  evento(a, 'gallery_interact', flow),
  evento(a, 'gallery_interact', flow),
  evento(a, 'click_whatsapp'),
  evento(b, 'page_view', {}, '/empreendimentos/alma-seahouses'),
  evento(b, 'gallery_interact', alma),
  evento(b, 'lead_submit'),
  evento(c, 'gallery_interact', { empreendimento: 'flow-aptos', ambiente: 'Fachada' }),
  evento(c, 'gallery_interact', flow),
  evento(d, 'page_view'),
  evento(antigo, 'page_view'),
  evento(teste, 'gallery_interact', flow),
  evento(historico, 'page_view'),
  evento(d, 'page_view', {}, '/', '2026-11-25T03:00:00Z'),
];
const inicial = {
  ...configuracaoBi(2, 'oficial', new Date('2026-11-24T12:00:00Z')),
  linhas: ['origem'], coluna: 'cidade',
  metricas: ['visitantes', 'visitas', 'paginas', 'eventos', 'passeios', 'aberturas', 'contatos', 'vinculados', 'conversao'],
};
const leadsPorVisitante = new Map([['A', [{ id: 'LA', qualificado: true, reuniao: true, proposta: false, venda: false }]]]);
const calcular = (mudancas = {}, ev = eventos) => calcularBi(validarConfigBi({ ...inicial, ...mudancas }), sessoes, ev, leadsPorVisitante);

assert.deepEqual(limitesBi(inicial), { inicio: '2026-11-23T03:00:00.000Z', fim: '2026-11-25T03:00:00.000Z' });
assert.deepEqual(periodoBi(2, new Date('2026-11-24T01:00:00Z')), { de: '2026-11-22', ate: '2026-11-23' });
const r = calcular();
assert.deepEqual(r.total, [4, 5, 4, 11, 2, 4, 1, 1, 25]);
assert.deepEqual(r.linhas.find((l) => l.rotulos[0] === 'Google').total, [3, 3, 2, 7, 2, 3, 1, 1, 1 / 3 * 100]);
assert.equal(r.colunas.find((coluna) => coluna.id === 'Itapema · Santa Catarina').total[0], 3);
assert.equal(r.colunas.find((coluna) => coluna.id === 'Porto Belo · Santa Catarina').total[0], 1);
assert.equal(r.colunas.reduce((n, col) => n + col.total[0], 0), 5);
assert.equal(r.total[0], 4); // A aparece em duas origens e cidades, mas só uma vez no total.
assert.deepEqual(calcular({ metricas: ['leads', 'qualificados', 'reunioes', 'propostas', 'vendas'] }).total, [1, 1, 1, 0, 0]);
assert.ok(!r.opcoes.origem.includes('Facebook'));
assert.ok(r.opcoes.acao.includes('Abriu passeio 3D'));
assert.ok(r.opcoes.acao.includes('Galeria / vista por andar'));
assert.ok(r.opcoes.empreendimento.includes('Flow Aptos'));
assert.ok(r.opcoes.empreendimento.includes('Alma Seahouses'));
assert.ok(!JSON.stringify(r).includes('visitor_code'));
assert.ok(!JSON.stringify(r).includes('session_id'));

const filtro = calcular({ filtros: { origem: ['Google', 'Instagram'], cidade: ['Itapema · Santa Catarina'] }, coluna: null });
assert.equal(filtro.total[0], 3); // OU dentro de origem, E com cidade.
assert.equal(filtro.linhas.length, 1);
const tours = calcular({ linhas: ['empreendimento'], coluna: 'origem', metricas: ['visitantes', 'passeios', 'aberturas', 'eventos'],
  filtros: { acao: ['Abriu passeio 3D'] } });
assert.deepEqual(tours.total, [2, 2, 4, 4]);
assert.deepEqual(tours.linhas.find((l) => l.rotulos[0] === 'Flow Aptos').total, [2, 2, 3, 3]);
assert.deepEqual(tours.linhas.find((l) => l.rotulos[0] === 'Alma Seahouses').total, [1, 1, 1, 1]);
assert.deepEqual(tours.linhas.find((l) => l.rotulos[0] === 'Alma Seahouses').celulas.Instagram, [1, 1, 1, 1]);
assert.equal(calcular({ ambiente: 'testes' }).total[0], 1);
assert.equal(calcular({ ambiente: 'historico' }).total[0], 1);
assert.equal(calcular({ ambiente: 'todos' }).total[0], 6);
assert.deepEqual(calcular({ linhas: [], coluna: null }).linhas[0].total, r.total);
const vazio = calcular({ filtros: { origem: ['inexistente'] } });
assert.equal(vazio.linhas.length, 0);
assert.deepEqual(vazio.total, [0, 0, 0, 0, 0, 0, 0, 0, null]);
assert.ok(vazio.opcoes.origem.includes('Google')); // Continua possível alterar filtros sem limpar tudo.

const orfao = { ...evento(a, 'page_view'), session_id: null, visitor_code: 'Z' };
const comOrfao = calcular({}, [...eventos, orfao]);
assert.equal(comOrfao.total[0], 5);
assert.equal(comOrfao.total[1], 5);
assert.equal(comOrfao.cobertura.eventosSemSessao, 1);
const inconsistentes = calcular({}, [...eventos, { ...evento(teste, 'page_view'), hostname: oficial }]);
assert.equal(inconsistentes.cobertura.eventosSemSessao, 1);
assert.deepEqual(calcular({ linhas: ['dia'], coluna: 'hora', metricas: ['eventos'] }).total, [11]);
for (const mudancas of [
  { ate: '2026-02-30' }, { ate: '2026-11-22' }, { de: '2020-01-01' },
  { linhas: ['origem', 'origem'] }, { coluna: 'origem' }, { metricas: [] }, { ambiente: 'invalido' },
  { filtros: { desconhecido: ['x'] } }, { filtros: { cidade: [false] } },
]) assert.throws(() => validarConfigBi({ ...inicial, ...mudancas }));
assert.equal(linhaCsvBi(['Google', 'A;B', 'C"D', '=1+1']), `"Google";"A;B";"C""D";"'=1+1"`);

const require = createRequire(import.meta.url);
async function carregarModulo(path, imports, extra = '') {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source + extra, { fileName: path, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const m = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => Object.hasOwn(imports, name) ? imports[name] : require(name), m.exports, m);
  return m.exports;
}
const styles = Object.fromEntries(['workspace', 'table', 'builder', 'report'].map((k) => [k, k]));
const ui = await carregarModulo('src/components/SiteBiWorkspace.tsx', {
  '@/lib/site-bi': bi, '@/lib/site-analytics': analytics, './SiteBiWorkspace.module.css': styles,
}, '\nexport { RelatorioBi };');
const painel = renderToStaticMarkup(React.createElement(ui.SiteBiWorkspace, { initial: inicial }));
for (const s of ['Configurar tabela', 'Indicadores', 'Adicionar filtro', 'Dimensão das colunas', 'Linhas', 'Cidades × origens', 'Passeios 3D'])
  assert.ok(painel.includes(s), s);
const tabela = renderToStaticMarkup(React.createElement(ui.RelatorioBi, { resultado: tours, ocupado: false, podeExportar: true }));
for (const s of ['Total geral', 'Flow Aptos', 'Alma Seahouses', 'Google', 'Instagram', 'Exportar CSV', 'Mapa de calor'])
  assert.ok(tabela.includes(s), s);
assert.ok(!tabela.includes('s1'));

let context = null, adminCalls = 0;
const queries = [];
const tables = {
  organizations: [{ id: 'bossa' }],
  site_sessions: sessoes.map((s) => ({ ...s, last_event_at: inicio })),
  site_events: eventos,
  lead_site_links: [{ id: 1, organization_id: 'bossa', visitor_code: 'A', lead_id: 'LA' }, { id: 2, organization_id: 'outra', visitor_code: 'B', lead_id: 'LB' }],
  lead_funnel_milestones: [{ organization_id: 'bossa', lead_id: 'LA', qualified_at: inicio, meeting_at: inicio, proposal_at: null, won_at: null }],
};
const admin = { from(table) {
  queries.push(table);
  let rows = tables[table] ?? [];
  const query = {
    select() { return query; }, limit(n) { rows = rows.slice(0, n); return query; },
    eq(k, v) { rows = rows.filter((r) => r[k] === v); return query; },
    in(k, values) { rows = rows.filter((r) => values.includes(r[k])); return query; },
    gte(k, v) { rows = rows.filter((r) => Date.parse(r[k]) >= Date.parse(v)); return query; },
    lt(k, v) { rows = rows.filter((r) => Date.parse(r[k]) < Date.parse(v)); return query; },
    order() { return query; }, range(a, b) { rows = rows.slice(a, b + 1); return query; },
    then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
  };
  return query;
} };
const createAdminClient = () => { adminCalls++; return admin; };
const server = await carregarModulo('src/lib/site-bi-server.ts', {
  '@/lib/site-bi': bi, '@/lib/supabase/admin': { createAdminClient },
});
const route = await carregarModulo('src/app/api/site/bi/route.ts', {
  '@/lib/site-bi': bi, '@/lib/site-bi-server': server, '@/lib/supabase/admin': { createAdminClient },
  '@/lib/auth': { getCurrentContext: async () => context },
});
const pedir = (payload = inicial) => route.POST(new Request('https://crm.example.test/api/site/bi', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
}));
assert.equal((await pedir()).status, 401);
context = { role: 'viewer', organization: { id: 'bossa' } };
assert.equal((await pedir()).status, 403);
assert.equal(adminCalls, 0);
context = { role: 'comercial', organization: { id: 'bossa' } };
assert.equal((await pedir({ ...inicial, coluna: 'origem' })).status, 400);
assert.equal(adminCalls, 0);
const resposta = await pedir({ ...inicial, organizationId: 'outra' });
assert.equal(resposta.status, 200);
assert.equal(resposta.headers.get('cache-control'), 'private, no-store');
const api = await resposta.json();
assert.deepEqual(api.total, r.total);
assert.equal(api.total[7], 1);
tables.organizations.push({ id: 'outra' });
queries.length = 0;
assert.equal((await pedir()).status, 403);
assert.deepEqual(queries, ['organizations']);
console.log('BI do site: cruzamento de dimensões, filtros combinados, eventos, períodos, ambientes, totais deduplicados e exportação validados.');
