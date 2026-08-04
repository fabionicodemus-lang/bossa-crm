import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  asksProtectedCommercialDetail,
  isGeneralPriceRangeReply,
} from '../src/lib/nara-price-levels.ts';

assert.equal(isGeneralPriceRangeReply('No Flow, os valores começam em R$ 995 mil.'), true);
assert.equal(isGeneralPriceRangeReply('Hoje a faixa geral fica entre R$ 995 mil e R$ 1,3 milhão.'), true);
assert.equal(isGeneralPriceRangeReply('Há opções de R$ 995 mil a R$ 1,3 milhão.'), true);
assert.equal(isGeneralPriceRangeReply('A unidade 901 custa R$ 995 mil.'), false);
assert.equal(isGeneralPriceRangeReply('A entrada é de R$ 100 mil e o saldo em 80 parcelas.'), false);
assert.equal(isGeneralPriceRangeReply('Temos disponibilidade a partir de R$ 995 mil.'), false);
assert.equal(isGeneralPriceRangeReply('O valor é R$ 995 mil.'), false);

assert.equal(asksProtectedCommercialDetail('Quanto custa o Flow?'), false);
assert.equal(asksProtectedCommercialDetail('Qual é o menor apartamento?'), false);
assert.equal(asksProtectedCommercialDetail('Qual o valor da unidade 901?'), true);
assert.equal(asksProtectedCommercialDetail('Qual é a entrada mínima?'), true);
assert.equal(asksProtectedCommercialDetail('Me manda a tabela.'), true);
assert.equal(asksProtectedCommercialDetail('Tem disponível no 20º andar?'), true);

const source = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
assert.match(source, /const canKeepGeneralPriceRange = asksCommercialValue\(lastUser\)/);
assert.match(source, /!asksProtectedCommercialDetail\(lastUser\)/);
assert.match(source, /isGeneralPriceRangeReply\(turn\.reply\)/);
assert.match(source, /!hasUngroundedMoney\(turn\.reply, history, context\)/);
assert.match(source, /turn\.score = Math\.min\(turn\.score, 20\)/);
assert.match(source, /turn\.classification = 'frio'/);
assert.match(source, /turn\.attachment_ids = \[\]/);

console.log('Níveis de preço da Nara validados: faixa geral liberada e detalhes protegidos.');
