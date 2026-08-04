import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
function normalizeGuardrailText(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}
function naraReplyWordCount(value) {
  return value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
function hasForbiddenScarcityClaim(value) {
  const normalized = normalizeGuardrailText(value);
  return /\b(acabou de ser (?:vendid[oa]|reservad[oa]|bloquead[oa])|acabou de (?:vender|reservar|bloquear)|foi (?:vendid[oa]|reservad[oa]) (?:agora|hoje|ha pouco))\b/.test(normalized);
}
function naraReplyGuardrailViolations(value) {
  const violations = [];
  if (!value.trim()) violations.push('resposta_vazia');
  if (naraReplyWordCount(value) > 45) violations.push('mais_de_45_palavras');
  if (hasForbiddenScarcityClaim(value)) violations.push('escassez_fabricada');
  return violations;
}
import { buildNaraOfferAuditRecords } from '../src/lib/nara-offer-log.ts';
import { loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';

const baseLead = {
  id: 'lead', organization_id: 'org', kind: 'cliente', name: 'Teste', stage: 'ia',
  enterprise: 'Flow Aptos', metadata: {},
};
const noDatabase = {
  from() { throw new Error('A consulta ao banco não deveria ocorrer para perfil bloqueado.'); },
};

const brokerContext = await loadNaraCommercialTurnContext(noDatabase, 'org', {
  ...baseLead,
  kind: 'corretor',
}, [{ role: 'user', content: 'Qual o preço do Flow?' }]);
assert.equal(brokerContext?.blocked_reason, 'corretor');
assert.equal(brokerContext?.calls.length, 0);
assert.match(brokerContext?.source_text ?? '', /Plantão da Bossa/);

const brokerSelfIdentified = await loadNaraCommercialTurnContext(noDatabase, 'org', baseLead, [
  { role: 'user', content: 'Sou corretor, qual a tabela do Alma?' },
]);
assert.equal(brokerSelfIdentified?.blocked_reason, 'corretor');

const currentCustomer = await loadNaraCommercialTurnContext(noDatabase, 'org', baseLead, [
  { role: 'user', content: 'Já comprei com vocês. Qual o valor da segunda via do boleto?' },
]);
assert.equal(currentCustomer?.blocked_reason, 'cliente_atual');
assert.match(currentCustomer?.source_text ?? '', /pós-venda/);

assert.equal(naraReplyWordCount('Uma resposta curta com seis palavras.'), 6);
const longReply = Array.from({ length: 46 }, (_, index) => `palavra${index + 1}`).join(' ');
assert.deepEqual(naraReplyGuardrailViolations(longReply), ['mais_de_45_palavras']);
assert.equal(hasForbiddenScarcityClaim('A unidade acabou de ser vendida agora.'), true);
assert.ok(naraReplyGuardrailViolations('A unidade acabou de ser vendida.').includes('escassez_fabricada'));
assert.equal(hasForbiddenScarcityClaim('A unidade não está disponível; posso verificar alternativas.'), false);

const commercial = {
  consulted_at: '2026-08-04T20:00:00Z',
  source_table: 'development_units',
  source_text: 'teste',
  calls: [
    {
      name: 'faixa_empreendimento',
      arguments: { empreendimento: 'Flow' },
      result: {
        empreendimento: 'Flow Aptos',
        valor_minimo: 900000,
        valor_maximo: 1050000,
        entrada_minima: 180000,
        qtd_disponiveis: 4,
      },
    },
    {
      name: 'consultar_apartamento',
      arguments: { empreendimento: 'Flow', unidade: '901' },
      result: {
        empreendimento: 'Flow Aptos', unidade: '901', andar: 9, tipologia: '2 suítes',
        valor: 900000, entrada: 180000, parcela_media: 4500, quantidade_parcelas: 60,
        indice_correcao: 'CUB/SC', validade_tabela: null, referencia_tabela: '2026-08',
        preco_atualizado_em: '2026-08-04T12:00:00Z',
      },
    },
  ],
};
const records = buildNaraOfferAuditRecords(
  'No Flow, a faixa vai de R$ 900 mil a R$ 1,05 milhão. A unidade 901 tem entrada de R$ 180 mil e parcelas de R$ 4.500.',
  commercial,
);
assert.equal(records.length, 2);
const rangeRecord = records.find((record) => record.scope === 'range');
const unitRecord = records.find((record) => record.scope === 'unit');
assert.equal(rangeRecord?.range_min, 900000);
assert.equal(rangeRecord?.range_max, 1050000);
assert.equal(rangeRecord?.range_entry_min, 180000);
assert.equal(unitRecord?.unit_code, '901');
assert.equal(unitRecord?.entry_amount, 180000);
assert.equal(unitRecord?.installment_amount, 4500);

const genericRecords = buildNaraOfferAuditRecords('O investimento informado foi de R$ 777 mil.', null);
assert.equal(genericRecords.length, 1);
assert.equal(genericRecords[0].scope, 'unstructured');
assert.equal(genericRecords[0].quoted_amounts[0].amount, 777000);

const aiSource = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const wrapperSource = await readFile(new URL('../src/lib/ai-v120.ts', import.meta.url), 'utf8');
const webhookSource = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../supabase/migrations/017_nara_offer_logs.sql', import.meta.url), 'utf8');

assert.match(aiSource, /NARA_REPLY_REGENERATION_ATTEMPTS = 2/);
assert.match(aiSource, /Nunca diga que algo acabou de ser vendido/);
assert.doesNotMatch(aiSource, /slice\(0,\s*NARA_REPLY_WORD_LIMIT\)/);
assert.ok(wrapperSource.indexOf('postProcessNaraTurn') < wrapperSource.lastIndexOf('enforceNaraReplyGuardrails'));
assert.ok(webhookSource.indexOf('prepareNaraOfferAudit(args.admin') < webhookSource.indexOf('provider.sendText'));
assert.ok(webhookSource.lastIndexOf('markNaraOfferAuditSent') > webhookSource.indexOf('provider.sendText'));
assert.match(migrationSource, /create table if not exists public\.nara_offer_logs/);
assert.match(migrationSource, /offered_value numeric\(14,2\)/);
assert.match(migrationSource, /entry_amount numeric\(14,2\)/);
assert.match(migrationSource, /installment_amount numeric\(14,2\)/);
assert.match(migrationSource, /delivery_status/);

console.log('Guardrails da Fase 6 validados: bloqueios de perfil, regeneração, teto de palavras e auditoria pré-envio.');
