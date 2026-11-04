import assert from 'node:assert/strict';
import { enforceNaraReplyGuardrails, enforceNaraTriage } from '../src/lib/ai.ts';
import {
  asksProtectedCommercialDetail,
  isGeneralPriceRangeReply,
} from '../src/lib/nara-price-levels.ts';

assert.equal(isGeneralPriceRangeReply('No Flow, os valores começam em R$ 995 mil.'), true);
assert.equal(isGeneralPriceRangeReply('Hoje a faixa geral fica entre R$ 995 mil e R$ 1,3 milhão.'), true);
assert.equal(isGeneralPriceRangeReply('Há opções de R$ 995 mil a R$ 1,3 milhão.'), true);
assert.equal(isGeneralPriceRangeReply('A unidade 901 custa R$ 995 mil.'), false);
assert.equal(isGeneralPriceRangeReply('A 901 parte de R$ 995 mil.'), false);
assert.equal(isGeneralPriceRangeReply('A entrada é de R$ 100 mil e o saldo em 80 parcelas.'), false);
assert.equal(isGeneralPriceRangeReply('Temos disponibilidade a partir de R$ 995 mil.'), false);
assert.equal(isGeneralPriceRangeReply('O valor é R$ 995 mil.'), false);

assert.equal(asksProtectedCommercialDetail('Quanto custa o Flow?'), false);
assert.equal(asksProtectedCommercialDetail('Qual é o menor apartamento?'), false);
assert.equal(asksProtectedCommercialDetail('Qual o valor da unidade 901?'), true);
assert.equal(asksProtectedCommercialDetail('Quanto custa a 901?'), true);
assert.equal(asksProtectedCommercialDetail('Qual é a entrada mínima?'), true);
assert.equal(asksProtectedCommercialDetail('Me manda a tabela.'), true);
assert.equal(asksProtectedCommercialDetail('Tem disponível no 20º andar?'), true);

const lead = {
  id: 'lead', organization_id: 'org', kind: 'cliente', name: 'Teste',
  stage: 'ia', enterprise: 'Flow Aptos', metadata: {},
};
const turn = (reply) => ({
  reply, classification: 'morno', score: 45, stage: 'ia', summary: '',
  next_action: '', handoff: false, attachment_ids: [], extracted: {},
});
const commercial = {
  consulted_at: new Date().toISOString(), source_table: 'development_units',
  calls: [{
    name: 'faixa_empreendimento', arguments: { empreendimento: 'Flow' },
    result: { empreendimento: 'Flow Aptos', valor_minimo: 995000, valor_maximo: 1300000, entrada_minima: 199000, qtd_disponiveis: 4 },
  }],
  source_text: '[faixa_empreendimento] empreendimento=Flow Aptos; valor_minimo=R$ 995.000,00; valor_maximo=R$ 1.300.000,00; entrada_minima=R$ 199.000,00; qtd_disponiveis=4',
};
const history = [
  { role: 'assistant', content: 'Olá! Sou a Nara, da Bossa.' },
  { role: 'user', content: 'Qual é a faixa de preço do Flow? Ainda estou pesquisando.' },
];
const triaged = enforceNaraTriage(turn('No Flow, os valores começam em R$ 995 mil.'), lead, history, { commercial });
const valid = await enforceNaraReplyGuardrails(triaged, lead, history, { commercial });
assert.match(valid.reply, /R\$\s*(?:995 mil|995\.000,00)/);
assert.equal(valid.handoff, false);
assert.equal(valid.classification, 'frio');
assert.ok(valid.score <= 20);
assert.doesNotMatch(valid.reply, /(?:morar|investir|uso|finalidade)[^?]*\?/i);

// An amount declared by the customer cannot become the development's asking
// price merely because the number exists in the conversation history.
const budgetHistory = [
  { role: 'assistant', content: 'Olá! Sou a Nara, da Bossa.' },
  { role: 'user', content: 'Tenho R$ 777 mil. Quanto custa um apartamento no Flow?' },
];
const safe = await enforceNaraReplyGuardrails(turn('No Flow, o preço começa em R$ 777 mil.'), lead, budgetHistory, { commercial });
assert.doesNotMatch(safe.reply, /(?:preço|custa|começa|a partir de)[^.!?]*R\$\s*(?:777 mil|777\.000(?:,00)?)/i);
if (/R\$\s*(?:777 mil|777\.000(?:,00)?)/.test(safe.reply)) {
  assert.match(safe.reply, /(?:seu orçamento|orçamento declarado|você informou|valor informado por você)[^.!?]*R\$\s*(?:777 mil|777\.000(?:,00)?)/i,
    'um orçamento pode ser repetido apenas com atribuição explícita ao cliente');
}

console.log('Níveis de preço validados no núcleo real: informação vigente disponível sem qualificação obrigatória; orçamento não vira oferta.');
