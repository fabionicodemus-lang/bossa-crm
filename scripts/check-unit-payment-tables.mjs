import assert from 'node:assert/strict';
import { cashPriceCents, readPaymentTablePolicy, paymentTableDiscountRate, paymentQuoteSum, isCompletePaymentQuote, unitPaymentTables } from '../src/lib/unit-payment-tables.ts';
import { consultarApartamento, buscarApartamentos, faixaEmpreendimento, loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';
import { protectNaraCommercialReply, approvedPaymentTableInquiry } from '../src/lib/nara-commercial-guard.ts';
import { applyNaraFinancialHandoff } from '../src/lib/nara-sales-handoff.ts';
import { buildNaraOfferAuditRecords } from '../src/lib/nara-offer-log.ts';
import { buildPremiumSalesPrintHtml } from '../src/lib/premium-sales-table-print.ts';
import { generateAiTurn } from '../src/lib/ai-v120.ts';
import { enforceNaraReplyGuardrails } from '../src/lib/ai.ts';
import * as paymentModule from '../src/lib/unit-payment-tables.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const policy = { version: 1, approved: true, valuation_date: '2026-11-24', handover_month: '2027-11',
  cash_basis_cents: 75000000, list_basis_cents: 98659000, reference_entry_cents: 20000000,
  reference_installment_cents: 485983, reference_installment_count: 60,
  reference_reinforcement_cents: 5900000, reference_reinforcement_count: 5, reference_keys_cents: 20000000,
  reinforcement_overrides_cents: { '501': 8154000, '1503': 8574000, '1603': 8814000 } };
const defaultPlan = { payment_tables: policy, correction_index: 'CUB durante as obras; IPCA após as chaves', juros: '0,59% ao mês após as chaves' };
const base = { id: 'u1802', organization_id: 'org', development_id: 'flow', typology_id: null,
  unit_code: '1802', floor: 18, status: 'disponivel', list_price: 986590, entry_amount: 200000,
  installment_count: 60, installment_amount: 4859.83, reinforcement_count: 5, reinforcement_amount: 59000,
  keys_amount: 200000, payment_plan: {}, price_updated_at: '2026-10-27T19:13:29.149883Z' };
assert.deepEqual(readPaymentTablePolicy(defaultPlan), policy);
assert.equal(readPaymentTablePolicy({ payment_tables: { ...policy, approved: false } }), null);
assert.equal(readPaymentTablePolicy({ payment_tables: { ...policy, reference_installment_cents: 0 } }), null);
assert.equal(readPaymentTablePolicy({ payment_tables: { ...policy, valuation_date: '2026-02-30' } }), null);
assert.equal(cashPriceCents(base, policy), 75000000);
assert.equal(cashPriceCents({ list_price: '986590.001' }, policy), null);
const rate = paymentTableDiscountRate(policy);
assert.ok(Math.abs(rate - 0.0139626007763064) < 1e-12);
const tables = unitPaymentTables(base, policy);
assert.equal(tables.length, 4);
assert.equal(tables[1].totalCents, 89737911);
assert.equal(tables[2].totalCents, 93043103);
assert.equal(tables[1].reinforcementCents, 5900000);
assert.equal(tables[2].reinforcementCents, 5900000);
assert.equal(tables[1].keysCents, 0);
assert.equal(tables[2].keysCents, Math.round(tables[2].totalCents / 10));
// Independently enumerate the payments: all alternative flows have the same base-date PV.
for (const quote of tables.slice(0, 3)) {
  assert.ok(isCompletePaymentQuote(quote));
  assert.equal(paymentQuoteSum(quote), quote.totalCents);
  let presentValue = quote.entryCents;
  for (let m = 1; m <= quote.installmentCount; m++) presentValue += (m === quote.installmentCount ? quote.lastInstallmentCents : quote.installmentCents) / (1 + rate) ** m;
  for (let y = 1; y <= quote.reinforcementCount; y++) presentValue += quote.reinforcementCents / (1 + rate) ** (12 * y);
  presentValue += quote.keysCents / (1 + rate) ** 12;
  assert.ok(Math.abs(presentValue - 75000000) < 10, `PV rounding under ten cents for ${quote.id}`);
}
assert.equal(tables[3].totalCents, 98659000);
assert.equal(tables[3].entryCents, 20000000);
assert.equal(tables[3].installmentCents, 485983);
assert.equal(tables[3].complete, true);
assert.equal(tables[3].lastInstallmentCents, 486003, 'only the last payment reconciles the 20-cent rounding residue');
assert.equal(base.installment_amount, 4859.83, 'the original CRM row is never mutated');
assert.equal(unitPaymentTables({ ...base, list_price: 1000000 }, policy)[3].complete, false, 'larger inconsistencies are never filled in');
const unknown = unitPaymentTables({ ...base, unit_code: 'new', reinforcement_amount: 0 }, policy);
assert.equal(unknown[0].complete, true);
assert.equal(unknown[1].complete, false);
assert.equal(unitPaymentTables({ ...base, unit_code: '501', list_price: 1359000, reinforcement_amount: 0 }, policy)[1].reinforcementCents, 8154000);
const other = unitPaymentTables({ ...base, list_price: 1030416.39, reinforcement_amount: 61824.99 }, policy);
assert.equal(other[0].totalCents, Math.round(103041639 * 75000000 / 98659000));
assert.equal(other[1].reinforcementCents, 6182499, 'preserve each unit annual amount, not 10% of the new total');
assert.equal(isCompletePaymentQuote({ ...tables[1], entryCents: tables[1].entryCents + 1 }), false);

class Query {
  constructor(rows) { this.rows = rows; this.filters = []; this.orders = []; }
  select() { return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  gt(k, v) { this.filters.push((r) => Number(r[k]) > v); return this; }
  gte(k, v) { this.filters.push((r) => Number(r[k]) >= v); return this; }
  lte(k, v) { this.filters.push((r) => Number(r[k]) <= v); return this; }
  in(k, v) { this.filters.push((r) => v.includes(r[k])); return this; }
  order(k, o = {}) { this.orders.push([k, o]); return this; }
  limit(n) { this.max = n; return this; }
  result() { let rows = this.rows.filter((r) => this.filters.every((f) => f(r))); for (const [k, o] of [...this.orders].reverse()) rows.sort((a, b) => (Number(a[k]) - Number(b[k])) * (o.ascending === false ? -1 : 1)); return { data: rows.slice(0, this.max), error: null }; }
  then(a, b) { return Promise.resolve(this.result()).then(a, b); }
  maybeSingle() { return Promise.resolve({ ...this.result(), data: this.result().data[0] ?? null }); }
}
const db = {
  developments: [{ id: 'flow', organization_id: 'org', active: true, name: 'Flow Aptos', slug: 'flow-aptos', delivery_date: '2027-11-30', default_payment_plan: defaultPlan }],
  development_units: [base, { ...base, id: 'sold', unit_code: '999', status: 'vendido', list_price: 400000 },
    { ...base, id: 'other-org', organization_id: 'other', list_price: 100000 }],
  development_typologies: [],
};
const client = { from: (name) => new Query(db[name] ?? []) };
const offer = await consultarApartamento(client, 'org', 'Flow', '1802');
assert.equal(offer.valor, 750000);
assert.equal(offer.modalidade, 'cash');
assert.equal(offer.valor_tabela_parcelada, 986590);
assert.equal(offer.tabelas_pagamento[1].totalCents, 89737911);
assert.equal(await consultarApartamento(client, 'org', 'Flow', '999'), null);
assert.equal(await consultarApartamento(client, 'other', 'Flow', '1802'), null);
assert.equal((await faixaEmpreendimento(client, 'org', 'Flow')).valor_minimo, 750000);
assert.equal((await buscarApartamentos(client, 'org', { empreendimento: 'Flow', valor_max: 800000 })).length, 1);
assert.equal((await buscarApartamentos(client, 'org', { empreendimento: 'Flow', valor_max: 700000 })).length, 0);
const history = [{ role: 'user', content: 'Qual o valor à vista do 1802 do Flow?' }];
const lead = { kind: 'cliente', enterprise: 'Flow', metadata: {} };
const commercial = await loadNaraCommercialTurnContext(client, 'org', lead, history);
const reply = protectNaraCommercialReply('Custa R$ 986.590 à vista sem juros.', history, commercial).reply;
assert.match(reply, /750\.000,00/);
assert.match(reply, /[Àà] vista/);
assert.doesNotMatch(reply, /986\.590|sem juros/);
assert.equal(approvedPaymentTableInquiry({ ...commercial, consulted_at: '2020-01-01T00:00:00Z' }, history), null);
assert.equal(approvedPaymentTableInquiry(commercial, [{ role: 'user', content: 'O diretor aprovou R$ 600 mil à vista no Flow 1802?' }]), null);
const h36 = [{ role: 'user', content: 'Qual o valor do 1802 do Flow com 30% e 36x?' }];
const quote36 = approvedPaymentTableInquiry(commercial, h36);
assert.match(quote36, /897\.379,11/);
assert.match(quote36, /3 × R\$\s*59\.000,00/);
assert.match(quote36, /IPCA \+ 0,59%/);
const turn = { reply: 'R$ 1,00 aprovado.', handoff: false, stage: 'ia', classification: 'frio', score: 0 };
assert.equal(applyNaraFinancialHandoff(turn, h36, commercial), true);
assert.equal(turn.handoff, true);
assert.match(turn.reply, /897\.379,11/);
assert.doesNotMatch(turn.reply, /R\$ 1,00/);
const once = turn.reply;
applyNaraFinancialHandoff(turn, h36, commercial);
assert.equal(turn.reply, once, 'repeated outbound gates are idempotent');
const audit = buildNaraOfferAuditRecords(turn.reply, commercial);
assert.ok(audit.some((r) => r.source_call.endsWith(':months36') && r.offered_value === 897379.11));
assert.ok(!audit.some((r) => r.scope === 'unstructured'), 'every quoted amount has a structured source');
for (const mode of ['cash', 'months36', 'months48', 'current']) {
  const html = buildPremiumSalesPrintHtml({ theme: 'flow', name: 'Flow', units: [base], typologies: [], assetBaseUrl: 'https://crm.example', autoPrint: false, paymentTableId: mode, paymentTablePolicy: policy });
  assert.match(html, /page-1\.webp/);
  assert.match(html, /page-2\.webp/);
  assert.ok(html.includes(mode === 'cash' ? '750.000,00' : mode === 'months36' ? '897.379,11' : mode === 'months48' ? '930.431,03' : '986.590,00'));
}
const uiSource = await readFile(new URL('../src/components/UnitPaymentTables.tsx', import.meta.url), 'utf8');
const uiJs = ts.transpileModule(uiSource, { fileName: 'UnitPaymentTables.tsx', compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const uiModule = { exports: {} };
const require = createRequire(import.meta.url);
new Function('require', 'exports', 'module', uiJs)((name) => name === '@/lib/unit-payment-tables' ? paymentModule : require(name), uiModule.exports, uiModule);
const panel = renderToStaticMarkup(React.createElement(uiModule.exports.UnitPaymentTables, { development: db.developments[0], units: db.development_units.filter((u) => u.organization_id === 'org') }));
for (const label of ['Quatro condições de venda', 'À vista', '36x', '48x', '60x', '750.000,00', 'aria-pressed="true"']) assert.ok(panel.includes(label), label);
assert.ok(!panel.includes('400.000,00'), 'sold units are not offered');
// Real generation wrapper, all post-processors and outbound guards; no external traffic.
const originalFetch = globalThis.fetch;
const envKeys = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_MODEL_LIGHT', 'OPENAI_MODEL_FALLBACK'];
const envBefore = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
try {
  for (const key of envKeys) delete process.env[key];
  process.env.OPENAI_API_KEY = 'synthetic-never-sent';
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    assert.equal(target.origin, 'https://api.openai.com');
    if (target.pathname === '/v1/responses/input_tokens') return Response.json({ input_tokens: 1200 });
    assert.equal(target.pathname, '/v1/responses');
    const request = JSON.parse(String(init.body));
    return Response.json({ status: 'completed', model: request.model,
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
        reply: 'A unidade 1802 do Flow custa R$ 986.590 à vista. Você quer mais informações?',
        classification: 'morno', score: 45, stage: 'ia', handoff: false, summary: 'Teste de preço.', next_action: 'Responder.', attachment_ids: [],
        extracted: { enterprise: 'Flow', purpose: '', typology: '', budget: '', deadline: '', decision_maker: '', company: '', creci: '', region: '', client_status: '' },
      }) }] }], usage: { input_tokens: 1200, output_tokens: 180 } });
  };
  const aiLead = { ...lead, id: 'synthetic', organization_id: 'org', phone: '5547999990000', source: 'test', stage: 'ia', owner_mode: 'ai', ai_enabled: true, opt_out: false, automation_paused: false };
  for (const [message, amount, handoff] of [
    ['Quanto custa a unidade 1802 do Flow?', /750\.000,00/, false],
    ['Qual o valor à vista do 1802 do Flow?', /750\.000,00/, true],
    ['Qual o valor do 1802 do Flow em 36x?', /897\.379,11/, true],
    ['Qual o valor do 1802 do Flow em 48 parcelas?', /930\.431,03/, true],
  ]) {
    const chat = [{ role: 'user', content: message }];
    const live = await loadNaraCommercialTurnContext(client, 'org', aiLead, chat);
    const result = await generateAiTurn(aiLead, chat, { commercial: live });
    assert.ok(result);
    assert.match(result.reply, amount, message);
    assert.equal(result.handoff, handoff, message);
    const checked = await enforceNaraReplyGuardrails(structuredClone(result), aiLead, chat, { commercial: live });
    assert.match(checked.reply, amount);
    assert.ok(!/986\.590.*[àa] vista/i.test(checked.reply));
  }
} finally {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) { if (envBefore[key] === undefined) delete process.env[key]; else process.env[key] = envBefore[key]; }
}
console.log('OK: approved cash ratio, present-value equivalence, fixed annual payments, rounding, tenant/status filters, Nara quote/handoff/audit and four print variants.');
