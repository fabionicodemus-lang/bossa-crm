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
  empreendimento: 'Flow Aptos',
  valor_minimo: 900000,
  valor_maximo: 1050000,
  entrada_minima: 180000,
  qtd_disponiveis: 4,
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
assert.match(context?.source_text ?? '', /R\$\s*900\.000,00/);
assert.doesNotMatch(context?.source_text ?? '', /reservado/);

const exactContext = await loadNaraCommercialTurnContext(client, 'org', lead, [
  { role: 'user', content: 'Quanto custa a 901?' },
]);
assert.equal(exactContext?.calls[0]?.name, 'consultar_apartamento');
assert.equal(exactContext?.calls[0]?.result?.unidade, '901');

const aiSource = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const webhookSource = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const simulatorSource = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
assert.match(aiSource, /context\.commercial\?\.source_text/);
assert.match(aiSource, /CONSULTAS COMERCIAIS DESTE TURNO/);
assert.match(aiSource, /nas mensagens do contato, na base de conhecimento, ou no retorno das consultas comerciais/);
assert.match(webhookSource, /loadNaraCommercialTurnContext/);
assert.match(simulatorSource, /loadNaraCommercialTurnContext/);

console.log('Consultas da Nara validadas: somente disponíveis, teto de 3 e valores fundamentados no turno.');
