import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildNaraDynamicSourceText,
  formatNaraLocalDateTime,
  loadNaraDynamicTurnContext,
  loadNaraRuntimeVariables,
} from '../src/lib/nara-dynamic-context.ts';
import {
  emptyNaraRuntimeVariables,
  missingNaraRuntimeVariables,
  normalizeNaraRuntimeVariables,
  NARA_RUNTIME_VARIABLE_FIELDS,
} from '../src/lib/nara-runtime-variables.ts';

class Query {
  constructor(rows) {
    this.rows = rows;
    this.filters = [];
    this.ordering = null;
    this.maxRows = null;
  }
  select() { return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  order(column, options = {}) { this.ordering = { column, ascending: options.ascending !== false }; return this; }
  limit(value) { this.maxRows = value; return this; }
  execute() {
    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      data = [...data].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
    }
    if (this.maxRows !== null) data = data.slice(0, this.maxRows);
    return Promise.resolve({ data, error: null });
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  maybeSingle() { return this.execute().then(({ data, error }) => ({ data: data[0] ?? null, error })); }
}

class FakeSupabase {
  constructor(tables) { this.tables = tables; }
  from(name) { return new Query(this.tables[name] ?? []); }
}

const complete = Object.fromEntries(NARA_RUNTIME_VARIABLE_FIELDS.map((field) => [field.key, `${field.label} preenchido`]));
const normalized = normalizeNaraRuntimeVariables({ ...complete, unknown: 'ignorado' });
assert.equal(missingNaraRuntimeVariables(normalized).length, 0);
assert.equal(Object.keys(normalized).length, NARA_RUNTIME_VARIABLE_FIELDS.length);
assert.equal(emptyNaraRuntimeVariables().consultant_on_duty_name, '');

const partial = normalizeNaraRuntimeVariables({ consultant_on_duty_name: 'Ana', finance_phone: '47999999999' });
assert.ok(missingNaraRuntimeVariables(partial).includes('partners_on_call_phone'));
assert.equal(formatNaraLocalDateTime('2026-08-04T23:00:00.000Z').includes('20:00'), true);

const variablesRow = {
  organization_id: 'org',
  values: normalized,
  updated_at: '2026-08-04T20:00:00Z',
};
const offerRows = [
  {
    id: 'sent-1', organization_id: 'org', lead_id: 'lead', delivery_status: 'sent',
    created_at: '2026-08-04T20:10:00Z', scope: 'unit', development_name: 'Flow Aptos', unit_code: '901',
    offered_value: 900000, entry_amount: 180000, installment_amount: 4500,
    range_min: null, range_max: null, range_entry_min: null, quoted_amounts: [],
    reply_text: 'A unidade 901 está por R$ 900 mil, com entrada de R$ 180 mil.', whatsapp_message_id: 'wamid-1',
  },
  {
    id: 'failed-1', organization_id: 'org', lead_id: 'lead', delivery_status: 'failed',
    created_at: '2026-08-04T20:20:00Z', scope: 'unit', development_name: 'Flow Aptos', unit_code: '1001',
    offered_value: 950000, entry_amount: 190000, installment_amount: null,
    range_min: null, range_max: null, range_entry_min: null, quoted_amounts: [],
    reply_text: 'Esta mensagem não chegou ao lead.', whatsapp_message_id: null,
  },
];
const client = new FakeSupabase({ nara_runtime_variables: [variablesRow], nara_offer_logs: offerRows });
const state = await loadNaraRuntimeVariables(client, 'org');
assert.equal(state.schema_ready, true);
assert.equal(state.values.consultant_on_duty_name, complete.consultant_on_duty_name);

const dynamic = await loadNaraDynamicTurnContext(client, 'org', 'lead', new Date('2026-08-04T23:00:00.000Z'));
assert.equal(dynamic.prior_offers.length, 1);
assert.equal(dynamic.prior_offers[0].unit_code, '901');
assert.match(dynamic.source_text, /Data e hora atuais:/);
assert.match(dynamic.source_text, /Consultor de plantão agora preenchido/);
assert.match(dynamic.source_text, /unidade 901/);
assert.match(dynamic.source_text, /R\$\s*900\.000,00/);
assert.match(dynamic.source_text, /Texto efetivamente enviado/);
assert.doesNotMatch(dynamic.source_text, /1001/);
assert.match(dynamic.source_text, /não os apresente novamente como condição vigente/i);
assert.match(dynamic.source_text, /\[PREENCHER\]/);

const emptyState = {
  values: emptyNaraRuntimeVariables(),
  missing: NARA_RUNTIME_VARIABLE_FIELDS.map((field) => field.key),
  schema_ready: false,
  updated_at: null,
};
const emptySource = buildNaraDynamicSourceText({
  now: new Date('2026-08-04T23:00:00.000Z'),
  variables: emptyState,
  priorOffers: [],
  offerLogReady: false,
});
assert.match(emptySource, /nunca invente/i);
assert.match(emptySource, /histórico de ofertas não pôde ser consultado/i);

const aiSource = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const webhookSource = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../src/app/(crm)/treinamento/[agente]/page.tsx', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../supabase/migrations/018_nara_dynamic_context.sql', import.meta.url), 'utf8');

assert.match(aiSource, /context\.dynamic\?\.source_text/);
assert.match(aiSource, /outsideBuyerReply\(history, context\)/);
assert.match(webhookSource, /loadNaraDynamicTurnContext/);
assert.match(webhookSource, /const \[commercial, dynamic\] = await Promise\.all/);
assert.match(apiSource, /body\.action === 'variables'/);
assert.match(apiSource, /aiContext\.dynamic = dynamic/);
assert.match(pageSource, /Variáveis operacionais/);
assert.match(pageSource, /Pendente/);
assert.match(pageSource, /018_nara_dynamic_context\.sql/);
assert.match(migrationSource, /create table if not exists public\.nara_runtime_variables/);
assert.match(migrationSource, /private\.is_org_admin/);

console.log('Fase 7 validada: data e hora, histórico de ofertas, consultor e variáveis operacionais no contexto da Nara.');
