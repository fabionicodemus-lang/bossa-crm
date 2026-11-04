import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buscarApartamentos,
  consultarApartamento,
  faixaEmpreendimento,
  loadNaraCommercialTurnContext,
} from '../src/lib/nara-unit-queries.ts';

class Query {
  constructor(rows) {
    this.rows = rows;
    this.filters = [];
    this.orders = [];
    this.maxRows = null;
  }
  select() { return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  gt(column, value) { this.filters.push((row) => Number(row[column]) > Number(value)); return this; }
  gte(column, value) { this.filters.push((row) => Number(row[column]) >= Number(value)); return this; }
  lte(column, value) { this.filters.push((row) => Number(row[column]) <= Number(value)); return this; }
  in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
  order(column, options = {}) { this.orders.push({ column, ascending: options.ascending !== false }); return this; }
  limit(value) { this.maxRows = value; return this; }
  execute() {
    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    for (const order of [...this.orders].reverse()) {
      data = [...data].sort((a, b) => {
        const left = a[order.column];
        const right = b[order.column];
        const result = typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left ?? '').localeCompare(String(right ?? ''));
        return order.ascending ? result : -result;
      });
    }
    if (this.maxRows !== null) data = data.slice(0, this.maxRows);
    return Promise.resolve({ data, error: null });
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  maybeSingle() {
    return this.execute().then(({ data, error }) => ({ data: data[0] ?? null, error }));
  }
}

class FakeSupabase {
  constructor(tables) { this.tables = tables; }
  from(name) { return new Query(this.tables[name] ?? []); }
}

const developments = [
  { id: 'flow', organization_id: 'org', name: 'Flow Aptos', slug: 'flow-aptos', code: 'FLOW', delivery_date: '2027-11-01', active: true },
  { id: 'alma', organization_id: 'org', name: 'Alma Seahouses', slug: 'alma-seahouses', code: 'ALMA', delivery_date: '2030-07-01', active: true },
];
const typologies = [
  { id: 'flow-2s', organization_id: 'org', development_id: 'flow', code: '02', name: '2 suítes', bedrooms: 2, suites: 2, private_area_m2: 62, active: true },
  { id: 'flow-3q', organization_id: 'org', development_id: 'flow', code: '03', name: '3 quartos', bedrooms: 3, suites: 1, private_area_m2: 73, active: true },
  { id: 'alma-3s', organization_id: 'org', development_id: 'alma', code: '01', name: '3 suítes', bedrooms: 3, suites: 3, private_area_m2: 120, active: true },
];
const basePlan = { table_reference: '2026-08', indice_correcao: 'CUB/SC' };
const units = [
  { id: 'f901', organization_id: 'org', development_id: 'flow', typology_id: 'flow-2s', unit_code: '901', floor: 9, status: 'disponivel', list_price: 900000, entry_amount: 180000, installment_count: 60, installment_amount: 4500, payment_plan: basePlan, price_updated_at: '2026-08-04T12:00:00Z' },
  { id: 'f1001', organization_id: 'org', development_id: 'flow', typology_id: 'flow-2s', unit_code: '1001', floor: 10, status: 'disponivel', list_price: 950000, entry_amount: 190000, installment_count: 60, installment_amount: 4750, payment_plan: basePlan, price_updated_at: '2026-08-04T12:00:00Z' },
  { id: 'f1101', organization_id: 'org', development_id: 'flow', typology_id: 'flow-3q', unit_code: '1101', floor: 11, status: 'disponivel', list_price: 1000000, entry_amount: 200000, installment_count: 60, installment_amount: 5000, payment_plan: basePlan, price_updated_at: '2026-08-04T12:00:00Z' },
  { id: 'f1201', organization_id: 'org', development_id: 'flow', typology_id: 'flow-3q', unit_code: '1201', floor: 12, status: 'disponivel', list_price: 1050000, entry_amount: 210000, installment_count: 60, installment_amount: 5250, payment_plan: basePlan, price_updated_at: '2026-08-04T12:00:00Z' },
  { id: 'f1301', organization_id: 'org', development_id: 'flow', typology_id: 'flow-3q', unit_code: '1301', floor: 13, status: 'reservado', list_price: 800000, entry_amount: 160000, installment_count: 60, installment_amount: 4000, payment_plan: basePlan, price_updated_at: '2026-08-04T12:00:00Z' },
  { id: 'a901', organization_id: 'org', development_id: 'alma', typology_id: 'alma-3s', unit_code: '901', floor: 9, status: 'disponivel', list_price: 1344231.08, entry_amount: 201634.66, installment_count: 80, installment_amount: 5376.92, payment_plan: { table_reference: '2026-08' }, price_updated_at: '2026-08-04T12:00:00Z' },
];
const client = new FakeSupabase({ developments, development_typologies: typologies, development_units: units });

const range = await faixaEmpreendimento(client, 'org', 'Flow');
assert.deepEqual(range, {
  empreendimento_id: 'flow',
  empreendimento: 'Flow Aptos',
  valor_minimo: 900000,
  valor_maximo: 1050000,
  entrada_minima: 180000,
  qtd_disponiveis: 4,
  validade_tabela: null,
});

const found = await buscarApartamentos(client, 'org', { empreendimento: 'Flow', tipologia: '3 quartos' });
assert.equal(found.length, 2);
assert.deepEqual(found.map((row) => row.unidade), ['1101', '1201']);
assert.ok(found.every((row) => row.valor >= 1000000));

const capped = await buscarApartamentos(client, 'org', { empreendimento: 'Flow' });
assert.equal(capped.length, 3);
assert.deepEqual(capped.map((row) => row.unidade), ['901', '1001', '1101']);

const available = await consultarApartamento(client, 'org', 'Flow', '901');
assert.equal(available?.valor, 900000);
assert.equal(available?.indice_correcao, 'CUB/SC');
assert.equal(available?.empreendimento_id, 'flow');
assert.equal(available?.unidade_id, 'f901');
assert.equal(available?.moeda, 'BRL');
assert.equal(available?.plano_pagamento?.status, 'incomplete');
const unavailable = await consultarApartamento(client, 'org', 'Flow', '1301');
assert.equal(unavailable, null);

const lead = {
  id: 'lead', organization_id: 'org', kind: 'cliente', name: 'Teste', stage: 'ia',
  enterprise: 'Flow Aptos', metadata: {},
};
const context = await loadNaraCommercialTurnContext(client, 'org', lead, [
  { role: 'user', content: 'Quanto custa o Flow?' },
]);
assert.equal(context?.calls[0]?.name, 'faixa_empreendimento');
assert.equal(context?.status, 'ok');
assert.match(context?.source_text ?? '', /R\$\s*900\.000,00/);
assert.doesNotMatch(context?.source_text ?? '', /reservado/);

const exactContext = await loadNaraCommercialTurnContext(client, 'org', lead, [
  { role: 'user', content: 'Quanto custa a 901?' },
]);
assert.equal(exactContext?.calls[0]?.name, 'consultar_apartamento');
assert.equal(exactContext?.calls[0]?.result?.unidade, '901');
assert.doesNotMatch(exactContext?.source_text ?? '', /parcela_media=/);
const filteredContext = await loadNaraCommercialTurnContext(client, 'org', lead, [
  { role: 'user', content: 'Quero 3 quartos no Flow com valor até R$ 1,02 milhão.' },
]);
assert.equal(filteredContext?.calls[0]?.name, 'buscar_apartamentos');
assert.deepEqual(filteredContext?.calls[0]?.result.map((row) => row.unidade), ['1101']);

const twoLimitsContext = await loadNaraCommercialTurnContext(client, 'org', lead, [
  { role: 'user', content: 'No Flow, entrada até 195 mil e valor até R$ 1,2 milhão.' },
]);
assert.equal(twoLimitsContext?.calls[0]?.name, 'buscar_apartamentos');
assert.deepEqual(twoLimitsContext?.calls[0]?.result.map((row) => row.unidade), ['901', '1001']);
assert.ok(twoLimitsContext?.calls[0]?.result.every((row) => row.entrada <= 195000));

// Full current plan: all amounts come from the row and arithmetic is exact in cents.
const completeRow = {
  ...units[0],
  list_price: '1000000.01', entry_amount: '200000.01',
  installment_count: 60, installment_amount: '5000.00',
  reinforcement_count: 5, reinforcement_amount: '60000.00', keys_amount: '200000.00',
  payment_plan: { ...basePlan, valid_until: '2099-12-31', juros: '0,59% a.m. após as chaves' },
};
const completeDb = new FakeSupabase({ developments, development_typologies: typologies, development_units: [completeRow] });
const complete = await consultarApartamento(completeDb, 'org', 'Flow', '901');
assert.equal(complete?.plano_pagamento?.status, 'complete');
assert.equal(complete?.plano_pagamento?.total_composto_centavos, 100000001);
assert.equal(complete?.plano_pagamento?.diferenca_centavos, 0);
assert.deepEqual(complete?.plano_pagamento?.componentes.map((component) => component.tipo), ['entrada', 'mensal', 'reforco', 'chaves']);
assert.equal(complete?.plano_pagamento?.juros, '0,59% a.m. após as chaves');
const fullContext = await loadNaraCommercialTurnContext(completeDb, 'org', lead, [{ role: 'user', content: 'Qual o pagamento da unidade 901 do Flow?' }]);
assert.match(fullContext?.source_text ?? '', /reforcos=5 x R\$\s*60\.000,00/);
assert.match(fullContext?.source_text ?? '', /chaves=R\$\s*200\.000,00/);
assert.match(fullContext?.source_text ?? '', /quantidade_parcelas=60/);

const inconsistentDb = new FakeSupabase({ developments, development_typologies: typologies, development_units: [{ ...completeRow, keys_amount: '200000.01' }] });
const inconsistent = await consultarApartamento(inconsistentDb, 'org', 'Flow', '901');
assert.equal(inconsistent?.valor, 1000000.01);
assert.equal(inconsistent?.plano_pagamento?.status, 'inconsistent');
assert.equal(inconsistent?.plano_pagamento?.diferenca_centavos, -1);
const inconsistentContext = await loadNaraCommercialTurnContext(inconsistentDb, 'org', lead, [{ role: 'user', content: 'Qual o pagamento da unidade 901 do Flow?' }]);
assert.doesNotMatch(inconsistentContext?.source_text ?? '', /parcela_media=|reforcos=|chaves=/);

// Asking for one unit does not require a buying-intent or qualification answer.
const browsing = await loadNaraCommercialTurnContext(client, 'org', lead, [{ role: 'user', content: 'Só pesquisando: quanto custa a unidade 901 do Flow?' }]);
assert.equal(browsing?.status, 'ok');
assert.equal(browsing?.calls[0]?.result?.unidade, '901');

const unknownProject = await loadNaraCommercialTurnContext(client, 'org', { ...lead, enterprise: '' }, [{ role: 'user', content: 'Quanto custa a unidade 901?' }]);
assert.equal(unknownProject?.status, 'ambiguous');
assert.equal(unknownProject?.motivo, 'missing_development');
assert.deepEqual(unknownProject?.calls, []);
const clarifiedProject = await loadNaraCommercialTurnContext(client, 'org', { ...lead, enterprise: '' }, [
  { role: 'user', content: 'Quanto custa a unidade 901?' },
  { role: 'assistant', content: 'De qual empreendimento é essa unidade?' },
  { role: 'user', content: 'Do Flow.' },
]);
assert.equal(clarifiedProject?.calls[0]?.name, 'consultar_apartamento');
assert.equal(clarifiedProject?.calls[0]?.result?.unidade_id, 'f901');
const ambiguousProject = await loadNaraCommercialTurnContext(client, 'org', lead, [
  { role: 'user', content: 'Estou comparando Flow e Alma.' },
  { role: 'assistant', content: 'Os dois são opções para você conhecer.' },
  { role: 'user', content: 'Qual o preço da unidade 901?' },
]);
assert.equal(ambiguousProject?.status, 'ambiguous');
assert.deepEqual(ambiguousProject?.calls, []);
const ambiguousUnit = await loadNaraCommercialTurnContext(client, 'org', lead, [{ role: 'user', content: 'Qual o preço da unidade 901 do Flow ou do Alma?' }]);
assert.equal(ambiguousUnit?.status, 'ambiguous');
assert.deepEqual(ambiguousUnit?.calls, []);
const multipleUnits = await loadNaraCommercialTurnContext(client, 'org', lead, [{ role: 'user', content: 'Qual o preço da unidade 901 ou 1001 do Flow?' }]);
assert.equal(multipleUnits?.status, 'ambiguous');
for (const content of [
  'Qual o preço das unidades 901, 1001 e 1101 do Flow?',
  'Quais os valores dos apartamentos 901,1001,1101 do Flow?',
  'Compare 901/1001 do Flow.',
  'Qual o preço de 901; 1001; 1101 do Flow?',
  'Preço das unidades 901 versus 1001 do Flow?',
  'Qual o preço das unidades 31,32 e 33 do Flow?',
]) {
  const listedUnits = await loadNaraCommercialTurnContext({ from() { throw new Error('Ambiguous units must be resolved before lookup'); } }, 'org', lead, [{ role: 'user', content }]);
  assert.equal(listedUnits?.status, 'ambiguous', content);
  assert.equal(listedUnits?.motivo, 'ambiguous_unit', content);
  assert.deepEqual(listedUnits?.calls, [], content);
}
assert.deepEqual(multipleUnits?.calls, []);

const changedProject = await loadNaraCommercialTurnContext(client, 'org', lead, [
  { role: 'user', content: 'Quanto custa a unidade 901 do Flow?' },
  { role: 'assistant', content: 'Você estava vendo a unidade 901 do Flow.' },
  { role: 'user', content: 'Agora quero saber o preço do Alma.' },
]);
assert.equal(changedProject?.calls[0]?.name, 'faixa_empreendimento');
assert.equal(changedProject?.calls[0]?.result?.empreendimento_id, 'alma');
const almaUnit = await loadNaraCommercialTurnContext(client, 'org', lead, [{ role: 'user', content: 'Quanto custa a unidade 901 do Alma?' }]);
assert.equal(almaUnit?.calls[0]?.result?.unidade_id, 'a901');
assert.equal(almaUnit?.calls[0]?.result?.valor, 1344231.08);

const newTable = new FakeSupabase({ developments, development_typologies: typologies, development_units: [{ ...units[0], list_price: 970000 }] });
const refreshed = await loadNaraCommercialTurnContext(newTable, 'org', lead, [
  { role: 'user', content: 'Gostei da unidade 901 do Flow.' },
  { role: 'assistant', content: 'A unidade 901 custava R$ 900 mil.' },
  { role: 'user', content: 'Repete o valor dela?' },
]);
assert.equal(refreshed?.calls[0]?.name, 'consultar_apartamento');
assert.equal(refreshed?.calls[0]?.result?.valor, 970000);
assert.doesNotMatch(refreshed?.source_text ?? '', /900\.000/);

const budget = await loadNaraCommercialTurnContext(client, 'org', lead, [
  { role: 'user', content: 'No Flow, tenho até R$ 950 mil.' },
  { role: 'assistant', content: 'Entendi seu orçamento.' },
  { role: 'user', content: 'Quero 2 suítes.' },
]);
assert.equal(budget?.calls[0]?.name, 'buscar_apartamentos');
assert.deepEqual(budget?.calls[0]?.result.map((row) => row.unidade), ['901', '1001']);
const decimalBudget = await loadNaraCommercialTurnContext(client, 'org', lead, [{ role: 'user', content: 'Quero 3 quartos no Flow até 1.02 milhão.' }]);
assert.deepEqual(decimalBudget?.calls[0]?.result.map((row) => row.unidade), ['1101']);
const smallEntry = await loadNaraCommercialTurnContext(client, 'org', lead, [{ role: 'user', content: 'Tenho 5000 de entrada para um apartamento do Flow.' }]);
assert.notEqual(smallEntry?.calls[0]?.name, 'consultar_apartamento');

const comparison = await loadNaraCommercialTurnContext(client, 'org', lead, [{ role: 'user', content: 'Compare os preços do Flow e do Alma.' }]);
assert.equal(comparison?.status, 'ok');
assert.deepEqual(comparison?.calls.map((call) => call.result?.empreendimento_id), ['flow', 'alma']);

// Price validity failure is not an inventory result or permission to repeat an old offer.
for (const payment_plan of [{ valid_until: '2000-01-01' }, { valid_until: '2099-02-30' }, { valid_until: 'a confirmar' }]) {
  const db = new FakeSupabase({ developments, development_typologies: typologies, development_units: [{ ...completeRow, payment_plan }] });
  const expired = await loadNaraCommercialTurnContext(db, 'org', lead, [{ role: 'user', content: 'Preço da unidade 901 do Flow?' }]);
  assert.equal(expired?.status, 'error');
  assert.equal(expired?.error, 'invalid_or_expired_price_table');
  assert.deepEqual(expired?.calls, []);
}
const mixedValidity = new FakeSupabase({ developments, development_typologies: typologies, development_units: [
  { ...units[0], list_price: 100, payment_plan: { valid_until: '2000-01-01' } }, units[1], units[2], units[3],
] });
const currentRange = await faixaEmpreendimento(mixedValidity, 'org', 'Flow');
assert.equal(currentRange?.valor_minimo, 950000);
assert.equal(currentRange?.qtd_disponiveis, 3);
assert.equal((await buscarApartamentos(mixedValidity, 'org', { empreendimento: 'Flow' })).length, 3);
const empty = await loadNaraCommercialTurnContext(client, 'org', lead, [{ role: 'user', content: 'Preço da unidade 1301 do Flow?' }]);
assert.equal(empty?.status, 'empty');
assert.equal(empty?.error, undefined);
assert.equal(empty?.calls[0]?.result, null);

const isolatedDb = new FakeSupabase({
  developments: [...developments, { ...developments[0], id: 'foreign-flow', organization_id: 'other-org' }],
  development_typologies: typologies,
  development_units: [...units, { ...units[0], id: 'foreign-unit', organization_id: 'other-org', list_price: 1 }],
});
assert.equal((await faixaEmpreendimento(isolatedDb, 'org', 'Flow'))?.valor_minimo, 900000);

const blocked = await loadNaraCommercialTurnContext({ from() { throw new Error('No database access for this profile'); } }, 'org', lead, [
  { role: 'user', content: 'Já comprei com vocês, preciso do boleto da minha unidade.' },
]);
assert.equal(blocked?.status, 'blocked');
assert.equal(blocked?.blocked_reason, 'cliente_atual');

const aiSource = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const webhookSource = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const simulatorSource = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
assert.match(aiSource, /context\.commercial\?\.source_text/);
assert.match(aiSource, /CONSULTAS COMERCIAIS DESTE TURNO/);
assert.match(webhookSource, /loadNaraCommercialTurnContext/);
assert.match(simulatorSource, /loadNaraCommercialTurnContext/);

console.log('Consultas da Nara validadas: identidade, isolamento, validade, nova consulta por turno e planos completos em centavos.');
