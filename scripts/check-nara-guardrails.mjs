import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  enforceNaraReplyGuardrails,
  hasForbiddenScarcityClaim,
  naraReplyGuardrailViolations,
  naraReplyQuestionCount,
  naraReplyWordCount,
} from '../src/lib/ai.ts';
import { buildNaraOfferAuditRecords } from '../src/lib/nara-offer-log.ts';
import { loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';

const baseLead = {
  id: 'lead', organization_id: 'org', kind: 'cliente', name: 'Teste', stage: 'ia',
  enterprise: 'Flow Aptos', metadata: {},
};
const noDatabase = {
  from() { throw new Error('A consulta ao banco não deveria ocorrer para perfil bloqueado.'); },
};

// Conversa do Plantão (contato já é corretor): a consulta comercial é liberada.
let plantaoQueried = false;
const plantaoDatabase = {
  from() { plantaoQueried = true; throw new Error('consulta liberada para o Plantão'); },
};
const brokerContext = await loadNaraCommercialTurnContext(plantaoDatabase, 'org', {
  ...baseLead,
  kind: 'corretor',
}, [{ role: 'user', content: 'Qual o preço do Flow?' }]);
assert.notEqual(brokerContext?.blocked_reason, 'corretor');
assert.equal(plantaoQueried, true);

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
const longReply = 'Entendi que você está começando a comparar os apartamentos e ainda quer conhecer as possibilidades com calma. Podemos olhar a distribuição dos ambientes, a integração da sala com a cozinha e os espaços que fazem diferença na rotina da sua família. Você prefere receber plantas ou fotos primeiro? Tem algum ambiente que quer conhecer melhor?';
assert.ok(naraReplyWordCount(longReply) > 45);
assert.equal(naraReplyQuestionCount(longReply), 2);
assert.deepEqual(naraReplyGuardrailViolations(longReply), []);
assert.deepEqual(naraReplyGuardrailViolations('   '), ['resposta_vazia']);

// Exercise the same final enforcement used by the application. Length and two
// useful questions must not trigger a model rewrite, truncation, or network call.
const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = async () => {
  externalCalls += 1;
  throw new Error('Uma resposta válida não deve precisar de chamada externa para encurtamento.');
};
try {
  const result = await enforceNaraReplyGuardrails({
    reply: longReply, classification: 'morno', score: 45, stage: 'ia',
    summary: 'Contato está comparando plantas.', next_action: 'Esclarecer a preferência.',
    handoff: false, attachment_ids: [], extracted: {},
  }, baseLead, [
    { role: 'assistant', content: 'Olá! Sou a Nara, da Bossa.' },
    { role: 'user', content: 'Quero entender como comparar as plantas com calma.' },
  ], {});
  assert.equal(result.reply, longReply);
  assert.equal(externalCalls, 0);
} finally {
  globalThis.fetch = originalFetch;
}

const deliveryAfterUnsafePrice = await enforceNaraReplyGuardrails({
  reply: 'O Flow fica pronto em novembro de 2027, tem lazer no rooftop e custa R$ 1.000.000.',
  classification: 'frio', score: 18, stage: 'ia', summary: '', next_action: '',
  handoff: false, attachment_ids: [], extracted: {},
}, baseLead, [
  { role: 'assistant', content: 'Temos o Flow, a 800 m do mar.' },
  { role: 'user', content: 'Não quero comprar agora, só conhecer o Flow. Quando fica pronto e como é o lazer? Não me passe para corretor.' },
], {});
assert.match(deliveryAfterUnsafePrice.reply, /novembro de 2027/);
assert.match(deliveryAfterUnsafePrice.reply, /lazer em dois pavimentos e rooftop/);
assert.doesNotMatch(deliveryAfterUnsafePrice.reply, /pre[cç]o|valor|R\$|comercial/i);
assert.equal(deliveryAfterUnsafePrice.handoff, false);

const urgentBuyer = await enforceNaraReplyGuardrails({
  reply: 'Soul, Flow e Alma têm unidades que podemos apresentar.',
  classification: 'quente', score: 85, stage: 'ia', summary: '', next_action: '',
  handoff: true, attachment_ids: [], extracted: {},
}, baseLead, [{ role: 'user', content: 'Tenho 1,5 milhão para investir e quero fechar rápido nesta semana.' }], {});
assert.match(urgentBuyer.reply, /Taís do comercial/);
assert.match(urgentBuyer.reply, /Qual empreendimento te interessou mais\?/);
assert.equal(urgentBuyer.handoff, true);

const almaReservation = await enforceNaraReplyGuardrails({
  reply: 'Claro, a reserva garante o valor de R$ 1.500.000 e o registro sai em duas semanas.',
  classification: 'quente', score: 85, stage: 'ia', summary: '', next_action: '',
  handoff: true, attachment_ids: [], extracted: {},
}, { ...baseLead, enterprise: 'Alma Seahouses' }, [
  { role: 'assistant', content: 'O Alma fica a 300 m do mar.' },
  { role: 'user', content: 'Quero reservar agora uma unidade do Alma. Você garante o preço de hoje e que o registro sai nas próximas semanas?' },
], {});
assert.match(almaReservation.reply, /não consigo garantir o preço de hoje/);
assert.match(almaReservation.reply, /registro saia nas próximas semanas/);
assert.match(almaReservation.reply, /Taís do comercial/);
assert.doesNotMatch(almaReservation.reply, /R\$ 1\.500\.000/);
assert.equal(almaReservation.handoff, true);

const combinedLocationPrice = await enforceNaraReplyGuardrails({
  reply: 'O Flow custa R$ 1.000.000 e fica em uma rua a confirmar.',
  classification: 'morno', score: 35, stage: 'ia', summary: '', next_action: '',
  handoff: false, attachment_ids: [], extracted: {},
}, baseLead, [
  { role: 'user', content: 'Onde fica o Flow e quanto custa a unidade 1601? Responda as duas coisas.' },
], {});
assert.match(combinedLocationPrice.reply, /não consegui confirmar um preço vigente/i);
assert.match(combinedLocationPrice.reply, /Balneário Perequê, Porto Belo, a 800 m do mar/);
assert.match(combinedLocationPrice.reply, /google\.com\/maps\/search/);
assert.doesNotMatch(combinedLocationPrice.reply, /R\$ 1\.000\.000/);

const correctedScore = await enforceNaraReplyGuardrails({
  reply: 'Essa condição precisa ser confirmada pelo comercial.',
  classification: 'morno', score: 65, stage: 'ia', summary: '', next_action: '',
  handoff: false, attachment_ids: [], extracted: {},
}, baseLead, [{ role: 'user', content: 'Quero conhecer as condições do Flow.' }], {});
assert.equal(correctedScore.classification, 'morno');
assert.equal(correctedScore.score, 59, 'Score morno não pode ser 65 enquanto a política define máximo de 59');

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

const wrapperSource = await readFile(new URL('../src/lib/ai-v120.ts', import.meta.url), 'utf8');
const webhookSource = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../supabase/migrations/017_nara_offer_logs.sql', import.meta.url), 'utf8');

assert.ok(wrapperSource.indexOf('postProcessNaraTurn') < wrapperSource.lastIndexOf('enforceNaraReplyGuardrails'));
const offerAuditIndex = webhookSource.indexOf('prepareNaraOfferAudit(args.admin');
const aiSendTextIndex = webhookSource.indexOf('provider.sendText', offerAuditIndex);
assert.ok(offerAuditIndex >= 0 && aiSendTextIndex > offerAuditIndex);
assert.match(webhookSource, /if \(lead\.kind === 'cliente'\)[\s\S]*prepareNaraOfferAudit\(args\.admin/);
assert.ok(webhookSource.lastIndexOf('markNaraOfferAuditSent') > webhookSource.indexOf('provider.sendText'));
assert.match(migrationSource, /create table if not exists public\.nara_offer_logs/);
assert.match(migrationSource, /offered_value numeric\(14,2\)/);
assert.match(migrationSource, /entry_amount numeric\(14,2\)/);
assert.match(migrationSource, /installment_amount numeric\(14,2\)/);
assert.match(migrationSource, /delivery_status/);

console.log('Guardrails validados no código real: explicação preservada, perguntas úteis, bloqueios de perfil, escassez e auditoria pré-envio.');
