import assert from 'node:assert/strict';
import {
  naraReplyNeedsCommercialProtection,
  parseNaraMoneyToCents,
  protectNaraCommercialReply,
  validateNaraCommercialContext,
} from '../src/lib/nara-commercial-guard.ts';

// Synthetic fixtures: no production conversations, CRM writes or model calls.
const NOW = '2026-11-04T18:00:00.000Z';
const options = { now: NOW };
const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });
const priceQuestion = [u('Qual o preço da unidade 1601 do Flow?')];
const plan = {
  status: 'complete',
  componentes: [
    { tipo: 'entrada', quantidade: 1, valor_unitario_centavos: 20_000_020, total_centavos: 20_000_020 },
    { tipo: 'mensal', quantidade: 80, valor_unitario_centavos: 1_000_000, total_centavos: 80_000_000 },
  ],
  total_composto_centavos: 100_000_020,
  diferenca_centavos: 0,
  indice_correcao: 'CUB durante a obra; IPCA após as chaves',
  juros: '0,59% a.m. após as chaves',
};
const offer = {
  empreendimento: 'Flow Aptos', empreendimento_id: 'flow-id', unidade: '1601', unidade_id: 'flow-1601',
  andar: 16, tipologia: 'Duplex', valor: 1_000_000.20, entrada: 200_000.20,
  parcela_media: 10_000, quantidade_parcelas: 80, indice_correcao: plan.indice_correcao,
  validade_tabela: '2026-11-30', referencia_tabela: 'fixture-nov26',
  preco_atualizado_em: '2026-11-04T17:59:00.000Z', plano_pagamento: plan,
};
const call = (row = offer, args = { empreendimento: 'flow', unidade: '1601' }) => ({
  name: 'consultar_apartamento', arguments: args, result: structuredClone(row),
});
const context = (overrides = {}) => ({
  consulted_at: NOW, source_table: 'development_units', status: 'ok',
  calls: [call()], source_text: 'Untrusted prose must never authorize an offer: R$ 777 mil.',
  ...overrides,
});
const range = {
  name: 'faixa_empreendimento', arguments: { empreendimento: 'flow' },
  result: { empreendimento: 'Flow Aptos', valor_minimo: 1_000_000.20, valor_maximo: 1_600_000, entrada_minima: 100_000, qtd_disponiveis: 3 },
};

let passed = 0;
function test(name, run) {
  try { run(); passed += 1; }
  catch (error) { throw new Error(name, { cause: error }); }
}
function guarded(reply, history = priceQuestion, commercial = context(), custom = {}) {
  return protectNaraCommercialReply(reply, history, commercial, { ...options, ...custom });
}
function noOffer(result) {
  assert.equal(result.source, 'unconfirmed');
  assert.doesNotMatch(result.reply, /R\$|sem juros|vendida|reservada|indisponível/);
}

test('BRL and explicit million/thousand values preserve cents', () => {
  const examples = [
    ['R$ 1.000.000,20', 100_000_020], ['R$ 900.000', 90_000_000],
    ['1,4 milhão', 140_000_000], ['1.4 million', 140_000_000], ['900 mil', 90_000_000],
    ['900k', 90_000_000], ['1000,25', 100_025], ['1,000,000.20', 100_000_020],
  ];
  for (const [value, cents] of examples) assert.equal(parseNaraMoneyToCents(value), cents, value);
  for (const bad of ['NaN', '-10', '1.00.00', '1,2,3', 'US$ 100', '900 mil por mês']) assert.equal(parseNaraMoneyToCents(bad), null, bad);
});

test('Pure natural conversation is untouched, including more than 45 words', () => {
  const reply = 'Entendo a sua preocupação com a distância da praia. Para quem pretende caminhar todos os dias, isso pode pesar bastante na escolha. Também vale olhar com calma a planta, o espaço e as áreas comuns que você vai usar. O que tem mais importância para a rotina da sua família?';
  const result = guarded(reply, [u('Achei longe da praia')], null);
  assert.equal(result.reply, reply);
  assert.equal(result.changed, false);
});

test('Architectural entry is not a payment claim', () => {
  const reply = 'O hall de entrada tem iluminação e acesso à área comum.';
  assert.equal(naraReplyNeedsCommercialProtection(reply), false);
  assert.equal(naraReplyNeedsCommercialProtection(reply, [u('Como é o hall de entrada?')]), false);
});

test('A clearly attributed customer budget remains a preference', () => {
  const reply = 'Entendi. Seu orçamento é de R$ 900.000. Você procura um imóvel para morar ou investir?';
  const result = guarded(reply, [u('Meu orçamento é R$ 900 mil')], null);
  assert.equal(result.reply, reply);
  assert.equal(result.commercial, false);
});

test('A customer budget cannot authorize a unit price', () => {
  const result = guarded('A unidade custa R$ 900 mil.', [u('Tenho R$ 900 mil. Qual o preço da unidade 1601 do Flow?')]);
  assert.equal(result.source, 'crm');
  assert.match(result.reply, /1\.000\.000,20/);
  assert.doesNotMatch(result.reply, /900/);
});

test('An old Nara price is never price authority', () => {
  const result = guarded('Sim, fica R$ 600 mil.', [u('Flow 1601'), a('Custa R$ 600 mil.'), u('É esse preço mesmo?')]);
  assert.equal(result.source, 'crm');
  assert.match(result.reply, /1\.000\.000,20/);
  assert.doesNotMatch(result.reply, /600 mil/);
});

test('No CRM result means no remembered price, even if both parties repeated it', () => {
  noOffer(guarded('Custa R$ 900 mil.', [u('Flow por R$ 900 mil?'), a('Isso, R$ 900 mil.'), u('Confirma?')], null));
});

test('Unstructured source_text alone never authorizes prices', () => {
  noOffer(guarded('O valor é R$ 777 mil.', [u('Quanto custa o Flow?')], context({ calls: [] })));
});

test('Correct number used as wrong field is replaced by the typed complete condition', () => {
  const result = guarded('O preço é R$ 200.000,20, com entrada de R$ 1.000.000,20.');
  assert.match(result.reply, /valor de tabela vigente da unidade 1601 é R\$\s*1\.000\.000,20/);
  assert.match(result.reply, /Entrada: R\$\s*200\.000,20/);
  assert.doesNotMatch(result.reply, /entrada de R\$\s*1\.000\.000,20/);
});

test('Result unit must match the queried unit', () => {
  const result = guarded('O 1601 custa R$ 1 milhão.', priceQuestion, context({ calls: [call({ ...offer, unidade: '1602' })] }));
  noOffer(result);
  assert.ok(result.reasons.includes('inconsistent_or_expired_commercial_data'));
});

test('Result project must match the queried project', () => {
  noOffer(guarded('O Flow custa R$ 1 milhão.', priceQuestion, context({ calls: [call({ ...offer, empreendimento: 'Alma Seahouses' })] })));
});

test('The same unit number from another project cannot satisfy the customer request', () => {
  noOffer(guarded('A unidade custa R$ 1 milhão.', [u('Qual o preço da unidade 1601 do Alma?')], context()));
});

test('A unit without a known project requires one clarification', () => {
  const result = guarded('Custa R$ 1 milhão.', [u('Quanto custa a unidade 1601?')]);
  noOffer(result);
  assert.match(result.reply, /qual empreendimento/);
});

test('A trusted project fallback resolves an otherwise unidentified unit', () => {
  const result = guarded('Custa R$ 1 milhão.', [u('Quanto custa a unidade 1601?')], context(), { enterprise: 'Flow Aptos' });
  assert.equal(result.source, 'crm');
});

test('A unit number shared across two projects remains ambiguous', () => {
  noOffer(guarded('O 1601 custa R$ 1 milhão.', [u('Qual o preço do 1601 no Flow ou Alma?')], context()));
});

test('Relative payment question keeps the previously identified unit', () => {
  const result = guarded('A entrada é R$ 200 mil.', [u('Quero ver a unidade 1601 do Flow'), a('Vou consultar.'), u('E a entrada?')]);
  assert.equal(result.source, 'crm');
  assert.match(result.reply, /unidade 1601/);
  assert.match(result.reply, /200\.000,20/);
});

test('Changing project clears the old unit', () => {
  const almaRange = { ...range, arguments: { empreendimento: 'alma' }, result: { ...range.result, empreendimento: 'Alma Seahouses' } };
  const result = guarded('O Alma começa em R$ 1 milhão.', [u('Unidade 1601 do Flow'), a('Flow Aptos.'), u('E o preço do Alma?')], context({ calls: [almaRange] }));
  assert.equal(result.source, 'crm');
  assert.doesNotMatch(result.reply, /1601|Flow/);
  assert.match(result.reply, /Alma/);
});

test('Project ranges cannot be sold as a specific unit quote', () => {
  noOffer(guarded('A unidade 1601 custa R$ 1 milhão.', priceQuestion, context({ calls: [range] })));
});

test('A stale lookup is rejected', () => {
  noOffer(guarded('Custa R$ 1 milhão.', priceQuestion, context({ consulted_at: '2026-11-04T17:54:59Z' })));
});

test('A future consultation timestamp is rejected', () => {
  noOffer(guarded('Custa R$ 1 milhão.', priceQuestion, context({ consulted_at: '2026-11-04T18:02:00Z' })));
});

test('Missing or malformed timestamps cannot authorize a quote', () => {
  for (const consulted_at of [undefined, '', 'yesterday']) noOffer(guarded('Custa R$ 1 milhão.', priceQuestion, context({ consulted_at })));
});

test('Expired and malformed validity dates are rejected', () => {
  for (const validade_tabela of ['2026-11-03', '03/11/2026', '2026-02-31', '31/13/2026', '2026-11-31T18:00:00Z', 'até dezembro']) {
    noOffer(guarded('Custa R$ 1 milhão.', priceQuestion, context({ calls: [call({ ...offer, validade_tabela })] })));
  }
});

test('Date-only expiry is valid through the stated São Paulo calendar day', () => {
  const valid = context({ consulted_at: '2026-11-05T02:58:00Z', calls: [call({ ...offer, validade_tabela: '04/11/2026' })] });
  assert.equal(guarded('Custa R$ 1 milhão.', priceQuestion, valid, { now: '2026-11-05T02:59:00Z' }).source, 'crm');
  noOffer(guarded('Custa R$ 1 milhão.', priceQuestion, valid, { now: '2026-11-05T03:00:00Z' }));
});

test('A future last-price-update timestamp is inconsistent', () => {
  noOffer(guarded('Custa R$ 1 milhão.', priceQuestion, context({ calls: [call({ ...offer, preco_atualizado_em: '2026-12-01T00:00:00Z' })] })));
});

test('Wrong source, failed, blocked, ambiguous and empty lookups never quote', () => {
  for (const change of [
    { source_table: 'conversation_messages' }, { status: 'error' }, { error: 'timeout' },
    { blocked_reason: 'cliente_atual' }, { status: 'blocked' }, { status: 'ambiguous' }, { status: 'empty' },
  ]) noOffer(guarded('Custa R$ 1 milhão.', priceQuestion, context(change)));
});

test('Invalid numeric data and conflicting duplicates are rejected', () => {
  for (const valor of [NaN, Infinity, -1, 0, 1000000.205, '1000000']) noOffer(guarded('Custa R$ 1 milhão.', priceQuestion, context({ calls: [call({ ...offer, valor })] })));
  noOffer(guarded('Custa R$ 1 milhão.', priceQuestion, context({ calls: [call(), call({ ...offer, valor: 900_000 })] })));
});

test('Complete payment plans are rendered in cents with their registered adjustments and interest', () => {
  const result = guarded('Tem 80 parcelas de R$ 9 mil.', [u('Como é o pagamento da unidade 1601 do Flow?')]);
  assert.match(result.reply, /80 × R\$\s*10\.000,00/);
  assert.match(result.reply, /200\.000,20/);
  assert.match(result.reply, /IPCA após as chaves/);
  assert.match(result.reply, /0,59% a\.m/);
  assert.doesNotMatch(result.reply, /9 mil/);
});

test('A one-cent mismatch never becomes an installment offer', () => {
  const badPlan = { ...plan, total_composto_centavos: plan.total_composto_centavos + 1 };
  const result = guarded('A entrada é R$ 200 mil.', priceQuestion, context({ calls: [call({ ...offer, plano_pagamento: badPlan })] }));
  assert.match(result.reply, /plano completo/);
  assert.doesNotMatch(result.reply, /Entrada:|Parcelas mensais:/);
  assert.match(result.reply, /1\.000\.000,20/);
});

test('Unknown or missing full plans cannot be reconstructed from partial fields', () => {
  const result = guarded('Entrada de R$ 200.000,20 e o restante em 80x.', priceQuestion, context({ calls: [call({ ...offer, plano_pagamento: undefined })] }));
  assert.doesNotMatch(result.reply, /Entrada:|80 ×/);
  assert.match(result.reply, /confirmação/);
});

test('Missing interest never means interest-free', () => {
  const missing = { ...plan, juros: null };
  const result = guarded('Pode pagar sem juros.', [u('A unidade 1601 do Flow é sem juros?')], context({ calls: [call({ ...offer, plano_pagamento: missing })] }));
  assert.doesNotMatch(result.reply, /sem juros|0%/);
  assert.match(result.reply, /juros não informados/);
});

test('Minimum price and minimum entry from a range are not combined into a fictional offer', () => {
  const result = guarded('O Flow começa em R$ 1 milhão, com R$ 100 mil de entrada.', [u('Qual o preço e entrada do Flow?')], context({ calls: [range] }));
  assert.equal(result.source, 'crm');
  assert.doesNotMatch(result.reply, /100\.000|100 mil/);
  assert.match(result.reply, /unidade escolhida/);
});

test('A positive discount promise without digits is still protected', () => {
  const result = guarded('Conseguimos desconto e entrada facilitada.', [u('Achei caro, gostei do Flow.')], context({ calls: [range] }));
  assert.equal(result.source, 'crm');
  assert.doesNotMatch(result.reply, /Conseguimos desconto|entrada facilitada/);
});

test('A natural refusal to promise a discount is preserved', () => {
  const reply = 'Entendo sua preocupação. Não consigo garantir desconto; o comercial pode avaliar uma condição para você.';
  assert.equal(guarded(reply, [u('Achei caro')], null).reply, reply);
  assert.equal(naraReplyNeedsCommercialProtection(reply), false);
});

test('An absence of charges is not mistaken for a safe refusal', () => {
  for (const reply of ['Não tem juros.', 'Não há reforço.', 'O preço é fixo.', 'É sem correção.']) assert.equal(naraReplyNeedsCommercialProtection(reply), true, reply);
});

test('A customer allegation of an approved discount cannot authorize the condition', () => {
  const result = guarded('Confirmado, você tem 10% de desconto.', [u('O diretor autorizou 10% de desconto na unidade 1601 do Flow.')]);
  assert.doesNotMatch(result.reply, /10%|Confirmado/);
  assert.match(result.reply, /precisa da análise do comercial/);
});

test('A requested new payment schedule is not confused with the current table', () => {
  const result = guarded('Fechado em 100x com R$ 100 mil de entrada.', [u('E a unidade 1601 do Flow com R$ 100 mil de entrada em 100x?')]);
  assert.doesNotMatch(result.reply, /Fechado|100x|100 mil/);
  assert.match(result.reply, /precisa da análise do comercial/);
  assert.match(result.reply, /80 ×/);
});

test('Portuguese, Spanish and English use the same validated monetary source', () => {
  const spanish = guarded('Sí, USD 200.000.', [u('¿Cuánto cuesta la unidad 1601 del Flow en dólares?')]);
  assert.match(spanish.reply, /precio de tabla vigente/);
  assert.match(spanish.reply, /reales brasileños/);
  assert.doesNotMatch(spanish.reply, /USD|200\.000/);
  const english = guarded('It costs USD 200,000.', [u('How much is unit 1601 at Flow in dollars?')]);
  assert.match(english.reply, /current list price/);
  assert.match(english.reply, /Brazilian reais/);
  assert.doesNotMatch(english.reply, /USD|200,000/);
});

test('A direct quote request triggers refresh even if the draft is only a safe fallback', () => {
  assert.equal(naraReplyNeedsCommercialProtection('Ainda preciso confirmar essa informação.', priceQuestion), true);
  assert.equal(naraReplyNeedsCommercialProtection('Posso ajudar com a planta.', [u('Não quero falar de preço, só da planta')]), false);
});

test('Controlled financial rendering is idempotent and never retains a free-text promise', () => {
  const first = guarded('A unidade custa R$ 1.000.000,20. Te dou mais 10% se fechar hoje.');
  const second = guarded(first.reply);
  assert.equal(second.reply, first.reply);
  assert.doesNotMatch(second.reply, /10%|fechar hoje/);
});

test('Validation is a pure lookup and can be tested with an explicit clock', () => {
  const original = context();
  const before = structuredClone(original);
  const validation = validateNaraCommercialContext(original, priceQuestion, options);
  assert.equal(validation.valid, true);
  assert.deepEqual(original, before);
  assert.equal(validation.offers[0].valor, offer.valor);
});

test('An amount written in words with a purchase commitment is protected', () => {
  for (const reply of ['Fechamos por novecentos mil.', 'Faço por oitocentos mil.', 'Pode levar por novecentos mil.']) {
    assert.equal(naraReplyNeedsCommercialProtection(reply), true, reply);
    assert.doesNotMatch(guarded(reply).reply, /novecentos|oitocentos|Pode levar|Fechamos/);
  }
});

test('A minimum-price request is answered with only the verified minimum', () => {
  const result = guarded('O Flow começa em R$ 900 mil.', [u('Qual é o mais barato do Flow?')], context({ calls: [range] }));
  assert.match(result.reply, /1\.000\.000,20/);
  assert.doesNotMatch(result.reply, /1\.600\.000/);
});

test('An explicit range or comparison includes minimum and maximum', () => {
  const result = guarded('A faixa do Flow é de R$ 900 mil a R$ 2 milhões.', [u('Qual é a faixa de preço do Flow?')], context({ calls: [range] }));
  assert.match(result.reply, /1\.000\.000,20/);
  assert.match(result.reply, /1\.600\.000,00/);
});

test('Two requested unit codes must not silently become a single unit quote', () => {
  const result = guarded('O 1601 custa R$ 1 milhão.', [u('Compare o preço das unidades 1601 e 1602 do Flow')]);
  noOffer(result);
  assert.match(result.reply, /todas as unidades/);
  const both = context({ calls: [call(), call({ ...offer, unidade: '1602', unidade_id: 'flow-1602', valor: 1_100_000 }, { empreendimento: 'flow', unidade: '1602' })] });
  const comparison = guarded('Custa R$ 1 milhão.', [u('Compare o preço das unidades 1601 e 1602 do Flow')], both);
  assert.equal(comparison.source, 'crm');
  assert.match(comparison.reply, /1601/);
  assert.match(comparison.reply, /1602/);
  noOffer(guarded('Custa R$ 1 milhão.', [u('Compare as unidades 1601,1602 e 1603 do Flow')], both));
});

test('An explicit correction is preserved for the same unit while only current values are quoted', () => {
  const history = [u('Qual o preço da unidade 1601 do Flow?'), a('A unidade 1601 do Flow está em R$ 900 mil.'), u('Confirma o valor?')];
  const result = guarded('Corrigindo a informação anterior, o valor que informei não estava confirmado. Agora é R$ 1.000.000,20.', history);
  assert.match(result.reply, /^Corrigindo a informação anterior/);
  assert.match(result.reply, /1\.000\.000,20/);
  assert.doesNotMatch(result.reply, /900|tabela mudou/);
});

test('A correction cannot allege an error for another project or unit', () => {
  const history = [u('Qual o preço da unidade 1602 do Alma?'), a('A unidade 1602 do Alma está em R$ 900 mil.'), u('E o preço da unidade 1601 do Flow?')];
  const result = guarded('Corrigindo a informação anterior, custa R$ 1.000.000,20.', history);
  assert.match(result.reply, /^Estes são os valores confirmados/);
  assert.doesNotMatch(result.reply, /Corrigindo|900|Alma/);
});

test('Unsolicited percentage, unlabeled amount and fixed-installment promises cannot escape', () => {
  for (const reply of [
    'Consigo 5% para você.', 'Fecho em 850 para você.', 'As parcelas são fixas.',
    'O preço à vista está garantido e o comercial pode confirmar.',
    'O preço à vista está garantido, o comercial pode confirmar.',
    'O comercial pode confirmar que o preço está garantido.',
    'Não consigo aprovar desconto, mas as parcelas são fixas.',
    'Não consigo garantir desconto e as parcelas são fixas.',
  ]) {
    assert.equal(naraReplyNeedsCommercialProtection(reply), true, reply);
    noOffer(guarded(reply, [u('Gostei da planta.')], null));
  }
});

test('A financial offer phrased as a question remains protected', () => {
  for (const reply of ['Você quer 10% de desconto?', 'Prefere entrada de 20%?', 'Você prefere parcelamento em 100 vezes?']) {
    assert.equal(naraReplyNeedsCommercialProtection(reply), true, reply);
    noOffer(guarded(reply, [u('Gostei da planta.')], null));
  }
});

test('A refusal stays scoped to its own clause and ordinary payment questions remain natural', () => {
  for (const reply of [
    'Não consigo garantir preço fixo.',
    'Não posso confirmar que as parcelas são fixas.',
    'O comercial pode avaliar um desconto.',
    'Você prefere pagar à vista ou parcelado?',
  ]) assert.equal(guarded(reply, [u('Gostei da planta.')], null).reply, reply, reply);
});

test('An apartment entrance question is architectural when the answer describes access to a room', () => {
  const history = [u('Como é a entrada do apartamento?')];
  const reply = 'A entrada do apartamento dá acesso à sala.';
  assert.equal(naraReplyNeedsCommercialProtection(reply, history), false);
  assert.equal(guarded(reply, history, null).reply, reply);
  assert.equal(naraReplyNeedsCommercialProtection('A entrada do apartamento é de 20%.'), true);
  assert.equal(naraReplyNeedsCommercialProtection('A entrada do apartamento é facilitada.'), true);
});

test('A largest-price request resets the previous specific unit and returns only the verified maximum', () => {
  const history = [u('Qual o preço da unidade 901 do Flow?'), a('Vou consultar.'), u('Qual o valor mais caro?')];
  const result = guarded('O maior valor é R$ 2 milhões.', history, context({ calls: [range] }));
  assert.equal(result.source, 'crm');
  assert.match(result.reply, /1\.600\.000,00/);
  assert.doesNotMatch(result.reply, /901|1\.000\.000,20/);
});

test('A multi-unit lookup marked ambiguous does not repeat a project question already answered', () => {
  const result = guarded('Vou verificar.', [u('Compare os preços das unidades 1601 e 1602 do Flow?')], context({ status: 'ambiguous', calls: [] }));
  noOffer(result);
  assert.match(result.reply, /todas as unidades/);
  assert.doesNotMatch(result.reply, /qual empreendimento/);
});

console.log(`Nara commercial guard: ${passed} scenarios passed (synthetic data, no external calls).`);
